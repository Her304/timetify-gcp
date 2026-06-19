import { T, FF, Icon, MonoLabel } from "@/components/shared/brand";

// Renders one human-readable line per clashing block.
const conflictLine = (c, currentUserId) => {
  const who = c.user_id === currentUserId ? "you" : c.username;
  const what = c.kind === "course" ? c.course_id : `“${c.event_name}”`;
  return `${who} · ${what} · ${c.day} ${c.start_time}–${c.end_time}`;
};

/**
 * Conflict resolution sheet shown when a new/accepted event clashes with an
 * existing class or event.
 *
 * Variants:
 *   "creator" — the creator's OWN schedule clashes. Offers skip / keep both /
 *               change timing.
 *   "self"    — an invitee accepting, or a requester asking to join, has a
 *               clash. Offers skip / keep both / decline (or cancel).
 *   "host"    — an invitee the creator picked has a clash; the creator can't
 *               decide for them. Offers let-them-decide / change timing / delete.
 *
 * Handlers are wired by the caller; only the buttons whose handler is provided
 * render. onSkip/onKeepBoth resolve with the matching conflict_resolution.
 */
export default function ConflictSheet({
  variant = "self",
  conflicts = [],
  currentUserId,
  busy = false,
  onSkip,
  onKeepBoth,
  onChangeTiming,
  onLetDecide,
  onDelete,
  onDecline,
  declineLabel = "decline",
  onClose,
}) {
  const heading =
    variant === "host" ? "someone you invited is busy"
    : variant === "creator" ? "this clashes with your schedule"
    : "you have a time conflict";

  const blurb =
    variant === "host"
      ? "they can’t pick for themselves yet — invite anyway and let them decide, or change the time."
      : variant === "self"
      ? "skip the clashing block so only this event shows, or keep both on your schedule."
      : "skip the clashing block so only this event shows on that day, or keep both.";

  const btnBase =
    "w-full px-4 py-3 rounded-2xl text-sm font-semibold lowercase disabled:opacity-40 transition-colors text-left";

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => { e.stopPropagation(); onClose && onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{ background: T.ink, color: "#fff", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,.08)" }}>
          <div className="min-w-0 pr-2">
            <MonoLabel color="rgba(255,255,255,.55)" fs={10}>time conflict</MonoLabel>
            <h2 className="text-xl leading-tight mt-1" style={{ fontFamily: FF.serif, letterSpacing: -0.4 }}>
              {heading}
            </h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,.12)" }}
              aria-label="close"
            >
              <Icon name="x" size={14} color="#fff" />
            </button>
          )}
        </div>

        {/* body */}
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-[12px] lowercase" style={{ color: "rgba(255,255,255,.65)", fontFamily: FF.sans }}>
            {blurb}
          </p>
          <div className="flex flex-col gap-1.5">
            {conflicts.map((c, i) => (
              <div
                key={`${c.kind}-${c.user_id}-${i}`}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl text-[12px] lowercase"
                style={{
                  background: "rgba(237,106,74,.14)",
                  border: `1px solid ${T.coral}`,
                  color: "#fff",
                  fontFamily: FF.mono,
                  letterSpacing: 0.3,
                }}
              >
                <Icon name={c.kind === "course" ? "file" : "calendar"} size={13} color={T.coral} />
                <span className="truncate">{conflictLine(c, currentUserId)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* footer — action stack */}
        <div className="px-5 py-4 border-t flex flex-col gap-2" style={{ borderColor: "rgba(255,255,255,.08)" }}>
          {onSkip && (
            <button
              onClick={onSkip}
              disabled={busy}
              className={btnBase}
              style={{ background: T.coral, color: "#fff" }}
            >
              skip the clashing block →
            </button>
          )}
          {onKeepBoth && (
            <button
              onClick={onKeepBoth}
              disabled={busy}
              className={btnBase}
              style={{ background: "rgba(255,255,255,.10)", color: "#fff", border: "1px solid rgba(255,255,255,.18)" }}
            >
              keep both on my schedule
            </button>
          )}
          {onLetDecide && (
            <button
              onClick={onLetDecide}
              disabled={busy}
              className={btnBase}
              style={{ background: T.coral, color: "#fff" }}
            >
              invite anyway · let them decide →
            </button>
          )}
          {onChangeTiming && (
            <button
              onClick={onChangeTiming}
              disabled={busy}
              className={btnBase}
              style={{ background: "rgba(255,255,255,.10)", color: "#fff", border: "1px solid rgba(255,255,255,.18)" }}
            >
              change the timing
            </button>
          )}
          {onDecline && (
            <button
              onClick={onDecline}
              disabled={busy}
              className={btnBase}
              style={{ background: "transparent", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.16)" }}
            >
              {declineLabel}
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={busy}
              className={btnBase}
              style={{ background: "transparent", color: T.coral, border: `1px solid ${T.coral}` }}
            >
              don’t create the event
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
