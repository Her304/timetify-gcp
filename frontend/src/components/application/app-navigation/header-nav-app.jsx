import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppMark, T, FF, Icon, ProfileAvatar } from "@/components/shared/brand";
import { authenticatedFetch } from "@/utils/api";
import { NotificationsPanel } from "./NotificationsPanel";
import { NavIcon } from "./nav-icons";

const NavItem = ({ active, href, icon, label, badge }) => (
  <a
    href={href}
    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
      active ? "bg-ink text-cream" : "text-ink-60 hover:text-ink"
    }`}
    style={{ fontFamily: FF.sans, letterSpacing: -0.1 }}
  >
    <NavIcon name={icon} size={18} />
    <span className="lowercase">{label}</span>
    {badge > 0 && (
      <span
        className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none"
        style={{
          background: T.coral,
          color: "#fff",
          fontFamily: FF.mono,
          letterSpacing: 0.2,
        }}
      >
        {badge > 9 ? "9+" : badge}
      </span>
    )}
  </a>
);

export const HeaderNavApp = ({ currentUser, onLogout, onRespondToRequest, unreadChatCount = 0 }) => {
  const location = useLocation();
  const path = location.pathname;

  const isSchedule = path === "/";
  const isFeed = path === "/feed";
  const isFriends = path === "/friend";

  const avatarLetter = (currentUser?.username?.[0] || currentUser?.email?.[0] || "U").toLowerCase();

  const [panelOpen, setPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const bellRef = useRef(null);

  const fetchNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/notifications/`);
      if (res.ok) setNotifications(await res.json());
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => { fetchNotifications(); }, []);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setPanelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  const handleRespondToRequest = async (id, action) => {
    await onRespondToRequest?.(id, action);
    fetchNotifications();
  };

  // Bell badge counts actionable items the user can still act on:
  // friend requests + unseen snaps + reports against me that are still
  // appealable. Filed-report status updates are passive (read-only summary).
  const actionableReports =
    (notifications?.reports_received || []).filter((r) => r.can_appeal).length;
  const unreadCount =
    (notifications?.friend_requests?.length ?? 0) +
    (notifications?.new_snaps?.length ?? 0) +
    actionableReports;

  return (
    <div className="hidden md:flex items-center gap-4 bg-cream border-b border-ink-8 px-6 h-16 flex-shrink-0 sticky top-0 z-30">
      {/* Logo */}
      <a href="/" className="flex items-center gap-2 flex-shrink-0">
        <AppMark size={32} />
        <span className="text-2xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.6 }}>
          timetify
        </span>
      </a>

      {/* Primary nav */}
      <nav className="flex items-center gap-1 ml-4">
        <NavItem
          active={isFeed}
          href="/feed"
          icon="feed"
          label="feed"
          badge={isFeed ? 0 : unreadChatCount}
        />
        <NavItem active={isSchedule} href="/" icon="schedule" label="schedule" />
        <NavItem active={isFriends} href="/friend" icon="friends" label="friends" />
      </nav>

      {/* Right cluster */}
      <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
        {/* Bell + panel */}
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => {
              const next = !panelOpen;
              setPanelOpen(next);
              if (next) fetchNotifications();
            }}
            className="w-10 h-10 rounded-full bg-white border border-ink-15 flex items-center justify-center hover:bg-ink-8 transition-colors"
            aria-label="notifications"
          >
            <Icon name="bell" size={18} color={T.ink} />
          </button>
          {/* Unread badge */}
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white pointer-events-none"
              style={{ background: T.coral, fontFamily: FF.mono }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          {panelOpen && (
            <NotificationsPanel
              notifications={notifications}
              loading={notifLoading}
              onRespondToRequest={handleRespondToRequest}
              onRefresh={fetchNotifications}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>

        <a href="/profile" className="hover:opacity-90 transition-opacity">
          <ProfileAvatar
            profilePictureUrl={currentUser?.profile_picture_url}
            name={avatarLetter}
            bg={T.lilac}
            fg={T.ink}
            size={40}
          />
        </a>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-coral hover:opacity-90 rounded-full transition-opacity whitespace-nowrap lowercase"
          >
            log out
          </button>
        )}
      </div>
    </div>
  );
};
