import { useState, useMemo } from "react";
import SnapCaptureModal from "@/components/snap/SnapCaptureModal";
import SnapViewerModal from "@/components/snap/SnapViewerModal";

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
  const [viewerState, setViewerState] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-2xl font-extrabold text-gray-900">Snap</h2>
        <span
          className="text-sm text-gray-600 font-semibold"
          style={{ fontFamily: "'DM Serif Text', serif" }}
        >
          {todayLabel()}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Today block */}
        <div className="bg-[#e8e9ed] p-4 flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Today
          </h3>
          {allToday.length === 0 ? (
            <p className="text-gray-400 text-sm italic">No classes today.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {allToday.map((c, idx) => {
                const liveNow = isLiveNow(c);
                return (
                  <div
                    key={`${c.owner}-${c.id || idx}`}
                    className="bg-white p-3 flex items-center gap-3 shadow-sm border border-[#d4d6dd]"
                  >
                    <div
                      className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                        c.owner === "Me"
                          ? "bg-[#607196] text-white"
                          : "bg-[#ffc759] text-gray-800"
                      }`}
                    >
                      {c.owner === "Me" ? "Me" : c.owner.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">
                          {c.course}
                        </h4>
                        {liveNow && (
                          <span className="text-[9px] font-bold bg-[#ffc759] text-gray-900 px-1.5 py-0.5 leading-none">
                            LIVE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <span className="w-1 h-1 rounded-full bg-[#607196] inline-block flex-shrink-0" />
                        {c.time}
                      </p>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
                        <span className="w-1 h-1 rounded-full bg-[#ffc759] inline-block flex-shrink-0" />
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
        <div className="bg-[#e8e9ed] p-4 flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Snaps
          </h3>
          <div className="flex flex-wrap gap-4">
            {/* Add tile */}
            <button
              type="button"
              onClick={handleAddClick}
              disabled={myCourses.length === 0}
              title="Add a snap"
              className="flex flex-col items-center gap-1 flex-shrink-0 hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="relative w-16 h-16 rounded-full bg-[#607196] flex items-center justify-center text-white font-bold">
                <ArOnYouIcon className="w-8 h-8 text-white" />
                <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#ffc759] text-gray-900 flex items-center justify-center text-base font-bold border-2 border-white leading-none">
                  +
                </span>
              </div>
              <span className="text-xs font-semibold text-gray-700 leading-none">add</span>
            </button>

            {/* Uploader tiles */}
            {tiles.map((t) => (
              <button
                key={t.username}
                type="button"
                onClick={() =>
                  setViewerState({ snaps: t.snaps, label: `@${t.username}` })
                }
                title={`${t.snaps.length} snap${t.snaps.length === 1 ? "" : "s"}`}
                className="flex flex-col items-center gap-1 flex-shrink-0 hover:opacity-70 transition-opacity"
              >
                <div
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold ${
                    t.isMine
                      ? "bg-[#607196] text-white ring-2 ring-[#ffc759]"
                      : "bg-[#ffc759] text-gray-800"
                  }`}
                >
                  {t.username[0].toUpperCase()}
                  {t.snaps.length > 1 && (
                    <span className="absolute -bottom-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white leading-none">
                      {t.snaps.length}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-gray-700 leading-none truncate max-w-[68px]">
                  {t.isMine ? "you" : t.username}
                </span>
              </button>
            ))}

            {tiles.length === 0 && (
              <p className="text-gray-400 text-sm italic self-center">
                No snaps yet today.
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
            className="bg-white w-full max-w-sm p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-900 mb-3">Pick a class to snap</h3>
            <div className="flex flex-col gap-1">
              {myCourses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    setCaptureCourse(c);
                  }}
                  className="bg-[#e8e9ed] hover:bg-[#d4d6dd] p-3 text-left flex items-center justify-between transition-colors"
                >
                  <div>
                    <div className="text-sm font-bold text-gray-900">{c.course}</div>
                    <div className="text-[11px] text-gray-500">
                      {c.time} · {c.location}
                    </div>
                  </div>
                  {isLiveNow(c) && (
                    <span className="text-[10px] font-bold bg-[#ffc759] text-gray-900 px-2 py-0.5">
                      LIVE
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {captureCourse && (
        <SnapCaptureModal
          course={captureCourse}
          friendsList={friendsList}
          currentUser={currentUser}
          onClose={() => setCaptureCourse(null)}
          onUploaded={() => onSnapsChanged && onSnapsChanged()}
        />
      )}

      {viewerState && (
        <SnapViewerModal
          courseLabel={viewerState.label}
          course={viewerState.course}
          snaps={viewerState.snaps}
          currentUser={currentUser}
          onClose={() => setViewerState(null)}
          onChanged={() => {
            onSnapsChanged && onSnapsChanged();
            setViewerState(null);
          }}
        />
      )}
    </>
  );
};
