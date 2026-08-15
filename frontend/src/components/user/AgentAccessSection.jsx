import { useState, useEffect, useCallback } from "react";
import { T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

// Mirrors main/mcp/scopes.py. Reads first, writes last and visually separated —
// granting an agent the ability to change a schedule should read as a bigger
// decision than letting it look at one.
const SCOPES = [
  { id: "schedule:read",     label: "read today's classes",              write: false },
  { id: "availability:read", label: "read your free/busy times",         write: false },
  { id: "friends:read",      label: "find free time you share with friends", write: false },
  { id: "unread:read",       label: "read your unread message count",    write: false },
  { id: "schedule:write",    label: "add classes to your timetable",     write: true },
  { id: "events:write",      label: "add events to your calendar",       write: true },
];

const DEFAULT_SCOPES = ["schedule:read", "availability:read"];

// In production this must be the canonical domain, not VITE_API_URL (which is
// the raw Cloud Run hostname): nginx proxies /mcp/v1/ through to Django so the
// address stays stable even if the backend service moves. Same reasoning as
// CANONICAL_DOMAIN on the backend. In dev there's no nginx, so talk to Django
// directly.
const MCP_URL = import.meta.env.PROD
  ? "https://timetify.net/mcp/v1/"
  : `${import.meta.env.VITE_API_URL || ""}/mcp/v1/`;

// "never" reads better than an empty cell, and a rough relative age is all this
// needs to answer: is this token actually in use, or just sitting there?
function relativeTime(iso) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

function CopyField({ value, mono = true }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked in some embedded browsers; the field is
      // select-on-focus so the user can still copy by hand.
    }
  };
  return (
    <div className="w-full flex items-center gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        className="flex-1 min-w-0 px-3 py-2 border border-ink-15 bg-cream rounded-full text-xs text-ink-60 outline-none"
        style={mono ? { fontFamily: FF.mono } : undefined}
      />
      <button
        onClick={copy}
        className="px-3 py-2 rounded-full text-xs font-semibold lowercase whitespace-nowrap"
        style={{ background: copied ? T.lime : T.ink, color: copied ? T.ink : "#fff" }}
      >
        {copied ? "copied!" : "copy"}
      </button>
    </div>
  );
}

export default function AgentAccessSection() {
  const [tokens, setTokens] = useState(null);
  const [connections, setConnections] = useState(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(DEFAULT_SCOPES);
  const [minting, setMinting] = useState(false);
  const [freshToken, setFreshToken] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [editing, setEditing] = useState(null);      // token id being edited
  const [editScopes, setEditScopes] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/agent-tokens/`);
      if (res.ok) setTokens((await res.json()).tokens || []);
      else setTokens([]);
    } catch {
      setTokens([]);
    }
  }, []);

  // Apps that connected by signing in (claude.ai, chatgpt) rather than by
  // pasting a token. Separate call so a failure in one list doesn't blank the
  // other — they're independent ways in and the user may only have one.
  const loadConnections = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/agent-connections/`);
      if (res.ok) setConnections((await res.json()).connections || []);
      else setConnections([]);
    } catch {
      setConnections([]);
    }
  }, []);

  useEffect(() => { load(); loadConnections(); }, [load, loadConnections]);

  const toggleScope = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const mint = async () => {
    if (!selected.length) { setError("pick at least one thing it can do."); return; }
    setMinting(true);
    setError("");
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/agent-tokens/`, {
        method: "POST",
        body: JSON.stringify({ name, scopes: selected }),
      });
      const data = await res.json();
      if (res.ok) {
        setFreshToken(data.token);
        setName("");
        setSelected(DEFAULT_SCOPES);
        load();
      } else {
        setError(data.detail || "couldn't create that token.");
      }
    } catch {
      setError("couldn't reach the server.");
    } finally {
      setMinting(false);
    }
  };

  const startEdit = (t) => {
    setEditing(t.id);
    setEditScopes(t.scopes || []);
    setError("");
  };

  const saveEdit = async (id) => {
    if (!editScopes.length) { setError("a token needs at least one permission."); return; }
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/agent-tokens/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ scopes: editScopes }),
      });
      if (res.ok) {
        setEditing(null);
        load();
      } else {
        setError((await res.json()).detail || "couldn't update that token.");
      }
    } catch {
      setError("couldn't reach the server.");
    }
  };

  const revoke = async (id) => {
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/agent-tokens/${id}/`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConfirmRevoke(null);
        load();
      }
    } catch {
      setError("couldn't revoke that token.");
    }
  };

  const disconnect = async (clientId) => {
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/agent-connections/${encodeURIComponent(clientId)}/`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setConfirmDisconnect(null);
        loadConnections();
      } else {
        setError("couldn't disconnect that app.");
      }
    } catch {
      setError("couldn't reach the server.");
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-ink-60 lowercase leading-relaxed">
        this lets an ai agent you run — like hermes, or claude — read your schedule and
        free time, and if you allow it, add classes and events. it can&apos;t post snaps,
        send messages, or see anyone else&apos;s stuff. anything it creates has to be
        confirmed first, and you can revoke access any time.
      </p>

      {/* Raw token, shown exactly once. */}
      {freshToken && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: T.coralLt }}>
          <MonoLabel fs={10} color={T.coralDk}>copy this now</MonoLabel>
          <p className="text-xs lowercase" style={{ color: T.ink }}>
            this is the only time you&apos;ll see it. paste it into your agent&apos;s config.
          </p>
          <CopyField value={freshToken} />
          <button
            onClick={() => setFreshToken(null)}
            className="text-xs lowercase underline"
            style={{ color: T.coralDk }}
          >
            done, hide it
          </button>
        </div>
      )}

      {/* Apps connected by signing in. Rendered only when there are any: the
          block at the bottom already explains how to add one, so an empty list
          would be noise for the majority who only use a pasted token. */}
      {connections !== null && connections.length > 0 && (
        <div>
          <MonoLabel fs={10}>connected apps</MonoLabel>
          <div className="divide-y divide-ink-8 mt-2">
            {connections.map((c) => (
              <div key={c.client_id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink lowercase truncate">
                    {c.name || "an app"}
                  </div>
                  <div className="text-[11px] text-ink-60 lowercase mt-0.5">
                    {(c.scopes || []).length} permission{(c.scopes || []).length === 1 ? "" : "s"}
                    {" · last used "}{relativeTime(c.last_used_at)}
                  </div>
                  <div className="text-[11px] text-ink-40 lowercase mt-1">
                    {(c.scopes || [])
                      .map((id) => SCOPES.find((s) => s.id === id)?.label || id)
                      .join(", ")}
                  </div>
                </div>
                {confirmDisconnect === c.client_id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <PillBtn onClick={() => disconnect(c.client_id)} bg={T.coral} fg="#fff" size="sm">
                      disconnect
                    </PillBtn>
                    <PillBtn
                      onClick={() => setConfirmDisconnect(null)}
                      bg="#fff"
                      fg={T.ink}
                      size="sm"
                      style={{ border: `1px solid ${T.ink15}` }}
                    >
                      cancel
                    </PillBtn>
                  </div>
                ) : (
                  <PillBtn
                    onClick={() => setConfirmDisconnect(c.client_id)}
                    bg="#fff"
                    fg={T.coralDk}
                    size="sm"
                    style={{ border: `1px solid ${T.ink15}` }}
                  >
                    disconnect
                  </PillBtn>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-ink-60 lowercase mt-2">
            to change what one of these can do, disconnect it and connect again —
            it&apos;ll ask you what to allow.
          </p>
        </div>
      )}

      {/* Existing tokens */}
      <div>
        <MonoLabel fs={10}>your agent tokens</MonoLabel>
        {tokens === null ? (
          <div className="h-12 bg-ink-8 animate-pulse rounded-xl mt-2" />
        ) : tokens.length === 0 ? (
          <p className="text-xs text-ink-40 lowercase mt-2">none yet.</p>
        ) : (
          <div className="divide-y divide-ink-8 mt-2">
            {tokens.map((t) => (
              <div key={t.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink lowercase truncate">
                      {t.name || "unnamed token"}
                    </div>
                    <div className="text-[11px] text-ink-60 lowercase mt-0.5">
                      {(t.scopes || []).length} permission{(t.scopes || []).length === 1 ? "" : "s"}
                      {" · last used "}{relativeTime(t.last_used_at)}
                    </div>
                  </div>
                  {confirmRevoke === t.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <PillBtn onClick={() => revoke(t.id)} bg={T.coral} fg="#fff" size="sm">
                        revoke
                      </PillBtn>
                      <PillBtn
                        onClick={() => setConfirmRevoke(null)}
                        bg="#fff"
                        fg={T.ink}
                        size="sm"
                        style={{ border: `1px solid ${T.ink15}` }}
                      >
                        cancel
                      </PillBtn>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <PillBtn
                        onClick={() => (editing === t.id ? setEditing(null) : startEdit(t))}
                        bg="#fff"
                        fg={T.ink}
                        size="sm"
                        style={{ border: `1px solid ${T.ink15}` }}
                      >
                        {editing === t.id ? "close" : "permissions"}
                      </PillBtn>
                      <PillBtn
                        onClick={() => setConfirmRevoke(t.id)}
                        bg="#fff"
                        fg={T.coralDk}
                        size="sm"
                        style={{ border: `1px solid ${T.ink15}` }}
                      >
                        revoke
                      </PillBtn>
                    </div>
                  )}
                </div>

                {/* Change what a live token can reach without re-pasting it
                    into the agent's config — the token itself doesn't change. */}
                {editing === t.id && (
                  <div className="mt-3 rounded-xl px-3 py-3 space-y-1.5" style={{ background: T.cream }}>
                    {SCOPES.map((s) => (
                      <label key={s.id} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={editScopes.includes(s.id)}
                          onChange={() =>
                            setEditScopes((prev) =>
                              prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                            )
                          }
                          className="w-4 h-4 accent-coral shrink-0"
                        />
                        <span className="text-xs text-ink lowercase">
                          {s.label}
                          {s.write && (
                            <span className="ml-1.5" style={{ color: T.coralDk, fontFamily: FF.mono, fontSize: 9 }}>
                              can change things
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                    <div className="pt-1.5">
                      <PillBtn onClick={() => saveEdit(t.id)} bg={T.ink} fg="#fff" size="sm">
                        save permissions
                      </PillBtn>
                    </div>
                    <p className="text-[10px] text-ink-60 lowercase pt-0.5">
                      takes effect right away — you don&apos;t need to update your agent.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mint */}
      <div className="border-t border-ink-8 pt-4 space-y-3">
        <MonoLabel fs={10}>new token</MonoLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="what's it for? e.g. hermes"
          maxLength={100}
          className="w-full px-4 py-2.5 rounded-2xl border border-ink-15 bg-white text-sm text-ink outline-none placeholder:text-ink-40 focus:border-coral"
        />

        <div className="space-y-1.5">
          {SCOPES.filter((s) => !s.write).map((s) => (
            <label key={s.id} className="flex items-center gap-2.5 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => toggleScope(s.id)}
                className="w-4 h-4 accent-coral shrink-0"
              />
              <span className="text-xs text-ink lowercase">{s.label}</span>
            </label>
          ))}
        </div>

        <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ background: T.cream }}>
          <MonoLabel fs={9} color={T.coralDk}>lets it change things</MonoLabel>
          {SCOPES.filter((s) => s.write).map((s) => (
            <label key={s.id} className="flex items-center gap-2.5 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => toggleScope(s.id)}
                className="w-4 h-4 accent-coral shrink-0"
              />
              <span className="text-xs text-ink lowercase">{s.label}</span>
            </label>
          ))}
          <p className="text-[10px] text-ink-60 lowercase pt-0.5">
            it always has to show you what it&apos;s about to add and wait for a yes.
          </p>
        </div>

        {error && <p className="text-xs lowercase" style={{ color: T.coralDk }}>{error}</p>}

        <PillBtn onClick={mint} disabled={minting} bg={T.coral} fg="#fff" size="sm">
          {minting ? "creating…" : "generate token"}
        </PillBtn>
      </div>

      {/* Setup. Timetify provides the server, not help configuring anyone's agent. */}
      <div className="border-t border-ink-8 pt-4 space-y-2">
        <MonoLabel fs={10}>server address</MonoLabel>
        <CopyField value={MCP_URL} />
        <p className="text-[10px] text-ink-60 lowercase leading-relaxed">
          add this as an mcp server in your agent, and send your token as the
          <span style={{ fontFamily: FF.mono }}> authorization: bearer </span>
          header. we can&apos;t help set up individual agents — that part&apos;s on you.
        </p>
      </div>

      {/* The sign-in route. Same server address as above — those clients take a
          URL and run the handshake themselves, which is why there's no button
          here for us to provide. */}
      <div className="border-t border-ink-8 pt-4">
        <MonoLabel fs={10}>connecting from claude.ai or chatgpt?</MonoLabel>
        <p className="text-[11px] text-ink-60 lowercase mt-1.5 leading-relaxed">
          those don&apos;t need a token. add the server address above as a connector
          and they&apos;ll send you here to sign in and choose what to allow. it shows
          up under connected apps, and you can disconnect it from there.
        </p>
      </div>
    </div>
  );
}
