import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T, FF, Avatar, Icon, MonoLabel } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

const NAME_MAX = 100;
const LOC_MAX = 200;
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const VISIBILITY_OPTIONS = [
  { value: "PRIVATE", label: "private", hint: "invited friends see details · other friends see a 'private event' busy block" },
  { value: "PUBLIC",  label: "public",  hint: "all your accepted friends see the full event" },
];

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const AVATAR_BG = [T.coral, T.lilac, "#f0c4a8", "#b8d8c2", T.lime];
const colorForUser = (name) => AVATAR_BG[hashStr(name) % AVATAR_BG.length];

const todayIso = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function AddEventPage({ friendsList = [], currentUser, onCreated }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatDays, setRepeatDays] = useState(() => new Set());
  const [selectedFriends, setSelectedFriends] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [createChat, setCreateChat] = useState(true);
  const [allowJoinRequests, setAllowJoinRequests] = useState(false);
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

  const toggleFriend = (id) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleDay = (d) => {
    setRepeatDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const step1Valid =
    name.trim().length > 0 &&
    !!date && !!startTime && !!endTime &&
    startTime < endTime;
  const step2Valid = !isRepeating || repeatDays.size > 0;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      name: name.trim(),
      date,
      start_time: startTime,
      end_time: endTime,
      location: location.trim(),
      is_repeating: isRepeating,
      repeat_days: isRepeating ? Array.from(repeatDays).join(",") : "",
      visibility,
      allow_join_requests: visibility === "PUBLIC" ? allowJoinRequests : false,
      invite_user_ids: Array.from(selectedFriends),
      create_chat: createChat,
    };
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/events/`,
        { method: "POST", body: JSON.stringify(payload) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "overlap" && Array.isArray(data.conflicts)) {
          const lines = data.conflicts.map((c) => {
            const who = c.user_id === currentUser?.id ? "you" : c.username;
            const what = c.kind === "course"
              ? `${c.course_id}`
              : `"${c.event_name}"`;
            return `${who} · ${what} on ${c.day} ${c.start_time}–${c.end_time}`;
          });
          setError(`time conflict — ${lines.join(" · ")}`);
        }
        else if (data.detail === "not_friends") setError("some picks aren't your friends");
        else if (data.detail) setError(String(data.detail));
        else if (data.end_time) setError(String(data.end_time));
        else if (data.repeat_days) setError(String(data.repeat_days));
        else setError("couldn't create event");
        setSubmitting(false);
        return;
      }
      onCreated && onCreated(data);
    } catch {
      setError("network error");
      setSubmitting(false);
    }
  };

  const goNext = () => {
    setError(null);
    if (step === 1 && !step1Valid) {
      setError(startTime >= endTime ? "end time must be after start" : "name, date, and time are required");
      return;
    }
    if (step === 2 && !step2Valid) {
      setError("pick at least one day to repeat on");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => {
    setError(null);
    if (step === 1) { navigate(-1); return; }
    setStep((s) => Math.max(1, s - 1));
  };

  const inputStyle = {
    background: "#fff", color: T.ink,
    border: `1px solid ${T.ink15}`, fontFamily: FF.sans,
  };

  return (
    <div className="min-h-full flex flex-col" style={{ background: T.cream, color: T.ink }}>
      {/* header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: T.ink15 }}>
        <button
          onClick={goBack}
          className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
          style={{ background: T.ink08 }}
          aria-label="back"
        >
          <Icon name="chevron-left" size={16} color={T.ink} />
        </button>
        <div>
          <MonoLabel color={T.ink40} fs={10}>new · step {step} of 3</MonoLabel>
          <h1 className="text-2xl leading-none mt-1" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
            add event
          </h1>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 px-5 py-6 flex flex-col gap-4 max-w-lg w-full mx-auto">
        {step === 1 && (
          <>
            <div className="flex flex-col gap-1.5">
              <MonoLabel color={T.ink40} fs={10}>name</MonoLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                placeholder="study jam"
                className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <MonoLabel color={T.ink40} fs={10}>date</MonoLabel>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <MonoLabel color={T.ink40} fs={10}>start</MonoLabel>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <MonoLabel color={T.ink40} fs={10}>end</MonoLabel>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none"
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <MonoLabel color={T.ink40} fs={10}>location (optional)</MonoLabel>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value.slice(0, LOC_MAX))}
                placeholder="myhal 150"
                className="w-full px-4 py-2.5 rounded-2xl text-sm outline-none"
                style={inputStyle}
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <MonoLabel color={T.ink40} fs={10}>repeat weekly</MonoLabel>
                <span className="text-xs lowercase mt-1" style={{ color: T.ink60, fontFamily: FF.sans }}>
                  {isRepeating ? "on selected days" : "single occurrence"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsRepeating((v) => !v)}
                className="w-12 h-7 rounded-full transition-colors"
                style={{
                  background: isRepeating ? T.coral : T.ink15,
                  position: "relative",
                }}
                aria-pressed={isRepeating}
              >
                <span
                  className="block w-5 h-5 rounded-full bg-white absolute top-1 transition-all"
                  style={{ left: isRepeating ? 24 : 4 }}
                />
              </button>
            </div>
            {isRepeating && (
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAYS.map((d) => {
                  const active = repeatDays.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
                      style={{
                        background: active ? T.coral : "#fff",
                        color: active ? "#fff" : T.ink,
                        border: `1px solid ${active ? T.coral : T.ink15}`,
                        fontFamily: FF.mono, letterSpacing: 0.6,
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-center justify-between">
                <MonoLabel color={T.ink40} fs={10}>
                  invite friends ({selectedFriends.size})
                </MonoLabel>
                <span className="text-[10px] lowercase" style={{ color: T.ink40, fontFamily: FF.mono }}>
                  optional
                </span>
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search friends…"
                className="w-full px-3 py-2 rounded-2xl text-xs outline-none"
                style={{ background: "#fff", color: T.ink, border: `1px solid ${T.ink15}`, fontFamily: FF.sans }}
              />
              {filteredFriends.length === 0 ? (
                <div className="text-xs lowercase py-6 text-center" style={{ color: T.ink40 }}>
                  {friends.length === 0 ? "no friends yet" : "no match"}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {filteredFriends.map((f) => {
                    const active = selectedFriends.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFriend(f.id)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-full transition-colors text-left"
                        style={{
                          background: active ? T.coral : "#fff",
                          color: active ? "#fff" : T.ink,
                          border: `1px solid ${active ? T.coral : T.ink15}`,
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
                        {active && <span className="text-[10px] font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-2 p-3 rounded-2xl" style={{ background: "#fff", border: `1px solid ${T.ink15}` }}>
              <div className="flex flex-col">
                <span className="text-sm lowercase font-semibold" style={{ fontFamily: FF.sans }}>
                  create a groupchat
                </span>
                <span className="text-[11px] lowercase mt-0.5" style={{ color: T.ink60, fontFamily: FF.sans }}>
                  for this event's participants
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCreateChat((v) => !v)}
                className="w-12 h-7 rounded-full transition-colors flex-shrink-0"
                style={{
                  background: createChat ? T.coral : T.ink15,
                  position: "relative",
                }}
                aria-pressed={createChat}
              >
                <span
                  className="block w-5 h-5 rounded-full bg-white absolute top-1 transition-all"
                  style={{ left: createChat ? 24 : 4 }}
                />
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-2">
            <MonoLabel color={T.ink40} fs={10}>who can see this event</MonoLabel>
            {VISIBILITY_OPTIONS.map((opt) => {
              const active = visibility === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVisibility(opt.value)}
                  className="flex items-start gap-3 p-3 rounded-2xl text-left transition-colors"
                  style={{
                    background: active ? "rgba(237,106,74,.10)" : "#fff",
                    border: `1px solid ${active ? T.coral : T.ink15}`,
                  }}
                >
                  <span
                    className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0"
                    style={{
                      background: active ? T.coral : "transparent",
                      border: `2px solid ${active ? T.coral : T.ink40}`,
                    }}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm lowercase font-semibold" style={{ fontFamily: FF.sans }}>
                      {opt.label}
                    </span>
                    <span className="text-[11px] lowercase mt-0.5" style={{ color: T.ink60, fontFamily: FF.sans }}>
                      {opt.hint}
                    </span>
                  </span>
                </button>
              );
            })}

            {visibility === "PUBLIC" && (
              <div className="flex items-center justify-between mt-2 p-3 rounded-2xl" style={{ background: "#fff", border: `1px solid ${T.ink15}` }}>
                <div className="flex flex-col">
                  <span className="text-sm lowercase font-semibold" style={{ fontFamily: FF.sans }}>
                    allow join requests
                  </span>
                  <span className="text-[11px] lowercase mt-0.5" style={{ color: T.ink60, fontFamily: FF.sans }}>
                    friends can ask to join this event
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowJoinRequests((v) => !v)}
                  className="w-12 h-7 rounded-full transition-colors flex-shrink-0"
                  style={{
                    background: allowJoinRequests ? T.coral : T.ink15,
                    position: "relative",
                  }}
                  aria-pressed={allowJoinRequests}
                >
                  <span
                    className="block w-5 h-5 rounded-full bg-white absolute top-1 transition-all"
                    style={{ left: allowJoinRequests ? 24 : 4 }}
                  />
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-[11px] lowercase px-3 py-2 rounded-2xl" style={{
            background: "rgba(237,106,74,.10)", color: T.coral,
            border: `1px solid ${T.coral}`, fontFamily: FF.mono, letterSpacing: 0.4,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* footer */}
      <div className="px-5 py-4 border-t flex gap-2 flex-shrink-0 max-w-lg w-full mx-auto" style={{ borderColor: T.ink15 }}>
        <button
          onClick={goBack}
          className="px-4 py-2.5 rounded-full text-sm lowercase"
          style={{ background: T.ink08, color: T.ink, border: `1px solid ${T.ink15}` }}
        >
          {step === 1 ? "cancel" : "back"}
        </button>
        <button
          onClick={step === 3 ? submit : goNext}
          disabled={submitting || (step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
          className="flex-1 px-4 py-2.5 rounded-full text-sm font-semibold lowercase disabled:opacity-40"
          style={{ background: T.coral, color: "#fff" }}
        >
          {step === 3 ? (submitting ? "creating…" : "create event") : "next"}
        </button>
      </div>
    </div>
  );
}
