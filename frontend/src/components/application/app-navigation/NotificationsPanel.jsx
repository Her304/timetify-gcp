import { T, FF, Avatar, Icon } from "@/components/shared/brand";

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

const SectionLabel = ({ children, count }) => (
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
        style={{ background: T.coral, fontFamily: FF.mono }}
      >
        {count}
      </span>
    )}
  </div>
);

export const NotificationsPanel = ({ notifications, loading, onRespondToRequest, onClose, variant = "dropdown" }) => {
  // `variant="dropdown"` — desktop anchor (absolute below the bell).
  // `variant="fullscreen"` — mobile sheet; rendered inside a portal-ish backdrop
  // wrapper by the caller; we just size to fill that wrapper.
  const isFullscreen = variant === "fullscreen";
  const shellCls = isFullscreen
    ? "w-full h-full bg-white overflow-hidden flex flex-col"
    : "absolute right-0 top-full mt-2 w-80 bg-white border border-ink-15 rounded-2xl shadow-xl z-50 overflow-hidden";
  const scrollShellStyle = isFullscreen
    ? { flex: 1, overflowY: "auto" }
    : { maxHeight: "80vh", overflowY: "auto" };

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

  const { friend_requests = [], new_snaps = [], live_class_alerts = [] } = notifications;
  const isEmpty = !friend_requests.length && !new_snaps.length && !live_class_alerts.length;
  const hasPrev = (s) => s > 0;

  return (
    <div className={shellCls} style={scrollShellStyle}>
      {/* Header */}
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
                  <div
                    className="text-sm lowercase leading-none"
                    style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                  >
                    {req.username}
                  </div>
                  <div
                    className="text-[10px] text-ink-40 mt-0.5 lowercase"
                    style={{ fontFamily: FF.mono }}
                  >
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

      {/* New Snaps */}
      {new_snaps.length > 0 && (
        <div className={hasPrev(friend_requests.length) ? "border-t border-ink-8" : ""}>
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
                  <div
                    className="text-sm lowercase leading-none"
                    style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                  >
                    {snap.uploader_username}
                  </div>
                  <div
                    className="text-[10px] text-ink-40 mt-0.5 lowercase"
                    style={{ fontFamily: FF.mono }}
                  >
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
            hasPrev(friend_requests.length) || hasPrev(new_snaps.length)
              ? "border-t border-ink-8"
              : ""
          }
        >
          <SectionLabel>live in class</SectionLabel>
          {live_class_alerts.map((alert) => (
            <div
              key={alert.course_id}
              className="px-4 py-2.5 hover:bg-ink-8 transition-colors"
            >
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
    </div>
  );
};
