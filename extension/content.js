// The "sync to timetify" panel on D2L home. A start screen offers two flows:
//
//   record my courses:  fetch → confirm → notice → syncing → done
//   find my exams:      school + campus → courses → lookup → results → review
//
// It reads D2L with TimetifyD2L (d2l.js) and hands everything Timetify-side to
// the background worker, which holds the Timetify sign-in. Nothing is saved
// from here: the last screen sends the student to Timetify's review page.
//
// Renders inside a closed shadow root with textContent only, so D2L's styles
// can't break it and course titles can't inject markup.

(() => {
  if (window.top !== window || document.getElementById("timetify-sync-host")) return;
  const D2L = globalThis.TimetifyD2L;
  if (!D2L) return;

  // ---------------------------------------------------------------- plumbing

  // After the extension updates or is reloaded, Chrome cuts the scripts
  // already running in open tabs off from it (chrome.runtime goes away). The
  // only fix is a page refresh, so say that instead of a TypeError.
  const STALE = "timetify sync was updated — refresh this page (⌘R / ctrl+R) and try again.";
  const send = (msg) => new Promise((resolve, reject) => {
    if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.id) return reject(new Error(STALE));
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(/context invalidated/i.test(err.message) ? STALE : err.message));
        if (!res || !res.ok) return reject(new Error((res && res.error) || "something went wrong"));
        resolve(res.data);
      });
    } catch (e) {
      reject(new Error(/context invalidated/i.test(String(e && e.message)) ? STALE : String(e && e.message)));
    }
  });

  const toBase64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const shortName = (c) => c.name.split(" - ")[0];   // "CP-363-B"
  const title = (c) => c.name.split(" - ").slice(1).join(" - ") || c.name;

  // ---------------------------------------------------------------- shell

  const host = document.createElement("div");
  host.id = "timetify-sync-host";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      .fab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; border: 0; border-radius: 999px;
             padding: 12px 18px 12px 14px; background: #1d1b16; color: #f7f2e7; font-size: 14px; cursor: pointer;
             box-shadow: 0 8px 24px rgba(0,0,0,.18); display: flex; align-items: center; gap: 8px; }
      .fab:hover { background: #000; }
      .fab .dot { width: 18px; height: 18px; border-radius: 6px; background: #ed6a4a; color: #fff; font: 700 12px/18px Georgia, serif; text-align: center; }
      .panel { position: fixed; right: 20px; bottom: 76px; z-index: 2147483000; width: min(420px, calc(100vw - 32px));
               height: min(600px, calc(100vh - 100px)); display: flex; flex-direction: column; background: #fffdf8; color: #1d1b16;
               border: 1px solid rgba(29,27,22,.12); border-radius: 24px; box-shadow: 0 16px 48px rgba(0,0,0,.2); overflow: hidden; }
      .panel[hidden] { display: none; }
      .top { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px 0; }
      .eyebrow { font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 1.6px; text-transform: lowercase; color: rgba(29,27,22,.5); }
      .x { border: 0; background: none; font-size: 18px; line-height: 1; color: rgba(29,27,22,.45); cursor: pointer; padding: 4px; }
      .steps { display: flex; gap: 4px; padding: 10px 18px 0; }
      .steps span { flex: 1; height: 3px; border-radius: 3px; background: rgba(29,27,22,.1); transition: background .3s; }
      .steps span.on { background: #ed6a4a; }
      .screen { flex: 1; overflow: auto; padding: 14px 18px 0; animation: enter .28s ease-out; }
      @keyframes enter { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
      .foot { padding: 12px 18px 16px; display: flex; gap: 8px; border-top: 1px solid rgba(29,27,22,.06); }
      .foot:empty { display: none; }
      h2 { margin: 0 0 6px; font: 400 26px/1.05 Georgia, "Times New Roman", serif; letter-spacing: -.5px; }
      p { margin: 0 0 12px; font-size: 13px; color: rgba(29,27,22,.65); line-height: 1.45; }
      .center { text-align: center; padding-top: 36px; }
      button.primary { flex: 2; border: 0; border-radius: 999px; padding: 11px 14px; background: #1d1b16; color: #f7f2e7; font-size: 14px; cursor: pointer; }
      button.primary.coral { background: #ed6a4a; color: #fff; }
      button.ghost { flex: 1; border: 1px solid rgba(29,27,22,.18); border-radius: 999px; padding: 11px 14px; background: #fff; color: #1d1b16; font-size: 14px; cursor: pointer; }
      button:disabled { opacity: .45; cursor: default; }
      /* fetch */
      .spinner { width: 44px; height: 44px; margin: 0 auto 18px; border-radius: 50%; border: 4px solid rgba(237,106,74,.18); border-top-color: #ed6a4a; animation: spin .9s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .checks { list-style: none; padding: 0; margin: 18px auto 0; max-width: 270px; text-align: left; font-size: 13px; }
      .checks li { display: flex; gap: 8px; align-items: center; padding: 5px 0; color: rgba(29,27,22,.45); transition: color .2s; }
      .checks li.now { color: #1d1b16; }
      .checks li.ok { color: #1d1b16; }
      .tick { width: 16px; height: 16px; border-radius: 50%; flex: none; border: 1.5px solid currentColor; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; }
      .ok .tick { background: #2f7a3a; border-color: #2f7a3a; color: #fff; }
      .now .tick { border-color: #ed6a4a; border-top-color: transparent; animation: spin .8s linear infinite; }
      /* confirm */
      .course { border: 1px solid rgba(29,27,22,.08); background: #fff; border-radius: 16px; padding: 10px 12px; margin-bottom: 8px; }
      .course.off { opacity: .55; }
      .row { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
      .row input { margin-top: 3px; accent-color: #ed6a4a; }
      .code { font: 600 10px/1 ui-monospace, Menlo, monospace; letter-spacing: 1px; color: rgba(29,27,22,.5); }
      .name { font-size: 14px; font-weight: 600; margin-top: 3px; }
      .meta { font-size: 12px; color: rgba(29,27,22,.55); margin-top: 3px; }
      select { width: 100%; margin-top: 8px; font-size: 12px; padding: 6px 8px; border-radius: 10px; border: 1px solid rgba(29,27,22,.15); background: #fffdf8; color: #1d1b16; }
      /* notice */
      .facts { list-style: none; padding: 0; margin: 4px 0 14px; }
      .facts li { display: flex; gap: 10px; padding: 9px 0; font-size: 13px; line-height: 1.4; border-bottom: 1px solid rgba(29,27,22,.06); }
      .facts b { font-weight: 600; }
      .ico { width: 22px; flex: none; text-align: center; }
      .callout { background: #f3efff; border: 1px solid #ddd3ff; border-radius: 14px; padding: 10px 12px; font-size: 12.5px; line-height: 1.45; color: #3b3270; }
      /* syncing */
      .bar { height: 8px; border-radius: 8px; background: rgba(29,27,22,.08); overflow: hidden; margin: 6px 0 14px; }
      .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ed6a4a, #f39a6b); border-radius: 8px; transition: width .5s ease; }
      .tasks { list-style: none; padding: 0; margin: 0; }
      .tasks li { display: flex; gap: 10px; align-items: center; padding: 8px 0; font-size: 13px; border-bottom: 1px solid rgba(29,27,22,.06); color: rgba(29,27,22,.5); }
      .tasks li.now, .tasks li.ok { color: #1d1b16; }
      .tasks li.warn { color: #b4532a; }
      .warn .tick { background: #f6e0d6; border-color: #e6a68c; color: #b4532a; }
      .tasks .sub { margin-left: auto; font-size: 11px; color: rgba(29,27,22,.45); }
      .hint { font-size: 11.5px; color: rgba(29,27,22,.45); margin-top: 12px; }
      /* done */
      .badge { width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 50%; background: #ed6a4a; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 30px; box-shadow: 0 0 0 10px rgba(237,106,74,.12); animation: pop .4s cubic-bezier(.2,1.6,.4,1); }
      .badge.soft { background: #f0b44c; box-shadow: 0 0 0 10px rgba(240,180,76,.15); }
      @keyframes pop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
      .stats { display: flex; gap: 8px; margin: 16px 0; }
      .stat { flex: 1; background: #fff; border: 1px solid rgba(29,27,22,.08); border-radius: 14px; padding: 10px 6px; text-align: center; }
      .stat b { display: block; font: 400 24px/1 Georgia, serif; }
      .stat span { font-size: 11px; color: rgba(29,27,22,.55); }
      .todo { text-align: left; background: #fff7ed; border: 1px solid #f6dcc0; border-radius: 14px; padding: 10px 12px; font-size: 12.5px; line-height: 1.5; color: #7a4a1d; margin-bottom: 8px; }
      .todo ul { margin: 4px 0 0; padding-left: 18px; }
      .fine { font-size: 11px; color: rgba(29,27,22,.45); margin-top: 10px; }
      .fine a { color: inherit; }
      .home { margin-left: auto; margin-right: 6px; border: 0; background: none; font-size: 12px; color: rgba(29,27,22,.5); cursor: pointer; text-decoration: underline; }
      .home[hidden] { display: none; }
      /* start screen */
      .choice { display: flex; gap: 12px; align-items: flex-start; width: 100%; text-align: left; border: 1px solid rgba(29,27,22,.1); background: #fff; border-radius: 18px; padding: 14px; margin-bottom: 10px; cursor: pointer; }
      .choice:hover { border-color: #ed6a4a; }
      .choice .big { font-size: 26px; line-height: 1; }
      .choice b { display: block; font-size: 15px; margin-bottom: 3px; color: #1d1b16; }
      .choice span { font-size: 12.5px; color: rgba(29,27,22,.6); line-height: 1.4; }
      /* exams */
      .label { font: 600 10px/1 ui-monospace, Menlo, monospace; letter-spacing: 1.4px; text-transform: lowercase; color: rgba(29,27,22,.5); margin: 14px 0 8px; }
      .pills { display: flex; gap: 8px; flex-wrap: wrap; }
      .pill { border: 1px solid rgba(29,27,22,.18); background: #fff; border-radius: 999px; padding: 8px 14px; font-size: 13px; cursor: pointer; color: #1d1b16; }
      .pill.on { background: #1d1b16; color: #f7f2e7; border-color: #1d1b16; }
      .xrow { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(29,27,22,.06); font-size: 14px; }
      .xrow input[type=checkbox] { accent-color: #ed6a4a; }
      .xrow .c { font-weight: 600; min-width: 64px; }
      .xrow .t { flex: 1; font-size: 12px; color: rgba(29,27,22,.55); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sec { width: 64px; font-size: 12px; padding: 5px 7px; border-radius: 8px; border: 1px solid rgba(29,27,22,.15); background: #fffdf8; }
      .add { display: flex; gap: 6px; margin-top: 10px; }
      .add input { flex: 1; font-size: 13px; padding: 7px 9px; border-radius: 10px; border: 1px solid rgba(29,27,22,.15); background: #fff; }
      .add input.sec { flex: none; }
      .add button { border: 1px solid rgba(29,27,22,.18); background: #fff; border-radius: 10px; padding: 0 12px; cursor: pointer; }
      .exam { background: #fff; border: 1px solid rgba(29,27,22,.08); border-radius: 14px; padding: 10px 12px; margin-bottom: 8px; }
      .exam .when { font: 400 18px/1.2 Georgia, serif; margin-top: 2px; }
      .exam .where { font-size: 12px; color: rgba(29,27,22,.6); margin-top: 2px; }
      .exam.muted { opacity: .6; }
      .exam .opts { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
      .exam .opts button { text-align: left; border: 1px solid rgba(29,27,22,.15); background: #fffdf8; border-radius: 10px; padding: 7px 9px; font-size: 12.5px; cursor: pointer; }
    </style>
    <button class="fab" type="button"><span class="dot">t</span>sync to timetify</button>
    <div class="panel" hidden>
      <div class="top"><span class="eyebrow">timetify sync</span><button class="home" type="button" hidden>start over</button><button class="x" type="button" aria-label="close">✕</button></div>
      <div class="steps"><span></span><span></span><span></span><span></span></div>
      <div class="screen"></div>
      <div class="foot"></div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (cls, text, on) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", on); return b; };
  const fab = $(".fab"), panel = $(".panel");
  let screen = $(".screen"), foot = $(".foot");

  // Swap in a fresh screen node so the enter animation replays.
  function show(stepIndex, build) {
    const fresh = el("div", "screen");
    screen.replaceWith(fresh);
    screen = fresh;
    foot.replaceChildren();
    root.querySelectorAll(".steps span").forEach((s, i) => s.classList.toggle("on", i <= stepIndex));
    $(".home").hidden = stepIndex < 0;
    build(screen, foot);
  }

  // Closing the panel is "done with it": also drop results handed back from
  // Laurier's page, so the next D2L page load doesn't reopen them.
  function closePanel() {
    panel.hidden = true;
    chrome.storage.local.remove("examResults").catch(() => {});
  }

  let state = null;     // { v, courses } from D2L
  let running = false;  // a sync is in flight: closing the panel must not lose it

  // ---------------------------------------------------------------- 1. fetch

  function fetchScreen() {
    show(0, (s) => {
      const box = el("div", "center");
      box.append(el("div", "spinner"), el("h2", null, "finding ur courses"),
        el("p", null, "reading this term from mylearningspace…"));
      const checks = el("ul", "checks");
      const rows = ["this term's courses", "course outlines", "due dates"].map((t) => {
        const li = el("li"); li.append(el("span", "tick"), el("span", null, t)); checks.append(li); return li;
      });
      box.append(checks);
      s.append(box);
      rows[0].classList.add("now");

      D2L.readAll((p) => {
        if (p.step === "courses" && p.done) {
          rows[0].className = "ok"; rows[0].lastChild.textContent = `${plural(p.count, "course")} this term`;
          rows[1].className = "now"; rows[2].className = "now";
        }
        if (p.step === "details") rows[1].lastChild.textContent = `course outlines (${p.done}/${p.total})`;
      }).then((res) => {
        state = res;
        rows[1].className = "ok"; rows[2].className = "ok";
        setTimeout(() => (state.courses.length ? confirmScreen() : emptyScreen()), 450);
      }).catch((e) => errorScreen("couldn't read mylearningspace", e.message, fetchScreen));
    });
  }

  function emptyScreen() {
    show(0, (s, f) => {
      const box = el("div", "center");
      box.append(el("h2", null, "no courses this term"), el("p", null, "we didn't find any courses running right now in mylearningspace."));
      s.append(box);
      f.append(btn("ghost", "close", () => { closePanel(); }));
    });
  }

  // ---------------------------------------------------------------- 2. confirm

  function confirmScreen() {
    for (const c of state.courses) {
      if (c.on !== undefined) continue;   // keep choices when coming back
      const usable = c.outlines.filter((o) => o.supported);
      c.pick = usable[0] ? usable[0].key : "";
      c.localFile = null;
      c.on = !!usable.length || c.items.some((i) => i.date);
    }
    show(1, (s, f) => {
      s.append(el("h2", null, "pick what to send"), el("p", null, "we picked the ones with an outline or due dates. change anything."));
      const next = btn("primary", "", noticeScreen);
      const count = () => {
        const n = state.courses.filter((c) => c.on).length;
        next.textContent = n ? `next · ${plural(n, "course")} →` : "pick a course";
        next.disabled = !n;
      };
      for (const c of state.courses) s.append(courseCard(c, count));
      f.append(btn("ghost", "close", () => { closePanel(); }), next);
      count();
    });
  }

  function courseCard(c, onToggle) {
    const box = el("div", c.on ? "course" : "course off");
    const row = el("label", "row");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = c.on;
    cb.addEventListener("change", () => { c.on = cb.checked; box.classList.toggle("off", !c.on); onToggle(); });
    const text = el("div");
    const dated = c.items.filter((i) => i.date).length;
    text.append(el("div", "code", shortName(c)), el("div", "name", title(c)),
      el("div", "meta", `${plural(dated, "due date")}${c.items.length > dated ? ` · ${c.items.length - dated} undated` : ""}`));
    row.append(cb, text);
    box.append(row);

    // Outline: what we found in D2L, a file from this computer (outlines that
    // came by email or sit behind a link), or none.
    const sel = el("select");
    for (const o of c.outlines) {
      const opt = el("option", null, `📄 ${o.title}.${o.ext}${o.supported ? "" : " — .doc can't be read, save as .docx/pdf"}`);
      opt.value = o.key; opt.disabled = !o.supported;
      sel.append(opt);
    }
    const pickLocal = el("option", null, c.localFile ? `📄 ${c.localFile.file.name} · this computer` : "pick a file from this computer…");
    pickLocal.value = "__local";
    const none = el("option", null, c.outlines.length ? "don't use an outline" : "no outline in d2l — add class times later");
    none.value = "";
    sel.append(pickLocal, none);
    sel.value = c.pick;
    const file = el("input"); file.type = "file"; file.accept = ".pdf,.docx"; file.hidden = true;
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      const ext = f ? ((f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase() : "";
      if (!f || !["pdf", "docx"].includes(ext) || f.size > 5 * 1024 * 1024) {
        c.localFile = null; sel.value = c.pick = "";
        return;
      }
      c.localFile = { file: f, ext };
      pickLocal.textContent = `📄 ${f.name} · this computer`;
    });
    sel.addEventListener("change", () => {
      c.pick = sel.value;
      if (sel.value === "__local") file.click();
    });
    box.append(sel, file);
    return box;
  }

  // ---------------------------------------------------------------- 3. notice

  function noticeScreen() {
    const chosen = state.courses.filter((c) => c.on);
    const outlines = chosen.filter((c) => c.pick && (c.pick !== "__local" || c.localFile)).length;
    const dated = chosen.reduce((n, c) => n + c.items.filter((i) => i.date).length, 0);
    show(2, (s, f) => {
      s.append(el("h2", null, "quick heads-up"), el("p", null, "here's what happens next."));
      const facts = el("ul", "facts");
      const fact = (ico, strong, rest) => {
        const li = el("li"); const t = el("div");
        t.append(el("b", null, strong), document.createTextNode(` ${rest}`));
        li.append(el("span", "ico", ico), t); facts.append(li);
      };
      fact("📚", plural(chosen.length, "course"), `+ ${plural(dated, "due date")} go to timetify.`);
      if (outlines) fact("✨", `ai reads ${plural(outlines, "outline")}`, `for class times, rooms + exams — about 20s each.`);
      fact("👀", "nothing's saved yet.", "u check everything on timetify first, then save.");
      fact("🔒", "only course stuff.", "no grades, messages or classmates.");
      s.append(facts);
      const where = el("p", "fine");
      const change = el("a", null, "change"); change.href = "#";
      change.addEventListener("click", (e) => { e.preventDefault(); send({ type: "openOptions" }).catch(() => {}); });
      where.append(document.createTextNode("sending to "), el("b", "where", "timetify"), document.createTextNode(" ("), change, document.createTextNode(")"));
      const callout = el("div", "callout");
      callout.hidden = true;
      callout.textContent = "first time only: a small timetify window opens so u can connect ur account. it closes by itself, and u won't see it again.";
      s.append(callout, where);
      send({ type: "whereTo" }).then((w) => { where.querySelector(".where").textContent = w.label; }).catch(() => {});
      send({ type: "connected" }).then((r) => { callout.hidden = r.connected; }).catch(() => { callout.hidden = false; });
      f.append(btn("ghost", "back", confirmScreen), btn("primary coral", "start sync →", () => syncScreen(chosen)));
    });
  }

  // ---------------------------------------------------------------- 4. syncing

  async function syncScreen(chosen) {
    running = true;
    const withOutline = chosen.filter((c) => c.pick && (c.pick !== "__local" || c.localFile));
    const total = 3 + withOutline.length;   // connect, send, each outline, double-check
    let done = 0;
    let bar, tasks, headline;
    show(3, (s) => {
      headline = el("h2", null, "syncing…");
      s.append(headline, el("p", null, "keep this tab open. u can keep using mylearningspace."));
      const b = el("div", "bar"); bar = el("i"); b.append(bar); s.append(b);
      tasks = el("ul", "tasks"); s.append(tasks);
      s.append(el("div", "hint", "outlines take ~20s each — the ai is reading the whole thing."));
    });
    const tick = () => { bar.style.width = `${Math.round((++done / total) * 100)}%`; };
    const task = (text, sub = "") => {
      const li = el("li"); li.append(el("span", "tick"), el("span", null, text), el("span", "sub", sub));
      tasks.append(li);
      return {
        now(subText) { li.className = "now"; if (subText != null) li.querySelector(".sub").textContent = subText; },
        ok(subText) { li.className = "ok"; li.querySelector(".tick").textContent = "✓"; if (subText != null) li.querySelector(".sub").textContent = subText; },
        warn(subText) { li.className = "warn"; li.querySelector(".tick").textContent = "!"; li.querySelector(".sub").textContent = subText; },
      };
    };

    const connect = task("connecting to timetify");
    const stage = task(`sending ${plural(chosen.length, "course")} + due dates`);
    const outlineTasks = new Map(withOutline.map((c) => [c.id, task(`${shortName(c)} outline`, "waiting")]));
    const check = task("double-checking with myls", "waiting");
    const results = { outlinesRead: 0, failed: [], unchecked: [], tidied: 0 };

    try {
      connect.now();
      await send({ type: "connect" });
      connect.ok(); tick();

      stage.now();
      const staged = await send({
        type: "stage",
        payload: {
          source: "d2l",
          host: location.hostname,
          courses: chosen.map(({ id, code, name, start_date, end_date, items }) => ({ id, code, name, start_date, end_date, items })),
        },
      });
      stage.ok(); tick();

      // Two at a time: each parse is ~20s, and one failing shouldn't sink the rest.
      headline.textContent = "reading outlines…";
      const queue = [...withOutline];
      const worker = async () => {
        for (let c = queue.shift(); c; c = queue.shift()) {
          const t = outlineTasks.get(c.id);
          t.now("reading…");
          try {
            let buf, ext;
            if (c.pick === "__local") {
              buf = await c.localFile.file.arrayBuffer(); ext = c.localFile.ext;
            } else {
              const o = c.outlines.find((x) => x.key === c.pick);
              buf = await D2L.download(state.v, c.id, o); ext = o.ext;
            }
            await send({ type: "outline", importId: staged.id, course: c.id, ext, b64: toBase64(buf) });
            results.outlinesRead++;
            t.ok("read");
          } catch (e) {
            results.failed.push({ course: c, why: e.message });
            t.warn("couldn't read");
          }
          tick();
        }
      };
      await Promise.all([worker(), worker()]);

      // Second pass: line the outline up against MyLS. MyLS wins on dates;
      // the ai only decides what the fixed rules couldn't match.
      headline.textContent = "double-checking…";
      check.now(`0/${chosen.length}`);
      let checked = 0;
      const checkQueue = [...chosen];
      const checker = async () => {
        for (let c = checkQueue.shift(); c; c = checkQueue.shift()) {
          try {
            const r = await send({ type: "reconcile", importId: staged.id, course: c.id });
            if (r.status !== "ok") results.unchecked.push(c);
            results.tidied += (r.merged || 0) + (r.dropped || 0) + (r.placeholders || 0);
          } catch (e) {
            results.unchecked.push(c);
          }
          check.now(`${++checked}/${chosen.length}`);
        }
      };
      await Promise.all([checker(), checker(), checker()]);
      if (results.unchecked.length) check.warn(`${results.unchecked.length} not checked`);
      else check.ok(results.tidied ? `${results.tidied} tidied up` : "all lined up");
      tick();
      bar.style.width = "100%";
      running = false;
      setTimeout(() => doneScreen(chosen, staged.review_url, results), 500);
    } catch (e) {
      running = false;
      errorScreen("sync didn't finish", e.message, noticeScreen);
    }
  }

  // ---------------------------------------------------------------- 5. done

  function doneScreen(chosen, reviewUrl, results) {
    const dated = chosen.reduce((n, c) => n + c.items.filter((i) => i.date).length, 0);
    const outlineIds = new Set(chosen.filter((c) => c.pick).map((c) => c.id));
    const failedIds = new Set(results.failed.map((f) => f.course.id));
    // Courses that will arrive without class times: no outline picked, or it
    // couldn't be read. They need the student's input on the review page.
    const noTimes = chosen.filter((c) => !outlineIds.has(c.id) || failedIds.has(c.id));
    const clean = !results.failed.length && !noTimes.length && !results.unchecked.length;

    show(3, (s, f) => {
      const box = el("div", "center");
      box.style.paddingTop = "18px";
      box.append(el("div", clean ? "badge" : "badge soft", clean ? "✓" : "✎"),
        el("h2", null, clean ? "ready for review" : "almost there"),
        el("p", null, clean
          ? "everything's on timetify, waiting for u. nothing's saved till u confirm."
          : "most of it's in. a couple of things need u on the review page."));
      const stats = el("div", "stats");
      for (const [n, label] of [[chosen.length, "courses"], [results.outlinesRead, "outlines read"], [dated, "due dates"]]) {
        const st = el("div", "stat"); st.append(el("b", null, String(n)), el("span", null, label)); stats.append(st);
      }
      box.append(stats);
      s.append(box);
      if (!clean) {
        const todo = el("div", "todo");
        todo.append(el("b", null, "to finish on timetify:"));
        const ul = el("ul");
        for (const fl of results.failed) ul.append(el("li", null, `${shortName(fl.course)}: we couldn't read the outline — add class times, or sync again later`));
        for (const c of noTimes.filter((x) => !failedIds.has(x.id))) ul.append(el("li", null, `${shortName(c)}: no outline — add when it meets`));
        for (const c of results.unchecked) ul.append(el("li", null, `${shortName(c)}: couldn't double-check against myls — look over its due dates`));
        todo.append(ul);
        s.append(todo);
      }
      const review = btn("primary coral", "review on timetify →", async () => {
        try {
          await send({ type: "open", url: reviewUrl });
          closePanel();
        } catch (e) {
          review.textContent = `couldn't open it: ${e.message}`;
        }
      });
      f.append(btn("ghost", "close", () => { closePanel(); }), review);
    });
  }

  // ---------------------------------------------------------------- start

  function homeScreen() {
    show(-1, (s) => {
      s.append(el("h2", null, "what do u want to do?"),
        el("p", null, "both end on timetify, where u check everything before it's saved."));
      const choice = (icon, title, sub, go) => {
        const b = btn("choice", null, go);
        const t = el("div");
        t.append(el("b", null, title), el("span", null, sub));
        b.append(el("div", "big", icon), t);
        return b;
      };
      s.append(
        choice("📚", "record my courses", "courses, outlines + due dates from mylearningspace.", fetchScreen),
        choice("📝", "find my exam schedule", "official final exam dates, times + rooms for ur courses.", examSetupScreen),
      );
    });
  }

  // ---------------------------------------------------------------- exams

  // Laurier only for now; the list is how another school gets added.
  const UNIS = { laurier: { name: "Wilfrid Laurier University", campuses: { waterloo: "Waterloo", brantford: "Brantford", milton: "Milton" } } };
  const SEASON = { "01": "winter", "05": "spring", "09": "fall" };
  const exam = { uni: "laurier", campus: null, term: null, rows: null };

  // "CP-363-B - Database I" → { code: "CP363", section: "B" }; "CP-220-PC-220-A-B"
  // → CP220 · "A, B". Lab shells ("MA-123-Labs") have no final, so they're left out.
  function courseFromName(name) {
    const head = String(name || "").split(" - ")[0];
    const m = head.match(/^([A-Za-z]{2,5})-?(\d{3,4}[A-Za-z]?)(.*)$/);
    if (!m || /lab/i.test(m[3])) return null;
    // "-PC-220-A-B": "PC" is a cross-listed subject (a number follows it),
    // "A"/"B" are sections. Brantford's "BR", Milton's "MC1" are sections too.
    const toks = m[3].split("-").map((t) => t.trim().toUpperCase()).filter(Boolean);
    const sections = toks.filter((t, i) => /^[A-Z]{1,3}\d{0,2}$/.test(t) && !/^\d/.test(toks[i + 1] || ""));
    return { code: `${m[1]}${m[2]}`.toUpperCase(), section: sections.join(", ") };
  }

  // D2L course codes end in the term ("3006.202609"); the most common one wins.
  function termOf(courses) {
    const counts = {};
    for (const c of courses) {
      const m = String(c.code || "").match(/\.(20\d{2}(?:01|05|09))$/);
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (best) return best[0];
    const d = new Date();
    return `${d.getFullYear()}${d.getMonth() < 4 ? "01" : d.getMonth() < 8 ? "05" : "09"}`;
  }
  const termLabel = (t) => `${SEASON[t.slice(4)]} ${t.slice(0, 4)}`;
  const normCode = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  async function examSetupScreen() {
    const { examCampus } = await chrome.storage.local.get("examCampus").catch(() => ({}));
    if (examCampus && !exam.campus) exam.campus = examCampus;
    show(0, (s, f) => {
      s.append(el("h2", null, "ur exam schedule"), el("p", null, "we'll read ur school's official final exam schedule."));
      s.append(el("div", "label", "school"));
      const uni = el("div", "pills");
      for (const [k, u] of Object.entries(UNIS)) {
        const b = btn("pill on", u.name, () => {});
        b.dataset.k = k;
        uni.append(b);
      }
      s.append(uni, el("div", "label", "campus"));
      const pills = el("div", "pills");
      const next = btn("primary", "next →", () => {
        chrome.storage.local.set({ examCampus: exam.campus }).catch(() => {});
        examCoursesScreen();
      });
      const paint = () => {
        pills.querySelectorAll(".pill").forEach((p) => p.classList.toggle("on", p.dataset.k === exam.campus));
        next.disabled = !exam.campus;
      };
      for (const [k, name] of Object.entries(UNIS[exam.uni].campuses)) {
        const b = btn("pill", name, () => { exam.campus = k; paint(); });
        b.dataset.k = k;
        pills.append(b);
      }
      s.append(pills);
      paint();
      f.append(btn("ghost", "back", homeScreen), next);
    });
  }

  async function examCoursesScreen() {
    if (!exam.rows) {
      show(1, (s) => {
        const box = el("div", "center");
        box.append(el("div", "spinner"), el("p", null, "getting ur courses from mylearningspace…"));
        s.append(box);
      });
      try {
        const v = state ? state.v : await D2L.versions();
        const courses = state ? state.courses : await D2L.currentCourses(v);
        exam.term = termOf(courses);
        const seen = new Set();
        exam.rows = [];
        for (const c of courses) {
          const x = courseFromName(c.name);
          if (x && !seen.has(x.code)) { seen.add(x.code); exam.rows.push({ ...x, name: c.name.split(" - ").slice(1).join(" - "), on: true }); }
        }
      } catch (e) {
        exam.term = termOf([]);
        exam.rows = [];
      }
    }
    show(1, (s, f) => {
      s.append(el("h2", null, "which courses?"),
        el("p", null, `${termLabel(exam.term)} · from ur mylearningspace courses. ur section picks the right exam slot when sections differ.`));
      const list = el("div");
      const go = btn("primary", "", examLookupScreen);
      const count = () => {
        const n = exam.rows.filter((r) => r.on).length;
        go.textContent = n ? `find ${n} exam${n === 1 ? "" : "s"} →` : "pick a course";
        go.disabled = !n;
      };
      const paint = () => {
        list.replaceChildren();
        for (const r of exam.rows) {
          const row = el("div", "xrow");
          const cb = el("input"); cb.type = "checkbox"; cb.checked = r.on;
          cb.addEventListener("change", () => { r.on = cb.checked; count(); });
          const sec = el("input", "sec"); sec.placeholder = "section"; sec.value = r.section || "";
          sec.addEventListener("input", () => { r.section = sec.value.toUpperCase(); });
          row.append(cb, el("span", "c", r.code), el("span", "t", r.name || ""), sec);
          list.append(row);
        }
        count();
      };
      s.append(list);
      const add = el("div", "add");
      const code = el("input"); code.placeholder = "add a course, e.g. CP104";
      const sec = el("input", "sec"); sec.placeholder = "section";
      const addIt = () => {
        const c = normCode(code.value);
        if (!/^[A-Z]{2,5}\d{3,4}[A-Z]?$/.test(c)) { code.style.borderColor = "#ed6a4a"; return; }
        code.style.borderColor = "";
        const hit = exam.rows.find((r) => r.code === c);
        if (hit) { hit.on = true; if (sec.value) hit.section = sec.value.toUpperCase(); }
        else exam.rows.push({ code: c, section: sec.value.toUpperCase(), name: "added by u", on: true });
        code.value = ""; sec.value = "";
        paint();
      };
      code.addEventListener("keydown", (e) => { if (e.key === "Enter") addIt(); });
      add.append(code, sec, btn(null, "add", addIt));
      s.append(add);
      paint();
      f.append(btn("ghost", "back", examSetupScreen), go);
    });
  }

  async function examLookupScreen() {
    const wanted = exam.rows.filter((r) => r.on);
    const campusName = UNIS[exam.uni].campuses[exam.campus];
    show(2, (s) => {
      const box = el("div", "center");
      box.append(el("div", "spinner"), el("h2", null, "opening the schedule"),
        el("p", null, `taking u to laurier's ${campusName} exam schedule for ${termLabel(exam.term)}. if laurier asks u to sign in, do it — we'll bring u back here.`));
      s.append(box);
    });
    // Without site access to students.wlu.ca (e.g. Chrome's "On click" setting)
    // the schedule page's script never runs and the tab would just sit on the
    // raw file. Say so here, before leaving.
    const access = await send({ type: "examAccess" }).catch(() => ({ ok: true }));
    if (!access.ok) {
      return errorScreen("timetify sync can't open laurier's site",
        "on chrome://extensions → timetify lms sync → details → site access, pick \"on all sites\" (or add students.wlu.ca), then try again.",
        examLookupScreen);
    }
    // This tab goes to Laurier's schedule file itself: a normal, visible page
    // visit, so Laurier's sign-in runs as usual (and the student sees it if
    // it wants a login) and Chrome never freezes it. exams.js copies the page
    // text there, Timetify filters it, and the tab comes back here with the
    // results (picked up below on load).
    try {
      await chrome.storage.local.set({ pendingExamLookup: {
        uni: exam.uni, campus: exam.campus, term: exam.term, at: Date.now(), returnUrl: location.href,
        courses: wanted.map((r) => ({ code: r.code, section: r.section, name: r.name || "" })),
      } });
    } catch (e) {
      document.documentElement.dataset.timetify = `pending save failed: ${e.message}`;
      return errorScreen("couldn't start the lookup", STALE, examLookupScreen);
    }
    document.documentElement.dataset.timetify = "pending saved, leaving for laurier";
    location.assign(`https://students.wlu.ca/academics/exams/assets/resources/${exam.campus}${exam.term}E.txt`);
  }

  const fmtDate = (iso) => iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }).toLowerCase()
    : "date tba";

  function examResultsScreen(res) {
    const results = res.results || [];
    const staged = results.filter((r) => r.status === "found" && r.timetify_course);
    show(3, (s, f) => {
      s.append(el("h2", null, staged.length ? "found ur exams" : "here's what we found"),
        el("p", null, staged.length
          ? "these go to the review page on timetify. nothing's saved till u confirm."
          : "nothing to add to ur timetify yet — see below."));
      for (const r of results) {
        const card = el("div", "exam");
        card.append(el("div", "code", `${r.code}${r.section ? ` · ${r.section}` : ""}`));
        if (r.status === "found") {
          card.append(el("div", "when", `${fmtDate(r.date)} · ${(r.time_text || "time tba").toLowerCase()}`),
            el("div", "where", r.room ? `room ${r.room}` : "room tba — laurier posts rooms closer to exams"));
          if (!r.timetify_course) card.classList.add("muted");
        } else if (r.status === "skipped") {
          card.classList.add("muted");
          card.append(el("div", "when", `${fmtDate(r.date)} · ${(r.time_text || "time tba").toLowerCase()}`),
            el("div", "where", "not on ur timetify yet — skipped. record ur courses first, then run this again."));
        } else if (r.status === "not_listed") {
          card.classList.add("muted");
          card.append(el("div", "where", "no final on this campus's schedule (labs + some courses don't have one)."));
        } else if (r.status === "pick_section") {
          card.append(el("div", "where", "sections write at different times — which is urs?"));
          const opts = el("div", "opts");
          for (const o of r.options || []) {
            opts.append(btn(null, `section ${o.sections.join(", ")} · ${fmtDate(o.date)} · ${String(o.time_text || "").toLowerCase()}`, () => {
              const row = exam.rows.find((x) => x.code === r.code);
              if (row) row.section = o.sections[0];
              examLookupScreen();
            }));
          }
          card.append(opts);
        }
        s.append(card);
      }
      s.append(el("div", "fine", "rooms + changes: run this again closer to exams to pick them up."));
      if (res.review_url && staged.length) {
        const review = btn("primary coral", `add ${staged.length} exam${staged.length === 1 ? "" : "s"} on timetify →`, async () => {
          try { await send({ type: "open", url: res.review_url }); closePanel(); }
          catch (e) { review.textContent = `couldn't open it: ${e.message}`; }
        });
        f.append(btn("ghost", "back", examCoursesScreen), review);
      } else {
        f.append(btn("ghost", "back", examCoursesScreen), btn("primary", "done", () => { closePanel(); }));
      }
    });
  }

  // ---------------------------------------------------------------- errors

  function errorScreen(heading, message, retry) {
    show(1, (s, f) => {
      const box = el("div", "center");
      box.append(el("div", "badge soft", "!"), el("h2", null, heading), el("p", null, message));
      s.append(box);
      f.append(btn("ghost", "close", () => { closePanel(); }), btn("primary", "try again", retry));
    });
  }

  // ---------------------------------------------------------------- wiring

  fab.addEventListener("click", () => {
    if (!panel.hidden) return closePanel();
    panel.hidden = false;
    if (!running && !screen.childNodes.length) homeScreen();
  });

  // Back from Laurier's schedule page (exams.js left the results): open the
  // panel straight on them. Not deleted on read — D2L's home can load twice
  // on the way back (it forwards to another address), and the second load
  // must still show them. Cleared when the panel is closed, or after 2 min.
  chrome.storage.local.get("examResults").then(({ examResults: r }) => {
    if (!r) return;
    if (Date.now() - r.at > 2 * 60e3) { chrome.storage.local.remove("examResults").catch(() => {}); return; }
    Object.assign(exam, { uni: r.uni, campus: r.campus, term: r.term });
    exam.rows = exam.rows || r.courses.map((c) => ({ ...c, name: c.name || "", on: true }));
    panel.hidden = false;
    if (r.error) errorScreen("couldn't read the schedule", r.error, examLookupScreen);
    else examResultsScreen(r.data);
  }).catch(() => {});
  $(".x").addEventListener("click", () => { closePanel(); });
  $(".home").addEventListener("click", () => { if (!running) homeScreen(); });
})();
