import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/utils/api";

const MAX_VIDEO_MS = 5000;
const PHOTO_QUALITY = 0.85;
const TARGET_RATIO = 4 / 5; // vertical 5:4 (portrait)
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

const extFromMime = (mime) => {
  if (!mime) return ".webm";
  if (mime.startsWith("video/mp4")) return ".mp4";
  if (mime.startsWith("video/webm")) return ".webm";
  if (mime.startsWith("image/jpeg")) return ".jpg";
  if (mime.startsWith("image/png")) return ".png";
  return ".bin";
};

export default function SnapCaptureModal({ course, friendsList, onClose, onUploaded }) {
  const [mode, setMode] = useState("photo"); // 'photo' | 'video'
  const [step, setStep] = useState("capture"); // 'capture' | 'preview' | 'details'
  const [stream, setStream] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState("");
  const [audienceType, setAudienceType] = useState("all"); // 'all' | 'selected'
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
  const friendOptions = (friendsList || [])
    .map((f) => f.friend_details)
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div
        className="bg-white w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: "min(95vw, calc((100vh - 14rem) * 4 / 5))",
          maxHeight: "95vh",
        }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e9ed]">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Snap</div>
            <div className="text-sm font-bold text-gray-900">{course.course}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          {step === "capture" && (
            <div className="flex flex-col">
              <div className="bg-black aspect-[4/5] relative flex items-center justify-center overflow-hidden">
                {streamError ? (
                  <div className="text-white text-sm text-center px-6">
                    <p>Camera blocked: {streamError}</p>
                    <p className="text-gray-400 text-xs mt-2">Allow camera access in your browser settings, then retry.</p>
                  </div>
                ) : (
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                )}
                {recording && (
                  <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    REC · {(remainingMs / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-[#e8e9ed]">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => switchMode("photo")}
                    disabled={recording}
                    className={`px-3 py-1.5 text-xs font-semibold ${mode === "photo" ? "bg-[#607196] text-white" : "bg-[#e8e9ed] text-gray-700"}`}
                  >
                    Photo
                  </button>
                  <button
                    onClick={() => switchMode("video")}
                    disabled={recording}
                    className={`px-3 py-1.5 text-xs font-semibold ${mode === "video" ? "bg-[#607196] text-white" : "bg-[#e8e9ed] text-gray-700"}`}
                  >
                    Video (5s)
                  </button>
                </div>
                {mode === "photo" ? (
                  <button
                    onClick={capturePhoto}
                    disabled={!stream || !!streamError}
                    className="px-5 py-2 bg-[#ffc759] text-gray-900 font-bold text-sm disabled:opacity-50"
                  >
                    Capture
                  </button>
                ) : recording ? (
                  <button
                    onClick={stopRecording}
                    className="px-5 py-2 bg-red-500 text-white font-bold text-sm"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    disabled={!stream || !!streamError}
                    className="px-5 py-2 bg-[#ffc759] text-gray-900 font-bold text-sm disabled:opacity-50"
                  >
                    Record
                  </button>
                )}
              </div>
            </div>
          )}

          {step === "preview" && previewUrl && (
            <div className="flex flex-col">
              <div className="bg-black aspect-[4/5] flex items-center justify-center overflow-hidden">
                {mode === "photo" ? (
                  <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <video src={previewUrl} className="w-full h-full object-cover" controls playsInline />
                )}
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-[#e8e9ed]">
                <button onClick={retake} className="px-4 py-2 bg-[#e8e9ed] text-gray-700 text-sm font-semibold">Retake</button>
                <button onClick={() => setStep("details")} className="px-5 py-2 bg-[#607196] text-white text-sm font-bold">Continue</button>
              </div>
            </div>
          )}

          {step === "details" && (
            <div className="p-4 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Caption</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(clampWords(e.target.value, CAPTION_MAX_WORDS))}
                  rows={2}
                  placeholder="Say something…"
                  className="mt-1 w-full bg-[#e8e9ed] p-3 text-sm outline-none"
                />
                <div className="text-[10px] text-gray-400 text-right">{countWords(caption)}/{CAPTION_MAX_WORDS} words</div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Audience</label>
                <div className="mt-1 flex gap-1">
                  <button
                    onClick={() => setAudienceType("all")}
                    className={`px-3 py-1.5 text-xs font-semibold ${audienceType === "all" ? "bg-[#607196] text-white" : "bg-[#e8e9ed] text-gray-700"}`}
                  >
                    All friends
                  </button>
                  <button
                    onClick={() => setAudienceType("selected")}
                    className={`px-3 py-1.5 text-xs font-semibold ${audienceType === "selected" ? "bg-[#607196] text-white" : "bg-[#e8e9ed] text-gray-700"}`}
                  >
                    Selected
                  </button>
                </div>
                {audienceType === "selected" && (
                  <div className="mt-2 max-h-40 overflow-y-auto bg-[#e8e9ed] p-2 flex flex-col gap-1">
                    {friendOptions.length === 0 ? (
                      <p className="text-xs text-gray-500 italic p-2">No friends yet — add some to use this option.</p>
                    ) : (
                      friendOptions.map((f) => (
                        <label key={f.id} className="flex items-center gap-2 bg-white px-2 py-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(f.id)}
                            onChange={() => toggleFriend(f.id)}
                          />
                          <span className="text-xs text-gray-800">@{f.username}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="text-xs text-red-600 bg-red-50 p-2">{errorMsg}</div>
              )}

              <div className="flex items-center justify-between">
                <button onClick={retake} className="px-4 py-2 bg-[#e8e9ed] text-gray-700 text-sm font-semibold">Retake</button>
                <button
                  onClick={submit}
                  disabled={submitting || (audienceType === "selected" && selectedIds.size === 0)}
                  className="px-5 py-2 bg-[#ffc759] text-gray-900 text-sm font-bold disabled:opacity-50"
                >
                  {submitting ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
