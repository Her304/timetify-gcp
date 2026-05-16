import { useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "@/utils/api";

const resolveMediaUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${import.meta.env.VITE_API_URL}${url}`;
};

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

const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const wasDuringClass = (createdAtIso, startTime, endTime) => {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (s == null || e == null || !createdAtIso) return false;
  const d = new Date(createdAtIso);
  const n = d.getHours() * 60 + d.getMinutes();
  return n >= s && n <= e;
};

const ArOnYouIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" className={className} fill="currentColor">
    <path d="M707-707q93 93 93 227t-93 227q-93 93-227 93t-227-93q-93-93-93-227t93-227q93-93 227-93t227 93Zm-57 397q70-70 70-170t-70-170q-70-70-170-70t-170 70q-70 70-70 170t70 170q70 70 170 70t170-70Zm-84-57.5q38-27.5 54-72.5H340q16 45 54 72.5t86 27.5q48 0 86-27.5Zm-214.5-164Q363-520 380-520t28.5-11.5Q420-543 420-560t-11.5-28.5Q397-600 380-600t-28.5 11.5Q340-577 340-560t11.5 28.5Zm200 0Q563-520 580-520t28.5-11.5Q620-543 620-560t-11.5-28.5Q597-600 580-600t-28.5 11.5Q540-577 540-560t11.5 28.5ZM40-720v-120q0-33 23.5-56.5T120-920h120v80H120v120H40ZM240-40H120q-33 0-56.5-23.5T40-120v-120h80v120h120v80Zm480 0v-80h120v-120h80v120q0 33-23.5 56.5T840-40H720Zm120-680v-120H720v-80h120q33 0 56.5 23.5T920-840v120h-80ZM480-480Z" />
  </svg>
);

export default function SnapViewerModal({
  courseLabel,
  course,
  snaps,
  onClose,
  onChanged,
  prevTile,
  nextTile,
  onSelectPrev,
  onSelectNext,
  onAdd,
}) {
  const ordered = useMemo(
    () => [...(snaps || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [snaps]
  );
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const touchStartX = useRef(null);

  useEffect(() => {
    setIdx(0);
  }, [snaps]);

  const current = ordered[idx];
  const currentId = current ? current.id : null;
  const currentIsMine = !!(current && current.is_mine);
  const currentHasViewed = !!(current && current.has_viewed);

  // Mark as viewed each time the current snap changes (skip self-uploads).
  useEffect(() => {
    if (currentId == null) return;
    if (currentIsMine) return;
    if (currentHasViewed) return;
    authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snaps/${currentId}/view/`, {
      method: "POST",
    }).catch(() => {});
  }, [currentId, currentIsMine, currentHasViewed]);

  if (!current) return null;

  const go = (delta) => {
    setIdx((i) => Math.min(ordered.length - 1, Math.max(0, i + delta)));
  };

  const onKey = (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
    if (e.key === "Escape") onClose();
  };

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  const deleteSnap = async () => {
    if (!current.is_mine) return;
    if (!window.confirm("Delete this snap?")) return;
    setDeleting(true);
    const res = await authenticatedFetch(
      `${import.meta.env.VITE_API_URL}/api/snaps/${current.id}/`,
      { method: "DELETE" }
    );
    setDeleting(false);
    if (res.ok) {
      onChanged && onChanged();
      if (ordered.length <= 1) onClose();
      else setIdx((i) => Math.max(0, i - 1));
    }
  };

  const avatarLetter = (current.uploader_username || "?")[0].toUpperCase();
  const mediaUrl = resolveMediaUrl(current.media_url);
  const duringClass = course
    ? wasDuringClass(current.created_at, course.start_time, course.end_time)
    : false;
  const duringClassLabel = duringClass
    ? `snap from ${course.base_course || course.course || courseLabel}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onKeyDown={onKey}
      tabIndex={-1}
      ref={(el) => el && el.focus()}
    >
      {prevTile ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectPrev && onSelectPrev(); }}
          title={`@${prevTile.username}`}
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#607196] text-white flex items-center justify-center text-base sm:text-lg font-bold ring-2 ring-[#ffc759] ring-offset-2 ring-offset-black/80 hover:opacity-80 transition-opacity"
        >
          {prevTile.username[0].toUpperCase()}
        </button>
      ) : onAdd ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          title="Add a snap"
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#607196] text-white flex items-center justify-center hover:opacity-80 transition-opacity"
        >
          <ArOnYouIcon className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#ffc759] text-gray-900 flex items-center justify-center text-xs font-bold border-2 border-black/80 leading-none">+</span>
        </button>
      ) : null}

      {nextTile && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectNext && onSelectNext(); }}
          title={`@${nextTile.username}`}
          className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#607196] text-white flex items-center justify-center text-base sm:text-lg font-bold ring-2 ring-[#ffc759] ring-offset-2 ring-offset-black/80 hover:opacity-80 transition-opacity"
        >
          {nextTile.username[0].toUpperCase()}
        </button>
      )}

      <div
        className="bg-white w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: "min(95vw, calc((100vh - 14rem) * 4 / 5))",
          maxHeight: "95vh",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e8e9ed]">
          <div className="w-8 h-8 rounded-full bg-[#607196] flex items-center justify-center text-white text-xs font-bold">
            {avatarLetter}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-900 truncate">
              @{current.uploader_username}
              {current.is_mine && <span className="text-[10px] text-gray-400 ml-1">(you)</span>}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {courseLabel} · {timeAgo(current.created_at)}
              {duringClassLabel && (
                <span className="ml-1 text-[#607196] font-semibold">· {duringClassLabel}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
        </div>

        {/* media */}
        <div className="bg-black aspect-[4/5] relative flex items-center justify-center overflow-hidden">
          {current.media_type === "photo" ? (
            <img src={mediaUrl} alt="snap" className="w-full h-full object-contain" />
          ) : (
            <video src={mediaUrl} className="w-full h-full object-contain" controls autoPlay playsInline />
          )}

          {ordered.length > 1 && (
            <>
              <button
                onClick={() => go(-1)}
                disabled={idx === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 text-gray-900 w-8 h-8 disabled:opacity-30"
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                onClick={() => go(1)}
                disabled={idx === ordered.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 text-gray-900 w-8 h-8 disabled:opacity-30"
                aria-label="Next"
              >
                ›
              </button>
              <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5">
                {idx + 1} / {ordered.length}
              </div>
            </>
          )}
        </div>

        {/* caption */}
        {current.caption && (
          <div className="px-4 py-3 border-b border-[#e8e9ed] text-sm text-gray-800 whitespace-pre-wrap">
            {current.caption}
          </div>
        )}

        {/* footer */}
        <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          {current.is_mine ? (
            <button
              onClick={deleteSnap}
              disabled={deleting}
              className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : (
            <>
              <button
                disabled
                title="Coming soon"
                className="px-3 py-1.5 bg-[#e8e9ed] text-gray-500 text-xs font-semibold cursor-not-allowed"
              >
                💬 Chat with @{current.uploader_username}
              </button>
              <button
                disabled
                title="Coming soon"
                className="px-3 py-1.5 bg-[#e8e9ed] text-gray-500 text-xs font-semibold cursor-not-allowed"
              >
                🚩 Report
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
