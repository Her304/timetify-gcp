import { useState, useMemo } from "react";
import SnapCaptureModal from "@/components/snap/SnapCaptureModal";
import SnapViewerModal from "@/components/snap/SnapViewerModal";
import { T, FF, MonoLabel, Avatar, Icon } from "@/components/shared/brand";

const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const isLiveNow = (course) => {
  const s = toMinutes(course.start_time);
  const e = toMinutes(course.end_time);
  if (s == null || e == null) return false;
  const d = new Date();
  const n = d.getHours() * 60 + d.getMinutes();
  return n >= s && n <= e;
};

const ArOnYouIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" className={className} fill="currentColor">
    <path d="M707-707q93 93 93 227t-93 227q-93 93-227 93t-227-93q-93-93-93-227t93-227q93-93 227-93t227 93Zm-57 397q70-70 70-170t-70-170q-70-70-170-70t-170 70q-70 70-70 170t70 170q70 70 170 70t170-70Zm-84-57.5q38-27.5 54-72.5H340q16 45 54 72.5t86 27.5q48 0 86-27.5Zm-214.5-164Q363-520 380-520t28.5-11.5Q420-543 420-560t-11.5-28.5Q397-600 380-600t-28.5 11.5Q340-577 340-560t11.5 28.5Zm200 0Q563-520 580-520t28.5-11.5Q620-543 620-560t-11.5-28.5Q597-600 580-600t-28.5 11.5Q540-577 540-560t11.5 28.5ZM40-720v-120q0-33 23.5-56.5T120-920h120v80H120v120H40ZM240-40H120q-33 0-56.5-23.5T40-120v-120h80v120h120v80Zm480 0v-80h120v-120h80v120q0 33-23.5 56.5T840-40H720Zm120-680v-120H720v-80h120q33 0 56.5 23.5T920-840v120h-80ZM480-480Z" />
  </svg>
);

const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" });

export const Snap = ({
  personalClasses,
  friendClasses,
  snapsByCourse = {},
  friendsList = [],
  currentUser,
  onSnapsChanged,
}) => {
  const allToday = useMemo(() => [
    ...personalClasses.map((c) => ({ ...c, owner: "Me" })),
    ...friendClasses.map((c) => ({ ...c, owner: c.friend })),
  ], [personalClasses, friendClasses]);

  const myCourses = useMemo(
    () => personalClasses.map((c) => ({ ...c, owner: "Me" })),
    [personalClasses]
  );

  // Flatten all snaps and group by uploader (one tile per friend / me)
  const tiles = useMemo(() => {
    const byUploader = new Map();
    for (const list of Object.values(snapsByCourse || {})) {
      for (const snap of list) {
        const k = snap.uploader_username;
        if (!byUploader.has(k)) {
          byUploader.set(k, { username: k, isMine: !!snap.is_mine, snaps: [] });
        }
        byUploader.get(k).snaps.push(snap);
      }
    }
    const arr = Array.from(byUploader.values());
    arr.sort((a, b) =>
      a.isMine ? -1 : b.isMine ? 1 : a.username.localeCompare(b.username)
    );
    return arr;
  }, [snapsByCourse]);

  const [captureCourse, setCaptureCourse] = useState(null);
  const [viewerTileIdx, setViewerTileIdx] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeTile = viewerTileIdx != null ? tiles[viewerTileIdx] : null;
  const prevTile = viewerTileIdx != null && viewerTileIdx > 0 ? tiles[viewerTileIdx - 1] : null;
  const nextTile =
    viewerTileIdx != null && viewerTileIdx < tiles.length - 1 ? tiles[viewerTileIdx + 1] : null;

  const handleAddClick = () => {
    if (myCourses.length === 0) return;
    if (myCourses.length === 1) {
      setCaptureCourse(myCourses[0]);
      return;
    }
    setPickerOpen(true);
  };

  return (
    <>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Today block */}
        <div className="bg-white border border-ink-8 rounded-2xl p-5 flex flex-col gap-3">
          <MonoLabel>today · class</MonoLabel>
          {allToday.length === 0 ? (
            <p className="text-ink-40 text-sm">no classes today.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {allToday.map((c, idx) => {
                const liveNow = isLiveNow(c);
                const isMe = c.owner === "Me";
                const ownerName = isMe ? (currentUser?.username || "") : (c.owner || "");
                const initial = ownerName.charAt(0).toUpperCase() || "?";
                const avatarBg = isMe ? T.coral : T.lilac;
                const avatarFg = isMe ? "#fff" : T.ink;
                return (
                  <div
                    key={`${c.owner}-${c.id || idx}`}
                    className="bg-cream rounded-xl p-3 flex items-center gap-3 border border-ink-8"
                  >
                    <Avatar name={initial.toLowerCase()} bg={avatarBg} fg={avatarFg} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-semibold text-ink leading-tight truncate lowercase">
                          {c.course}
                        </h4>
                        {liveNow && (
                          <span
                            className="text-[9px] font-semibold px-2 py-0.5 rounded-full leading-none uppercase"
                            style={{ background: T.coral, color: '#fff', fontFamily: FF.mono, letterSpacing: 1 }}
                          >
                            live
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-60 flex items-center gap-1.5 mt-1" style={{ fontFamily: FF.mono }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.coral }} />
                        {c.time}
                      </p>
                      <p className="text-[11px] text-ink-60 flex items-center gap-1.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: T.lime }} />
                        {c.location}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Snaps block */}
        <div className="bg-white border border-ink-8 rounded-2xl p-5 flex flex-col gap-3">
          <MonoLabel>snaps · {tiles.length}</MonoLabel>
          <div className="flex flex-wrap gap-4">
            {/* Add tile */}
            <button
              type="button"
              onClick={handleAddClick}
              disabled={myCourses.length === 0}
              title="Add a snap"
              className="flex flex-col items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="relative w-16 h-16 rounded-full flex items-center justify-center" style={{ background: T.coral }}>
                <ArOnYouIcon className="w-8 h-8 text-white" />
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center text-base font-bold leading-none"
                  style={{ background: T.lime, color: T.ink, border: `2px solid ${T.cream}` }}
                >
                  +
                </span>
              </div>
              <span className="text-[11px] font-medium text-ink leading-none" style={{ fontFamily: FF.mono, letterSpacing: 0.5 }}>snap now!</span>
            </button>

            {/* Uploader tiles */}
            {tiles.map((t, i) => (
              <button
                key={t.username}
                type="button"
                onClick={() => setViewerTileIdx(i)}
                title={`${t.snaps.length} snap${t.snaps.length === 1 ? "" : "s"}`}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity"
              >
                <Avatar
                  name={t.username[0].toLowerCase()}
                  bg={t.isMine ? T.coral : T.lilac}
                  fg={t.isMine ? '#fff' : T.ink}
                  size={64}
                  ring={T.coral}
                />
                <span className="text-[11px] font-medium text-ink-60 leading-none truncate max-w-[68px] lowercase">
                  {t.isMine ? "you" : t.username}
                </span>
              </button>
            ))}

            {tiles.length === 0 && (
              <p className="text-ink-40 text-sm self-center">
                no snaps yet today.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Course picker for "add" when user has more than one own course today */}
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
              <h3 className="text-2xl text-ink leading-none mt-1" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
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
                  className="bg-white hover:bg-cream border border-ink-8 hover:border-coral rounded-xl p-3 text-left flex items-center justify-between transition-colors"
                >
                  <div>
                    <div className="text-sm font-semibold text-ink lowercase">{c.course}</div>
                    <div className="text-[11px] text-ink-60 mt-0.5" style={{ fontFamily: FF.mono }}>
                      {c.time} · {c.location}
                    </div>
                  </div>
                  {isLiveNow(c) && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
                      style={{ background: T.coral, color: '#fff', fontFamily: FF.mono, letterSpacing: 1 }}
                    >
                      live
                    </span>
                  )}
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

      {activeTile && (
        <SnapViewerModal
          courseLabel={`@${activeTile.username}`}
          snaps={activeTile.snaps}
          currentUser={currentUser}
          prevTile={prevTile}
          nextTile={nextTile}
          onSelectPrev={() => setViewerTileIdx((i) => Math.max(0, (i ?? 0) - 1))}
          onSelectNext={() =>
            setViewerTileIdx((i) => Math.min(tiles.length - 1, (i ?? 0) + 1))
          }
          onAdd={() => {
            setViewerTileIdx(null);
            handleAddClick();
          }}
          onClose={() => setViewerTileIdx(null)}
          onChanged={() => {
            onSnapsChanged && onSnapsChanged();
            setViewerTileIdx(null);
          }}
        />
      )}
    </>
  );
};
