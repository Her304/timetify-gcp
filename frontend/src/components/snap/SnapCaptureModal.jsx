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
  const [audienceType, setAudienceType] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const tickRef = useRef(null);

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

  useEffect(() => {
    startStream(mode);
    return () => {
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
      form.append("visibility", audienceType === "selected" ? "selected" : "all_friends");
      if (audienceType === "selected") {
        for (const id of selectedIds) form.append("audience_user_ids", String(id));
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      form.append("timezone", tz);

      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snaps/`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || "Upload failed.");
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
          {step === "capture" && (
            <div className="flex flex-col">
              <div className="relative px-3">
                <div className="aspect-[4/5] rounded-2xl relative flex items-center justify-center overflow-hidden" style={{ background: '#2a2226' }}>
                  {streamError ? (
                    <div className="text-white text-sm text-center px-6">
                      <p>camera blocked: {streamError}</p>
                      <p className="text-white/60 text-xs mt-2">allow camera access in browser settings, then retry.</p>
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
            </div>
          )}

          {step === "preview" && previewUrl && (
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

          {step === "details" && (
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
                <div className="mt-2 flex gap-2">
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
                </div>
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
                  disabled={submitting || (audienceType === "selected" && selectedIds.size === 0)}
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
