import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { T, FF, Icon, MonoLabel, ProfileAvatar } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";
import ConflictSheet from "./ConflictSheet";

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long", month: "short", day: "numeric"
  }).toLowerCase();
};

const fmtTimeHM = (t) => {
  if (!t || typeof t !== "string") return "";
  const [hh, mm] = t.split(":");
  const h24 = Number(hh);
  const m = Number(mm);
  if (Number.isNaN(h24) || Number.isNaN(m)) return t;
  const ap = h24 >= 12 ? "pm" : "am";
  const h = ((h24 + 11) % 12) + 1;
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, "0")}${ap}`;
};

const STATUS_TONE = {
  ACCEPTED:  { bg: T.lime,    fg: T.ink,     label: "going" },
  PENDING:   { bg: T.ink08,   fg: T.ink60,   label: "pending" },
  DECLINED:  { bg: T.coralLt, fg: T.coralDk, label: "declined" },
  REQUESTED: { bg: T.ink08,   fg: T.ink60,   label: "request sent" },
};

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const AVATAR_BG = [T.coral, T.lilac, "#f0c4a8", "#b8d8c2", T.lime];
const colorForUser = (name) => AVATAR_BG[hashStr(name) % AVATAR_BG.length];

/**
 * Modal showing full event details for the clicked tile.
 *
 * Props:
 *   event       – serialized Event object (with creator, invites, my_invite_status, is_mine, etc.)
 *   onClose     – dismiss handler
 *   onChanged   – called after a mutation (delete) so the parent can refetch
 */
function EventDetailsContent({ event, currentUser, onClose, onChanged }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState(null);
  const [joinConflicts, setJoinConflicts] = useState(null); // [] from a 409

  if (!event) return null;

  const isMine = !!event.is_mine;
  const myStatus = event.my_invite_status;
  const invites = Array.isArray(event.invites) ? event.invites : [];
  const chatRoomId = event.chat_room;
  const canRequestJoin =
    !isMine &&
    !myStatus &&
    event.visibility === "PUBLIC" &&
    !!event.allow_join_requests;

  const handleDelete = async () => {
    if (deleting) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/events/${event.id}/`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) throw new Error("delete failed");
      onChanged && onChanged();
      onClose && onClose();
    } catch {
      setError("couldn't delete event");
      setDeleting(false);
    }
  };

  const openChat = () => {
    if (!chatRoomId) return;
    navigate(`/chat/${chatRoomId}`);
    onClose && onClose();
  };

  const handleRequestJoin = async (resolution) => {
    if (requesting) return;
    setRequesting(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/events/${event.id}/request-join/`,
        { method: "POST", body: JSON.stringify(resolution ? { conflict_resolution: resolution } : {}) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "overlap") {
          // Surface the clash; the requester states how they'd handle it and
          // we re-send with that preference (applied only if the host accepts).
          setJoinConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
          setRequesting(false);
          return;
        }
        else if (data.detail === "already_invited") setError("already requested");
        else if (data.detail) setError(String(data.detail).toLowerCase().replace(/_/g, " "));
        else setError("couldn't send request");
        setRequesting(false);
        return;
      }
      setJoinConflicts(null);
      onChanged && onChanged();
      onClose && onClose();
    } catch {
      setError("network error");
      setRequesting(false);
    }
  };

  const repeatLabel =
    event.is_repeating && event.repeat_days
      ? event.repeat_days.split(",").map((d) => d.trim()).join(" · ").toLowerCase()
      : null;

  return (
    <>
      <div className="flex flex-col h-full w-full max-w-md mx-auto" style={{ background: T.ink, color: "#fff", borderRadius: "1.5rem", overflow: "hidden" }}>
        {/* header */}
        <div
          className="px-5 py-4 border-b flex items-start justify-between gap-3"
          style={{ borderColor: "rgba(255,255,255,.08)", background: T.lilacDk }}
        >
          <div className="min-w-0">
            <MonoLabel color="rgba(255,255,255,.7)" fs={10}>event</MonoLabel>
            <h2
              className="text-2xl leading-tight mt-1 truncate"
              style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}
            >
              {event.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,.18)" }}
            aria-label="close"
          >
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>

        {/* body */}
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* when */}
          <div className="flex flex-col gap-1.5">
            <MonoLabel color="rgba(255,255,255,.55)" fs={10}>when</MonoLabel>
            <div className="flex items-center gap-2 text-sm lowercase" style={{ fontFamily: FF.sans }}>
              <Icon name="calendar" size={14} color="rgba(255,255,255,.7)" />
              <span>
                {fmtDate(event.occurrence_date || event.date)} · {fmtTimeHM(event.start_time)}–{fmtTimeHM(event.end_time)}
              </span>
            </div>
            {repeatLabel && (
              <div className="text-[11px] lowercase mt-0.5" style={{ color: "rgba(255,255,255,.55)", fontFamily: FF.mono, letterSpacing: 0.4 }}>
                repeats · {repeatLabel}
              </div>
            )}
          </div>

          {/* where */}
          {event.location && (
            <div className="flex flex-col gap-1.5">
              <MonoLabel color="rgba(255,255,255,.55)" fs={10}>where</MonoLabel>
              <div className="text-sm lowercase" style={{ fontFamily: FF.sans }}>
                {event.location}
              </div>
            </div>
          )}

          {/* creator */}
          <div className="flex flex-col gap-1.5">
            <MonoLabel color="rgba(255,255,255,.55)" fs={10}>host</MonoLabel>
            <div className="flex items-center gap-2.5">
              <ProfileAvatar
                profilePictureUrl={event.creator_profile_picture_url}
                name={(event.creator_username || "?").slice(0, 2).toLowerCase()}
                bg={colorForUser(event.creator_username || "")}
                fg={T.ink}
                size={32}
              />
              <span className="text-sm lowercase" style={{ fontFamily: FF.sans }}>
                {isMine ? "you" : event.creator_username}
              </span>
            </div>
          </div>

          {/* my status (for non-creators) */}
          {!isMine && myStatus && (
            <div className="flex flex-col gap-1.5">
              <MonoLabel color="rgba(255,255,255,.55)" fs={10}>your status</MonoLabel>
              <span
                className="inline-flex items-center self-start px-3 py-1 rounded-full text-[11px] font-semibold lowercase"
                style={{
                  background: STATUS_TONE[myStatus]?.bg || "rgba(255,255,255,.1)",
                  color:      STATUS_TONE[myStatus]?.fg || "#fff",
                  fontFamily: FF.mono, letterSpacing: 0.4,
                }}
              >
                {STATUS_TONE[myStatus]?.label || myStatus.toLowerCase()}
              </span>
            </div>
          )}

          {/* invitee list (creator + accepted invitees only — backend gates this) */}
          {invites.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <MonoLabel color="rgba(255,255,255,.55)" fs={10}>
                participants ({invites.length})
              </MonoLabel>
              <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                {invites.map((inv) => {
                  const tone = STATUS_TONE[inv.status] || STATUS_TONE.PENDING;
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-2xl"
                      style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)" }}
                    >
                      <ProfileAvatar
                        profilePictureUrl={inv.invitee_profile_picture_url}
                        name={(inv.invitee_username || "?").slice(0, 2).toLowerCase()}
                        bg={colorForUser(inv.invitee_username || "")}
                        fg={T.ink}
                        size={26}
                      />
                      <span className="text-xs lowercase truncate flex-1" style={{ fontFamily: FF.sans }}>
                        {inv.invitee_username}
                      </span>
                      <span
                        className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                        style={{ background: tone.bg, color: tone.fg, fontFamily: FF.mono, letterSpacing: 0.5 }}
                      >
                        {tone.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
          {chatRoomId && (
            <button
              onClick={openChat}
              className="px-4 py-2.5 rounded-full text-sm lowercase font-semibold"
              style={{ background: T.lilac, color: T.ink }}
            >
              open chat
            </button>
          )}
          {isMine ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto px-4 py-2.5 rounded-full text-sm lowercase font-semibold disabled:opacity-40"
              style={{ background: confirmingDelete ? T.coral : "rgba(255,255,255,.08)", color: confirmingDelete ? "#fff" : "rgba(255,255,255,.85)", border: confirmingDelete ? "none" : "1px solid rgba(255,255,255,.16)" }}
            >
              {deleting ? "deleting…" : confirmingDelete ? "tap again to confirm" : "delete"}
            </button>
          ) : canRequestJoin ? (
            <button
              onClick={() => handleRequestJoin()}
              disabled={requesting}
              className="ml-auto px-4 py-2.5 rounded-full text-sm lowercase font-semibold disabled:opacity-40"
              style={{ background: T.coral, color: "#fff" }}
            >
              {requesting ? "sending…" : "request to join"}
            </button>
          ) : myStatus === "REQUESTED" ? (
            <button
              disabled
              className="ml-auto px-4 py-2.5 rounded-full text-sm lowercase font-semibold disabled:opacity-60"
              style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.16)" }}
            >
              request pending
            </button>
          ) : (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2.5 rounded-full text-sm lowercase"
              style={{ background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.16)" }}
            >
              close
            </button>
          )}
        </div>
      </div>

      {joinConflicts && (
        <ConflictSheet
          variant="self"
          conflicts={joinConflicts}
          currentUserId={currentUser?.id}
          busy={requesting}
          declineLabel="cancel request"
          onSkip={() => handleRequestJoin("skip")}
          onKeepBoth={() => handleRequestJoin("keep_both")}
          onDecline={() => setJoinConflicts(null)}
          onClose={() => setJoinConflicts(null)}
        />
      )}
    </>
  );
}

const EventRow = ({ evt, active, onSelect }) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(evt)}
      className="w-full flex items-center gap-3 rounded-2xl p-3 transition-colors text-left"
      style={{
        background: active ? T.ink : "#fff",
        color: active ? T.cream : T.ink,
        border: active ? "none" : `1px solid ${T.ink08}`,
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: T.lilac, color: T.ink }}
      >
        <Icon name="calendar" size={16} />
      </div>
      <div className="min-w-0">
        <div
          className="text-[11px] uppercase font-semibold leading-none truncate"
          style={{ fontFamily: FF.mono, letterSpacing: 1 }}
        >
          {evt.name}
        </div>
        <div
          className="text-xs mt-1 truncate lowercase"
          style={{
            fontFamily: FF.sans,
            color: active ? "rgba(248,244,237,0.7)" : T.ink60,
          }}
        >
          {fmtTimeHM(evt.start_time)}–{fmtTimeHM(evt.end_time)}
        </div>
      </div>
    </button>
  );
};

export default function EventDetailsModal({ event, cluster, currentUser, onClose, onChanged }) {
  const [selected, setSelected] = useState(event || (cluster && cluster[0]));

  if (!selected) return null;

  const isCluster = cluster && cluster.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full rounded-3xl overflow-hidden flex flex-col shadow-xl"
        style={{ 
          background: isCluster ? T.cream : "transparent",
          color: isCluster ? T.ink : "#fff",
          maxWidth: isCluster ? "48rem" : "28rem",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {isCluster && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-8" style={{ background: T.cream }}>
            <MonoLabel>overlapping · {cluster.length} events</MonoLabel>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white border border-ink-8 flex items-center justify-center hover:bg-ink hover:text-cream transition-colors"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        <div className={isCluster ? "grid gap-4 overflow-y-auto p-5 md:grid-cols-[200px_1fr]" : ""}>
          {isCluster && (
            <aside className="flex flex-col gap-2">
              {cluster.map((e, i) => (
                <EventRow
                  key={`ev-${e.id}-${i}`}
                  evt={e}
                  active={selected.id === e.id}
                  onSelect={setSelected}
                />
              ))}
            </aside>
          )}
          <div className={isCluster ? "h-full min-h-[500px]" : "h-full"}>
            <EventDetailsContent event={selected} currentUser={currentUser} onClose={onClose} onChanged={onChanged} />
          </div>
        </div>
      </div>
    </div>
  );
}
