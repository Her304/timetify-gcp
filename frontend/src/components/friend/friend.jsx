import { useEffect, useMemo, useRef, useState } from "react";
import { T, FF, MonoLabel, Avatar, Icon, Blob, Star } from "@/components/shared/brand";

// ─────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [T.lime, T.lilac, "#f0c4a8", "#b8d8c2", T.coral];
const colorFor = (name) => {
  if (!name) return T.lilac;
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
};
const isCoral = (c) => c === T.coral;

const COURSE_DOT_PALETTE = [T.coral, T.lime, T.lilac, "#E89866", "#7DB389"];
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const dotForCourse = (courseId) =>
  COURSE_DOT_PALETTE[hashStr(courseId) % COURSE_DOT_PALETTE.length];

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const formatRelative = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

// Friends currently inside a class, derived from allClasses (which already
// includes friend-owned classes). Returns Map<username, {courseId, course_name}>.
const liveFriendsFromSchedule = (allClasses, currentUser) => {
  const out = new Map();
  if (!Array.isArray(allClasses) || allClasses.length === 0) return out;
  const now = new Date();
  const todayKey = DAYS[now.getDay()];
  const nowMins = now.getHours() * 60 + now.getMinutes();
  allClasses.forEach((c) => {
    const day = String(c.day || "").toUpperCase().slice(0, 3);
    if (day !== todayKey) return;
    const s = toMinutes(c.start_time);
    const e = toMinutes(c.end_time);
    if (s == null || e == null) return;
    if (nowMins < s || nowMins > e) return;
    const owners = String(c.owner || "")
      .split(/[,&]\s*/)
      .map((o) => o.trim())
      .filter((o) => o && o !== "Me" && o !== currentUser?.username);
    owners.forEach((o) => {
      if (!out.has(o)) {
        out.set(o, { courseId: c.course || c.course_id, courseName: c.course_name });
      }
    });
  });
  return out;
};

// ─────────────────────────────────────────────────────────────────
// small atoms
// ─────────────────────────────────────────────────────────────────

const CountPill = ({ value, label, dot, active, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(value)}
    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap"
    style={{
      background: active ? T.ink : "#fff",
      color: active ? T.cream : T.ink,
      border: active ? "none" : `1px solid ${T.ink15}`,
      fontFamily: FF.sans,
      fontWeight: 500,
    }}
  >
    {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
    <span className="lowercase">{label}</span>
  </button>
);

const CoursePill = ({ courseId }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium uppercase"
    style={{
      background: "#fff",
      border: `1px solid ${T.ink15}`,
      color: T.ink,
      fontFamily: FF.mono,
      letterSpacing: 0.6,
    }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotForCourse(courseId) }} />
    {courseId}
  </span>
);

// ─────────────────────────────────────────────────────────────────
// LIVE NOW strip — horizontal dark card with friend tiles
// ─────────────────────────────────────────────────────────────────

const LiveNowStrip = ({ liveFriends }) => {
  const entries = Array.from(liveFriends.entries()).slice(0, 5);
  if (entries.length === 0) return null;
  return (
    <div
      className="rounded-3xl p-5 relative overflow-hidden"
      style={{ background: T.ink, color: T.cream }}
    >
      <Blob
        color={T.coral}
        size={170}
        seed={2}
        style={{ position: "absolute", left: -60, bottom: -60, opacity: 0.8 }}
      />
      <div className="relative flex items-center justify-between mb-4">
        <div
          className="text-[10px] uppercase font-medium flex items-center gap-2"
          style={{
            fontFamily: FF.mono,
            color: "rgba(248,244,237,0.65)",
            letterSpacing: 1.2,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.coral }} />
          live now · {entries.length} friend{entries.length === 1 ? "" : "s"}
        </div>
        <a
          href="#recently-active"
          className="text-[11px] uppercase font-medium"
          style={{
            fontFamily: FF.mono,
            color: "rgba(248,244,237,0.65)",
            letterSpacing: 1,
          }}
        >
          more →
        </a>
      </div>
      <div className="relative flex gap-2 overflow-x-auto pb-1">
        {entries.map(([username, info]) => (
          <div
            key={username}
            className="flex-shrink-0 rounded-2xl p-3 flex items-center gap-2"
            style={{
              background: "rgba(248,244,237,0.06)",
              border: "1px solid rgba(248,244,237,0.1)",
              minWidth: 168,
            }}
          >
            <Avatar
              name={(username?.slice(0, 2) || "?").toLowerCase()}
              bg={colorFor(username)}
              fg={isCoral(colorFor(username)) ? "#fff" : T.ink}
              size={36}
              ring={T.ink}
            />
            <div className="min-w-0">
              <div
                className="text-sm lowercase truncate leading-none"
                style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
              >
                {username}
              </div>
              <div
                className="text-[9px] uppercase mt-1"
                style={{
                  fontFamily: FF.mono,
                  color: "rgba(248,244,237,0.6)",
                  letterSpacing: 1,
                }}
              >
                {info.courseId}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Friend card — rich tile in the recently-active grid
// ─────────────────────────────────────────────────────────────────

const FriendCard = ({ user, isLive, liveCourse }) => {
  const name = user.username;
  const bg = colorFor(name);
  const snappedLabel = !isLive ? formatRelative(user.last_snap_at) : null;
  const lastSeenLabel = !isLive && !snappedLabel ? formatRelative(user.last_seen) : null;

  return (
    <div className="bg-white border border-ink-8 rounded-3xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Avatar
          name={(name?.slice(0, 2) || "?").toLowerCase()}
          bg={bg}
          fg={isCoral(bg) ? "#fff" : T.ink}
          size={56}
          ring={isLive ? T.coral : bg}
        />
        {isLive ? (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] uppercase font-semibold"
            style={{
              background: T.coralLt,
              color: T.coralDk,
              fontFamily: FF.mono,
              letterSpacing: 1,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.coral }} />
            live now
          </span>
        ) : snappedLabel || lastSeenLabel ? (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] uppercase font-semibold"
            style={{
              background: "#E8F5D7",
              color: "#3F5E14",
              fontFamily: FF.mono,
              letterSpacing: 1,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.lime }} />
            recently
          </span>
        ) : null}
      </div>
      <div>
        <h3
          className="text-2xl lowercase leading-none"
          style={{ fontFamily: FF.serif, letterSpacing: -0.6 }}
        >
          {name}
        </h3>
        <div className="text-xs text-ink-60 mt-1" style={{ fontFamily: FF.mono }}>
          @{name}
        </div>
      </div>
      {(user.shared_courses || []).length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {(user.shared_courses || []).slice(0, 2).map((c) => (
            <CoursePill key={c} courseId={c} />
          ))}
        </div>
      )}
      <div className="text-xs text-ink-60 lowercase" style={{ fontFamily: FF.sans }}>
        {isLive
          ? `in class now · ${(liveCourse?.courseId || "").toLowerCase()}`
          : snappedLabel
            ? `snapped ${snappedLabel}`
            : lastSeenLabel
              ? `active ${lastSeenLabel}`
              : [user.major, user.grad_year ? `class of ${user.grad_year}` : null]
                  .filter(Boolean)
                  .join(" · ")}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          disabled
          title="messages coming soon"
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold opacity-90 cursor-not-allowed"
          style={{ background: T.ink, color: T.cream, fontFamily: FF.sans }}
        >
          <Icon name="msg" size={15} color={T.cream} />
          message
        </button>
        <button
          type="button"
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "#fff", border: `1px solid ${T.ink15}` }}
          aria-label="schedule"
        >
          <Icon name="calendar" size={16} color={T.ink} />
        </button>
      </div>
    </div>
  );
};

// Search-result row (compact horizontal layout, used while the user is typing).
const SearchResultRow = ({ user, onAdd, status }) => {
  const name = user.username;
  const bg = colorFor(name);
  const shared = (user.shared_courses || []).slice(0, 1)[0];

  let action;
  if (status === 0) {
    action = <span className="text-xs text-ink-60 lowercase pr-2">pending</span>;
  } else if (status === 1) {
    action = <span className="text-xs text-ink-60 lowercase pr-2">friends ✓</span>;
  } else {
    action = (
      <button
        type="button"
        onClick={() => onAdd && onAdd(user.id)}
        aria-label={`add ${name}`}
        className="w-10 h-10 rounded-full bg-coral hover:bg-coral-dark flex items-center justify-center transition-colors flex-shrink-0"
      >
        <Icon name="plus" size={20} color="#fff" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 bg-white border border-ink-8 rounded-2xl p-3 hover:border-coral transition-colors">
      <Avatar
        name={(name?.slice(0, 2) || "?").toLowerCase()}
        bg={bg}
        fg={isCoral(bg) ? "#fff" : T.ink}
        size={48}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="text-lg text-ink lowercase leading-none"
            style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
          >
            {name}
          </span>
          <span className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>
            @{name}
          </span>
        </div>
        <div className="text-xs text-ink-60 mt-1 lowercase truncate" style={{ fontFamily: FF.sans }}>
          {[user.major, user.grad_year ? `class of ${user.grad_year}` : null]
            .filter(Boolean)
            .join(" · ")}
          {shared && (
            <>
              {" · "}also in <span className="font-semibold text-ink">{shared}</span>
            </>
          )}
        </div>
      </div>
      {action}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Requests card (right rail)
// ─────────────────────────────────────────────────────────────────

const RequestsCard = ({ friendRequests, respondToFriendRequest }) => {
  if (!friendRequests || friendRequests.length === 0) return null;
  return (
    <div className="bg-white border border-ink-8 rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3
            className="text-2xl lowercase leading-none"
            style={{ fontFamily: FF.serif, letterSpacing: -0.6 }}
          >
            requests
          </h3>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
            style={{
              background: T.coralLt,
              color: T.coralDk,
              fontFamily: FF.mono,
              letterSpacing: 0.8,
            }}
          >
            {friendRequests.length} new
          </span>
        </div>
        <a
          href="#all-requests"
          className="text-[11px] uppercase font-medium text-ink-60"
          style={{ fontFamily: FF.mono, letterSpacing: 1 }}
        >
          see all
        </a>
      </div>
      <div className="flex flex-col gap-3">
        {friendRequests.slice(0, 4).map((fship) => {
          const r = fship.friend_details;
          if (!r) return null;
          const shared = (r.shared_courses || [])[0];
          return (
            <div key={fship.id} className="flex items-center gap-3">
              <Avatar
                name={(r.username?.slice(0, 2) || "?").toLowerCase()}
                bg={colorFor(r.username)}
                fg={isCoral(colorFor(r.username)) ? "#fff" : T.ink}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-base lowercase leading-none"
                  style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                >
                  {r.username}
                </div>
                <div
                  className="text-[10px] text-ink-60 mt-1 lowercase truncate"
                  style={{ fontFamily: FF.mono }}
                >
                  {shared
                    ? `${shared}`
                    : [r.major, r.grad_year ? `’${String(r.grad_year).slice(-2)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => respondToFriendRequest(fship.id, "accept")}
                aria-label="accept"
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: T.coral }}
              >
                <Icon name="check" size={14} color="#fff" stroke={2.4} />
              </button>
              <button
                type="button"
                onClick={() => respondToFriendRequest(fship.id, "reject")}
                aria-label="reject"
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "#fff", border: `1px solid ${T.ink15}` }}
              >
                <Icon name="x" size={14} color={T.ink60} stroke={2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Suggested-for-u card (right rail)
// ─────────────────────────────────────────────────────────────────

const SuggestedCard = ({ suggestions, onAdd }) => (
  <div
    className="rounded-3xl p-5 relative overflow-hidden"
    style={{ background: T.ink, color: T.cream, minHeight: 220 }}
  >
    <Blob
      color={T.lilac}
      size={160}
      seed={1}
      style={{ position: "absolute", right: -55, top: -55, opacity: 0.9 }}
    />
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <MonoLabel color="rgba(248,244,237,0.65)" ls={1.2}>
          suggested for u
        </MonoLabel>
        <Star color={T.lilac} size={16} />
      </div>
      <h3
        className="text-2xl lowercase leading-tight"
        style={{ fontFamily: FF.serif, letterSpacing: -0.6 }}
      >
        ppl in ur classes →
      </h3>
      {suggestions.length === 0 ? (
        <p
          className="mt-4 text-sm lowercase"
          style={{ color: "rgba(248,244,237,0.6)", fontFamily: FF.sans }}
        >
          search by name above to find more ppl.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {suggestions.slice(0, 3).map((u) => {
            const shared = (u.shared_courses || [])[0];
            return (
              <div key={u.id} className="flex items-center gap-3">
                <Avatar
                  name={(u.username?.slice(0, 2) || "?").toLowerCase()}
                  bg={colorFor(u.username)}
                  fg={isCoral(colorFor(u.username)) ? "#fff" : T.ink}
                  size={40}
                  ring={T.ink}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-base lowercase leading-none"
                    style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                  >
                    {u.username}
                  </div>
                  <div
                    className="text-[10px] mt-1 lowercase"
                    style={{
                      color: "rgba(248,244,237,0.6)",
                      fontFamily: FF.mono,
                    }}
                  >
                    {shared ? `also in ${shared}` : u.major || ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(u.id)}
                  aria-label={`add ${u.username}`}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: T.coral }}
                >
                  <Icon name="plus" size={16} color="#fff" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────

const SearchFriend = ({
  searchfriends,
  sendFriendRequest,
  friendsList = [],
  friendRequests = [],
  respondToFriendRequest,
  currentUser,
  allClasses = [],
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [filter, setFilter] = useState("all"); // all | my_classes | year | live
  const [sortBy, setSortBy] = useState("recent"); // recent | name | live
  const [popup, setPopup] = useState(false);
  const searchInputRef = useRef(null);
  const suggestedRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim()) {
        searchfriends(query).then((data) => setResults(data || []));
      } else {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, searchfriends]);

  // Suggestions: search by the user's own major (cheap heuristic, no new endpoint).
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => {
    if (!currentUser?.major) return;
    let cancelled = false;
    searchfriends(currentUser.major).then((data) => {
      if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.major, searchfriends]);

  // Pull friend user objects out of the friendship wrappers.
  const friendUsers = useMemo(
    () => friendsList.map((f) => f.friend_details).filter(Boolean),
    [friendsList]
  );

  const liveFriends = useMemo(
    () => liveFriendsFromSchedule(allClasses, currentUser),
    [allClasses, currentUser]
  );

  const counts = useMemo(() => {
    const all = friendUsers.length;
    const myClasses = friendUsers.filter((u) => (u.shared_courses || []).length > 0).length;
    const year = currentUser?.grad_year
      ? friendUsers.filter((u) => String(u.grad_year) === String(currentUser.grad_year)).length
      : 0;
    const live = liveFriends.size;
    return { all, myClasses, year, live };
  }, [friendUsers, currentUser, liveFriends]);

  // Sort + filter the friend grid.
  const visibleFriends = useMemo(() => {
    let arr = friendUsers;
    if (filter === "my_classes") {
      arr = arr.filter((u) => (u.shared_courses || []).length > 0);
    } else if (filter === "year") {
      arr = arr.filter(
        (u) => currentUser?.grad_year && String(u.grad_year) === String(currentUser.grad_year)
      );
    } else if (filter === "live") {
      arr = arr.filter((u) => liveFriends.has(u.username));
    }
    const liveSet = liveFriends;
    const tsRecent = (u) => {
      const lastSnap = u.last_snap_at ? new Date(u.last_snap_at).getTime() : 0;
      const lastSeen = u.last_seen ? new Date(u.last_seen).getTime() : 0;
      return Math.max(lastSnap, lastSeen);
    };
    arr = [...arr];
    if (sortBy === "name") {
      arr.sort((a, b) => (a.username || "").localeCompare(b.username || ""));
    } else if (sortBy === "live") {
      arr.sort((a, b) => {
        const aL = liveSet.has(a.username) ? 1 : 0;
        const bL = liveSet.has(b.username) ? 1 : 0;
        if (aL !== bL) return bL - aL;
        return tsRecent(b) - tsRecent(a);
      });
    } else {
      arr.sort((a, b) => tsRecent(b) - tsRecent(a));
    }
    return arr;
  }, [friendUsers, filter, sortBy, currentUser, liveFriends]);

  const filteredResults = useMemo(() => {
    let arr = results;
    if (filter === "my_classes") {
      arr = arr.filter((u) => (u.shared_courses || []).length > 0);
    } else if (filter === "year") {
      arr = arr.filter(
        (u) => currentUser?.grad_year && String(u.grad_year) === String(currentUser.grad_year)
      );
    }
    return arr;
  }, [results, filter, currentUser]);

  const handleAdd = async (id) => {
    await sendFriendRequest(id);
    setPopup(true);
    setTimeout(() => {
      setPopup(false);
      window.location.reload();
    }, 1200);
  };

  const focusSearch = () => {
    suggestedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    searchInputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      {popup && (
        <div
          className="fixed top-4 right-4 px-5 py-3 rounded-full shadow-xl z-50 text-sm font-semibold"
          style={{ background: T.coral, color: "#fff" }}
        >
          friend request sent!
        </div>
      )}

      {/* ───── Header ───── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <MonoLabel>
            {counts.all} friend{counts.all === 1 ? "" : "s"} · {counts.live} in class now
          </MonoLabel>
          <h1
            className="text-5xl md:text-6xl text-ink mt-2 leading-none flex items-center gap-3"
            style={{ fontFamily: FF.serif, letterSpacing: -1.4 }}
          >
            ur ppl
            <Star color={T.coral} size={28} style={{ display: "inline-block", marginLeft: 6 }} />
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="bg-white rounded-full border border-ink-15 px-4 py-2.5 flex items-center gap-2"
            style={{ minWidth: 260 }}
          >
            <Icon name="search" size={16} color={T.ink60} />
            <input
              ref={searchInputRef}
              id="search"
              type="text"
              placeholder="search ppl, classes, majors"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none text-ink placeholder-ink-40 text-sm"
              style={{ fontFamily: FF.sans }}
            />
          </div>
          <button
            type="button"
            onClick={focusSearch}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-cream bg-ink hover:opacity-90 transition-opacity lowercase"
          >
            + find more
          </button>
        </div>
      </div>

      {/* ───── Filter row ───── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <CountPill
            value="all"
            label={`all · ${counts.all}`}
            active={filter === "all"}
            onSelect={setFilter}
          />
          <CountPill
            value="my_classes"
            label={`my classes · ${counts.myClasses}`}
            dot={T.coral}
            active={filter === "my_classes"}
            onSelect={setFilter}
          />
          <CountPill
            value="year"
            label={`my year · ${counts.year}`}
            dot={T.lilac}
            active={filter === "year"}
            onSelect={setFilter}
          />
          <CountPill
            value="live"
            label={`live · ${counts.live}`}
            dot={T.lime}
            active={filter === "live"}
            onSelect={setFilter}
          />
        </div>
        <div
          className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-ink-15"
          style={{ fontFamily: FF.sans }}
        >
          <Icon name="sort" size={14} color={T.ink60} />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-transparent outline-none text-sm lowercase pr-1"
            style={{ fontFamily: FF.sans }}
          >
            <option value="recent">recently active</option>
            <option value="live">live first</option>
            <option value="name">name</option>
          </select>
        </div>
      </div>

      {/* Search-results mode replaces the grid while query is active */}
      {query.trim() ? (
        <section>
          <MonoLabel>search results · {filteredResults.length}</MonoLabel>
          <div className="flex flex-col gap-2 mt-3">
            {filteredResults.length === 0 ? (
              <div className="bg-white border border-ink-8 rounded-2xl p-8 text-center">
                <p className="text-ink-60 text-sm lowercase">
                  no matches{filter !== "all" ? ` for this filter` : ""}.
                </p>
              </div>
            ) : (
              filteredResults.map((u) => (
                <SearchResultRow key={u.id} user={u} status={u.status} onAdd={handleAdd} />
              ))
            )}
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Left column: live strip + recently-active grid */}
          <div className="flex flex-col gap-4">
            <LiveNowStrip liveFriends={liveFriends} />

            <section id="recently-active">
              <div className="flex items-end justify-between mb-3">
                <h2
                  className="text-3xl lowercase leading-none"
                  style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}
                >
                  recently active
                </h2>
                <MonoLabel>
                  showing {visibleFriends.length} of {counts.all}
                </MonoLabel>
              </div>
              {visibleFriends.length === 0 ? (
                <div className="bg-white border border-ink-8 rounded-3xl p-8 text-center">
                  <p className="text-ink-60 text-sm lowercase">
                    {counts.all === 0
                      ? "no friends yet. search above to find some."
                      : "no friends match this filter."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visibleFriends.map((u) => (
                    <FriendCard
                      key={u.id}
                      user={u}
                      isLive={liveFriends.has(u.username)}
                      liveCourse={liveFriends.get(u.username)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right column: requests + suggested */}
          <div className="flex flex-col gap-4" ref={suggestedRef}>
            <RequestsCard
              friendRequests={friendRequests}
              respondToFriendRequest={respondToFriendRequest}
            />
            <SuggestedCard suggestions={suggestions} onAdd={handleAdd} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchFriend;
