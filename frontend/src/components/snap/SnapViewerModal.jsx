import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "@/utils/api";
import { T, FF, Icon, Avatar } from "@/components/shared/brand";
import ReportModal from "@/components/shared/ReportModal";

const resolveMediaUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${import.meta.env.VITE_API_URL}${url}`;
};

// Mirrors the backend MESSAGE_MAX_LEN cap. Server already enforces; we soft-
// cap at the textarea so the user gets a hint at ~1800 chars instead of a 400.
const MESSAGE_MAX_LEN = 2000;

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
  const [reportOpen, setReportOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  // Inline IG-story reply state. `replyOpen` slides the input panel up over
  // the footer; `replyText` is the buffer; `sending` blocks double-submits;
  // `sentToast` triggers the fade-in 'sent ✓' chip for ~1.4s after success.
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sentToast, setSentToast] = useState(false);
  const [sentRoomId, setSentRoomId] = useState(null);
  const touchStartX = useRef(null);
  const shellRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { setIdx(0); }, [snaps]);

  // Focus the shell once on mount so Arrow/Escape keys work. Doing this via
  // an inline ref callback re-fires on every render and steals focus from the
  // reply textarea after each keystroke.
  useEffect(() => { shellRef.current?.focus(); }, []);

  // Reset the inline reply panel when the user pages to a different snap or
  // the modal is reopened. Stops a half-typed reply from leaking across snaps.
  useEffect(() => {
    setReplyOpen(false);
    setReplyText("");
    setSentToast(false);
    setSentRoomId(null);
    setChatError(null);
  }, [idx, snaps]);

  const current = ordered[idx];
  const currentId = current ? current.id : null;
  const currentIsMine = !!(current && current.is_mine);
  const currentHasViewed = !!(current && current.has_viewed);

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

  // Reveal the inline reply input over the footer. Open-or-get the DM up
  // front so we can show a friend-gated error early and have the room id
  // ready when the user hits send.
  const openReplyPanel = async () => {
    if (!current || current.is_mine || chatLoading) return;
    setReplyOpen(true);
    setChatError(null);
    // Skip the lookup if we already resolved the DM for this snap session.
    if (sentRoomId) return;
    setChatLoading(true);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/chats/`, {
        method: "POST",
        body: JSON.stringify({ friend_id: current.uploader }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.detail === "not_friends") setChatError("can't reply — not friends");
        else if (data.detail === "blocked") setChatError("messaging blocked");
        else setChatError("couldn't open chat");
        setReplyOpen(false);
        return;
      }
      setSentRoomId(data.id);
    } catch {
      setChatError("network error");
      setReplyOpen(false);
    } finally {
      setChatLoading(false);
    }
  };

  // Send the reply: POST to /api/chats/<roomId>/messages/ with the snap's
  // id as replied_snap_id so the recipient sees a thumbnail card above the
  // bubble. On success: collapse the input, brief 'sent ✓' toast, keep the
  // viewer open. Errors surface inline.
  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || sending || !sentRoomId) return;
    setSending(true);
    setChatError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/chats/${sentRoomId}/messages/`,
        {
          method: "POST",
          body: JSON.stringify({ content: text, replied_snap_id: current.id }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.detail === "blocked") setChatError("messaging blocked");
        else if (data.detail === "restricted") setChatError("messaging restricted");
        else setChatError(data.detail || "send failed");
        setSending(false);
        return;
      }
      setReplyText("");
      setReplyOpen(false);
      setSentToast(true);
      window.setTimeout(() => setSentToast(false), 1400);
    } catch {
      setChatError("network error");
    } finally {
      setSending(false);
    }
  };

  // Escape hatch — same shape as the previous flow, kept so a user who really
  // wants the thread can still get there from the small 'view chat →' link.
  const openChatWithUploader = async () => {
    if (!current || current.is_mine) return;
    if (sentRoomId) {
      onClose();
      navigate(`/chat/${sentRoomId}`);
      return;
    }
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/chats/`, {
        method: "POST",
        body: JSON.stringify({ friend_id: current.uploader }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.detail === "not_friends") setChatError("can't chat — not friends");
        else if (data.detail === "blocked") setChatError("messaging blocked");
        else setChatError("couldn't open chat");
        setChatLoading(false);
        return;
      }
      onClose();
      navigate(`/chat/${data.id}`);
    } catch {
      setChatError("network error");
      setChatLoading(false);
    }
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

  const avatarLetter = (current.uploader_username || "?")[0].toLowerCase();
  const mediaUrl = resolveMediaUrl(current.media_url);
  const duringClass = course
    ? wasDuringClass(current.created_at, course.start_time, course.end_time)
    : false;
  const duringClassLabel = duringClass
    ? `snap from ${(course.base_course || course.course || courseLabel)?.toLowerCase()}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onKeyDown={onKey}
      tabIndex={-1}
      ref={shellRef}
    >
      {prevTile ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectPrev && onSelectPrev(); }}
          title={`@${prevTile.username}`}
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 hover:opacity-80 transition-opacity"
        >
          <Avatar
            name={prevTile.username[0].toLowerCase()}
            bg={T.coral} fg="#fff" size={52} ring={T.coral}
          />
        </button>
      ) : onAdd ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          title="Add a snap"
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 hover:opacity-80 transition-opacity"
        >
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center" style={{ background: T.coral }}>
            <ArOnYouIcon className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold leading-none"
              style={{ background: T.lime, color: T.ink, border: '2px solid rgba(0,0,0,0.85)' }}
            >+</span>
          </div>
        </button>
      ) : null}

      {nextTile && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectNext && onSelectNext(); }}
          title={`@${nextTile.username}`}
          className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 hover:opacity-80 transition-opacity"
        >
          <Avatar
            name={nextTile.username[0].toLowerCase()}
            bg={T.coral} fg="#fff" size={52} ring={T.coral}
          />
        </button>
      )}

      <div
        className="w-full flex flex-col overflow-hidden rounded-3xl relative"
        style={{
          background: T.ink, color: '#fff',
          maxWidth: "min(95vw, calc((100vh - 12rem) * 4 / 5))",
          maxHeight: "95vh",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar name={avatarLetter} bg={T.lime} fg={T.ink} size={38} ring={T.coral}/>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-white truncate" style={{ letterSpacing: -0.2 }}>
              @{current.uploader_username}
              {current.is_mine && <span className="text-xs ml-1" style={{ color: 'rgba(255,255,255,.5)' }}>(you)</span>}
            </div>
            <div className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,.6)', fontFamily: FF.mono }}>
              {courseLabel?.toLowerCase()} · {timeAgo(current.created_at)}
              {duringClassLabel && (
                <span className="ml-1" style={{ color: T.coral }}>· {duringClassLabel}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: 'rgba(255,255,255,.15)' }}
          >
            <Icon name="x" size={16} color="#fff"/>
          </button>
        </div>

        {/* media */}
        <div className="px-3">
          <div className="aspect-[4/5] rounded-2xl relative flex items-center justify-center overflow-hidden bg-black">
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full grid place-items-center disabled:opacity-30"
                  style={{ background: 'rgba(0,0,0,.5)', color: '#fff', backdropFilter: 'blur(6px)' }}
                  aria-label="Previous"
                >
                  <Icon name="chevL" size={18} color="#fff"/>
                </button>
                <button
                  onClick={() => go(1)}
                  disabled={idx === ordered.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full grid place-items-center disabled:opacity-30"
                  style={{ background: 'rgba(0,0,0,.5)', color: '#fff', backdropFilter: 'blur(6px)' }}
                  aria-label="Next"
                >
                  <Icon name="chevR" size={18} color="#fff"/>
                </button>
                <div
                  className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px]"
                  style={{ background: 'rgba(0,0,0,.55)', color: '#fff', fontFamily: FF.mono, letterSpacing: 0.5 }}
                >
                  {idx + 1} / {ordered.length}
                </div>
              </>
            )}
          </div>
        </div>

        {/* caption */}
        {current.caption && (
          <div className="px-5 py-3 text-base whitespace-pre-wrap" style={{ fontFamily: FF.serif, lineHeight: 1.25, letterSpacing: -0.2, color: '#fff' }}>
            {current.caption}
          </div>
        )}

        {/* footer */}
        <div className="px-4 py-4 flex items-center justify-between gap-2 flex-wrap">
          {current.is_mine ? (
            <button
              onClick={deleteSnap}
              disabled={deleting}
              className="px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 lowercase"
              style={{ background: 'rgba(237,106,74,.18)', color: T.coral, border: `1px solid ${T.coral}` }}
            >
              <Icon name="trash" size={12} color={T.coral}/>
              {deleting ? "deleting…" : "delete"}
            </button>
          ) : (
            <>
              <button
                onClick={openReplyPanel}
                disabled={chatLoading}
                className="px-3 py-2 rounded-full text-xs font-medium lowercase flex items-center gap-1.5 disabled:opacity-60 hover:opacity-90 transition-opacity"
                style={{ background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.16)' }}
              >
                <Icon name="msg" size={11} color="#fff" />
                {chatLoading ? "opening…" : `reply to @${current.uploader_username}`}
              </button>
              {chatError && (
                <span
                  className="text-[10px] lowercase px-2 py-1 rounded-full self-center"
                  style={{ background: 'rgba(237,106,74,.18)', color: '#fff', border: `1px solid ${T.coral}`, fontFamily: FF.mono, letterSpacing: 0.4 }}
                >
                  {chatError}
                </span>
              )}
              <button
                onClick={() => setReportOpen(true)}
                className="px-3 py-2 rounded-full text-xs font-medium lowercase flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                style={{ background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.16)' }}
              >
                <Icon name="flag" size={11} color="#fff" />
                report
              </button>
            </>
          )}
        </div>

        {/* IG-style reply panel: slides up over the footer when openReplyPanel
            is invoked. Stays inside the dark shell so it inherits backdrop
            click-to-close from outer overlay. */}
        {!current.is_mine && replyOpen && (
          <div
            className="px-4 pt-3 pb-4 border-t"
            style={{ borderColor: 'rgba(255,255,255,.1)', background: 'rgba(0,0,0,.35)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-end gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, MESSAGE_MAX_LEN))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
                  if (e.key === "Escape") setReplyOpen(false);
                }}
                placeholder={`reply to @${current.uploader_username}…`}
                autoFocus
                rows={1}
                className="flex-1 px-4 py-2.5 rounded-2xl text-sm outline-none resize-none"
                style={{
                  background: 'rgba(255,255,255,.10)', color: '#fff',
                  border: '1px solid rgba(255,255,255,.18)', fontFamily: FF.sans,
                  maxHeight: 100,
                }}
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim() || !sentRoomId}
                className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40"
                style={{ background: T.coral, color: '#fff' }}
                aria-label="send reply"
              >
                {sending ? (
                  <span style={{ fontSize: 11, fontFamily: FF.mono }}>…</span>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => { setReplyOpen(false); setChatError(null); }}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.16)' }}
                aria-label="close reply"
              >
                <Icon name="x" size={14} color="#fff" />
              </button>
            </div>
            {chatError && (
              <div className="mt-2 text-[10px] lowercase" style={{ color: T.coral, fontFamily: FF.mono, letterSpacing: 0.4 }}>
                {chatError}
              </div>
            )}
            {replyText.length > MESSAGE_MAX_LEN - 200 && (
              <div className="mt-1.5 text-[10px] lowercase text-right" style={{ color: 'rgba(255,255,255,.5)', fontFamily: FF.mono }}>
                {MESSAGE_MAX_LEN - replyText.length} chars left
              </div>
            )}
          </div>
        )}

        {/* 'sent ✓' toast after a successful reply. Auto-dismisses via the
            timeout in sendReply(). Opacity transition fades it out smoothly
            when sentToast flips back to false. */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs lowercase pointer-events-none transition-opacity duration-500"
          style={{
            background: 'rgba(0,0,0,.6)', color: '#fff',
            border: `1px solid ${T.coral}`, fontFamily: FF.mono, letterSpacing: 0.6,
            opacity: sentToast ? 1 : 0,
          }}
        >
          sent ✓
        </div>
      </div>
      {reportOpen && (
        <ReportModal
          contentType="snap"
          targetId={current.id}
          targetLabel={`@${current.uploader_username}'s snap`}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
