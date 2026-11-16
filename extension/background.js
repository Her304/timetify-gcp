// Service worker: Timetify sign-in (OAuth 2.1 + PKCE via chrome.identity)
// and the calls to Timetify's API. The content script reads D2L; only this
// side ever holds a Timetify token, and it only ever holds the
// `courses:import` scope, which can stage an import for the student to
// review and nothing else.

const SERVERS = {
  // OAuth lives on the canonical domain (nginx proxies /oauth/* to Django);
  // the API is the backend's own host, like the SPA's VITE_API_URL.
  prod: { label: "timetify.net", auth: "https://timetify.net",
          api: "https://timetify-web-931972332433.us-central1.run.app", web: "https://timetify.net" },
  local: { label: "local dev (127.0.0.1:8000)", auth: "http://127.0.0.1:8000",
           api: "http://127.0.0.1:8000", web: "http://localhost:5173" },
};
const SCOPE = "courses:import";

// fetch() only says "Failed to fetch" when the server can't be reached at
// all; name the address so "wrong server picked" and "server down" are
// distinguishable from the panel.
async function net(url, init) {
  try {
    return await fetch(url, init);
  } catch (e) {
    throw new Error(`couldn't reach ${new URL(url).origin} — is that server running? (${e.message})`);
  }
}

// An unpacked ("development") install talks to a local dev server unless
// told otherwise; a Web Store install talks to production. An explicit pick
// in the options page wins either way.
async function defaultServer() {
  const self = await chrome.management.getSelf();
  return self.installType === "development" ? "local" : "prod";
}

async function server() {
  const { server: which } = await chrome.storage.local.get("server");
  return SERVERS[which || await defaultServer()] || SERVERS.prod;
}

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Dynamic client registration, once per server + redirect URL. The redirect
// is https://<extension-id>.chromiumapp.org/, which Timetify's registration
// rules accept (https), and which only this extension can receive.
async function clientId(srv) {
  const key = `client:${srv.auth}`;
  const redirect = chrome.identity.getRedirectURL();
  const stored = (await chrome.storage.local.get(key))[key];
  if (stored && stored.redirect === redirect) return stored.id;
  const r = await net(`${srv.auth}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "timetify lms sync (browser extension)",
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!r.ok) throw new Error(`couldn't register with timetify (${r.status})`);
  const j = await r.json();
  await chrome.storage.local.set({ [key]: { id: j.client_id, redirect } });
  return j.client_id;
}

async function saveTokens(srv, j) {
  const tok = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  await chrome.storage.local.set({ [`tok:${srv.auth}`]: tok });
  return tok;
}

async function tokenRequest(srv, form) {
  const r = await net(`${srv.auth}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || "timetify sign-in failed");
  return saveTokens(srv, j);
}

async function signIn(srv) {
  const id = await clientId(srv);
  const redirect = chrome.identity.getRedirectURL();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const url = `${srv.auth}/oauth/authorize?${new URLSearchParams({
    response_type: "code", client_id: id, redirect_uri: redirect,
    code_challenge: challenge, code_challenge_method: "S256", scope: SCOPE, state,
  })}`;
  let back;
  try {
    back = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  } catch (e) {
    // Chrome's own wording ("The user did not approve access.") reads like
    // something went wrong; it almost always means the window was closed.
    throw new Error("the timetify window was closed before connecting — nothing was sent.");
  }
  const params = new URL(back).searchParams;
  if (params.get("state") !== state) throw new Error("sign-in was interrupted. try again.");
  if (params.get("error") === "access_denied") throw new Error("u chose not now — nothing was sent.");
  if (params.get("error")) throw new Error(params.get("error_description") || params.get("error"));
  return tokenRequest(srv, {
    grant_type: "authorization_code", code: params.get("code"),
    redirect_uri: redirect, code_verifier: verifier, client_id: id,
  });
}

// Refresh tokens rotate on every use, so two refreshes racing would burn
// each other's token. One in flight at a time.
let pending = null;
function accessToken(srv) {
  pending = pending || (async () => {
    const key = `tok:${srv.auth}`;
    const tok = (await chrome.storage.local.get(key))[key];
    if (tok && tok.exp > Date.now()) return tok.access;
    if (tok && tok.refresh) {
      try {
        return (await tokenRequest(srv, {
          grant_type: "refresh_token", refresh_token: tok.refresh, client_id: await clientId(srv),
        })).access;
      } catch (e) {
        await chrome.storage.local.remove(key);
      }
    }
    return (await signIn(srv)).access;
  })().finally(() => { pending = null; });
  return pending;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init = {}, retried = false, attempt = 0) {
  const srv = await server();
  const token = await accessToken(srv);
  const r = await net(srv.api + path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (r.status === 401 && !retried) {
    // Revoked from Settings → connected apps, or expired early: sign in again.
    await chrome.storage.local.remove(`tok:${srv.auth}`);
    return api(path, init, true, attempt);
  }
  if (r.status === 429 && attempt < 6) {
    // Timetify's per-token budget is per minute; a term's worth of courses
    // can brush it. Wait it out rather than failing the sync.
    await sleep(Math.min(20000, 3000 * 2 ** attempt));
    return api(path, init, retried, attempt + 1);
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || body.error || `timetify answered ${r.status}`);
  return body;
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// ------------------------------------------------------------ exam schedule
//
// Laurier's schedule file sits behind its student login, so the panel sends
// the student's own tab to it; exams.js copies the page text there and sends
// it here. Timetify parses and filters it (main/exam_schedule.py).

const handlers = {
  async examAccess() {
    return { ok: await chrome.permissions.contains({ origins: ["https://students.wlu.ca/*"] }) };
  },
  async examLookup({ uni, campus, term, courses, schedule_text }) {
    if (typeof schedule_text !== "string" || !schedule_text.includes("examSchedule")) throw new Error("no schedule text");
    return api("/api/exam-schedule/lookup/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uni, campus, term, courses, schedule_text }),
    });
  },
  // For the notice screen: will starting the sync open the timetify window?
  async connected() {
    const srv = await server();
    const tok = (await chrome.storage.local.get(`tok:${srv.auth}`))[`tok:${srv.auth}`];
    return { connected: !!(tok && (tok.exp > Date.now() || tok.refresh)) };
  },
  // Sign in up front (opening the window only if needed), so the syncing
  // screen never stalls behind it.
  async connect() {
    await accessToken(await server());
    return { ok: true };
  },
  async stage({ payload }) {
    return api("/api/lms/imports/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
  },
  async outline({ importId, course, ext, b64 }) {
    if (!MIME[ext]) throw new Error("only pdf + word (.docx) outlines");
    const form = new FormData();
    form.append("course", course);
    form.append("file", new Blob([fromBase64(b64)], { type: MIME[ext] }), `outline.${ext}`);
    return api(`/api/lms/imports/${encodeURIComponent(importId)}/outline/`, { method: "POST", body: form });
  },
  async reconcile({ importId, course }) {
    return api(`/api/lms/imports/${encodeURIComponent(importId)}/reconcile/`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course }),
    });
  },
  async whereTo() {
    return { label: (await server()).label };
  },
  async openOptions() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
  async currentServer() {
    const { server: which } = await chrome.storage.local.get("server");
    return { server: which || await defaultServer() };
  },
  async open({ url }) {
    // Only ever the review page on the selected server's own frontend, never
    // an address the LMS page could have supplied.
    const u = new URL(url);
    if (u.origin !== (await server()).web || u.pathname !== "/Add") throw new Error("unexpected review address");
    await chrome.tabs.create({ url: u.toString() });
    return { ok: true };
  },
  async signOut() {
    const srv = await server();
    const key = `tok:${srv.auth}`;
    const tok = (await chrome.storage.local.get(key))[key];
    if (tok && tok.refresh) {
      await fetch(`${srv.auth}/oauth/revoke`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tok.refresh }),
      }).catch(() => {});
    }
    await chrome.storage.local.remove(key);
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Messages come from this extension's own content script or options page.
  if (sender.id !== chrome.runtime.id || !handlers[msg && msg.type]) return false;
  // Chrome shuts an idle extension worker down after ~30s, and network waits
  // (Laurier's sign-in, a cold Timetify server) don't count as activity. A
  // cheap extension API call every 20s keeps it alive until the reply is sent.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  handlers[msg.type](msg)
    .then((data) => reply({ ok: true, data }))
    .catch((e) => reply({ ok: false, error: String((e && e.message) || e) }))
    .finally(() => clearInterval(keepAlive));
  return true; // async reply
});

// Toolbar button: open D2L home, where the panel lives.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "https://mylearningspace.wlu.ca/d2l/home" });
});
