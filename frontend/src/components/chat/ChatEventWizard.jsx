import { useState, useEffect } from "react";
import { T, FF, Icon, MonoLabel } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
};

// ISO datetime → local "HH:MM" for a <input type="time"> value.
const isoToTimeInput = (iso) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const fmtSlotTime = (iso) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase();

const fmtSlotDuration = (mins) => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const inputStyle = (T) => ({
  background: T.cream,
  color: T.ink,
  border: `1px solid ${T.ink15 || "rgba(31,26,34,.15)"}`,
  fontFamily: FF.sans,
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 14,
  width: "100%",
  outline: "none",
});

// Slash command picker: shows when user types "/" in the chat input.
// Currently only has "event" but is extensible.
export function SlashCommandMenu({ onSelect }) {
  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 mx-3 rounded-2xl overflow-hidden shadow-lg z-30"
      style={{ background: "#fff", border: `1px solid ${T.ink08}` }}
    >
      <div
        className="px-3 py-2 border-b flex items-center gap-1.5"
        style={{ borderColor: T.ink08 }}
      >
        <MonoLabel fs={9} ls={1}>commands</MonoLabel>
      </div>
      <button
        type="button"
        onClick={() => onSelect("event")}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-cream transition-colors text-left"
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: T.lilac }}
        >
          <Icon name="calendar" size={16} color={T.ink} />
        </div>
        <div>
          <div className="text-sm lowercase" style={{ fontFamily: FF.sans, color: T.ink }}>event</div>
          <div className="text-[11px]" style={{ fontFamily: FF.mono, color: T.ink40, letterSpacing: 0.4 }}>
            create an event with this chat
          </div>
        </div>
      </button>
    </div>
  );
}

// Multi-step event creation wizard rendered above the chat input.
export function ChatEventWizard({ roomId, memberIds = [], onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Shared free slots for the chosen day (fetched on entering step 2).
  const [gaps, setGaps] = useState([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsErr, setGapsErr] = useState(false);
  const [selectedGap, setSelectedGap] = useState(null); // index into gaps

  const step1Valid = name.trim().length > 0 && !!date;

  const goNext = () => {
    if (step === 1 && !step1Valid) {
      setError("name and date are required");
      return;
    }
    setError(null);
    setStep(2);
  };

  // Load the shared free time for everyone in this chat on the selected day.
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    (async () => {
      setGapsLoading(true);
      setGapsErr(false);
      setGaps([]);
      setSelectedGap(null);
      try {
        const res = await authenticatedFetch(
          `${import.meta.env.VITE_API_URL}/api/availability/shared-gaps/`,
          {
            method: "POST",
            body: JSON.stringify({ user_ids: memberIds, date, min_duration_minutes: 30 }),
          }
        );
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (!cancelled) setGaps(data.gaps || []);
      } catch {
        if (!cancelled) setGapsErr(true);
      } finally {
        if (!cancelled) setGapsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, date, memberIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickGap = (gap, idx) => {
    setSelectedGap(idx);
    setStartTime(isoToTimeInput(gap.start));
    setEndTime(isoToTimeInput(gap.end));
    setError(null);
  };

  const submit = async () => {
    if (submitting) return;
    if (!startTime || !endTime || startTime >= endTime) {
      setError("pick a start and end time (end must be after start)");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/events/`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            date,
            start_time: startTime,
            end_time: endTime,
            location: location.trim(),
            is_repeating: false,
            repeat_days: "",
            visibility: "PRIVATE",
            create_chat: false,
            invite_user_ids: memberIds,
            source_chat_room_id: roomId,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "overlap") {
          setError("this overlaps with an existing event or class — try a different time");
        } else {
          setError(data.detail || data.end_time || "couldn't create event");
        }
        setSubmitting(false);
        return;
      }
      onCreated?.(data);
    } catch {
      setError("network error");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 mx-3 rounded-2xl overflow-hidden shadow-lg z-30"
      style={{ background: "#fff", border: `1px solid ${T.ink08}` }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b"
        style={{ borderColor: T.ink08 }}
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: T.lilac }}
        >
          <Icon name="calendar" size={13} color={T.ink} />
        </div>
        <span
          className="flex-1 text-sm lowercase"
          style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.2 }}
        >
          {step === 1 ? "new event" : "details"}
        </span>
        <div className="flex items-center gap-1">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ background: s === step ? T.coral : T.ink15 || T.ink08 }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-cream ml-1"
          aria-label="close"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.ink60} strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="px-3 py-3 flex flex-col gap-3">
        {step === 1 && (
          <>
            <input
              autoFocus
              type="text"
              placeholder="event name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 100))}
              style={inputStyle(T)}
              className="placeholder:text-ink-40"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle(T)}
            />
          </>
        )}

        {step === 2 && (
          <>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: T.cream }}
            >
              <div
                className="text-sm font-medium lowercase truncate"
                style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.2 }}
              >
                {name}
              </div>
              <div
                className="text-[11px] mt-0.5"
                style={{ fontFamily: FF.mono, color: T.ink60, letterSpacing: 0.3 }}
              >
                {formatDisplayDate(date)} · {startTime}–{endTime}
              </div>
            </div>

            {/* Shared free time for everyone in this chat on the chosen day */}
            <div>
              <div
                className="text-[10px] uppercase mb-1.5 px-0.5"
                style={{ fontFamily: FF.mono, color: T.ink40, letterSpacing: 0.8 }}
              >
                {memberIds.length > 0 ? "everyone's free" : "your free time"}
              </div>
              {gapsLoading ? (
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-7 w-24 rounded-full animate-pulse" style={{ background: T.ink08 }} />
                  ))}
                </div>
              ) : gapsErr ? (
                <div className="text-[11px] lowercase px-0.5" style={{ fontFamily: FF.sans, color: T.ink40 }}>
                  couldn't load free times — pick a time below
                </div>
              ) : gaps.length === 0 ? (
                <div className="text-[11px] lowercase px-0.5" style={{ fontFamily: FF.sans, color: T.ink40 }}>
                  no shared free slots this day — pick a time below
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {gaps.map((gap, idx) => {
                    const active = selectedGap === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => pickGap(gap, idx)}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold lowercase transition-colors"
                        style={{
                          background: active ? T.coral : T.cream,
                          color: active ? "#fff" : T.ink,
                          border: `1px solid ${active ? T.coral : T.ink15 || T.ink08}`,
                          fontFamily: FF.sans,
                        }}
                      >
                        {fmtSlotTime(gap.start)}–{fmtSlotTime(gap.end)}
                        <span style={{ opacity: 0.6 }}> · {fmtSlotDuration(gap.duration_minutes)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Fine-tune the exact start / end */}
            <div className="flex gap-2">
              <div className="flex-1">
                <div
                  className="text-[10px] uppercase mb-1 px-0.5"
                  style={{ fontFamily: FF.mono, color: T.ink40, letterSpacing: 0.8 }}
                >
                  from
                </div>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => { setStartTime(e.target.value); setSelectedGap(null); }}
                  style={inputStyle(T)}
                />
              </div>
              <div className="flex-1">
                <div
                  className="text-[10px] uppercase mb-1 px-0.5"
                  style={{ fontFamily: FF.mono, color: T.ink40, letterSpacing: 0.8 }}
                >
                  to
                </div>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => { setEndTime(e.target.value); setSelectedGap(null); }}
                  style={inputStyle(T)}
                />
              </div>
            </div>

            <input
              type="text"
              placeholder="location (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value.slice(0, 200))}
              style={inputStyle(T)}
              className="placeholder:text-ink-40"
            />
            <div
              className="text-[11px] lowercase px-0.5"
              style={{ fontFamily: FF.sans, color: T.ink40 }}
            >
              {memberIds.length > 0
                ? `${memberIds.length} chat member${memberIds.length !== 1 ? "s" : ""} will be invited`
                : "no other members to invite"}
            </div>
          </>
        )}

        {error && (
          <div
            className="text-[12px] lowercase px-0.5"
            style={{ color: T.coral, fontFamily: FF.sans }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          {step === 2 && (
            <button
              type="button"
              onClick={() => { setError(null); setStep(1); }}
              className="px-3 py-2 rounded-xl text-sm lowercase"
              style={{ fontFamily: FF.sans, color: T.ink60, background: T.cream }}
            >
              back
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              onClick={goNext}
              disabled={!step1Valid}
              className="px-4 py-2 rounded-xl text-sm lowercase disabled:opacity-40"
              style={{ fontFamily: FF.sans, background: T.coral, color: "#fff" }}
            >
              next
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm lowercase disabled:opacity-40 flex items-center gap-2"
              style={{ fontFamily: FF.sans, background: T.coral, color: "#fff" }}
            >
              {submitting && (
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              )}
              create event
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
