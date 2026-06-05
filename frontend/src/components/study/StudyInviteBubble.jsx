import { useState } from "react";
import { T, FF, MonoLabel, PillBtn, Chip } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

const fmt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).toLowerCase();
};

const fmtDuration = (start, end) => {
  if (!start || !end) return "";
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

/**
 * Rich bubble for message_type === 'study_invite'.
 * Shows proposed time, duration, course chip, and accept/decline controls.
 * Calls PATCH /api/chats/<roomId>/messages/<msgId>/invite/ on action.
 */
export default function StudyInviteBubble({ msg, mine, roomId, onUpdated }) {
  const meta      = msg.metadata || {};
  const invStatus = meta.status || "pending";
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);

  // Sender can't accept/decline their own invite
  const canRespond = !mine && invStatus === "pending";

  const respond = async (action) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/chats/${roomId}/messages/${msg.id}/invite/`,
        { method: "PATCH", body: JSON.stringify({ action }) }
      );
      if (!res.ok) throw new Error("failed");
      const updated = await res.json();
      onUpdated?.(updated);
    } catch {
      setErr("something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = () => {
    if (invStatus === "accepted") return { label: "accepted ✓", color: "#22c55e" };
    if (invStatus === "declined") return { label: "declined",   color: T.ink40 };
    return null;
  };
  const badge = statusBadge();

  return (
    <div
      className="rounded-2xl p-3.5 max-w-[280px] flex flex-col gap-2.5"
      style={{
        background: mine ? T.coral : "#fff",
        border: `1.5px solid ${mine ? "transparent" : T.ink15}`,
        alignSelf: mine ? "flex-end" : "flex-start",
      }}
    >
      {/* Header label */}
      <div className="flex items-center gap-1.5">
        <span className="text-base">📅</span>
        <span
          className="text-[11px] uppercase tracking-widest"
          style={{ fontFamily: FF.mono, color: mine ? "rgba(255,255,255,.75)" : T.ink60 }}
        >
          study invite
        </span>
      </div>

      {/* Proposed time */}
      <div>
        <div
          className="text-sm font-semibold leading-snug lowercase"
          style={{ fontFamily: FF.serif, color: mine ? "#fff" : T.ink, letterSpacing: -0.3 }}
        >
          {fmt(meta.proposed_start)}
        </div>
        <div
          className="text-[11px] mt-0.5"
          style={{ fontFamily: FF.mono, color: mine ? "rgba(255,255,255,.65)" : T.ink60 }}
        >
          {fmtDuration(meta.proposed_start, meta.proposed_end)} long
        </div>
      </div>

      {/* Course chip */}
      {meta.suggested_course_id && (
        <span
          className="self-start px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: mine ? "rgba(255,255,255,.2)" : T.lime,
            color: mine ? "#fff" : T.ink,
            fontFamily: FF.mono,
          }}
        >
          {meta.suggested_course_name || `course #${meta.suggested_course_id}`}
        </span>
      )}

      {/* Status badge OR action buttons */}
      {badge ? (
        <span
          className="text-[11px] font-semibold"
          style={{ color: mine ? "rgba(255,255,255,.8)" : badge.color, fontFamily: FF.mono }}
        >
          {badge.label}
        </span>
      ) : canRespond ? (
        <div className="flex gap-2 mt-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => respond("accept")}
            className="flex-1 py-1.5 rounded-full text-xs font-semibold lowercase transition-opacity disabled:opacity-50"
            style={{ background: T.coral, color: "#fff", fontFamily: FF.sans }}
          >
            accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => respond("decline")}
            className="flex-1 py-1.5 rounded-full text-xs font-semibold lowercase transition-opacity disabled:opacity-50"
            style={{ background: T.ink08, color: T.ink, fontFamily: FF.sans }}
          >
            decline
          </button>
        </div>
      ) : invStatus === "pending" && mine ? (
        <span
          className="text-[10px]"
          style={{ color: "rgba(255,255,255,.6)", fontFamily: FF.mono }}
        >
          waiting for response…
        </span>
      ) : null}

      {err && (
        <span className="text-[10px] text-coral-dark" style={{ fontFamily: FF.mono }}>
          {err}
        </span>
      )}
    </div>
  );
}
