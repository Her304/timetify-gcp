import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { T, FF, MonoLabel, Avatar, Icon } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";
import SnapViewerModal from "@/components/snap/SnapViewerModal";

const MAX_LEN = 2000;
const COUNTER_THRESHOLD = 1800;
const POLL_INTERVAL = 5000;
const TIMESTAMP_GAP_MS = 5 * 60 * 1000;
const TEXTAREA_LINE_PX = 22;
const TEXTAREA_MAX_LINES = 5;

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const AVATAR_BG = [T.coral, T.lilac, "#f0c4a8", "#b8d8c2", T.lime];
const colorForUser = (name) => AVATAR_BG[hashStr(name) % AVATAR_BG.length];

const formatBubbleTime = (iso) => {
  const d = new Date(iso);
  const hh = d.getHours();
  const mm = d.getMinutes().toString().padStart(2, "0");
  const period = hh < 12 ? "am" : "pm";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm} ${period}`;
};

const formatLastSeen = (iso) => {
  if (!iso) return null;
  const ageMs = Date.now() - new Date(iso).getTime();
  if (ageMs < 5 * 60 * 1000) return "active now";
  const mins = Math.floor(ageMs / 60000);
  if (mins < 60) return `active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `active ${hrs}h ago`;
  return `last seen ${formatBubbleTime(iso)}`;
};

// One chat bubble. `mine` flips alignment + color; `__pending` dims it, `__failed`
// surfaces a retry control supplied by the parent.
const Bubble = ({ msg, mine, showTime, onRetry }) => {
  if (msg.is_removed) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} px-1`}>
        <div
          className="px-3 py-2 rounded-2xl max-w-[78%] italic text-sm leading-snug"
          style={{ color: T.ink40, background: T.ink08, fontFamily: FF.sans }}
        >
          [message removed]
        </div>
      </div>
    );
  }
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} px-1`}>
      <div
        className="px-3.5 py-2 rounded-2xl max-w-[78%] whitespace-pre-wrap break-words text-[15px] leading-snug"
        style={{
          background: mine ? T.coral : T.ink08,
          color: mine ? "#fff" : T.ink,
          opacity: msg.__pending ? 0.6 : 1,
          fontFamily: FF.sans,
        }}
      >
        {msg.content}
      </div>
      {showTime && (
        <span
          className="text-[10px] mt-1 px-1 uppercase"
          style={{ color: T.ink40, fontFamily: FF.mono, letterSpacing: 0.6 }}
        >
          {formatBubbleTime(msg.created_at)}
        </span>
      )}
      {msg.__failed && (
        <button
          type="button"
          onClick={() => onRetry && onRetry(msg)}
          className="text-[10px] mt-0.5 px-1 lowercase hover:underline"
          style={{ color: T.coral, fontFamily: FF.mono, letterSpacing: 0.4 }}
        >
          ↻ retry
        </button>
      )}
    </div>
  );
};

const DAYS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const toMins = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Mirror SnapViewerModal: relative /media/... paths get the API base prefix
// in local dev; signed/absolute URLs from GCS pass through untouched.
const resolveMediaUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${import.meta.env.VITE_API_URL}${url}`;
};

export const ChatThread = ({ currentUser, allClasses = [], snapsByCourse = {} }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  // DESC order (newest first) — matches API response shape. Rendered with
  // flex-col-reverse so visual order is ascending (oldest top, newest bottom)
  // and new messages naturally appear at the bottom without manual scrolling.
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderExhausted, setOlderExhausted] = useState(false);

  const textareaRef = useRef(null);
  const topSentinelRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const API = import.meta.env.VITE_API_URL;
  const otherUser = room?.other_user || null;

  const markRead = useCallback(async () => {
    try {
      await authenticatedFetch(`${API}/api/chats/${roomId}/read/`, { method: "POST" });
    } catch {
      // ok — server-side last_read_at update is best-effort; the badge poll resolves it
    }
  }, [API, roomId]);

  // Initial load + reset on roomId change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    setOlderExhausted(false);
    const load = async () => {
      try {
        const res = await authenticatedFetch(`${API}/api/chats/${roomId}/`);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? "forbidden" : "not_found");
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setRoom(data);
        setMessages(data.messages || []);
        setLoading(false);
        markRead();
      } catch {
        if (!cancelled) {
          setError("network");
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [API, roomId, markRead]);

  // 5s poll while the tab is visible. Refetches the latest 50 and merges by id
  // so any older messages loaded via pagination stay put. Marks read when an
  // incoming message from the other user arrives while we're visible.
  useEffect(() => {
    let stopped = false;
    let intervalId = null;

    const tick = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await authenticatedFetch(`${API}/api/chats/${roomId}/`);
        if (stopped || !res.ok) return;
        const data = await res.json();
        if (stopped) return;
        let hasIncoming = false;
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          for (const m of data.messages || []) {
            if (!byId.has(m.id) && m.sender_id !== currentUser?.id) hasIncoming = true;
            byId.set(m.id, m);
          }
          return Array.from(byId.values()).sort((a, b) => {
            const at = new Date(a.created_at).getTime();
            const bt = new Date(b.created_at).getTime();
            return bt - at;
          });
        });
        if (hasIncoming) markRead();
      } catch {
        // transient — next tick will retry
      }
    };

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(tick, POLL_INTERVAL);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [API, roomId, currentUser?.id, markRead]);

  // Load older messages when the top sentinel comes into view. The sentinel
  // sits at the visual top of the list which, under flex-col-reverse, maps
  // to the LAST item in our DESC array (the oldest message).
  useEffect(() => {
    if (loading || olderExhausted || messages.length === 0) return;
    const node = topSentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (olderLoading) return;
        const oldest = messages[messages.length - 1];
        if (!oldest) return;
        setOlderLoading(true);
        try {
          const res = await authenticatedFetch(
            `${API}/api/chats/${roomId}/messages/?before=${oldest.id}`
          );
          if (!res.ok) return;
          const data = await res.json();
          const older = data.messages || [];
          if (older.length === 0) {
            setOlderExhausted(true);
            return;
          }
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of older) byId.set(m.id, m);
            return Array.from(byId.values()).sort((a, b) => {
              const at = new Date(a.created_at).getTime();
              const bt = new Date(b.created_at).getTime();
              return bt - at;
            });
          });
        } catch {
          // swallow; user can scroll up again to retry
        } finally {
          setOlderLoading(false);
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [API, roomId, loading, messages, olderLoading, olderExhausted]);

  // Autosize the input: re-measure on every text change, capped at 5 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, TEXTAREA_LINE_PX * TEXTAREA_MAX_LINES + 16);
    el.style.height = `${next}px`;
  }, [text]);

  const doSend = async (content, tempId) => {
    try {
      const res = await authenticatedFetch(`${API}/api/chats/${roomId}/messages/`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("send_failed");
      const real = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === tempId ? real : m)));
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, __pending: false, __failed: true } : m
        )
      );
    }
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || content.length > MAX_LEN || sending) return;
    setSending(true);
    const tempId = `pending-${Date.now()}`;
    const optimistic = {
      id: tempId,
      sender_id: currentUser?.id,
      sender_username: currentUser?.username,
      content,
      is_removed: false,
      created_at: new Date().toISOString(),
      __pending: true,
    };
    setMessages((prev) => [optimistic, ...prev]);
    setText("");
    await doSend(content, tempId);
    setSending(false);
  };

  const handleRetry = async (failedMsg) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === failedMsg.id ? { ...m, __pending: true, __failed: false } : m
      )
    );
    await doSend(failedMsg.content, failedMsg.id);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Precompute which bubbles get a timestamp underneath:
  // - newest message always shows time
  // - any message where the gap to the next-older message is > 5 min
  const showTimeByIdx = useMemo(() => {
    const flags = new Array(messages.length).fill(false);
    for (let j = 0; j < messages.length; j++) {
      if (j === 0) {
        flags[j] = true;
        continue;
      }
      const older = messages[j + 1];
      if (!older) {
        flags[j] = true;
        continue;
      }
      const gap = new Date(messages[j].created_at).getTime() - new Date(older.created_at).getTime();
      if (gap > TIMESTAMP_GAP_MS) flags[j] = true;
    }
    return flags;
  }, [messages]);

  const charsLeft = MAX_LEN - text.length;
  const showCounter = text.length >= COUNTER_THRESHOLD;
  const canSend = text.trim().length > 0 && text.length <= MAX_LEN && !sending;
  const lastSeenLabel = otherUser ? formatLastSeen(otherUser.last_seen) : null;

  // Side panel: classes today that both me and other_user are enrolled in.
  // Match the WeekView convention — allClasses entries carry `day` (MON..SUN)
  // and `owner` ("Me" or a friend's username). Intersect by base_course so a
  // lecture+lab pair on either side still aligns. Highlight whichever entry
  // is currently in session.
  const today = DAYS_SHORT[new Date().getDay()];
  const sharedClassesToday = useMemo(() => {
    if (!otherUser || !Array.isArray(allClasses) || allClasses.length === 0) return [];
    const myTodayByCourse = new Map();
    const theirCourseIds = new Set();
    for (const c of allClasses) {
      if (c.day !== today) continue;
      const key = c.base_course || c.course_id;
      if (!key) continue;
      if (c.owner === "Me") {
        if (!myTodayByCourse.has(key)) myTodayByCourse.set(key, c);
      } else if (c.owner === otherUser.username) {
        theirCourseIds.add(key);
      }
    }
    const out = [];
    for (const [key, cls] of myTodayByCourse) {
      if (theirCourseIds.has(key)) out.push(cls);
    }
    out.sort((a, b) => toMins(a.start_time) - toMins(b.start_time));
    return out;
  }, [otherUser, allClasses, today]);

  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const happeningNowKey = useMemo(() => {
    const live = sharedClassesToday.find(
      (c) => toMins(c.start_time) <= nowMins && nowMins < toMins(c.end_time)
    );
    return live ? live.base_course || live.course_id : null;
  }, [sharedClassesToday, nowMins]);

  // Other user's snaps posted today and visible to me. snapsByCourse already
  // applies the server-side visibility rules (uploader OR all_friends-of-current-friends
  // OR selected allowlist), so a simple username + today filter is enough.
  const theirSnapsToday = useMemo(() => {
    if (!otherUser || !snapsByCourse) return [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const seen = new Set();
    const out = [];
    for (const list of Object.values(snapsByCourse)) {
      for (const s of list || []) {
        if (s.uploader_username !== otherUser.username) continue;
        if (new Date(s.created_at) < startOfDay) continue;
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
      }
    }
    out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return out;
  }, [otherUser, snapsByCourse]);

  const [snapViewerIdx, setSnapViewerIdx] = useState(null);
  const snapViewerOpen = snapViewerIdx != null && theirSnapsToday.length > 0;

  return (
    <div
      className="flex flex-col md:flex-row gap-4 w-full mx-auto"
      style={{ maxWidth: 1100, minHeight: "calc(100dvh - 120px)" }}
    >
      <div
        className="flex flex-col flex-1 bg-cream rounded-2xl overflow-hidden md:max-w-[640px]"
        style={{ minHeight: "calc(100dvh - 120px)", maxHeight: "calc(100dvh - 120px)" }}
      >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: T.ink08, background: T.cream }}
      >
        <button
          type="button"
          onClick={() => navigate("/feed")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-ink-8 transition-colors"
          aria-label="back"
        >
          <Icon name="chevL" size={20} color={T.ink} />
        </button>
        {otherUser ? (
          <>
            <Avatar
              name={otherUser.username.slice(0, 2).toLowerCase()}
              bg={colorForUser(otherUser.username)}
              fg={colorForUser(otherUser.username) === T.coral ? "#fff" : T.ink}
              size={40}
            />
            <div className="flex-1 min-w-0">
              <div
                className="text-lg leading-none lowercase truncate"
                style={{ fontFamily: FF.serif, letterSpacing: -0.4, color: T.ink }}
              >
                {otherUser.username}
              </div>
              {lastSeenLabel && (
                <MonoLabel fs={10} ls={0.8} style={{ marginTop: 4 }}>
                  {lastSeenLabel}
                </MonoLabel>
              )}
            </div>
          </>
        ) : loading ? (
          <div className="text-sm text-ink-60 lowercase">loading…</div>
        ) : (
          <div className="text-sm text-ink-60 lowercase">chat</div>
        )}
      </div>

      {/* Message list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ background: T.cream }}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm text-ink-60 lowercase">loading…</span>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center px-6 text-center">
            <div>
              <div
                className="text-2xl lowercase mb-2"
                style={{ fontFamily: FF.serif, letterSpacing: -0.5, color: T.ink }}
              >
                {error === "forbidden" ? "not your chat" : "chat not found"}
              </div>
              <button
                type="button"
                onClick={() => navigate("/feed")}
                className="mt-3 px-4 py-2 rounded-full text-sm lowercase"
                style={{ background: T.ink, color: T.cream, fontFamily: FF.sans }}
              >
                back to feed
              </button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6 text-center">
            <div>
              <div className="text-4xl mb-2">👋</div>
              <div
                className="text-xl lowercase"
                style={{ fontFamily: FF.serif, letterSpacing: -0.4, color: T.ink }}
              >
                say hi to @{otherUser?.username}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-1.5 py-4 px-3 min-h-full">
            {messages.map((m, idx) => (
              <Bubble
                key={m.id}
                msg={m}
                mine={m.sender_id === currentUser?.id}
                showTime={showTimeByIdx[idx]}
                onRetry={handleRetry}
              />
            ))}
            {/* Sentinel sits at the *visual* top under flex-col-reverse (DOM-last). */}
            {!olderExhausted && (
              <div ref={topSentinelRef} className="h-4 flex items-center justify-center">
                {olderLoading && (
                  <span className="text-[10px] text-ink-40 lowercase" style={{ fontFamily: FF.mono }}>
                    loading older…
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="border-t px-3 py-2"
        style={{ borderColor: T.ink08, background: "#fff" }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={onKeyDown}
            placeholder={`message @${otherUser?.username || ""}`}
            rows={1}
            disabled={loading || error}
            className="flex-1 resize-none px-3 py-2 rounded-2xl outline-none text-[15px] leading-snug placeholder:text-ink-40 disabled:opacity-50"
            style={{
              fontFamily: FF.sans,
              background: T.cream,
              color: T.ink,
              border: `1px solid ${T.ink08}`,
              maxHeight: TEXTAREA_LINE_PX * TEXTAREA_MAX_LINES + 16,
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
            style={{ background: T.coral, color: "#fff" }}
            aria-label="send"
          >
            {sending ? (
              <span className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        </div>
        {showCounter && (
          <div
            className="text-right text-[10px] mt-1 px-1"
            style={{
              color: charsLeft <= 50 ? T.coralDk : T.ink40,
              fontFamily: FF.mono,
              letterSpacing: 0.4,
            }}
          >
            {charsLeft} chars left
          </div>
        )}
      </div>
      </div>
      {/* Side panel: shared classes today + their snaps today.
          Mobile: stacks under the chat column (scroll to see).
          Desktop: pinned to the right of the chat. */}
      <aside
        className="flex flex-col gap-3 md:w-[320px] md:flex-shrink-0 md:overflow-y-auto"
        style={{ maxHeight: "calc(100dvh - 120px)" }}
      >
        <SharedClassesCard
          otherUser={otherUser}
          classes={sharedClassesToday}
          happeningNowKey={happeningNowKey}
        />
        <TheirSnapsCard
          otherUser={otherUser}
          snaps={theirSnapsToday}
          onOpenViewer={(i) => setSnapViewerIdx(i)}
        />
      </aside>
      {snapViewerOpen && (
        <SnapViewerModal
          courseLabel={`@${otherUser?.username || ""}`}
          snaps={theirSnapsToday}
          onClose={() => setSnapViewerIdx(null)}
          onChanged={() => setSnapViewerIdx(null)}
        />
      )}
    </div>
  );
};

// Side cards live below so the main component stays focused on chat behavior.

const CARD_BASE =
  "bg-white border border-ink-8 rounded-2xl p-4 flex flex-col gap-3";

const SharedClassesCard = ({ otherUser, classes, happeningNowKey }) => {
  if (!otherUser) return null;
  return (
    <div className={CARD_BASE}>
      <div className="flex items-baseline justify-between">
        <MonoLabel fs={10}>our class today</MonoLabel>
        {classes.length > 0 && (
          <span
            className="text-[10px] uppercase"
            style={{ fontFamily: FF.mono, color: T.ink40, letterSpacing: 0.6 }}
          >
            {classes.length}
          </span>
        )}
      </div>
      {classes.length === 0 ? (
        <p
          className="text-xs lowercase"
          style={{ color: T.ink40, fontFamily: FF.sans }}
        >
          no shared class today
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {classes.map((c) => {
            const key = c.base_course || c.course_id;
            const live = happeningNowKey === key;
            return (
              <div
                key={`${key}-${c.start_time}`}
                className="rounded-xl px-3 py-2.5 border"
                style={{
                  background: live ? T.coral : T.cream,
                  color: live ? "#fff" : T.ink,
                  borderColor: live ? T.coral : T.ink08,
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="text-sm font-semibold lowercase truncate flex-1"
                    style={{ fontFamily: FF.serif, letterSpacing: -0.2 }}
                  >
                    {c.course || c.course_id}
                  </div>
                  {live && (
                    <span
                      className="text-[9px] uppercase px-1.5 py-0.5 rounded-full"
                      style={{
                        background: "#fff",
                        color: T.coralDk,
                        fontFamily: FF.mono,
                        letterSpacing: 0.8,
                      }}
                    >
                      now
                    </span>
                  )}
                </div>
                <div
                  className="text-[11px] mt-1"
                  style={{
                    fontFamily: FF.mono,
                    color: live ? "rgba(255,255,255,0.85)" : T.ink60,
                    letterSpacing: 0.3,
                  }}
                >
                  {c.start_time}–{c.end_time}
                  {c.location ? ` · ${c.location}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TheirSnapsCard = ({ otherUser, snaps, onOpenViewer }) => {
  if (!otherUser) return null;
  const hasAny = snaps.length > 0;
  return (
    <div className={CARD_BASE}>
      <div className="flex items-baseline justify-between">
        <MonoLabel fs={10}>their snaps today</MonoLabel>
        {hasAny && (
          <span
            className="text-[10px] uppercase"
            style={{ fontFamily: FF.mono, color: T.ink40, letterSpacing: 0.6 }}
          >
            {snaps.length}
          </span>
        )}
      </div>
      {!hasAny ? (
        <p
          className="text-xs lowercase"
          style={{ color: T.ink40, fontFamily: FF.sans }}
        >
          no snaps from @{otherUser.username} today
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {snaps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenViewer(i)}
              className="relative rounded-xl overflow-hidden bg-ink-8 aspect-[4/5] hover:opacity-90 transition-opacity"
              style={{ border: `1px solid ${T.ink08}` }}
              aria-label={`open snap ${i + 1}`}
            >
              {s.media_type === "video" ? (
                <video
                  src={resolveMediaUrl(s.media_url)}
                  className="absolute inset-0 w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={resolveMediaUrl(s.media_url)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              {s.course_code && (
                <span
                  className="absolute bottom-1 left-1 right-1 text-[9px] uppercase px-1 py-0.5 rounded text-center truncate"
                  style={{
                    background: "rgba(0,0,0,0.45)",
                    color: "#fff",
                    fontFamily: FF.mono,
                    letterSpacing: 0.5,
                  }}
                >
                  {s.course_code}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatThread;
