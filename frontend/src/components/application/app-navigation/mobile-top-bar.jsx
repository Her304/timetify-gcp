import { useEffect, useState } from "react";
import { AppMark, T, FF, Icon } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";
import { NotificationsPanel } from "./NotificationsPanel";

// Mobile-only sticky top bar. Mirrors the desktop header's left + right
// clusters (logo+wordmark and bell) but drops the nav pills — those live in
// the floating bottom pill. Bell taps open NotificationsPanel as a full-screen
// sheet so the small viewport can host the same content the desktop dropdown
// shows.
export const MobileTopBar = ({ currentUser, onRespondToRequest }) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);

  const fetchNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/notifications/`);
      if (res.ok) setNotifications(await res.json());
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) fetchNotifications();
  }, [currentUser]);

  // Lock body scroll while the full-screen sheet is open so the page
  // underneath doesn't drift on touch devices.
  useEffect(() => {
    if (!panelOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [panelOpen]);

  const unreadCount =
    (notifications?.friend_requests?.length ?? 0) +
    (notifications?.new_snaps?.length ?? 0);

  const handleRespondToRequest = async (id, action) => {
    await onRespondToRequest?.(id, action);
    fetchNotifications();
  };

  return (
    <>
      <div
        className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-cream border-b border-ink-8 flex-shrink-0"
      >
        <a href="/" className="flex items-center gap-2">
          <AppMark size={28} />
          <span
            className="text-xl text-ink leading-none"
            style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}
          >
            timetify
          </span>
        </a>
        {currentUser && (
          <button
            type="button"
            onClick={() => {
              setPanelOpen(true);
              fetchNotifications();
            }}
            className="relative w-10 h-10 rounded-full bg-white border border-ink-15 flex items-center justify-center hover:bg-ink-8 transition-colors"
            aria-label="notifications"
          >
            <Icon name="bell" size={18} color={T.ink} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white pointer-events-none"
                style={{ background: T.coral, fontFamily: FF.mono }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {panelOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/30"
          onClick={() => setPanelOpen(false)}
        >
          <div
            className="absolute inset-0 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <NotificationsPanel
              variant="fullscreen"
              notifications={notifications}
              loading={notifLoading}
              onRespondToRequest={handleRespondToRequest}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default MobileTopBar;
