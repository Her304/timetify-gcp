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
import PeopleSearch from "./PeopleSearch";
import QrModal from "./QrModal";
import RequestsBanner from "./RequestsBanner";
import GroupChatList from "./GroupChatList";
import DmInboxList from "./DmInboxList";
import CoursePickerModal from "./CoursePickerModal";
import { useChats } from "./hooks/useChats";
import { useOrderedTiles } from "./hooks/useOrderedTiles";
import { useMyStatus } from "./hooks/useMyStatus";
import { useFriendsAvailability } from "./hooks/useFriendsAvailability";

export const Feed = ({
  snapsByCourse = {},
  personalSchedule = [],
  allMyCourses = [],
  friendsList = [],
  friendRequests = [],
  searchfriends,
  sendFriendRequest,
  respondToFriendRequest,
  currentUser,
  onSnapsChanged,
}) => {
  const [filter, setFilter] = useState("today"); // today | my_classes | friends
  const [captureCourse, setCaptureCourse] = useState(null);
  // Friend a snap is being targeted at (null = normal all-friends/audience flow).
  const [snapTargetFriend, setSnapTargetFriend] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerSnapIdx, setViewerSnapIdx] = useState(null);
  const [creatingDmFor, setCreatingDmFor] = useState(null);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [groupsExpanded, setGroupsExpanded] = useState(false);
  const [dmsExpanded, setDmsExpanded] = useState(false);
  const [connectToast, setConnectToast] = useState(false);
  // null | "show" | "scan" — drives the QR sheet next to the search bar.
  const [qrMode, setQrMode] = useState(null);
  // Mobile-only: "messages" | "groups" — which inbox section is visible.
  // Desktop ignores this and shows both stacked.
  const [chatTab, setChatTab] = useState("messages");

  const navigate = useNavigate();

  const { chatsByFriendId, groupChats } = useChats();
  const { statusByUsername } = useFriendsAvailability();

  // Create-or-get a DM with this friend and route to /chat/<id>.
  // Same handler powers inbox row clicks, no-snap avatar tile clicks, and the
  // search "chat" action.
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

  // Connect = send a friend request from the people-search "new people" list.
  const handleConnect = async (id) => {
    if (!id) return;
    await sendFriendRequest(id);
    setConnectToast(true);
    setTimeout(() => {
      setConnectToast(false);
      window.location.reload();
    }, 1200);
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

  // Course resolution shared by the "+" snap button and the friend-targeted
  // snap action: pick a single obvious course, else open the picker.
  const resolveSnapCourse = () => {
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

  const handleAddClick = () => {
    setSnapTargetFriend(null);
    resolveSnapCourse();
  };

  // Snap aimed at one friend (from the people-search). Pre-targets the audience,
  // then runs the same course resolution as the "+" flow.
  const handleSnapTo = (friend) => {
    if (!friend?.id || myCourses.length === 0) return;
    setSnapTargetFriend(friend);
    resolveSnapCourse();
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
  // by the locked rule: unread → free now → last active. "All friends always
  // show" is preserved — empty-DM friends keep a row.
  const inboxRows = useMemo(() => {
    const lastActiveTs = (row) => {
      const msgTs = row.chat?.last_message?.created_at
        ? new Date(row.chat.last_message.created_at).getTime()
        : 0;
      const snapTs = row.friend?.last_snap_at
        ? new Date(row.friend.last_snap_at).getTime()
        : 0;
      const seenTs = row.friend?.last_seen
        ? new Date(row.friend.last_seen).getTime()
        : 0;
      return Math.max(msgTs, snapTs, seenTs);
    };
    const rows = orderedTiles.map((t) => ({
      ...t,
      chat: t.friend?.id ? chatsByFriendId[t.friend.id] || null : null,
    }));
    rows.sort((a, b) => {
      const aUnread = (a.chat?.unread_count || 0) > 0 ? 1 : 0;
      const bUnread = (b.chat?.unread_count || 0) > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aFree = statusByUsername.get(a.username) === "free" ? 1 : 0;
      const bFree = statusByUsername.get(b.username) === "free" ? 1 : 0;
      if (aFree !== bFree) return bFree - aFree;
      return lastActiveTs(b) - lastActiveTs(a);
    });
    return rows;
  }, [orderedTiles, chatsByFriendId, statusByUsername]);

  const searching = search.trim().length > 0;

  const activeTile = viewerSnapIdx != null ? snapTiles[viewerSnapIdx] : null;
  const prevTile = viewerSnapIdx != null && viewerSnapIdx > 0 ? snapTiles[viewerSnapIdx - 1] : null;
  const nextTile =
    viewerSnapIdx != null && viewerSnapIdx < snapTiles.length - 1
      ? snapTiles[viewerSnapIdx + 1]
      : null;

  return (
    <>
      {connectToast && (
        <div
          className="fixed top-4 right-4 px-5 py-3 rounded-full shadow-xl z-50 text-sm font-semibold"
          style={{ background: T.coral, color: "#fff" }}
        >
          friend request sent!
        </div>
      )}

      <div className="flex flex-col gap-6 pb-24">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-5xl md:text-6xl text-ink leading-none"
              style={{ fontFamily: FF.serif, letterSpacing: -1.4 }}
            >
              your feed
            </h1>
          </div>
          <MonoLabel fs={13} ls={1.6}>{todayLabel()}</MonoLabel>
        </div>

        <PeopleSearch
          value={search}
          onChange={setSearch}
          searchfriends={searchfriends}
          acceptedFriends={acceptedFriends}
          onChat={openChat}
          onSnap={handleSnapTo}
          onConnect={handleConnect}
          creatingDmFor={creatingDmFor}
          onShowQr={() => setQrMode("show")}
          onScanQr={() => setQrMode("scan")}
        />

        {!searching && (
          <>
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

            <RequestsBanner
              friendRequests={friendRequests}
              onRespond={respondToFriendRequest}
            />

            <div className="border-t border-ink-15" />

            <div className="flex items-center gap-2 md:hidden">
              <FilterChip
                value="messages"
                label="messages"
                active={chatTab === "messages"}
                onSelect={setChatTab}
              />
              <FilterChip
                value="groups"
                label="group chat"
                active={chatTab === "groups"}
                onSelect={setChatTab}
              />
            </div>

            <div className={`${chatTab === "groups" ? "block" : "hidden"} md:block`}>
              <GroupChatList
                groupChats={groupChats}
                filteredGroups={groupChats}
                search=""
                expanded={groupsExpanded}
                onToggleExpanded={() => setGroupsExpanded((v) => !v)}
                onOpenChat={(id) => navigate(`/chat/${id}`)}
                onOpenCreate={() => setGroupCreateOpen(true)}
              />
            </div>

            <div className={`${chatTab === "messages" ? "block" : "hidden"} md:block`}>
              <DmInboxList
                inboxRows={inboxRows}
                filteredRows={inboxRows}
                search=""
                expanded={dmsExpanded}
                onToggleExpanded={() => setDmsExpanded((v) => !v)}
                onOpenChat={openChat}
                creatingDmFor={creatingDmFor}
              />
            </div>
          </>
        )}
      </div>

      {pickerOpen && (
        <CoursePickerModal
          myCourses={myCourses}
          personalSchedule={personalSchedule}
          onPick={(c) => {
            setPickerOpen(false);
            setCaptureCourse(c);
          }}
          onClose={() => {
            setPickerOpen(false);
            setSnapTargetFriend(null);
          }}
        />
      )}

      {captureCourse && (
        <SnapCaptureModal
          course={captureCourse}
          friendsList={friendsList}
          currentUser={currentUser}
          presetAudience={snapTargetFriend ? { friend: snapTargetFriend } : null}
          // No reload here — see snap.jsx: it would abort the onUploaded
          // feed refetch that fires immediately before this.
          onClose={() => {
            setCaptureCourse(null);
            setSnapTargetFriend(null);
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

      {qrMode && (
        <QrModal
          mode={qrMode}
          currentUser={currentUser}
          onClose={() => setQrMode(null)}
          onFriendAdded={() => window.location.reload()}
          sendFriendRequest={sendFriendRequest}
        />
      )}
    </>
  );
};
