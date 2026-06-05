import { useEffect, useState } from "react";
import { T, FF, MonoLabel, PillBtn, Icon } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, {
  weekday: "long", month: "short", day: "numeric"
}).toLowerCase();

const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, {
  hour: "numeric", minute: "2-digit"
}).toLowerCase();

const fmtDuration = (mins) => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

/**
 * Bottom-sheet that shows shared free gaps and lets the user send a study invite.
 *
 * Props:
 *   userIds      – array of friend user IDs to find shared gaps with
 *   roomId       – chat room to send the invite into
 *   onClose      – dismiss handler
 *   onInviteSent – called with the new Message object after sending
 */
export default function FindTimeSheet({ userIds = [], roomId, onClose, onInviteSent }) {
  const [gaps, setGaps]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);
  const [sending, setSending] = useState(null); // gap index being sent

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await authenticatedFetch(
          `${import.meta.env.VITE_API_URL}/api/availability/shared-gaps/`,
          {
            method: "POST",
            body: JSON.stringify({ user_ids: userIds, days_ahead: 7, min_duration_minutes: 30 }),
          }
        );
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (!cancelled) setGaps(data.gaps || []);
      } catch {
        if (!cancelled) setErr("couldn't load free times");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userIds.join(","), roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendInvite = async (gap, idx) => {
    if (sending !== null) return;
    setSending(idx);
    try {
      const body = {
        room_id:             roomId,
        proposed_start:      gap.start,
        proposed_end:        gap.end,
        suggested_course_id: gap.suggested_course?.id || null,
      };
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/study-invites/`,
        { method: "POST", body: JSON.stringify(body) }
      );
      if (!res.ok) throw new Error("failed");
      const msg = await res.json();
      onInviteSent?.(msg);
      onClose();
    } catch {
      setErr("couldn't send invite");
      setSending(null);
    }
  };

  // Group gaps by day
  const byDay = gaps.reduce((acc, gap, idx) => {
    const day = fmtDay(gap.start);
    if (!acc[day]) acc[day] = [];
    acc[day].push({ ...gap, _idx: idx });
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: "#fff", maxHeight: "80dvh" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: T.ink15 }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0 border-b" style={{ borderColor: T.ink08 }}>
          <div>
            <h2 className="text-xl leading-none lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.5, color: T.ink }}>
              find a time
            </h2>
            <MonoLabel fs={10} style={{ marginTop: 4 }}>next 7 days · 30 min+ gaps</MonoLabel>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-8 transition-colors"
            aria-label="close"
          >
            <Icon name="x" size={18} color={T.ink} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: T.ink08 }} />
              ))}
            </div>
          ) : err ? (
            <p className="text-sm text-ink-60 lowercase text-center py-8" style={{ fontFamily: FF.sans }}>{err}</p>
          ) : gaps.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-3xl mb-3">😬</div>
              <p className="text-sm text-ink-60 lowercase" style={{ fontFamily: FF.sans }}>
                no shared free slots in the next 7 days
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {Object.entries(byDay).map(([day, dayGaps]) => (
                <div key={day}>
                  <MonoLabel fs={10} style={{ marginBottom: 8 }}>{day}</MonoLabel>
                  <div className="flex flex-col gap-2">
                    {dayGaps.map((gap) => (
                      <div
                        key={gap._idx}
                        className="flex items-center gap-3 p-3 rounded-2xl border"
                        style={{ borderColor: T.ink08, background: T.cream }}
                      >
                        {/* Time + duration */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold lowercase leading-tight" style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.2 }}>
                            {fmtTime(gap.start)} – {fmtTime(gap.end)}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: T.lilac, color: T.ink, fontFamily: FF.mono }}
                            >
                              {fmtDuration(gap.duration_minutes)}
                            </span>
                            {gap.suggested_course && (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: T.lime, color: T.ink, fontFamily: FF.mono }}
                              >
                                {gap.suggested_course.course_id}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Send invite button */}
                        <button
                          type="button"
                          disabled={sending !== null}
                          onClick={() => sendInvite(gap, gap._idx)}
                          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold lowercase transition-opacity disabled:opacity-50"
                          style={{ background: T.coral, color: "#fff", fontFamily: FF.sans }}
                        >
                          {sending === gap._idx ? "sending…" : "invite"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
