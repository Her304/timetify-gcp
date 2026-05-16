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

const CenterFocusIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" className={className} fill="currentColor">
    <path d="M200-120q-33 0-56.5-23.5T120-200v-160h80v160h160v80H200Zm400 0v-80h160v-160h80v160q0 33-23.5 56.5T760-120H600ZM120-600v-160q0-33 23.5-56.5T200-840h160v80H200v160h-80Zm640 0v-160H600v-80h160q33 0 56.5 23.5T840-760v160h-80ZM338.5-338.5Q280-397 280-480t58.5-141.5Q397-680 480-680t141.5 58.5Q680-563 680-480t-58.5 141.5Q563-280 480-280t-141.5-58.5ZM565-395q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm-85-85Z" />
  </svg>
);

const ArOnYouIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" className={className} fill="currentColor">
    <path d="M707-707q93 93 93 227t-93 227q-93 93-227 93t-227-93q-93-93-93-227t93-227q93-93 227-93t227 93Zm-57 397q70-70 70-170t-70-170q-70-70-170-70t-170 70q-70 70-70 170t70 170q70 70 170 70t170-70Zm-84-57.5q38-27.5 54-72.5H340q16 45 54 72.5t86 27.5q48 0 86-27.5Zm-214.5-164Q363-520 380-520t28.5-11.5Q420-543 420-560t-11.5-28.5Q397-600 380-600t-28.5 11.5Q340-577 340-560t11.5 28.5Zm200 0Q563-520 580-520t28.5-11.5Q620-543 620-560t-11.5-28.5Q597-600 580-600t-28.5 11.5Q540-577 540-560t11.5 28.5ZM40-720v-120q0-33 23.5-56.5T120-920h120v80H120v120H40ZM240-40H120q-33 0-56.5-23.5T40-120v-120h80v120h120v80Zm480 0v-80h120v-120h80v120q0 33-23.5 56.5T840-40H720Zm120-680v-120H720v-80h120q33 0 56.5 23.5T920-840v120h-80ZM480-480Z" />
  </svg>
);

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

  const uniqueOwners = useMemo(() => {
    const owners = new Set(allToday.map((c) => c.owner));
    return Array.from(owners).sort((a, b) =>
      a === "Me" ? -1 : b === "Me" ? 1 : a.localeCompare(b)
    );
  }, [allToday]);

  const [selected, setSelected] = useState("all");
  const [captureCourse, setCaptureCourse] = useState(null);
  const [viewerState, setViewerState] = useState(null);

  const visible = selected === "all"
    ? allToday
    : allToday.filter((c) => c.owner === selected);

  const snapsFor = (course) => snapsByCourse[String(course.id)] || [];

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-2xl font-extrabold text-gray-900">Snap</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 font-medium">Sort:</span>
          <div className="relative">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="appearance-none bg-[#e8e9ed] text-gray-800 text-sm font-semibold px-4 py-2 pr-8 border-none outline-none cursor-pointer"
            >
              <option value="all">All of my friend</option>
              {uniqueOwners.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      <div className="bg-[#e8e9ed] p-5 w-full">
        {visible.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-gray-400 text-sm italic">No classes today.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((course, idx) => {
              const courseSnaps = snapsFor(course);
              const hasSnaps = courseSnaps.length > 0;
              const isOwn = course.owner === "Me";
              const liveNow = isLiveNow(course);
              const canSnapNow = isOwn; // unrestricted; intended for ad-hoc captures
              const canScheduledSnap = isOwn && liveNow;

              return (
                <div key={`${course.owner}-${course.id || idx}`} className="bg-white p-3 flex items-center gap-3 shadow-sm">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                    course.owner === "Me"
                      ? "bg-[#607196] text-white"
                      : "bg-[#ffc759] text-gray-800"
                  }`}>
                    {course.owner === "Me" ? "Me" : course.owner.charAt(0).toUpperCase()}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-gray-800 leading-tight truncate">{course.course}</h4>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                      <span className="w-1 h-1 rounded-full bg-[#607196] inline-block flex-shrink-0" />
                      {course.time}
                    </p>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1 truncate">
                      <span className="w-1 h-1 rounded-full bg-[#ffc759] inline-block flex-shrink-0" />
                      {course.location}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0 items-start">
                    {isOwn && (
                      <button
                        onClick={() => setCaptureCourse(course)}
                        disabled={!canSnapNow}
                        title="Snap anytime"
                        className={`flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap transition-opacity ${
                          canSnapNow
                            ? "text-[#ffc759] hover:opacity-70 cursor-pointer"
                            : "text-gray-300 cursor-not-allowed"
                        }`}
                      >
                        <CenterFocusIcon className="w-4 h-4" />
                        snap now!
                      </button>
                    )}
                    {isOwn && (
                      <button
                        onClick={() => canScheduledSnap && setCaptureCourse(course)}
                        disabled={!canScheduledSnap}
                        title={canScheduledSnap ? "Add a snap to this class" : "Class isn't running right now"}
                        className={`flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap transition-opacity ${
                          canScheduledSnap
                            ? "text-[#607196] hover:opacity-70 cursor-pointer"
                            : "text-gray-300 cursor-not-allowed"
                        }`}
                      >
                        <CenterFocusIcon className="w-4 h-4" />
                        add snap to {course.base_course || course.course}
                      </button>
                    )}
                    {hasSnaps && (
                      <button
                        onClick={() => setViewerState({ snaps: courseSnaps, label: course.course })}
                        title="View snaps"
                        className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap text-gray-700 hover:opacity-70 cursor-pointer transition-opacity"
                      >
                        <ArOnYouIcon className="w-4 h-4" />
                        view snap
                        <span className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 text-[9px] font-bold bg-[#ffc759] text-gray-900 rounded-full">
                          {courseSnaps.length}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
