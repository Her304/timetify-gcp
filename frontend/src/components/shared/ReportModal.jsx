import { useEffect, useState } from "react";
import { T, FF, Icon } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

// Per the plan: chip lists differ by content_type. Both lists end in "other"
// so the user can free-text anything not covered.
const SNAP_REASONS = [
  { key: "inappropriate", label: "inappropriate/explicit" },
  { key: "harassment", label: "harassment" },
  { key: "spam", label: "spam" },
  { key: "violent", label: "violent" },
  { key: "hate_speech", label: "hate speech" },
  { key: "other", label: "other" },
];

const CHAT_REASONS = [
  { key: "harassment", label: "harassment" },
  { key: "hate_speech", label: "hate speech" },
  { key: "threats", label: "threats" },
  { key: "spam", label: "spam" },
  { key: "private_info", label: "sharing private info" },
  { key: "other", label: "other" },
];

const FREE_TEXT_MAX = 1000;

export default function ReportModal({
  contentType,            // 'snap' | 'chat_message'
  targetId,               // snap id OR chat message id
  targetLabel,            // optional UI label, e.g. "@alice's snap" or "message from @bob"
  onClose,
  onSubmitted,            // optional callback after a successful submit
}) {
  const [reasons, setReasons] = useState(new Set());
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const REASON_LIST = contentType === "snap" ? SNAP_REASONS : CHAT_REASONS;

  // ESC closes the modal — same affordance as SnapViewerModal.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleReason = (key) => {
    setReasons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (submitting) return;
    if (reasons.size === 0 && !freeText.trim()) {
      setError("pick a reason or describe what's wrong");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        content_type: contentType,
        template_reasons: Array.from(reasons),
        free_text: freeText.trim().slice(0, FREE_TEXT_MAX),
      };
      if (contentType === "snap") body.snap = targetId;
      else body.chat_message = targetId;

      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/reports/`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubmitted(true);
        onSubmitted?.(data);
        return;
      }
      // Map known backend payloads to friendly messages. The 409 case still
      // counts as "report on file" from the user's POV, so we treat it as
      // a successful no-op rather than an error.
      if (res.status === 409 && data.detail === "duplicate") {
        setSubmitted(true);
        return;
      }
      if (res.status === 400 && data.detail === "cannot_report_self") {
        setError("you can't report your own content");
      } else if (typeof data.detail === "string") {
        setError(data.detail.replace(/_/g, " "));
      } else {
        setError("couldn't submit — try again in a moment");
      }
    } catch {
      setError("network error — try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{ background: T.ink, color: "#fff", maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,.1)" }}>
          <span style={{ fontFamily: FF.serif, fontSize: 22, letterSpacing: -0.4 }}>
            report {contentType === "snap" ? "snap" : "message"}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: "rgba(255,255,255,.12)" }}
            aria-label="close"
          >
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>

        {submitted ? (
          // Same UI for first-time submit and the 409 dedup branch — both mean
          // "the moderation pipeline is already aware of this content."
          <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full grid place-items-center" style={{ background: T.coral }}>
              <Icon name="check" size={20} color="#fff" stroke={2.4} />
            </div>
            <div style={{ fontFamily: FF.serif, fontSize: 22, letterSpacing: -0.4 }}>thanks for reporting</div>
            <p className="text-sm" style={{ color: "rgba(255,255,255,.7)" }}>
              our moderators will review this within ~10 minutes. you'll get an
              email with the AI assessment when it's ready.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2 rounded-full text-sm font-bold lowercase"
              style={{ background: T.coral, color: "#fff" }}
            >
              done
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
              {targetLabel && (
                <p className="text-xs lowercase" style={{ color: "rgba(255,255,255,.6)", fontFamily: FF.mono, letterSpacing: 0.4 }}>
                  reporting: {targetLabel}
                </p>
              )}
              <p className="text-sm" style={{ color: "rgba(255,255,255,.78)" }}>
                what's wrong with this? pick all that apply.
              </p>

              <div className="flex flex-wrap gap-2">
                {REASON_LIST.map((r) => {
                  const active = reasons.has(r.key);
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => toggleReason(r.key)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium lowercase transition-colors"
                      style={{
                        background: active ? T.coral : "rgba(255,255,255,.08)",
                        color: "#fff",
                        border: `1px solid ${active ? T.coral : "rgba(255,255,255,.16)"}`,
                      }}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="text-[10px] uppercase block mb-1" style={{ fontFamily: FF.mono, letterSpacing: 1, color: "rgba(255,255,255,.6)" }}>
                  tell us more (optional)
                </label>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value.slice(0, FREE_TEXT_MAX))}
                  rows={3}
                  placeholder="any context that'd help our moderators?"
                  className="w-full p-3 rounded-2xl outline-none text-sm resize-none"
                  style={{
                    background: "rgba(255,255,255,.06)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,.14)",
                    fontFamily: FF.sans,
                  }}
                />
                <div className="text-[10px] text-right mt-1" style={{ color: "rgba(255,255,255,.45)", fontFamily: FF.mono }}>
                  {freeText.length}/{FREE_TEXT_MAX}
                </div>
              </div>

              {error && (
                <div
                  className="text-xs p-3 rounded-2xl lowercase"
                  style={{ background: "rgba(237,106,74,.18)", color: "#fff", border: `1px solid ${T.coral}` }}
                >
                  {error}
                </div>
              )}
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-3 border-t" style={{ borderColor: "rgba(255,255,255,.1)" }}>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full text-sm font-semibold lowercase"
                style={{ background: "rgba(255,255,255,.1)", color: "#fff" }}
              >
                cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="px-5 py-2 rounded-full text-sm font-bold lowercase disabled:opacity-50"
                style={{ background: T.coral, color: "#fff" }}
              >
                {submitting ? "submitting…" : "submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
