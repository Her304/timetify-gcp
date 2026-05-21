import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T, FF, MonoLabel, Avatar, Icon } from "@/components/shared/brand";
import SnapCaptureModal from "@/components/snap/SnapCaptureModal";
import SnapViewerModal from "@/components/snap/SnapViewerModal";
import GroupCreateModal from "@/components/chat/GroupCreateModal";
import { authenticatedFetch } from "@/utils/api";

const timeAgo = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const AVATAR_BG = [T.coral, T.lilac, "#f0c4a8", "#b8d8c2", T.lime];

const colorForUser = (name) => AVATAR_BG[hashStr(name) % AVATAR_BG.length];

const todayLabel = () => {
  const d = new Date();
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return `${day} · ${month} ${d.getDate()}`;
};

const minutesSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
const isLiveSnap = (iso) => minutesSince(iso) < 30;

const FilterChip = ({ value, label, dot, active, onSelect }) => (
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

const seededShuffle = (arr, seed) => {
  const a = [...arr];
  let s = Math.floor(seed * 4294967296) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const Feed = ({
  snapsByCourse = {},
  personalSchedule = [],
  allMyCourses = [],
  friendsList = [],
  currentUser,
  onSnapsChanged,
}) => {
  const [filter, setFilter] = useState("today"); // today | my_classes | friends
  const [captureCourse, setCaptureCourse] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerSnapIdx, setViewerSnapIdx] = useState(null);
  // Inbox state: DM rows keyed by other_user.id + a flat list of group rows.
  // Friends without a DM row simply have no entry in dmsByFriendId (rendered
  // with empty preview); group chats are rendered separately at the top.
  const [chatsByFriendId, setChatsByFriendId] = useState({});
  const [groupChats, setGroupChats] = useState([]);
  // Username currently waiting on a create-or-get DM round-trip — used to show a row spinner.
  const [creatingDmFor, setCreatingDmFor] = useState(null);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [groupsExpanded, setGroupsExpanded] = useState(false);
  const [dmsExpanded, setDmsExpanded] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await authenticatedFetch(
          `${import.meta.env.VITE_API_URL}/api/chats/`
        );
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const dmMap = {};
        const groups = [];
        (data.chats || []).forEach((c) => {
          if (c.room_type === "group") groups.push(c);
          else if (c.other_user) dmMap[c.other_user.id] = c;
        });
        setChatsByFriendId(dmMap);
        setGroupChats(groups);
      } catch {
        // network blip — keep last good map; next focus/mount will retry
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Create-or-get a DM with this friend and route to /chat/<id>.
  // Same handler powers inbox row clicks and no-snap avatar tile clicks.
  const openChat = async (friend) => {
    if (!friend || !friend.id) return;
    if (creatingDmFor) return;
    setCreatingDmFor(friend.username);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/chats/`,
        {
          method: "POST",
          body: JSON.stringify({ friend_id: friend.id }),
        }
      );
      if (!res.ok) {
        setCreatingDmFor(null);
        return;
      }
      const data = await res.json();
      navigate(`/chat/${data.id}`);
    } catch {
      setCreatingDmFor(null);
    }
  };

  // For the snap-add flow we want every personal course (so the + tile still
  // works on days the user has no class). `personalSchedule` is today-only, so
  // fall back to `allMyCourses` (full week) when today is empty. When both
  // sources are populated, prefer today's entries because they carry the
  // live-now context handleAddClick keys off.
  const myCourses = useMemo(() => {
    if (personalSchedule.length > 0) {
      return personalSchedule.map((c) => ({ ...c, owner: "Me" }));
    }
    // Dedupe by course id so a course that meets twice in the week shows once.
    const seen = new Set();
    const dedup = [];
    for (const c of allMyCourses) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      dedup.push({ ...c, owner: "Me" });
    }
    return dedup;
  }, [personalSchedule, allMyCourses]);

  // friendsList items are friendship rows: { id, user, friend, status, friend_details }
  // The server already filters to status=1 (accepted), so we just flatten to user objects.
  const acceptedFriends = useMemo(
    () => friendsList.map((f) => f.friend_details).filter(Boolean),
    [friendsList]
  );

  // username -> [snaps]
  const snapsByUser = useMemo(() => {
    const m = new Map();
    Object.values(snapsByCourse || {}).forEach((list) =>
      list.forEach((s) => {
        if (s.is_mine) return;
        const k = s.uploader_username;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(s);
      })
    );
    return m;
  }, [snapsByCourse]);

  // Stable seed so the random-tail order doesn't reshuffle on every render
  const [randomSeed] = useState(() => Math.random());

  // Pills now pick a SORT PRIORITY rather than filtering — every friend still shows.
  const orderedTiles = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const snappedToday = (f) =>
      f.last_snap_at && new Date(f.last_snap_at) >= startOfDay;
    const sharesClass = (f) => (f.shared_courses || []).length > 0;
    const hasSnap = (f) => snapsByUser.has(f.username);

    let primary = [];
    let rest = [];
    if (filter === "today") {
      primary = acceptedFriends.filter(snappedToday);
      rest = acceptedFriends.filter((f) => !snappedToday(f));
    } else if (filter === "my_classes") {
      primary = acceptedFriends.filter(sharesClass);
      rest = acceptedFriends.filter((f) => !sharesClass(f));
    } else {
      primary = acceptedFriends.filter(hasSnap);
      rest = acceptedFriends.filter((f) => !hasSnap(f));
    }

    primary.sort(
      (a, b) => new Date(b.last_snap_at || 0) - new Date(a.last_snap_at || 0)
    );
    const shuffledRest = seededShuffle(rest, randomSeed);

    return [...primary, ...shuffledRest].map((f) => ({
      username: f.username,
      friend: f,
      snaps: snapsByUser.get(f.username) || [],
      hasSnap: hasSnap(f),
    }));
  }, [acceptedFriends, snapsByUser, filter, randomSeed]);

  const snapTiles = useMemo(() => orderedTiles.filter((t) => t.hasSnap), [orderedTiles]);

  // Live badge: how many friends snapped in the last 30 min
  const liveCount = useMemo(
    () =>
      snapTiles.filter((t) => t.snaps.some((s) => isLiveSnap(s.created_at))).length,
    [snapTiles]
  );

  // Status under the "me" tile: which class am I expected to snap for, and have I?
  const myStatus = useMemo(() => {
    if (!personalSchedule || personalSchedule.length === 0) return null;

    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const toMins = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Pick a context class: currently happening, else next one today.
    const sorted = [...personalSchedule].sort(
      (a, b) => toMins(a.start_time) - toMins(b.start_time)
    );
    const ongoing = sorted.find(
      (c) => toMins(c.start_time) <= mins && mins < toMins(c.end_time)
    );
    const upcoming = sorted.find((c) => toMins(c.start_time) > mins);
    const ctx = ongoing || upcoming;
    if (!ctx) return null;

    // Did I snap for this class today? `snapsByCourse` is keyed by Course PK.
    const mySnapsForCtx = (snapsByCourse[ctx.id] || []).filter(
      (s) => s.is_mine && new Date(s.created_at) >= startOfDay
    );
    const latest = mySnapsForCtx.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0];

    return {
      courseCode: ctx.course || ctx.course_id,
      snappedAt: latest ? latest.created_at : null,
    };
  }, [personalSchedule, snapsByCourse]);

  const handleAddClick = () => {
    if (myCourses.length === 0) return;
    if (myCourses.length === 1) {
      setCaptureCourse(myCourses[0]);
      return;
    }
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const toMins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
    // personalSchedule is today-only; only run live/upcoming logic when we
    // actually have today's slots — otherwise the times belong to other days
    // and "live now" / "upcoming today" don't apply.
    if (personalSchedule.length > 0) {
      const liveNow = myCourses.filter(
        (c) => toMins(c.start_time) <= mins && mins < toMins(c.end_time)
      );
      if (liveNow.length === 1) {
        setCaptureCourse(liveNow[0]);
        return;
      }
      if (liveNow.length > 1) {
        setPickerOpen(true);
        return;
      }
      const upcoming = [...myCourses]
        .filter((c) => toMins(c.start_time) > mins)
        .sort((a, b) => toMins(a.start_time) - toMins(b.start_time))[0];
      if (upcoming) {
        setCaptureCourse(upcoming);
        return;
      }
    }
    // No class today (or none live / upcoming): let the user pick which course
    // the snap belongs to instead of silently tying it to the first row.
    setPickerOpen(true);
  };

  const handleTileClick = (tile) => {
    if (tile.hasSnap) {
      const idx = snapTiles.findIndex((t) => t.username === tile.username);
      if (idx >= 0) setViewerSnapIdx(idx);
    } else {
      openChat(tile.friend);
    }
  };

  // Inbox rows = orderedTiles annotated with the DM row (if any), then re-sorted
  // by the locked rule: unread → recent message → snap-havers → alphabetical.
  // "All friends always show" is preserved — empty-DM friends keep a row.
  const inboxRows = useMemo(() => {
    const rows = orderedTiles.map((t) => ({
      ...t,
      chat: t.friend?.id ? chatsByFriendId[t.friend.id] || null : null,
    }));
    rows.sort((a, b) => {
      const aUnread = (a.chat?.unread_count || 0) > 0 ? 1 : 0;
      const bUnread = (b.chat?.unread_count || 0) > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aTs = a.chat?.last_message?.created_at
        ? new Date(a.chat.last_message.created_at).getTime()
        : 0;
      const bTs = b.chat?.last_message?.created_at
        ? new Date(b.chat.last_message.created_at).getTime()
        : 0;
      if (aTs !== bTs) return bTs - aTs;
      const aSnap = a.hasSnap ? 1 : 0;
      const bSnap = b.hasSnap ? 1 : 0;
      if (aSnap !== bSnap) return bSnap - aSnap;
      return a.username.localeCompare(b.username);
    });
    return rows;
  }, [orderedTiles, chatsByFriendId]);

  const q = search.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!q) return groupChats;
    return groupChats.filter((g) => {
      if ((g.name || "").toLowerCase().includes(q)) return true;
      if ((g.last_message?.content || "").toLowerCase().includes(q)) return true;
      if (g.last_message?.sender_username?.toLowerCase().includes(q)) return true;
      if ((g.members_preview || []).some((u) => (u.username || "").toLowerCase().includes(q))) return true;
      return false;
    });
  }, [groupChats, q]);

  const filteredRows = useMemo(() => {
    if (!q) return inboxRows;
    return inboxRows.filter((t) => {
      if ((t.username || "").toLowerCase().includes(q)) return true;
      if ((t.chat?.last_message?.content || "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [inboxRows, q]);

  const GROUP_CAP = 5;
  const DM_CAP = 10;
  const visibleGroups = q || groupsExpanded ? filteredGroups : filteredGroups.slice(0, GROUP_CAP);
  const visibleRows = q || dmsExpanded ? filteredRows : filteredRows.slice(0, DM_CAP);

  const activeTile = viewerSnapIdx != null ? snapTiles[viewerSnapIdx] : null;
  const prevTile = viewerSnapIdx != null && viewerSnapIdx > 0 ? snapTiles[viewerSnapIdx - 1] : null;
  const nextTile =
    viewerSnapIdx != null && viewerSnapIdx < snapTiles.length - 1
      ? snapTiles[viewerSnapIdx + 1]
      : null;

  return (
    <>
      <div className="flex flex-col gap-6 pb-24">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-5xl md:text-6xl text-ink leading-none"
              style={{ fontFamily: FF.serif, letterSpacing: -1.4 }}
            >
              ur feed
            </h1>
          </div>
          <MonoLabel fs={13} ls={1.6}>{todayLabel()}</MonoLabel>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip value="today" label="today" dot={T.lime} active={filter === "today"} onSelect={setFilter} />
          <FilterChip value="my_classes" label="my classes" dot={T.coral} active={filter === "my_classes"} onSelect={setFilter} />
          <FilterChip value="friends" label="friends" dot={T.lilac} active={filter === "friends"} onSelect={setFilter} />
          {liveCount > 0 && (
            <span
              className="inline-flex flex-col items-center justify-center w-11 h-11 rounded-full ml-auto"
              style={{
                background: "#F6D9C1",
                color: T.coralDk,
                fontFamily: FF.mono,
                letterSpacing: 0.4,
                lineHeight: 1,
              }}
            >
              <span className="text-sm font-semibold">{liveCount}</span>
              <span className="text-[10px] opacity-70 mt-0.5">on</span>
            </span>
          )}
        </div>

        {/* Avatar row: me + friends (snap-havers first, others stable random) */}
        <div className="flex md:flex-wrap gap-5 overflow-x-auto md:overflow-visible -mx-1 px-1 pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Add tile */}
          <button
            type="button"
            onClick={handleAddClick}
            disabled={myCourses.length === 0}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="relative">
              <Avatar name="me" bg={T.coral} fg="#fff" size={56} ring={T.coral} />
              <span
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-sm font-bold leading-none"
                style={{ background: T.ink, color: "#fff", border: `2px solid ${T.cream}` }}
              >
                +
              </span>
            </div>
            {myStatus ? (
              <div className="flex flex-col items-center gap-0.5 leading-tight max-w-[88px]">
                {myStatus.snappedAt ? (
                  <>
                    <span
                      className="text-[10px] font-medium leading-none lowercase truncate max-w-full"
                      style={{ fontFamily: FF.mono, color: T.coralDk, letterSpacing: 0.3 }}
                    >
                      snapped {timeAgo(myStatus.snappedAt)}
                    </span>
                    <span
                      className="text-[10px] font-medium leading-none lowercase truncate max-w-full"
                      style={{ fontFamily: FF.mono, color: T.ink60, letterSpacing: 0.3 }}
                    >
                      for {myStatus.courseCode}
                    </span>
                  </>
                ) : (
                  <span
                    className="text-[11px] font-medium leading-none lowercase truncate max-w-full"
                    style={{ fontFamily: FF.mono, color: T.coralDk, letterSpacing: 0.4 }}
                  >
                    snap for {myStatus.courseCode}
                  </span>
                )}
              </div>
            ) : (
              <span
                className="text-[11px] font-medium text-ink-60 leading-none"
                style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}
              >
                u
              </span>
            )}
          </button>

          {orderedTiles.map((t) => (
            <button
              key={t.username}
              type="button"
              onClick={() => handleTileClick(t)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity"
            >
              <div className={t.hasSnap ? "" : "opacity-60"}>
                <Avatar
                  name={t.username.slice(0, 2).toLowerCase()}
                  bg={colorForUser(t.username)}
                  fg={colorForUser(t.username) === T.coral ? "#fff" : T.ink}
                  size={56}
                  ring={t.hasSnap ? T.coral : T.ink15}
                />
              </div>
              <span
                className="text-[11px] font-medium text-ink-60 leading-none truncate max-w-[68px] lowercase"
                style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}
              >
                {t.username}
              </span>
            </button>
          ))}
        </div>

        {/* Chat search */}
        <div
          className="flex items-center gap-2 bg-white border border-ink-8 rounded-full px-4 py-2.5"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: T.ink60, flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search groups & messages"
            className="flex-1 bg-transparent outline-none text-sm lowercase min-w-0"
            style={{ fontFamily: FF.sans, color: T.ink }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-[10px] lowercase px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{
                background: T.ink8, color: T.ink60,
                fontFamily: FF.mono, letterSpacing: 0.4,
              }}
            >
              clear
            </button>
          )}
        </div>

        {/* Group chats */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <MonoLabel fs={11}>group chats</MonoLabel>
            <button
              type="button"
              onClick={() => setGroupCreateOpen(true)}
              className="text-[10px] lowercase px-2.5 py-1 rounded-full"
              style={{
                background: T.ink, color: T.cream,
                fontFamily: FF.mono, letterSpacing: 0.4,
              }}
            >
              + new group
            </button>
          </div>
          {groupChats.length === 0 ? (
            <button
              type="button"
              onClick={() => setGroupCreateOpen(true)}
              className="bg-white border border-dashed border-ink-15 rounded-2xl px-4 py-5 text-left hover:bg-cream transition-colors"
            >
              <div className="text-sm lowercase" style={{ color: T.ink60 }}>
                start a group chat with friends →
              </div>
            </button>
          ) : visibleGroups.length === 0 ? (
            <div className="bg-white border border-ink-8 rounded-2xl p-6 text-center">
              <p className="text-ink-60 text-sm lowercase">no groups match "{search}"</p>
            </div>
          ) : (
            <div className="bg-white border border-ink-8 rounded-2xl overflow-hidden">
              {visibleGroups.map((g, i) => {
                const lm = g.last_message;
                const unread = g.unread_count || 0;
                const previewSender = lm?.sender_username
                  ? `${lm.sender_username}: `
                  : "";
                const previewBody = lm
                  ? lm.is_removed
                    ? "[message removed]"
                    : lm.content
                  : "tap to chat";
                const timeChip = lm ? timeAgo(lm.created_at) : null;
                const preview3 = (g.members_preview || []).slice(0, 3);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => navigate(`/chat/${g.id}`)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-cream transition-colors ${
                      i > 0 ? "border-t border-ink-8" : ""
                    }`}
                  >
                    {/* Avatar cluster */}
                    <div className="relative w-12 h-12 flex-shrink-0">
                      {preview3.map((u, j) => (
                        <div
                          key={u.id}
                          className="absolute"
                          style={{
                            left: j === 0 ? 0 : j === 1 ? 14 : 7,
                            top: j === 2 ? 18 : 0,
                            zIndex: 3 - j,
                          }}
                        >
                          <Avatar
                            name={u.username.slice(0, 2).toLowerCase()}
                            bg={colorForUser(u.username)}
                            fg={colorForUser(u.username) === T.coral ? "#fff" : T.ink}
                            size={28}
                            ring="#fff"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="text-base text-ink leading-tight lowercase truncate"
                          style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                        >
                          {g.name}
                        </div>
                        <span
                          className="text-[10px] uppercase px-1.5 py-0.5 rounded-full"
                          style={{
                            background: T.ink8, color: T.ink60,
                            fontFamily: FF.mono, letterSpacing: 0.5,
                          }}
                        >
                          {g.member_count}
                        </span>
                        {unread > 0 && (
                          <span
                            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none"
                            style={{
                              background: T.coral, color: "#fff",
                              fontFamily: FF.mono,
                            }}
                          >
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>
                      <div
                        className="text-xs truncate mt-0.5"
                        style={{
                          fontFamily: FF.sans,
                          fontWeight: unread > 0 ? 600 : 400,
                          color: unread > 0 ? T.ink : T.ink60,
                        }}
                      >
                        {previewSender}
                        {lm?.is_removed ? (
                          <span className="italic" style={{ color: T.ink40 }}>
                            {previewBody}
                          </span>
                        ) : (
                          previewBody
                        )}
                      </div>
                    </div>
                    {timeChip && (
                      <span
                        className="text-[10px] font-semibold uppercase whitespace-nowrap"
                        style={{
                          color: T.ink60, fontFamily: FF.mono, letterSpacing: 0.8,
                        }}
                      >
                        {timeChip}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {!q && filteredGroups.length > GROUP_CAP && (
            <button
              type="button"
              onClick={() => setGroupsExpanded((v) => !v)}
              className="self-start text-[11px] lowercase px-3 py-1 rounded-full"
              style={{
                background: T.ink8, color: T.ink,
                fontFamily: FF.mono, letterSpacing: 0.4,
              }}
            >
              {groupsExpanded
                ? "view less"
                : `view ${filteredGroups.length - GROUP_CAP} more`}
            </button>
          )}
        </div>

        {/* Chat inbox */}
        <div className="flex flex-col gap-2">
          <MonoLabel fs={11}>messages</MonoLabel>
          {inboxRows.length === 0 ? (
            <div className="bg-white border border-ink-8 rounded-2xl p-10 text-center">
              <p className="text-ink-60 text-sm lowercase">
                no friends yet. add some on the friends page.
              </p>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="bg-white border border-ink-8 rounded-2xl p-6 text-center">
              <p className="text-ink-60 text-sm lowercase">no chats match "{search}"</p>
            </div>
          ) : (
            <div className="bg-white border border-ink-8 rounded-2xl overflow-hidden">
              {visibleRows.map((t, i) => {
                const lm = t.chat?.last_message;
                const unread = t.chat?.unread_count || 0;
                const busy = creatingDmFor === t.username;
                let preview;
                if (lm) {
                  if (lm.is_removed) {
                    preview = (
                      <span className="italic" style={{ color: T.ink40 }}>
                        [message removed]
                      </span>
                    );
                  } else {
                    preview = lm.content;
                  }
                } else if (t.hasSnap) {
                  preview = `snapped ${timeAgo(t.friend.last_snap_at)}`;
                } else {
                  preview = "tap to chat";
                }
                const timeChip = lm
                  ? timeAgo(lm.created_at)
                  : t.hasSnap
                  ? "snap"
                  : null;
                return (
                  <button
                    key={t.username}
                    type="button"
                    onClick={() => openChat(t.friend)}
                    disabled={busy}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-cream transition-colors disabled:opacity-60 ${
                      i > 0 ? "border-t border-ink-8" : ""
                    }`}
                  >
                    <Avatar
                      name={t.username.slice(0, 2).toLowerCase()}
                      bg={colorForUser(t.username)}
                      fg={colorForUser(t.username) === T.coral ? "#fff" : T.ink}
                      size={44}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="text-base text-ink leading-tight lowercase truncate"
                          style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                        >
                          {t.username}
                        </div>
                        {unread > 0 && (
                          <span
                            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none"
                            style={{
                              background: T.coral,
                              color: "#fff",
                              fontFamily: FF.mono,
                            }}
                          >
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>
                      <div
                        className="text-xs text-ink-60 truncate mt-0.5"
                        style={{
                          fontFamily: FF.sans,
                          fontWeight: unread > 0 ? 600 : 400,
                          color: unread > 0 ? T.ink : T.ink60,
                        }}
                      >
                        {preview}
                      </div>
                    </div>
                    {busy ? (
                      <span
                        className="inline-block w-4 h-4 rounded-full border-2 border-ink-15 border-t-coral animate-spin"
                        aria-label="opening"
                      />
                    ) : timeChip ? (
                      <span
                        className="text-[10px] font-semibold uppercase whitespace-nowrap"
                        style={{
                          color: T.ink60,
                          fontFamily: FF.mono,
                          letterSpacing: 0.8,
                        }}
                      >
                        {timeChip}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {!q && filteredRows.length > DM_CAP && (
            <button
              type="button"
              onClick={() => setDmsExpanded((v) => !v)}
              className="self-start text-[11px] lowercase px-3 py-1 rounded-full"
              style={{
                background: T.ink8, color: T.ink,
                fontFamily: FF.mono, letterSpacing: 0.4,
              }}
            >
              {dmsExpanded
                ? "view less"
                : `view ${filteredRows.length - DM_CAP} more`}
            </button>
          )}
        </div>
      </div>

      {/* Course picker */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-cream w-full max-w-sm p-5 rounded-2xl shadow-xl border border-ink-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <MonoLabel>step 1</MonoLabel>
              <h3
                className="text-2xl text-ink leading-none mt-1"
                style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}
              >
                pick a class to snap
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {myCourses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    setCaptureCourse(c);
                  }}
                  className="bg-white hover:bg-cream border border-ink-8 hover:border-coral rounded-xl p-3 text-left transition-colors"
                >
                  <div className="text-sm font-semibold text-ink lowercase">{c.course}</div>
                  <div
                    className="text-[11px] text-ink-60 mt-0.5"
                    style={{ fontFamily: FF.mono }}
                  >
                    {personalSchedule.length === 0 && c.day ? `${c.day.toLowerCase()} · ` : ""}
                    {c.time} · {c.location}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="mt-4 w-full text-xs text-ink-60 hover:text-ink lowercase"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {captureCourse && (
        <SnapCaptureModal
          course={captureCourse}
          friendsList={friendsList}
          currentUser={currentUser}
          onClose={() => {
            setCaptureCourse(null);
            window.location.reload();
          }}
          onUploaded={() => onSnapsChanged && onSnapsChanged()}
        />
      )}

      {groupCreateOpen && (
        <GroupCreateModal
          friendsList={friendsList}
          onClose={() => setGroupCreateOpen(false)}
          onCreated={(roomId) => {
            setGroupCreateOpen(false);
            navigate(`/chat/${roomId}`);
          }}
        />
      )}

      {activeTile && (
        <SnapViewerModal
          courseLabel={`@${activeTile.username}`}
          snaps={activeTile.snaps}
          currentUser={currentUser}
          prevTile={prevTile}
          nextTile={nextTile}
          onSelectPrev={() => setViewerSnapIdx((i) => Math.max(0, (i ?? 0) - 1))}
          onSelectNext={() =>
            setViewerSnapIdx((i) => Math.min(snapTiles.length - 1, (i ?? 0) + 1))
          }
          onAdd={() => {
            setViewerSnapIdx(null);
            handleAddClick();
          }}
          onClose={() => setViewerSnapIdx(null)}
          onChanged={() => {
            onSnapsChanged && onSnapsChanged();
            setViewerSnapIdx(null);
          }}
        />
      )}

    </>
  );
};
