import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T, FF, MonoLabel } from "@/components/shared/brand";
import SnapCaptureModal from "@/components/snap/SnapCaptureModal";
import SnapViewerModal from "@/components/snap/SnapViewerModal";
import GroupCreateModal from "@/components/chat/GroupCreateModal";
import { authenticatedFetch } from "@/utils/api";

import { isLiveSnap, todayLabel, toMins } from "./utils";
import FilterChip from "./FilterChip";
import AvatarRow from "./AvatarRow";
import ChatSearch from "./ChatSearch";
import GroupChatList from "./GroupChatList";
import DmInboxList from "./DmInboxList";
import CoursePickerModal from "./CoursePickerModal";
import { useChats } from "./hooks/useChats";
import { useOrderedTiles } from "./hooks/useOrderedTiles";
import { useMyStatus } from "./hooks/useMyStatus";

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
  const [creatingDmFor, setCreatingDmFor] = useState(null);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [groupsExpanded, setGroupsExpanded] = useState(false);
  const [dmsExpanded, setDmsExpanded] = useState(false);

  const navigate = useNavigate();

  const { chatsByFriendId, groupChats } = useChats();

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

  const orderedTiles = useOrderedTiles({ acceptedFriends, snapsByUser, filter });
  const myStatus = useMyStatus({ personalSchedule, snapsByCourse });

  const snapTiles = useMemo(() => orderedTiles.filter((t) => t.hasSnap), [orderedTiles]);

  const liveCount = useMemo(
    () =>
      snapTiles.filter((t) => t.snaps.some((s) => isLiveSnap(s.created_at))).length,
    [snapTiles]
  );

  const handleAddClick = () => {
    if (myCourses.length === 0) return;
    if (myCourses.length === 1) {
      setCaptureCourse(myCourses[0]);
      return;
    }
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
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

  const activeTile = viewerSnapIdx != null ? snapTiles[viewerSnapIdx] : null;
  const prevTile = viewerSnapIdx != null && viewerSnapIdx > 0 ? snapTiles[viewerSnapIdx - 1] : null;
  const nextTile =
    viewerSnapIdx != null && viewerSnapIdx < snapTiles.length - 1
      ? snapTiles[viewerSnapIdx + 1]
      : null;

  return (
    <>
      <div className="flex flex-col gap-6 pb-24">
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
      

        <AvatarRow
          orderedTiles={orderedTiles}
          currentUser={currentUser}
          myStatus={myStatus}
          addDisabled={myCourses.length === 0}
          onAddClick={handleAddClick}
          onTileClick={handleTileClick}
        />

        <ChatSearch value={search} onChange={setSearch} />

        <GroupChatList
          groupChats={groupChats}
          filteredGroups={filteredGroups}
          search={search}
          expanded={groupsExpanded}
          onToggleExpanded={() => setGroupsExpanded((v) => !v)}
          onOpenChat={(id) => navigate(`/chat/${id}`)}
          onOpenCreate={() => setGroupCreateOpen(true)}
        />

        <DmInboxList
          inboxRows={inboxRows}
          filteredRows={filteredRows}
          search={search}
          expanded={dmsExpanded}
          onToggleExpanded={() => setDmsExpanded((v) => !v)}
          onOpenChat={openChat}
          creatingDmFor={creatingDmFor}
        />
      </div>

      {pickerOpen && (
        <CoursePickerModal
          myCourses={myCourses}
          personalSchedule={personalSchedule}
          onPick={(c) => {
            setPickerOpen(false);
            setCaptureCourse(c);
          }}
          onClose={() => setPickerOpen(false)}
        />
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
