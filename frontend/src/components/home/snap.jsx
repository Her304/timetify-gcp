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

const groupSnapsByUploader = (snaps) => {
  const m = new Map();
  for (const s of snaps) {
    const k = s.uploader_username;
    if (!m.has(k)) m.set(k, { username: k, isMine: !!s.is_mine, snaps: [] });
    m.get(k).snaps.push(s);
  }
  const arr = Array.from(m.values());
  arr.sort((a, b) =>
    a.isMine ? -1 : b.isMine ? 1 : a.username.localeCompare(b.username)
  );
  return arr;
};

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

  const [captureCourse, setCaptureCourse] = useState(null);
  const [viewerState, setViewerState] = useState(null);

  const snapsFor = (course) => snapsByCourse[String(course.id)] || [];

  return (
    <>
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h2 className="text-2xl font-extrabold text-gray-900">Snap</h2>
        <span
          className="text-sm text-gray-600 font-semibold"
          style={{ fontFamily: "'DM Serif Text', serif" }}
        >
          {todayLabel()}
        </span>
      </div>

      {allToday.length === 0 ? (
        <div className="bg-[#e8e9ed] p-5 w-full text-center">
          <p className="text-gray-400 text-sm italic">No classes today.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {allToday.map((course, idx) => {
            const courseSnaps = snapsFor(course);
            const uploaders = groupSnapsByUploader(courseSnaps);
            const isOwn = course.owner === "Me";
            const liveNow = isLiveNow(course);

            return (
              <div
                key={`${course.owner}-${course.id || idx}`}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                {/* Left panel: class info */}
                <div className="bg-[#e8e9ed] p-3">
                  <div className="bg-white p-3 flex items-center gap-3 shadow-sm border border-[#d4d6dd]">
                    <div
                      className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                        isOwn
                          ? "bg-[#607196] text-white"
                          : "bg-[#ffc759] text-gray-800"
                      }`}
                    >
                      {isOwn ? "Me" : course.owner.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-gray-900 leading-tight truncate">
                          {course.course}
                        </h4>
                        {liveNow && (
                          <span className="text-[9px] font-bold bg-[#ffc759] text-gray-900 px-1.5 py-0.5 leading-none">
                            LIVE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <span className="w-1 h-1 rounded-full bg-[#607196] inline-block flex-shrink-0" />
                        {course.time}
                      </p>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
                        <span className="w-1 h-1 rounded-full bg-[#ffc759] inline-block flex-shrink-0" />
                        {course.location}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right panel: snaps */}
                <div className="bg-[#e8e9ed] p-3 flex flex-col gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    snaps
                  </h3>
                  <div className="flex items-center gap-3 overflow-x-auto pb-1">
                    {/* Add tile (own courses only) */}
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => setCaptureCourse(course)}
                        title={liveNow ? `Snap ${course.base_course || course.course}` : "Snap Now!"}
                        className="flex flex-col items-center gap-1 flex-shrink-0 hover:opacity-70 transition-opacity"
                      >
                        <div className="relative w-12 h-12 rounded-full bg-[#607196] flex items-center justify-center text-white text-xs font-bold">
                          <ArOnYouIcon className="w-6 h-6 text-white" />
                          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#ffc759] text-gray-900 flex items-center justify-center text-sm font-bold border-2 border-white leading-none">
                            +
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-gray-700 leading-none">
                          {liveNow ? course.base_course || course.course : "add"}
                        </span>
                      </button>
                    )}

                    {/* Uploader tiles */}
                    {uploaders.map((u) => (
                      <button
                        key={u.username}
                        type="button"
                        onClick={() =>
                          setViewerState({
                            snaps: u.snaps,
                            label: course.course,
                            course,
                          })
                        }
                        title={`${u.snaps.length} snap${u.snaps.length === 1 ? "" : "s"}`}
                        className="flex flex-col items-center gap-1 flex-shrink-0 hover:opacity-70 transition-opacity"
                      >
                        <div
                          className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xs font-bold ${
                            u.isMine
                              ? "bg-[#607196] text-white ring-2 ring-[#ffc759]"
                              : "bg-[#ffc759] text-gray-800"
                          }`}
                        >
                          {u.username[0].toUpperCase()}
                          {u.snaps.length > 1 && (
                            <span className="absolute -bottom-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white leading-none">
                              {u.snaps.length}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-gray-700 leading-none truncate max-w-[56px]">
                          {u.isMine ? "you" : u.username}
                        </span>
                      </button>
                    ))}

                    {/* Empty placeholder for friend's classes with no snaps */}
                    {!isOwn && uploaders.length === 0 && (
                      <span className="text-[11px] text-gray-400 italic px-1">no snaps</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
