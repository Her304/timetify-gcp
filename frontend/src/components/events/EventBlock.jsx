import { T, FF, Icon } from "@/components/shared/brand";

const formatRange = (s, e) => {
  if (s == null || e == null) return "";
  const fmt = (mins) => {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h24 >= 12 ? "pm" : "am";
    const h = ((h24 + 11) % 12) + 1;
    return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, "0")}${ap}`;
  };
  return `${fmt(s)}–${fmt(e)}`;
};

/**
 * Calendar tile for an event.
 *
 * Props:
 *   event    – serialized Event (with start_time/end_time + occurrence_date)
 *   top      – absolute top in px
 *   height   – tile height in px
 *   onOpen   – click handler (optional; step 10 wires it)
 *   startMin – start time in minutes (precomputed)
 *   endMin   – end time in minutes (precomputed)
 */
export default function EventBlock({ event, top, height, onOpen, startMin, endMin }) {
  const compact = height < 48;
  const clickable = typeof onOpen === "function";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!clickable}
      className="absolute rounded-2xl overflow-hidden text-left flex flex-col"
      style={{
        top,
        left: 4,
        right: 4,
        height,
        background: T.lilac,
        color: T.ink,
        border: `1px solid ${T.lilacDk}`,
        padding: compact ? "5px 8px" : "7px 10px",
        gap: compact ? 2 : 4,
        zIndex: 10,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon name="calendar" size={compact ? 11 : 13} color={T.ink} />
        <span
          className="text-[10px] font-semibold uppercase truncate leading-none"
          style={{ fontFamily: FF.mono, color: T.ink, letterSpacing: 0.8 }}
        >
          event
        </span>
      </div>
      <div
        className="text-[11px] lowercase font-semibold truncate leading-tight w-full"
        style={{ fontFamily: FF.sans, color: T.ink, letterSpacing: -0.1 }}
      >
        {event.name}
      </div>
      {!compact && (
        <div
          className="text-[10px] lowercase truncate w-full"
          style={{ fontFamily: FF.mono, color: T.ink, opacity: 0.75, letterSpacing: 0.2 }}
        >
          {formatRange(startMin, endMin)}
          {event.location ? ` · ${event.location}` : ""}
        </div>
      )}
    </button>
  );
}
