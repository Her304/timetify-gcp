import { useLocation } from "react-router-dom";
import { T, FF } from "@/components/shared/brand";
import { NavIcon } from "./nav-icons";

// Reuse the same Material Design icon set the desktop nav pills use, so the
// two surfaces feel like the same nav. NavIcon's path inherits `currentColor`
// so we set the wrapper's color to flip between cream (inactive) and white
// (active on coral disc).
const TabBtn = ({ active, href, icon, label, badgeDot }) => (
  <a
    href={href}
    aria-label={label}
    className="flex items-center justify-center flex-1"
  >
    <span
      className="relative w-11 h-11 rounded-full flex items-center justify-center transition-colors"
      style={{
        background: active ? T.coral : "transparent",
        color: active ? "#fff" : T.cream,
      }}
    >
      <NavIcon name={icon} size={22} />
      {badgeDot && (
        <span
          className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full"
          style={{ background: T.coral, border: `2px solid ${T.ink}` }}
        />
      )}
    </span>
  </a>
);

// Avatar tab replaces the old camera button. Renders as a coral circle with
// the user's initial; coral ring when /profile is active to match the active
// state visual of the other tabs (which use a filled coral disc behind the icon).
const AvatarTab = ({ active, currentUser }) => {
  const letter = (currentUser?.username?.[0] || currentUser?.email?.[0] || "u").toLowerCase();
  return (
    <a
      href="/profile"
      aria-label="profile"
      className="flex items-center justify-center flex-1"
    >
      <span
        className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-shadow"
        style={{
          background: T.lilac,
          color: T.ink,
          fontFamily: FF.serif,
          boxShadow: active ? `0 0 0 2px ${T.cream}, 0 0 0 4px ${T.coral}` : "none",
        }}
      >
        {letter}
      </span>
    </a>
  );
};

export const MobileBottomNav = ({ currentUser, unreadChatCount = 0 }) => {
  const location = useLocation();
  const path = location.pathname;

  const isSchedule = path === "/";
  const isFriends = path === "/friend";
  const isFeed = path === "/feed";
  const isProfile = path === "/profile";

  return (
    <div className="md:hidden fixed bottom-4 left-0 right-0 z-40 flex justify-center px-6 pointer-events-none">
      <div
        className="flex items-center gap-1 px-3 py-2 rounded-full pointer-events-auto"
        style={{
          background: T.ink,
          boxShadow: "0 8px 28px rgba(31,26,34,0.35)",
          minWidth: 280,
        }}
      >
        <TabBtn
          active={isFeed}
          href="/feed"
          icon="feed"
          label="feed"
          badgeDot={unreadChatCount > 0 && !isFeed}
        />
        <TabBtn active={isSchedule} href="/" icon="schedule" label="schedule" />
        <TabBtn active={isFriends} href="/friend" icon="friends" label="friends" />
        <AvatarTab active={isProfile} currentUser={currentUser} />
      </div>
    </div>
  );
};
