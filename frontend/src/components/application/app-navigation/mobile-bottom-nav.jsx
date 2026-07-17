import { useState } from "react";
import { useLocation } from "react-router-dom";
import { T, FF, Icon, ProfileAvatar } from "@/components/shared/brand";
import { NavIcon } from "./nav-icons";
import AddMenu from "./AddMenu";

// iOS-26-style "liquid glass": a translucent frosted material that lets the
// page bleed through, edged with a bright hairline and lifted on a soft shadow.
// Shared so the main pill and the standalone "+" pod read as the same material.
const GLASS = {
  background: "rgba(252,250,245,0.60)",
  backdropFilter: "blur(22px) saturate(180%)",
  WebkitBackdropFilter: "blur(22px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.55)",
  boxShadow:
    "0 4px 14px rgba(31,26,34,0.10), inset 0 1px 0 rgba(255,255,255,0.65)",
};

// Feed / schedule tab: icon + label always visible. Active tab lifts onto a
// coral "lens" capsule (white content); inactive is muted ink on the glass.
// NavIcon inherits `currentColor` so we flip it via the wrapper's color.
const TabBtn = ({ active, href, icon, label, badgeDot, tourId }) => (
  <a
    href={href}
    aria-label={label}
    data-tour={tourId}
    className="relative flex items-center justify-center gap-1.5 rounded-full transition-all duration-200"
    style={{
      height: 40,
      padding: "0 14px",
      background: active ? T.coral : "transparent",
      color: active ? "#fff" : T.ink60,
      boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.30)" : "none",
    }}
  >
    <NavIcon name={icon} size={20} />
    <span style={{ fontFamily: FF.sans, fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>
      {label}
    </span>
    {badgeDot && (
      <span
        className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full"
        style={{ background: T.coral, border: `2px solid ${T.paper}` }}
      />
    )}
  </a>
);

// Profile avatar sits at the end of the pill. Coral ring when /profile is active,
// mirroring the coral fill the other active tabs use.
const AvatarTab = ({ active, currentUser }) => {
  const letter = (currentUser?.username?.[0] || currentUser?.email?.[0] || "u").toLowerCase();
  return (
    <a
      href="/profile"
      aria-label="profile"
      data-tour="profile"
      className="flex items-center justify-center px-1"
      style={{ height: 40 }}
    >
      <ProfileAvatar
        profilePictureUrl={currentUser?.profile_picture_url}
        name={letter}
        bg={T.lilac}
        fg={T.ink}
        size={40}
        ring={active ? T.coral : undefined}
      />
    </a>
  );
};

// Standalone "+" pod to the right of the pill — the primary action, a coral
// disc floating on the same glass shadow so it reads as its own liquid element.
const AddTab = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="add"
    data-tour="add"
    className="flex items-center justify-center rounded-full shrink-0 pointer-events-auto transition-transform active:scale-95"
    style={{
      width: 52,
      height: 52,
      background: T.coral,
      boxShadow:
        "0 4px 14px rgba(237,106,74,0.22), inset 0 1px 0 rgba(255,255,255,0.35)",
    }}
  >
    <Icon name="plus" size={24} color="#fff" />
  </button>
);

export const MobileBottomNav = ({ currentUser, unreadChatCount = 0, onAddClass, onAddEvent }) => {
  const location = useLocation();
  const path = location.pathname;

  const isSchedule = path === "/";
  const isFeed = path === "/feed";
  const isProfile = path === "/profile";

  const [addMenuOpen, setAddMenuOpen] = useState(false);

  return (
    <>
      <div className="md:hidden fixed bottom-4 left-0 right-0 z-40 flex justify-between items-center px-4 pointer-events-none">
        <div
          className="flex items-center gap-1 pointer-events-auto rounded-full"
          style={{ padding: 6, ...GLASS }}
        >
          <TabBtn
            active={isFeed}
            href="/feed"
            icon="feed"
            label="feed"
            badgeDot={unreadChatCount > 0 && !isFeed}
            tourId="feed"
          />
          <TabBtn active={isSchedule} href="/" icon="schedule" label="schedule" tourId="schedule" />
          <AvatarTab active={isProfile} currentUser={currentUser} />
        </div>
        <AddTab onClick={() => setAddMenuOpen(true)} />
      </div>
      {addMenuOpen && (
        <AddMenu
          variant="sheet"
          onClose={() => setAddMenuOpen(false)}
          onAddClass={onAddClass}
          onAddEvent={onAddEvent}
        />
      )}
    </>
  );
};
