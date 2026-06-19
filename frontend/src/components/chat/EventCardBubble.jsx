import { useState } from "react";
import { T, FF, Icon, MonoLabel } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
};

const fmtTime = (hhmm) => {
  if (!hhmm) return "";
  const [h, m] = String(hhmm).split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
};

export default function EventCardBubble({ msg, currentUserId }) {
  const meta = msg.metadata || {};
  const isCreator = msg.sender_id === currentUserId;

  // rsvpStatus: null = unknown/pending, 'ACCEPTED', 'DECLINED'
  const [rsvpStatus, setRsvpStatus] = useState(meta.my_rsvp_status || null);
  const [loading, setLoading] = useState(false);

  const handleRsvp = async (newStatus) => {
    if (loading || isCreator) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/events/${meta.event_id}/rsvp/`,
        { method: "POST", body: JSON.stringify({ status: newStatus }) }
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setRsvpStatus(data.status || newStatus);
      }
    } catch {
      // silent — button snaps back visually on next render
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start px-1 my-0.5">
      <div
        className="rounded-2xl overflow-hidden max-w-[300px] w-full"
        style={{ border: `1px solid ${T.ink08}`, background: "#fff" }}
      >
        {/* Coloured header strip */}
        <div
          className="px-3.5 pt-3 pb-2 flex items-start gap-2.5"
          style={{ background: T.lilac + "44" }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: T.lilac }}
          >
            <Icon name="calendar" size={16} color={T.ink} />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-medium lowercase leading-tight truncate"
              style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.2 }}
            >
              {meta.name || "event"}
            </div>
            <div
              className="text-[10px] mt-0.5 uppercase"
              style={{ fontFamily: FF.mono, color: T.ink60, letterSpacing: 0.5 }}
            >
              by @{meta.creator_username || msg.sender_username}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-3.5 py-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Icon name="clock" size={12} color={T.ink40} />
            <span
              className="text-[12px] lowercase"
              style={{ fontFamily: FF.sans, color: T.ink }}
            >
              {fmtDate(meta.date)} · {fmtTime(meta.start_time)}–{fmtTime(meta.end_time)}
            </span>
          </div>
          {meta.location && (
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.ink40} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
              <span
                className="text-[12px] lowercase truncate"
                style={{ fontFamily: FF.sans, color: T.ink }}
              >
                {meta.location}
              </span>
            </div>
          )}
        </div>

        {/* RSVP row — creator sees a "you're going" chip; invitees see buttons */}
        <div
          className="px-3.5 pb-3 flex items-center gap-2"
        >
          {isCreator ? (
            <span
              className="text-[10px] uppercase px-2.5 py-1 rounded-full"
              style={{
                background: T.lime,
                color: T.ink,
                fontFamily: FF.mono,
                letterSpacing: 0.6,
              }}
            >
              you're going
            </span>
          ) : rsvpStatus === "ACCEPTED" ? (
            <>
              <span
                className="text-[10px] uppercase px-2.5 py-1 rounded-full"
                style={{ background: T.lime, color: T.ink, fontFamily: FF.mono, letterSpacing: 0.6 }}
              >
                going ✓
              </span>
              <button
                type="button"
                onClick={() => handleRsvp("DECLINED")}
                disabled={loading}
                className="text-[11px] lowercase disabled:opacity-40"
                style={{ color: T.ink40, fontFamily: FF.sans }}
              >
                can't go
              </button>
            </>
          ) : rsvpStatus === "DECLINED" ? (
            <>
              <span
                className="text-[10px] uppercase px-2.5 py-1 rounded-full"
                style={{ background: T.ink08, color: T.ink60, fontFamily: FF.mono, letterSpacing: 0.6 }}
              >
                can't go
              </span>
              <button
                type="button"
                onClick={() => handleRsvp("ACCEPTED")}
                disabled={loading}
                className="text-[11px] lowercase disabled:opacity-40"
                style={{ color: T.coral, fontFamily: FF.sans }}
              >
                actually going
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleRsvp("ACCEPTED")}
                disabled={loading}
                className="flex-1 py-1.5 rounded-xl text-[12px] lowercase font-medium disabled:opacity-40 transition-opacity"
                style={{ background: T.coral, color: "#fff", fontFamily: FF.sans }}
              >
                {loading ? "…" : "going"}
              </button>
              <button
                type="button"
                onClick={() => handleRsvp("DECLINED")}
                disabled={loading}
                className="flex-1 py-1.5 rounded-xl text-[12px] lowercase disabled:opacity-40 transition-opacity"
                style={{ background: T.cream, color: T.ink, fontFamily: FF.sans, border: `1px solid ${T.ink08}` }}
              >
                {loading ? "…" : "can't go"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tiny timestamp below the card */}
      <MonoLabel fs={9} style={{ marginTop: 3, marginLeft: 4 }}>
        {meta.name ? "/create" : "event"}
      </MonoLabel>
    </div>
  );
}
