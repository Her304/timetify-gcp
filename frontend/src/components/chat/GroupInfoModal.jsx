import { useEffect, useMemo, useState } from "react";
import { T, FF, Avatar, Icon, MonoLabel } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

const NAME_MAX = 80;

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const AVATAR_BG = [T.coral, T.lilac, "#f0c4a8", "#b8d8c2", T.lime];
const colorForUser = (name) => AVATAR_BG[hashStr(name) % AVATAR_BG.length];

export default function GroupInfoModal({
  room,
  friendsList = [],
  currentUserId,
  onClose,
  onUpdated,
  onLeft,
}) {
  const [name, setName] = useState(room?.name || "");
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState(room?.members || []);
  const [isAdmin, setIsAdmin] = useState(!!room?.is_admin);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(room?.name || "");
    setMembers(room?.members || []);
    setIsAdmin(!!room?.is_admin);
  }, [room]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const addableFriends = useMemo(() => {
    const arr = friendsList.map((f) => f.friend_details).filter(Boolean);
    return arr.filter((f) => !memberIds.has(f.id));
  }, [friendsList, memberIds]);

  const saveName = async () => {
    const next = name.trim();
    if (!next || next === room.name) {
      setEditing(false);
      setName(room.name || "");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/chats/groups/${room.id}/`,
        { method: "PATCH", body: JSON.stringify({ name: next }) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "rename failed");
        setBusy(false);
        return;
      }
      setMembers(data.members || []);
      setIsAdmin(!!data.is_admin);
      setEditing(false);
      onUpdated && onUpdated(data);
    } catch {
      setError("network error");
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (uid) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/chats/groups/${room.id}/members/`,
        { method: "POST", body: JSON.stringify({ user_id: uid }) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "couldn't add");
        setBusy(false);
        return;
      }
      setMembers(data.members || []);
      onUpdated && onUpdated(data);
    } catch {
      setError("network error");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (uid) => {
    if (!window.confirm("remove this member?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/chats/groups/${room.id}/members/${uid}/`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "couldn't remove");
        setBusy(false);
        return;
      }
      // 204 → soft-deleted room (last member removed). Otherwise refresh.
      if (res.status === 204) {
        onLeft && onLeft();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setMembers(data.members || []);
      onUpdated && onUpdated(data);
    } catch {
      setError("network error");
    } finally {
      setBusy(false);
    }
  };

  const leaveGroup = async () => {
    if (!window.confirm("leave this group?")) return;
    setBusy(true);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/chats/groups/${room.id}/members/${currentUserId}/`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "couldn't leave");
        setBusy(false);
        return;
      }
      onLeft && onLeft();
    } catch {
      setError("network error");
      setBusy(false);
    }
  };

  if (!room) return null;

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
          <div className="flex-1 min-w-0">
            <MonoLabel color="rgba(255,255,255,.55)" fs={10}>group</MonoLabel>
            {editing ? (
              <div className="flex gap-2 mt-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditing(false); setName(room.name || ""); } }}
                  className="flex-1 px-3 py-1.5 rounded-xl text-lg outline-none"
                  style={{ background: "rgba(255,255,255,.08)", color: "#fff",
                           border: "1px solid rgba(255,255,255,.16)", fontFamily: FF.serif, letterSpacing: -0.4 }}
                />
                <button
                  onClick={saveName}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold lowercase disabled:opacity-50"
                  style={{ background: T.coral, color: "#fff" }}
                >
                  save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <h2 className="text-2xl leading-none truncate" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
                  {room.name}
                </h2>
                {isAdmin && (
                  <button
                    onClick={() => setEditing(true)}
                    className="text-[10px] lowercase px-2 py-1 rounded-full"
                    style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.7)",
                             border: "1px solid rgba(255,255,255,.16)", fontFamily: FF.mono, letterSpacing: 0.4 }}
                  >
                    rename
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center ml-3"
            style={{ background: "rgba(255,255,255,.12)" }}
            aria-label="close"
          >
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>

        {/* members */}
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <MonoLabel color="rgba(255,255,255,.55)" fs={10}>
              members ({members.length})
            </MonoLabel>
            {isAdmin && !addOpen && addableFriends.length > 0 && (
              <button
                onClick={() => setAddOpen(true)}
                className="text-[10px] lowercase px-2 py-1 rounded-full"
                style={{ background: T.coral, color: "#fff", fontFamily: FF.mono, letterSpacing: 0.4 }}
              >
                + add
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2.5 px-2 py-2 rounded-2xl"
                style={{ background: "rgba(255,255,255,.06)" }}
              >
                <Avatar
                  name={m.username.slice(0, 2).toLowerCase()}
                  bg={colorForUser(m.username)}
                  fg={colorForUser(m.username) === T.coral ? "#fff" : T.ink}
                  size={32}
                />
                <span className="text-sm lowercase flex-1 truncate" style={{ fontFamily: FF.sans }}>
                  {m.username}
                  {m.id === currentUserId && (
                    <span className="text-[10px] ml-1.5" style={{ color: "rgba(255,255,255,.45)" }}>(you)</span>
                  )}
                </span>
                {m.is_admin && (
                  <span
                    className="text-[9px] lowercase px-1.5 py-0.5 rounded-full"
                    style={{ background: T.lime, color: T.ink, fontFamily: FF.mono, letterSpacing: 0.4 }}
                  >
                    admin
                  </span>
                )}
                {isAdmin && m.id !== currentUserId && (
                  <button
                    onClick={() => removeMember(m.id)}
                    disabled={busy}
                    className="w-6 h-6 rounded-full grid place-items-center disabled:opacity-30"
                    style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.65)" }}
                    aria-label={`remove ${m.username}`}
                  >
                    <Icon name="x" size={11} color="rgba(255,255,255,.65)" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {addOpen && (
            <div className="flex flex-col gap-2 mt-2 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,.08)" }}>
              <MonoLabel color="rgba(255,255,255,.55)" fs={10}>add friends</MonoLabel>
              {addableFriends.length === 0 ? (
                <div className="text-xs lowercase py-3 text-center" style={{ color: "rgba(255,255,255,.5)" }}>
                  no more friends to add
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
                  {addableFriends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => addMember(f.id)}
                      disabled={busy}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-full disabled:opacity-50"
                      style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.85)",
                               border: "1px solid rgba(255,255,255,.12)" }}
                    >
                      <Avatar
                        name={f.username.slice(0, 2).toLowerCase()}
                        bg={colorForUser(f.username)}
                        fg={colorForUser(f.username) === T.coral ? "#fff" : T.ink}
                        size={24}
                      />
                      <span className="text-xs lowercase truncate flex-1 text-left" style={{ fontFamily: FF.sans }}>
                        {f.username}
                      </span>
                      <span className="text-[12px]" style={{ color: T.coral }}>+</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setAddOpen(false)}
                className="text-[11px] lowercase mt-1"
                style={{ color: "rgba(255,255,255,.55)", fontFamily: FF.mono }}
              >
                done
              </button>
            </div>
          )}

          {error && (
            <div className="text-[11px] lowercase px-3 py-2 rounded-2xl mt-2" style={{
              background: "rgba(237,106,74,.18)", color: T.coral,
              border: `1px solid ${T.coral}`, fontFamily: FF.mono, letterSpacing: 0.4,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t" style={{ borderColor: "rgba(255,255,255,.08)" }}>
          <button
            onClick={leaveGroup}
            disabled={busy}
            className="w-full px-4 py-2.5 rounded-full text-sm font-semibold lowercase disabled:opacity-40"
            style={{ background: T.coral, color: "#fff" }}
          >
            leave group
          </button>
        </div>
      </div>
    </div>
  );
}
