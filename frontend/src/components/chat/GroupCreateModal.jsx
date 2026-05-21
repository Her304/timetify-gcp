import { useMemo, useState } from "react";
import { T, FF, Avatar, Icon, MonoLabel } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

const NAME_MAX = 80;
const MIN_MEMBERS = 2;

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const AVATAR_BG = [T.coral, T.lilac, "#f0c4a8", "#b8d8c2", T.lime];
const colorForUser = (name) => AVATAR_BG[hashStr(name) % AVATAR_BG.length];

export default function GroupCreateModal({ friendsList = [], onClose, onCreated }) {
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const friends = useMemo(
    () => friendsList.map((f) => f.friend_details).filter(Boolean),
    [friendsList]
  );

  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.username.toLowerCase().includes(q));
  }, [friends, query]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  };

  const canSubmit =
    name.trim().length > 0 &&
    selectedIds.size >= MIN_MEMBERS &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/chats/groups/`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            member_ids: Array.from(selectedIds),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.detail === "not_friends") setError("some picks aren't your friends");
        else if (data.detail === "blocked") setError("can't add a blocked user");
        else setError(data.detail || "couldn't create group");
        setSubmitting(false);
        return;
      }
      onCreated && onCreated(data.id);
    } catch {
      setError("network error");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{ background: T.ink, color: "#fff", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,.08)" }}>
          <div>
            <MonoLabel color="rgba(255,255,255,.55)" fs={10}>new</MonoLabel>
            <h2 className="text-2xl leading-none mt-1" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
              group chat
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: "rgba(255,255,255,.12)" }}
            aria-label="close"
          >
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>

        {/* body */}
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* name */}
          <div className="flex flex-col gap-1.5">
            <MonoLabel color="rgba(255,255,255,.55)" fs={10}>name</MonoLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              placeholder="csc207 squad"
              className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none"
              style={{
                background: "rgba(255,255,255,.08)", color: "#fff",
                border: "1px solid rgba(255,255,255,.16)", fontFamily: FF.sans,
              }}
            />
          </div>

          {/* search + member chips */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <MonoLabel color="rgba(255,255,255,.55)" fs={10}>
                members ({selectedIds.size})
              </MonoLabel>
              <span className="text-[10px] lowercase" style={{ color: "rgba(255,255,255,.4)", fontFamily: FF.mono }}>
                pick at least {MIN_MEMBERS}
              </span>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search friends…"
              className="w-full px-3 py-2 rounded-2xl text-xs outline-none"
              style={{
                background: "rgba(255,255,255,.06)", color: "#fff",
                border: "1px solid rgba(255,255,255,.12)", fontFamily: FF.sans,
              }}
            />
            {filteredFriends.length === 0 ? (
              <div className="text-xs lowercase py-6 text-center" style={{ color: "rgba(255,255,255,.5)" }}>
                {friends.length === 0 ? "no friends yet" : "no match"}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 mt-1 max-h-[260px] overflow-y-auto pr-1">
                {filteredFriends.map((f) => {
                  const active = selectedIds.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggle(f.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-full transition-colors text-left"
                      style={{
                        background: active ? T.coral : "rgba(255,255,255,.08)",
                        color: active ? "#fff" : "rgba(255,255,255,.85)",
                        border: `1px solid ${active ? T.coral : "rgba(255,255,255,.12)"}`,
                      }}
                    >
                      <Avatar
                        name={f.username.slice(0, 2).toLowerCase()}
                        bg={colorForUser(f.username)}
                        fg={colorForUser(f.username) === T.coral ? "#fff" : T.ink}
                        size={26}
                      />
                      <span className="text-xs lowercase truncate flex-1" style={{ fontFamily: FF.sans }}>
                        {f.username}
                      </span>
                      {active && (
                        <span className="text-[10px] font-bold" style={{ color: "#fff" }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="text-[11px] lowercase px-3 py-2 rounded-2xl" style={{
              background: "rgba(237,106,74,.18)", color: T.coral,
              border: `1px solid ${T.coral}`, fontFamily: FF.mono, letterSpacing: 0.4,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t flex gap-2" style={{ borderColor: "rgba(255,255,255,.08)" }}>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-full text-sm lowercase"
            style={{ background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.16)" }}
          >
            cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 rounded-full text-sm font-semibold lowercase disabled:opacity-40"
            style={{ background: T.coral, color: "#fff" }}
          >
            {submitting ? "creating…" : "create group"}
          </button>
        </div>
      </div>
    </div>
  );
}
