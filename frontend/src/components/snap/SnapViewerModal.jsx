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

export default function SnapViewerModal({ courseLabel, snaps, onClose, onChanged }) {
  const ordered = useMemo(
    () => [...(snaps || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [snaps]
  );
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const touchStartX = useRef(null);

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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onKeyDown={onKey}
      tabIndex={-1}
      ref={(el) => el && el.focus()}
    >
      <div
        className="bg-white w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden"
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
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
        </div>

        {/* media */}
        <div className="bg-black aspect-[3/4] relative flex items-center justify-center overflow-hidden">
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
