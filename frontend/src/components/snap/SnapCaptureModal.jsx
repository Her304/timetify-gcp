import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/utils/api";
import { T, FF, Icon, MonoLabel } from "@/components/shared/brand";

const MAX_VIDEO_MS = 5000;
const PHOTO_QUALITY = 0.85;
const TARGET_RATIO = 4 / 5;
const CAPTION_MAX_WORDS = 50;

const countWords = (s) => (s.match(/\S+/g) || []).length;
const clampWords = (s, max) => {
  const words = s.match(/\S+/g) || [];
  if (words.length <= max) return s;
  return words.slice(0, max).join(" ");
};

const pickRecorderMime = () => {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
};

const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const isLiveNow = (course) => {
  const s = toMinutes(course?.start_time);
  const e = toMinutes(course?.end_time);
  if (s == null || e == null) return false;
  const d = new Date();
  const n = d.getHours() * 60 + d.getMinutes();
  return n >= s && n <= e;
};

const extFromMime = (mime) => {
  if (!mime) return ".webm";
  if (mime.startsWith("video/mp4")) return ".mp4";
  if (mime.startsWith("video/webm")) return ".webm";
  if (mime.startsWith("image/jpeg")) return ".jpg";
  if (mime.startsWith("image/png")) return ".png";
  return ".bin";
};

const FocusBracket = ({ position }) => (
  <div
    style={{
      position: 'absolute',
      ...position,
      width: 22, height: 22,
      borderTop: '2px solid rgba(255,255,255,.6)',
      borderLeft: '2px solid rgba(255,255,255,.6)',
      transform: `rotate(${position.rot || 0}deg)`,
    }}
  />
);

export default function SnapCaptureModal({ course, friendsList, onClose, onUploaded }) {
  const [mode, setMode] = useState("photo");
  const [step, setStep] = useState("capture");
  const [stream, setStream] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState("");
  // Audience type: "all" | "selected" | "group".
  const [audienceType, setAudienceType] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [groups, setGroups] = useState([]);
  const [chatGroups, setChatGroups] = useState([]);
  // selectedGroup holds {kind: 'snap_group' | 'chat', id}; either source feeds
  // into the same audience-resolution flow on the server.
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  // Restriction state: set proactively from GET /api/restrictions/my/ on mount,
  // or reactively when POST /api/snaps/ returns 403 with the restriction payload.
  // Shape: { restriction_type, expires_at, offense_count } | null
  const [restriction, setRestriction] = useState(null);

  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const tickRef = useRef(null);
  const fileInputRef = useRef(null);

  // Library-upload fallback. Plan spec: "camera + library fallback"; especially
  // important when getUserMedia is blocked / unavailable. The file is fed into
  // the existing preview → details flow unchanged. Server still magic-byte
  // checks, mime-checks, and caps at 20MB, so a basic client-side validate is
  // enough.
  const SNAP_MIME_PHOTO = ["image/jpeg", "image/png"];
  const SNAP_MIME_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];
  const SNAP_MAX_BYTES = 20 * 1024 * 1024;

  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // reset so picking the same file twice still fires
    if (!file) return;
    if (file.size > SNAP_MAX_BYTES) {
      setErrorMsg("file too large — max 20 MB");
      return;
    }
    const mime = (file.type || "").split(";")[0].trim();
    let nextMode;
    if (SNAP_MIME_PHOTO.includes(mime)) nextMode = "photo";
    else if (SNAP_MIME_VIDEO.includes(mime)) nextMode = "video";
    else {
      setErrorMsg("unsupported file type — pick a jpg/png or mp4/mov/webm");
      return;
    }
    setErrorMsg(null);
    // Tear down the camera stream — we don't need it now that we have a blob.
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setMode(nextMode);
    setPreviewBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep("preview");
  };

  const openLibrary = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const startStream = async (nextMode) => {
    setStreamError(null);
    try {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const ms = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1080 },
          height: { ideal: 1350 },
          aspectRatio: { ideal: TARGET_RATIO },
          facingMode: { ideal: "environment" },
        },
        audio: nextMode === "video",
      });
      setStream(ms);
      if (videoRef.current) {
        videoRef.current.srcObject = ms;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setStreamError(err.message || "Could not access camera.");
    }
  };

  // Audience picker pulls from two sources: caller's saved SnapGroups and
  // their group chats. Both render together in the `group` tab; the snap-send
  // API accepts either group_id (SnapGroup) or chat_room_id (ChatRoom).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [gRes, cRes] = await Promise.all([
          authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snap-groups/`),
          authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/chats/`),
        ]);
        if (!cancelled && gRes.ok) {
          const data = await gRes.json();
          setGroups(data.groups || []);
        }
        if (!cancelled && cRes.ok) {
          const data = await cRes.json();
          setChatGroups((data.chats || []).filter((c) => c.room_type === "group"));
        }
      } catch { /* fail-soft — the picker just shows an empty state. */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Proactive restriction check — avoids spinning up the camera at all if
    // the user is already barred. We only start the stream once we've heard
    // back from the server (or it errored — fail-open).
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/restrictions/my/`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          const snapRestrictions = (data.restrictions || []).filter(
            (r) => r.restriction_type === "snap_posting" || r.restriction_type === "both",
          );
          if (snapRestrictions.length > 0) {
            setRestriction(snapRestrictions[0]);
            return;
          }
        }
      } catch {
        // Network error → fall through to start the camera anyway. The POST
        // will still 403 if there's actually a restriction.
      }
      if (!cancelled) startStream(mode);
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = async (next) => {
    if (next === mode || recording || step !== "capture") return;
    setMode(next);
    await startStream(next);
  };

  const capturePhoto = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const sw = v.videoWidth;
    const sh = v.videoHeight;
    const sourceRatio = sw / sh;
    let cropW, cropH, cropX, cropY;
    if (sourceRatio > TARGET_RATIO) {
      cropH = sh;
      cropW = sh * TARGET_RATIO;
      cropX = (sw - cropW) / 2;
      cropY = 0;
    } else {
      cropW = sw;
      cropH = sw / TARGET_RATIO;
      cropX = 0;
      cropY = (sh - cropH) / 2;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);
    canvas.getContext("2d").drawImage(v, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", PHOTO_QUALITY));
    if (!blob) return;
    setPreviewBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    setStep("preview");
  };

  const startRecording = () => {
    if (!stream) return;
    const mime = pickRecorderMime();
    let recorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      setStreamError("Recording is not supported on this browser.");
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setRecording(false);
      setStep("preview");
    };
    recorder.start();
    setRecording(true);
    setRecordingMs(0);
    const startedAt = Date.now();
    tickRef.current = setInterval(() => setRecordingMs(Date.now() - startedAt), 100);
    timerRef.current = setTimeout(() => stopRecording(), MAX_VIDEO_MS);
  };

  const stopRecording = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timerRef.current = null;
    tickRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(null);
    setPreviewUrl(null);
    setStep("capture");
  };

  const toggleFriend = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!previewBlob) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const form = new FormData();
      const ext = extFromMime(previewBlob.type);
      const filename = `snap${ext}`;
      form.append("media", previewBlob, filename);
      form.append("media_type", mode);
      form.append("course_pk", String(course.id));
      form.append("caption", caption);
      // Visibility maps 1:1 to the backend's three modes. 'group' resolves
      // server-side to the group's current member set (friend-gated).
      const visibilityValue =
        audienceType === "selected" ? "selected"
        : audienceType === "group" ? "group"
        : "all_friends";
      form.append("visibility", visibilityValue);
      if (audienceType === "selected") {
        for (const id of selectedIds) form.append("audience_user_ids", String(id));
      } else if (audienceType === "group" && selectedGroup) {
        if (selectedGroup.kind === "chat") {
          form.append("chat_room_id", String(selectedGroup.id));
        } else {
          form.append("group_id", String(selectedGroup.id));
        }
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      form.append("timezone", tz);

      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snaps/`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && data.detail === "restricted") {
          // Hand off to the banner UI; the camera section will rerender as the
          // restriction screen and the user can dismiss with the X.
          setRestriction({
            restriction_type: data.restriction_type,
            expires_at: data.expires_at,
            offense_count: data.offense_count,
          });
        } else {
          setErrorMsg(data.error || data.detail || "Upload failed.");
        }
        setSubmitting(false);
        return;
      }
      onUploaded && onUploaded(data);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Upload failed.");
      setSubmitting(false);
    }
  };

  const remainingMs = Math.max(0, MAX_VIDEO_MS - recordingMs);
  const liveNow = isLiveNow(course);
  const title = liveNow ? `snap ${course.course?.toLowerCase()}` : "snap now";
  const friendOptions = (friendsList || [])
    .map((f) => f.friend_details)
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div
        className="w-full flex flex-col overflow-hidden rounded-3xl"
        style={{
          background: T.ink, color: '#fff',
          maxWidth: "min(95vw, calc((100vh - 12rem) * 4 / 5))",
          maxHeight: "95vh",
        }}
      >
        {/* Hidden file input fed by the "upload from library" affordances —
            both the prominent button shown during streamError and the small
            secondary link below the capture row click into this one input. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,video/mp4,video/quicktime,video/webm"
          onChange={onPickFile}
          style={{ display: 'none' }}
        />
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center text-white"
            style={{ background: 'rgba(255,255,255,.12)' }}
          >
            <Icon name="x" size={14} color="#fff"/>
          </button>
          <span style={{ fontFamily: FF.serif, fontSize: 24, letterSpacing: -0.5, color: '#fff' }}>
            {title}
          </span>
          <button
            className="w-8 h-8 rounded-full grid place-items-center text-white"
            style={{ background: 'rgba(255,255,255,.12)' }}
          >
            <Icon name="bolt" size={14} color="#fff"/>
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          {restriction ? (
            <RestrictionBanner restriction={restriction} onClose={onClose} />
          ) : null}
          {!restriction && step === "capture" && (
            <div className="flex flex-col">
              <div className="relative px-3">
                <div className="aspect-[4/5] rounded-2xl relative flex items-center justify-center overflow-hidden" style={{ background: '#2a2226' }}>
                  {streamError ? (
                    <div className="text-white text-sm text-center px-6 flex flex-col items-center gap-3">
                      <p>camera blocked: {streamError}</p>
                      <p className="text-white/60 text-xs">allow camera access in browser settings, then retry — or pick a file from your library.</p>
                      <button
                        type="button"
                        onClick={openLibrary}
                        className="mt-2 px-4 py-2 rounded-full text-xs font-bold lowercase"
                        style={{ background: T.coral, color: '#fff' }}
                      >
                        upload from library
                      </button>
                    </div>
                  ) : (
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                  )}
                  {/* focus brackets */}
                  <FocusBracket position={{ top: 16, left: 16, rot: 0 }}/>
                  <FocusBracket position={{ top: 16, right: 16, rot: 90 }}/>
                  <FocusBracket position={{ bottom: 16, right: 16, rot: 180 }}/>
                  <FocusBracket position={{ bottom: 16, left: 16, rot: 270 }}/>

                  {/* course pill on viewfinder — only when class is live */}
                  {liveNow && (
                    <div
                      className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs"
                      style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(8px)' }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.coral }}/>
                      <span style={{ fontFamily: FF.mono, letterSpacing: 1, textTransform: 'uppercase' }}>
                        {course.course?.toLowerCase()} · live
                      </span>
                    </div>
                  )}

                  {recording && (
                    <div
                      className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs"
                      style={{ background: T.coral, color: '#fff', fontFamily: FF.mono, letterSpacing: 1 }}
                    >
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      REC · {(remainingMs / 1000).toFixed(1)}S
                    </div>
                  )}
                </div>
              </div>

              {/* mode chip row */}
              <div className="flex items-center justify-center gap-5 mt-5"
                   style={{ fontFamily: FF.mono, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                <button
                  onClick={() => switchMode("photo")}
                  disabled={recording}
                  style={{ color: mode === "photo" ? T.coral : 'rgba(255,255,255,.5)', fontWeight: mode === "photo" ? 600 : 400 }}
                >
                  photo
                </button>
                <button
                  onClick={() => switchMode("video")}
                  disabled={recording}
                  style={{ color: mode === "video" ? T.coral : 'rgba(255,255,255,.5)', fontWeight: mode === "video" ? 600 : 400 }}
                >
                  video
                </button>
              </div>

              {/* capture controls */}
              <div className="flex items-center justify-center py-5">
                {mode === "photo" ? (
                  <button
                    onClick={capturePhoto}
                    disabled={!stream || !!streamError}
                    className="rounded-full grid place-items-center disabled:opacity-50"
                    style={{
                      width: 78, height: 78, padding: 5,
                      background: 'transparent', border: '3px solid #fff',
                    }}
                  >
                    <div
                      className="rounded-full w-full h-full"
                      style={{ background: T.coral, boxShadow: '0 0 24px rgba(237,106,74,.5)' }}
                    />
                  </button>
                ) : recording ? (
                  <button
                    onClick={stopRecording}
                    className="rounded-full grid place-items-center"
                    style={{ width: 78, height: 78, padding: 5, background: 'transparent', border: '3px solid #fff' }}
                  >
                    <div
                      className="rounded-md w-1/2 h-1/2"
                      style={{ background: T.coral }}
                    />
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    disabled={!stream || !!streamError}
                    className="rounded-full grid place-items-center disabled:opacity-50"
                    style={{
                      width: 78, height: 78, padding: 5,
                      background: 'transparent', border: '3px solid #fff',
                    }}
                  >
                    <div
                      className="rounded-full w-full h-full"
                      style={{ background: T.coral, boxShadow: '0 0 24px rgba(237,106,74,.5)' }}
                    />
                  </button>
                )}
              </div>

              {/* Secondary library affordance — always visible (not only when
                  camera errors) so users can choose their own file even when
                  the camera is happily streaming. */}
              {!recording && (
                <div className="flex items-center justify-center pb-4">
                  <button
                    type="button"
                    onClick={openLibrary}
                    className="text-[11px] lowercase hover:opacity-90"
                    style={{
                      fontFamily: FF.mono,
                      letterSpacing: 1,
                      color: 'rgba(255,255,255,.55)',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                    }}
                  >
                    or upload from library
                  </button>
                </div>
              )}

              {errorMsg && step === "capture" && (
                <div
                  className="mx-5 mb-4 text-xs p-3 rounded-2xl lowercase"
                  style={{ background: 'rgba(237,106,74,.18)', color: '#fff', border: `1px solid ${T.coral}` }}
                >
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {!restriction && step === "preview" && previewUrl && (
            <div className="flex flex-col">
              <div className="px-3">
                <div className="aspect-[4/5] rounded-2xl flex items-center justify-center overflow-hidden bg-black">
                  {mode === "photo" ? (
                    <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <video src={previewUrl} className="w-full h-full object-cover" controls playsInline />
                  )}
                </div>
              </div>
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <button
                  onClick={retake}
                  className="px-5 py-2 rounded-full text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }}
                >
                  retake
                </button>
                <button
                  onClick={() => setStep("details")}
                  className="px-5 py-2 rounded-full text-sm font-bold"
                  style={{ background: T.coral, color: '#fff' }}
                >
                  continue →
                </button>
              </div>
            </div>
          )}

          {!restriction && step === "details" && (
            <div className="p-5 flex flex-col gap-4">
              <div>
                <MonoLabel color="rgba(255,255,255,.6)">caption</MonoLabel>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(clampWords(e.target.value, CAPTION_MAX_WORDS))}
                  rows={2}
                  placeholder="say something…"
                  className="mt-2 w-full p-3 rounded-2xl outline-none text-sm"
                  style={{
                    background: 'rgba(255,255,255,.08)', color: '#fff',
                    border: '1px solid rgba(255,255,255,.15)',
                  }}
                />
                <div className="text-[10px] text-right" style={{ color: 'rgba(255,255,255,.5)', fontFamily: FF.mono }}>
                  {countWords(caption)}/{CAPTION_MAX_WORDS} words
                </div>
              </div>

              <div>
                <MonoLabel color="rgba(255,255,255,.6)">audience</MonoLabel>
                <div className="mt-2 flex gap-2 flex-wrap">
                  <button
                    onClick={() => setAudienceType("all")}
                    className="px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{
                      background: audienceType === "all" ? T.coral : 'rgba(255,255,255,.08)',
                      color: '#fff',
                    }}
                  >
                    all friends
                  </button>
                  <button
                    onClick={() => setAudienceType("selected")}
                    className="px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{
                      background: audienceType === "selected" ? T.coral : 'rgba(255,255,255,.08)',
                      color: '#fff',
                    }}
                  >
                    selected
                  </button>
                  <button
                    onClick={() => setAudienceType("group")}
                    className="px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{
                      background: audienceType === "group" ? T.coral : 'rgba(255,255,255,.08)',
                      color: '#fff',
                    }}
                  >
                    group
                  </button>
                </div>
                {audienceType === "group" && (
                  <div
                    className="mt-2 rounded-2xl p-2 flex flex-wrap gap-1.5"
                    style={{ background: 'rgba(255,255,255,.06)' }}
                  >
                    {chatGroups.length === 0 && groups.length === 0 ? (
                      <p className="text-xs p-2" style={{ color: 'rgba(255,255,255,.55)' }}>
                        no groups yet — start a group chat from /feed or create a snap group in /profile.
                      </p>
                    ) : (
                      <>
                        {chatGroups.map((c) => {
                          const picked = selectedGroup?.kind === "chat" && selectedGroup.id === c.id;
                          return (
                            <button
                              key={`c-${c.id}`}
                              onClick={() => setSelectedGroup(
                                picked ? null : { kind: "chat", id: c.id }
                              )}
                              className="px-2.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5"
                              style={{
                                background: picked ? T.coral : 'rgba(255,255,255,.08)',
                                color: '#fff',
                                border: picked ? 'none' : '1px solid rgba(255,255,255,.15)',
                              }}
                              title="chat group"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                              </svg>
                              {c.name} · {c.member_count}
                            </button>
                          );
                        })}
                        {groups.map((g) => {
                          const picked = selectedGroup?.kind === "snap_group" && selectedGroup.id === g.id;
                          return (
                            <button
                              key={`g-${g.id}`}
                              onClick={() => setSelectedGroup(
                                picked ? null : { kind: "snap_group", id: g.id }
                              )}
                              className="px-2.5 py-1.5 rounded-full text-xs font-medium"
                              style={{
                                background: picked ? T.coral : 'rgba(255,255,255,.08)',
                                color: '#fff',
                                border: picked ? 'none' : '1px solid rgba(255,255,255,.15)',
                              }}
                            >
                              {g.name} · {g.member_count}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
                {audienceType === "selected" && (
                  <div
                    className="mt-2 max-h-40 overflow-y-auto rounded-2xl p-2 flex flex-col gap-1"
                    style={{ background: 'rgba(255,255,255,.06)' }}
                  >
                    {friendOptions.length === 0 ? (
                      <p className="text-xs p-2" style={{ color: 'rgba(255,255,255,.55)' }}>
                        no friends yet — add some to use this option.
                      </p>
                    ) : (
                      friendOptions.map((f) => (
                        <label
                          key={f.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer"
                          style={{ background: 'rgba(255,255,255,.05)' }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(f.id)}
                            onChange={() => toggleFriend(f.id)}
                            style={{ accentColor: T.coral }}
                          />
                          <span className="text-xs text-white" style={{ fontFamily: FF.mono }}>@{f.username}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {errorMsg && (
                <div
                  className="text-xs p-3 rounded-2xl"
                  style={{ background: T.coralLt + "55", color: T.coralLt, border: `1px solid ${T.coral}` }}
                >
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={retake}
                  className="px-5 py-2 rounded-full text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }}
                >
                  retake
                </button>
                <button
                  onClick={submit}
                  disabled={
                    submitting
                    || (audienceType === "selected" && selectedIds.size === 0)
                    || (audienceType === "group" && !selectedGroup)
                  }
                  className="px-5 py-2 rounded-full text-sm font-bold disabled:opacity-50"
                  style={{ background: T.coral, color: '#fff' }}
                >
                  {submitting ? "posting…" : "post →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Restriction banner used in place of the camera viewfinder when the user's
// snap-posting privileges are revoked. Same shape backend returns from
// `/api/restrictions/my/` and from 403 `/api/snaps/` responses.
const formatRestrictionExpiry = (iso) => {
  if (!iso) return "until an admin lifts it";
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `until ${date}, ${time}`;
};

const RestrictionBanner = ({ restriction, onClose }) => (
  <div className="p-6 flex flex-col items-center text-center gap-3">
    <div className="w-14 h-14 rounded-full grid place-items-center" style={{ background: 'rgba(237,106,74,.18)', border: `1px solid ${T.coral}` }}>
      <Icon name="lock" size={22} color={T.coral} />
    </div>
    <div style={{ fontFamily: FF.serif, fontSize: 22, letterSpacing: -0.4, color: '#fff' }}>
      snap posting restricted
    </div>
    <p className="text-sm max-w-xs" style={{ color: 'rgba(255,255,255,.7)' }}>
      you can't post snaps right now after a moderation action on prior content.
      this is offense #{restriction.offense_count || "?"} — restriction lifts {formatRestrictionExpiry(restriction.expires_at)}.
    </p>
    <button
      onClick={onClose}
      className="mt-2 px-5 py-2 rounded-full text-sm font-bold lowercase"
      style={{ background: T.coral, color: "#fff" }}
    >
      got it
    </button>
  </div>
);
