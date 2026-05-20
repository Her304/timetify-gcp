import { useState } from "react";
import { T, FF, Avatar, Icon } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";

const AVATAR_PALETTE = [T.lime, T.lilac, "#f0c4a8", "#b8d8c2", T.coral];
const colorFor = (name) => {
  if (!name) return T.lilac;
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
};
const isCoral = (c) => c === T.coral;

const timeAgo = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const SectionLabel = ({ children, count, tone }) => (
  <div className="px-4 pt-3 pb-1 flex items-center gap-2">
    <span
      className="text-[10px] uppercase text-ink-40"
      style={{ fontFamily: FF.mono, letterSpacing: 1 }}
    >
      {children}
    </span>
    {count != null && (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
        style={{ background: tone || T.coral, fontFamily: FF.mono }}
      >
        {count}
      </span>
    )}
  </div>
);

// Short human-readable status for Report rows. Mirrors the backend enum.
const REPORT_STATUS_LABEL = {
  pending: "queued",
  ai_reported: "ai reviewed",
  appeal_pending: "appeal in review",
  appeal_analyzed: "appeal in review",
  third_loop: "appeal in review",
  enforced: "enforced",
  appeal_upheld: "no violation",
  warned: "warned",
  admin_removed: "admin removed",
  admin_dismissed: "dismissed",
};

const formatContentType = (ct) => (ct === "snap" ? "snap" : "message");

// Tiny inline AppealModal — keeps the network call local to the panel so it
// can refetch notifications on success and dismiss without a full reload.
const AppealModal = ({ reportId, onClose, onSubmitted }) => {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("please write a short explanation");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/appeals/`,
        {
          method: "POST",
          body: JSON.stringify({ report: reportId, reason: trimmed }),
        },
      );
      if (res.ok) {
        onSubmitted?.();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError((data.detail || "couldn't submit appeal").replace(/_/g, " "));
    } catch {
      setError("network error — try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{ background: T.ink, color: "#fff" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,.1)" }}>
          <span style={{ fontFamily: FF.serif, fontSize: 22, letterSpacing: -0.4 }}>file an appeal</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: "rgba(255,255,255,.12)" }}
            aria-label="close"
          >
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm" style={{ color: "rgba(255,255,255,.78)" }}>
            tell us why this report is wrong. an independent second review will
            run automatically.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 4000))}
            rows={4}
            placeholder="explain why this report doesn't apply…"
            className="w-full p-3 rounded-2xl outline-none text-sm resize-none"
            style={{
              background: "rgba(255,255,255,.06)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,.14)",
              fontFamily: FF.sans,
            }}
          />
          <div className="text-[10px] text-right" style={{ color: "rgba(255,255,255,.45)", fontFamily: FF.mono }}>
            {reason.length}/4000
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
            {submitting ? "submitting…" : "submit appeal"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ReportDocPreview = ({ doc }) => {
  const [expanded, setExpanded] = useState(false);
  if (!doc) return null;
  const trimmed = doc.length > 220 ? doc.slice(0, 220) + "…" : doc;
  return (
    <div className="mt-1">
      <p
        className="text-[11px] leading-snug whitespace-pre-wrap"
        style={{ color: T.ink60, fontFamily: FF.sans }}
      >
        {expanded ? doc : trimmed}
      </p>
      {doc.length > 220 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] mt-1 lowercase hover:underline"
          style={{ color: T.coralDk || T.coral, fontFamily: FF.mono, letterSpacing: 0.5 }}
        >
          {expanded ? "show less" : "show full assessment"}
        </button>
      )}
    </div>
  );
};

export const NotificationsPanel = ({ notifications, loading, onRespondToRequest, onClose, onRefresh, variant = "dropdown" }) => {
  const isFullscreen = variant === "fullscreen";
  const shellCls = isFullscreen
    ? "w-full h-full bg-white overflow-hidden flex flex-col"
    : "absolute right-0 top-full mt-2 w-[22rem] bg-white border border-ink-15 rounded-2xl shadow-xl z-50 overflow-hidden";
  const scrollShellStyle = isFullscreen
    ? { flex: 1, overflowY: "auto" }
    : { maxHeight: "80vh", overflowY: "auto" };

  const [appealingReportId, setAppealingReportId] = useState(null);

  if (loading || !notifications) {
    return (
      <div className={shellCls}>
        <div className="px-4 py-3 border-b border-ink-8 flex items-center justify-between">
          <span style={{ fontFamily: FF.serif, letterSpacing: -0.4 }} className="text-xl text-ink lowercase">
            notifications
          </span>
          {isFullscreen && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-8 transition-colors"
            >
              <Icon name="x" size={16} color={T.ink60} stroke={2} />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 p-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-ink-8 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const {
    friend_requests = [],
    new_snaps = [],
    live_class_alerts = [],
    reports_received = [],
    reports_filed = [],
  } = notifications;
  const isEmpty =
    !friend_requests.length &&
    !new_snaps.length &&
    !live_class_alerts.length &&
    !reports_received.length &&
    !reports_filed.length;
  const hasPrev = (s) => s > 0;

  return (
    <div className={shellCls} style={scrollShellStyle}>
      <div className="px-4 py-3 border-b border-ink-8 flex items-center justify-between sticky top-0 bg-white z-10">
        <span style={{ fontFamily: FF.serif, letterSpacing: -0.4 }} className="text-xl text-ink lowercase">
          notifications
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-ink-8 transition-colors"
        >
          <Icon name="x" size={14} color={T.ink60} stroke={2} />
        </button>
      </div>

      {isEmpty && (
        <div className="px-4 py-10 text-center">
          <div className="text-sm text-ink-40 lowercase" style={{ fontFamily: FF.mono }}>
            all clear ✓
          </div>
        </div>
      )}

      {/* Friend Requests */}
      {friend_requests.length > 0 && (
        <div>
          <SectionLabel count={friend_requests.length}>friend requests</SectionLabel>
          {friend_requests.map((req) => {
            const bg = colorFor(req.username);
            return (
              <div
                key={req.id}
                className="px-4 py-2.5 flex items-center gap-3 hover:bg-ink-8 transition-colors"
              >
                <Avatar
                  name={(req.username?.slice(0, 2) || "?").toLowerCase()}
                  bg={bg}
                  fg={isCoral(bg) ? "#fff" : T.ink}
                  size={38}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm lowercase leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}>
                    {req.username}
                  </div>
                  <div className="text-[10px] text-ink-40 mt-0.5 lowercase" style={{ fontFamily: FF.mono }}>
                    {req.major} · '{String(req.grad_year).slice(-2)}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onRespondToRequest(req.id, "accept")}
                    aria-label="accept"
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: T.coral }}
                  >
                    <Icon name="check" size={14} color="#fff" stroke={2.4} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespondToRequest(req.id, "reject")}
                    aria-label="decline"
                    className="w-8 h-8 rounded-full flex items-center justify-center border"
                    style={{ background: "#fff", borderColor: T.ink15 }}
                  >
                    <Icon name="x" size={14} color={T.ink60} stroke={2} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reports against me — surfaced first because they're actionable. */}
      {reports_received.length > 0 && (
        <div className={hasPrev(friend_requests.length) ? "border-t border-ink-8" : ""}>
          <SectionLabel count={reports_received.filter((r) => r.can_appeal).length || null}>
            reports against you
          </SectionLabel>
          {reports_received.map((rep) => (
            <div
              key={rep.id}
              className="px-4 py-2.5 flex flex-col gap-1 hover:bg-ink-8 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full uppercase"
                    style={{
                      background: rep.can_appeal ? T.coral : T.ink08,
                      color: rep.can_appeal ? "#fff" : T.ink60,
                      fontFamily: FF.mono,
                      letterSpacing: 0.5,
                    }}
                  >
                    {REPORT_STATUS_LABEL[rep.status] || rep.status}
                  </span>
                  <span
                    className="text-xs lowercase truncate"
                    style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.2 }}
                  >
                    your {formatContentType(rep.content_type)} was reported
                  </span>
                </div>
                <span
                  className="text-[10px] flex-shrink-0"
                  style={{ color: T.ink40, fontFamily: FF.mono }}
                >
                  {timeAgo(rep.created_at)}
                </span>
              </div>
              <ReportDocPreview doc={rep.report_document} />
              {rep.can_appeal && (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => setAppealingReportId(rep.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold lowercase"
                    style={{ background: T.coral, color: "#fff", fontFamily: FF.sans }}
                  >
                    appeal
                  </button>
                  {rep.appeal_deadline && (
                    <span
                      className="text-[10px] ml-2 lowercase"
                      style={{ color: T.ink40, fontFamily: FF.mono }}
                    >
                      until {new Date(rep.appeal_deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reports I filed — read-only summary. */}
      {reports_filed.length > 0 && (
        <div
          className={
            hasPrev(friend_requests.length) || hasPrev(reports_received.length)
              ? "border-t border-ink-8"
              : ""
          }
        >
          <SectionLabel>your reports</SectionLabel>
          {reports_filed.map((rep) => (
            <div
              key={rep.id}
              className="px-4 py-2.5 flex flex-col gap-1 hover:bg-ink-8 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full uppercase"
                    style={{
                      background: T.ink08,
                      color: T.ink60,
                      fontFamily: FF.mono,
                      letterSpacing: 0.5,
                    }}
                  >
                    {REPORT_STATUS_LABEL[rep.status] || rep.status}
                  </span>
                  <span
                    className="text-xs lowercase truncate"
                    style={{ fontFamily: FF.serif, color: T.ink, letterSpacing: -0.2 }}
                  >
                    {formatContentType(rep.content_type)} report
                  </span>
                </div>
                <span
                  className="text-[10px] flex-shrink-0"
                  style={{ color: T.ink40, fontFamily: FF.mono }}
                >
                  {timeAgo(rep.created_at)}
                </span>
              </div>
              <ReportDocPreview doc={rep.report_document} />
            </div>
          ))}
        </div>
      )}

      {/* New Snaps */}
      {new_snaps.length > 0 && (
        <div
          className={
            hasPrev(friend_requests.length) ||
            hasPrev(reports_received.length) ||
            hasPrev(reports_filed.length)
              ? "border-t border-ink-8"
              : ""
          }
        >
          <SectionLabel count={new_snaps.length}>new snaps</SectionLabel>
          {new_snaps.map((snap) => {
            const bg = colorFor(snap.uploader_username);
            return (
              <div
                key={snap.id}
                className="px-4 py-2.5 flex items-center gap-3 hover:bg-ink-8 transition-colors"
              >
                <Avatar
                  name={(snap.uploader_username?.slice(0, 2) || "?").toLowerCase()}
                  bg={bg}
                  fg={isCoral(bg) ? "#fff" : T.ink}
                  size={38}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm lowercase leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}>
                    {snap.uploader_username}
                  </div>
                  <div className="text-[10px] text-ink-40 mt-0.5 lowercase" style={{ fontFamily: FF.mono }}>
                    {snap.course_code} · {timeAgo(snap.created_at)}
                  </div>
                </div>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: T.coral }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Live Class Alerts */}
      {live_class_alerts.length > 0 && (
        <div
          className={
            hasPrev(friend_requests.length) ||
            hasPrev(new_snaps.length) ||
            hasPrev(reports_received.length) ||
            hasPrev(reports_filed.length)
              ? "border-t border-ink-8"
              : ""
          }
        >
          <SectionLabel>live in class</SectionLabel>
          {live_class_alerts.map((alert) => (
            <div key={alert.course_id} className="px-4 py-2.5 hover:bg-ink-8 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[10px] font-semibold uppercase"
                  style={{ fontFamily: FF.mono, color: T.coral }}
                >
                  {alert.course_id}
                </span>
                <span className="text-xs text-ink truncate">{alert.course_name}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {alert.friends.map((f) => {
                  const fb = colorFor(f.username);
                  return (
                    <Avatar
                      key={f.id}
                      name={(f.username?.slice(0, 2) || "?").toLowerCase()}
                      bg={fb}
                      fg={isCoral(fb) ? "#fff" : T.ink}
                      size={22}
                    />
                  );
                })}
                <span
                  className="text-[10px] text-ink-40 ml-1 lowercase"
                  style={{ fontFamily: FF.mono }}
                >
                  {alert.friend_count} in class now
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="h-3" />

      {appealingReportId && (
        <AppealModal
          reportId={appealingReportId}
          onClose={() => setAppealingReportId(null)}
          onSubmitted={() => {
            setAppealingReportId(null);
            // Pull a fresh notifications payload so the appealed row drops
            // out of can_appeal and the bell badge updates.
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};
