import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { authenticatedFetch } from "@/utils/api";
import { T, FF, Icon, MonoLabel, ProfileAvatar } from "@/components/shared/brand";

// Pull the invite code out of a scanned QR payload. QRs encode the full
// `<origin>/invite/<code>` link, but we also tolerate a bare path or raw code so
// a re-hosted link still resolves.
function extractInviteCode(text) {
  if (!text) return null;
  const m = String(text).match(/\/invite\/([^/?#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

// Dual-purpose QR sheet. mode="show" renders the current user's own invite QR;
// mode="scan" opens the rear camera, decodes a friend's QR, and sends them a
// friend request. Both reuse the /api/invite/* endpoints from the invite feature.
export default function QrModal({ mode, currentUser, onClose, onFriendAdded, sendFriendRequest }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div
        className="w-full max-w-sm flex flex-col overflow-hidden rounded-3xl"
        style={{ background: T.ink, color: "#fff", maxHeight: "95vh" }}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: "rgba(255,255,255,.12)" }}
            aria-label="close"
          >
            <Icon name="x" size={14} color="#fff" />
          </button>
          <span style={{ fontFamily: FF.serif, fontSize: 22, letterSpacing: -0.5, color: "#fff" }}>
            {mode === "show" ? "my qr code" : "scan qr code"}
          </span>
          <span className="w-8 h-8 grid place-items-center">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "rgba(255,255,255,.6)" }}>
              {mode === "show" ? "qr_code" : "qr_code_scanner"}
            </span>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {mode === "show" ? (
            <ShowQr currentUser={currentUser} />
          ) : (
            <ScanQr
              currentUser={currentUser}
              onClose={onClose}
              onFriendAdded={onFriendAdded}
              sendFriendRequest={sendFriendRequest}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ShowQr({ currentUser }) {
  const [qrUrl, setQrUrl] = useState(null);

  useEffect(() => {
    let revoked = false;
    let url = null;
    (async () => {
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/invite/qr/`);
        if (res.ok) {
          const blob = await res.blob();
          url = URL.createObjectURL(blob);
          if (!revoked) setQrUrl(url);
        }
      } catch (err) { console.error("Failed to load QR", err); }
    })();
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 pt-2">
      <div className="w-56 h-56 rounded-2xl bg-white flex items-center justify-center overflow-hidden">
        {qrUrl ? (
          <img src={qrUrl} alt="your invite qr code" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full bg-white/10 animate-pulse" />
        )}
      </div>
      <div className="text-center">
        <div className="text-2xl leading-none lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.5, color: "#fff" }}>
          @{currentUser?.username}
        </div>
        <p className="text-xs mt-2 lowercase" style={{ color: "rgba(255,255,255,.6)", fontFamily: FF.mono, letterSpacing: 0.4 }}>
          have a friend scan this to add you
        </p>
      </div>
    </div>
  );
}

function ScanQr({ currentUser, onClose, onFriendAdded, sendFriendRequest }) {
  // "scanning" → decoding frames | "looking_up" → resolving the code
  // "found" → profile card | "self" | "notfound" | "requested" | "error"
  const [phase, setPhase] = useState("scanning");
  const [streamError, setStreamError] = useState(null);
  const [inviter, setInviter] = useState(null);
  const [adding, setAdding] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const phaseRef = useRef("scanning");
  phaseRef.current = phase;

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const resolveCode = useCallback(async (code) => {
    if (code === currentUser?.invite_code) {
      setPhase("self");
      return;
    }
    setPhase("looking_up");
    try {
      // Authenticated so the response's `status` reflects any existing
      // relationship (pending / already friends) between us and the scanned user.
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/invite/${code}/`);
      if (res.ok) {
        const data = await res.json();
        setInviter(data.inviter);
        setPhase("found");
      } else {
        setPhase("notfound");
      }
    } catch {
      setPhase("notfound");
    }
  }, [currentUser?.invite_code]);

  // One decode loop, driven by rAF. It only inspects frames while the phase is
  // "scanning" (guarded via phaseRef), and stops itself the moment a valid
  // invite code is found — resolveCode then moves the phase off "scanning".
  const scanLoop = useCallback(() => {
    const step = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (phaseRef.current === "scanning" && v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        const w = v.videoWidth, h = v.videoHeight;
        if (w && h) {
          c.width = w; c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const result = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          const code = result && extractInviteCode(result.data);
          if (code) { resolveCode(code); return; }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [resolveCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) { ms.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = ms;
        if (videoRef.current) {
          videoRef.current.srcObject = ms;
          await videoRef.current.play().catch(() => {});
        }
        scanLoop();
      } catch (err) {
        setStreamError(err.message || "could not access camera.");
      }
    })();
    return () => { cancelled = true; stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-arm the loop after a dismissed miss (self / not-found).
  const rescan = () => {
    setInviter(null);
    setPhase("scanning");
    scanLoop();
  };

  // Send a friend request to the scanned user rather than friending them
  // outright — like the manual-username flow, they decide whether to accept.
  // (The /invite/accept auto-friend path is reserved for unregistered users
  // arriving via the invite link.)
  const addFriend = async () => {
    if (!inviter?.id) return;
    setAdding(true);
    try {
      const ok = await sendFriendRequest(inviter.id);
      if (ok) {
        stopCamera();
        setPhase("requested");
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    } finally {
      setAdding(false);
    }
  };

  // ── Camera-error / result screens ─────────────────────────────────────────
  if (streamError) {
    return (
      <Centered>
        <p className="text-sm text-center px-2">camera blocked: {streamError}</p>
        <p className="text-xs text-center mt-2" style={{ color: "rgba(255,255,255,.6)" }}>
          allow camera access in your browser settings, then reopen.
        </p>
      </Centered>
    );
  }

  if (phase === "found" && inviter) {
    const subtitle = [inviter.major, inviter.university].filter(Boolean).join(" • ");
    return (
      <div className="flex flex-col items-center gap-4 pt-2">
        <ProfileAvatar
          profilePictureUrl={inviter.profile_picture_url}
          name={inviter.username?.charAt(0).toLowerCase()}
          bg={T.coral}
          fg="#fff"
          size={88}
        />
        <div className="text-center">
          <div className="text-2xl leading-none lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.5, color: "#fff" }}>
            {inviter.username}
          </div>
          {subtitle && (
            <p className="text-sm mt-1.5 lowercase" style={{ color: "rgba(255,255,255,.75)" }}>{subtitle}</p>
          )}
          {inviter.grad_year && (
            <p className="text-xs mt-1 lowercase" style={{ color: "rgba(255,255,255,.55)", fontFamily: FF.mono, letterSpacing: 0.4 }}>
              class of {inviter.grad_year}
            </p>
          )}
        </div>
        {inviter.status === 1 ? (
          <div className="w-full flex flex-col items-center gap-3 pt-2">
            <p className="text-sm lowercase" style={{ color: "rgba(255,255,255,.7)" }}>
              you&apos;re already friends
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-full text-sm font-bold lowercase"
              style={{ background: T.coral, color: "#fff" }}
            >
              done
            </button>
          </div>
        ) : inviter.status === 0 ? (
          <div className="w-full flex flex-col items-center gap-3 pt-2">
            <p className="text-sm lowercase" style={{ color: "rgba(255,255,255,.7)" }}>
              a friend request is already pending
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-full text-sm font-bold lowercase"
              style={{ background: "rgba(255,255,255,.12)", color: "#fff" }}
            >
              close
            </button>
          </div>
        ) : (
          <div className="w-full flex items-center gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-full text-sm font-semibold lowercase"
              style={{ background: "rgba(255,255,255,.12)", color: "#fff" }}
            >
              cancel
            </button>
            <button
              onClick={addFriend}
              disabled={adding}
              className="flex-1 py-3 rounded-full text-sm font-bold lowercase disabled:opacity-60"
              style={{ background: T.coral, color: "#fff" }}
            >
              {adding ? "sending…" : "send request"}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (phase === "requested" && inviter) {
    return (
      <Centered>
        <div className="w-14 h-14 rounded-full grid place-items-center mb-3" style={{ background: "rgba(201,238,111,.2)" }}>
          <Icon name="check" size={24} color={T.lime} stroke={2.5} />
        </div>
        <div className="text-xl lowercase text-center" style={{ fontFamily: FF.serif, letterSpacing: -0.4, color: "#fff" }}>
          friend request sent to @{inviter.username}
        </div>
        <p className="text-xs mt-2 text-center lowercase" style={{ color: "rgba(255,255,255,.6)", fontFamily: FF.mono, letterSpacing: 0.4 }}>
          you&apos;ll be connected once they accept
        </p>
        <button
          onClick={() => { onFriendAdded && onFriendAdded(); onClose(); }}
          className="mt-5 px-6 py-2.5 rounded-full text-sm font-bold lowercase"
          style={{ background: T.coral, color: "#fff" }}
        >
          done
        </button>
      </Centered>
    );
  }

  if (phase === "self" || phase === "notfound" || phase === "error") {
    const msg =
      phase === "self" ? "that's your own qr code."
      : phase === "error" ? "couldn't send the request — try again."
      : "that's not a timetify invite code.";
    return (
      <Centered>
        <p className="text-sm text-center px-2">{msg}</p>
        <button
          onClick={rescan}
          className="mt-4 px-6 py-2.5 rounded-full text-sm font-bold lowercase"
          style={{ background: T.coral, color: "#fff" }}
        >
          scan again
        </button>
      </Centered>
    );
  }

  // ── Live viewfinder (scanning / looking_up) ───────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 pt-2">
      <div className="w-full aspect-square rounded-2xl relative overflow-hidden" style={{ background: "#2a2226" }}>
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="hidden" />
        {/* scan reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-2/3 h-2/3 rounded-2xl" style={{ border: "3px solid rgba(255,255,255,.7)" }} />
        </div>
        {phase === "looking_up" && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,.45)" }}>
            <span className="text-sm lowercase" style={{ fontFamily: FF.mono, letterSpacing: 1 }}>reading…</span>
          </div>
        )}
      </div>
      <MonoLabel color="rgba(255,255,255,.6)">point at a friend&apos;s qr code</MonoLabel>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[240px] py-6 text-white">
      {children}
    </div>
  );
}
