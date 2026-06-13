import { useState } from "react";
import { T, FF, Icon, ProfileAvatar } from "@/components/shared/brand";

const formatRange = (s, e) => {
  if (s == null || e == null) return "";
  const fmt = (mins) => {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h24 >= 12 ? "pm" : "am";
    const h = ((h24 + 11) % 12) + 1;
    return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, "0")}${ap}`;
  };
  return `${fmt(s)}–${fmt(e)}`;
};

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const AVATAR_BG = [T.coral, T.lilac, "#f0c4a8", "#b8d8c2", T.lime];
const colorForUser = (name) => AVATAR_BG[hashStr(name) % AVATAR_BG.length];

export default function EventBlock({ event, top, height, onOpen, startMin, endMin, onRespond, leftStyle = 4, rightStyle = 4, widthStyle, extraCount = 0, onOpenCluster }) {
  const [responding, setResponding] = useState(false);
  const compact = height < 48;
  const redacted = !!event?.is_redacted;
  const isPending = !event?.is_mine && event?.my_invite_status === "PENDING";
  const clickable = !redacted && !isPending && typeof onOpen === "function";

  const allUsers = [
    { username: event?.creator_username, pic: event?.creator_profile_picture_url },
    ...(event?.invites || []).map(inv => ({ username: inv.invitee_username, pic: inv.invitee_profile_picture_url }))
  ].filter(u => u.username);

  const baseStyle = {
    top,
    left: leftStyle,
    ...(widthStyle !== undefined ? { width: widthStyle } : { right: rightStyle }),
    height,
    padding: compact ? "5px 8px" : "7px 10px",
    gap: compact ? 2 : 4,
    zIndex: 10,
    cursor: clickable ? "pointer" : "default",
  };

  const handleRespond = async (e, action) => {
    e.stopPropagation();
    if (responding || !onRespond) return;
    setResponding(true);
    await onRespond(action);
    setResponding(false);
  };

  if (redacted) {
    const initials = (event.creator_username || "?").slice(0, 2).toLowerCase();
    return (
      <div
        className="absolute rounded-2xl overflow-hidden text-left flex flex-col"
        style={{
          ...baseStyle,
          background: "rgba(200, 176, 223, 0.35)",
          color: T.ink,
          border: `1px dashed ${T.lilacDk}`,
        }}
        aria-label={`private event from ${event.creator_username}`}
        title={`private event · ${event.creator_username} · ${formatRange(startMin, endMin)}`}
      >
        <div className="flex items-center gap-1.5">
          <ProfileAvatar
            profilePictureUrl={event.creator_profile_picture_url}
            name={initials}
            bg={T.lilac}
            fg={T.ink}
            size={compact ? 16 : 20}
          />
          <span
            className="text-[10px] font-semibold uppercase truncate leading-none"
            style={{ fontFamily: FF.mono, color: T.ink60, letterSpacing: 0.8 }}
          >
            private
          </span>
        </div>
        {!compact && (
          <div
            className="text-[11px] lowercase truncate w-full"
            style={{ fontFamily: FF.sans, color: T.ink60, letterSpacing: -0.1 }}
          >
            private event
          </div>
        )}

        {extraCount > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onOpenCluster && onOpenCluster();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onOpenCluster && onOpenCluster();
              }
            }}
            className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase cursor-pointer"
            style={{
              background: "#fff",
              color: T.lilacDk,
              border: `1.5px solid ${T.lilac}`,
              fontFamily: FF.mono,
              letterSpacing: 0.4,
            }}
            aria-label={`see ${extraCount} more overlapping events`}
          >
            +{extraCount}
          </span>
        )}
      </div>
    );
  }

  if (isPending) {
    return (
      <div
        className="absolute rounded-2xl overflow-hidden text-left flex flex-col justify-between"
        style={{
          ...baseStyle,
          background: "rgba(237,106,74,0.12)",
          color: T.ink,
          border: `1px dashed ${T.coral}`,
        }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Icon name="calendar" size={compact ? 11 : 13} color={T.coral} />
            <span
              className="text-[10px] font-semibold uppercase truncate leading-none"
              style={{ fontFamily: FF.mono, color: T.coral, letterSpacing: 0.8 }}
            >
              pending invite
            </span>
          </div>
          <div
            className="text-[11px] lowercase font-semibold truncate leading-tight w-full"
            style={{ fontFamily: FF.sans, color: T.ink, letterSpacing: -0.1 }}
          >
            {event.name}
          </div>
        </div>
        
        {!compact && (
          <div className="flex items-center justify-end gap-1.5 mt-auto">
            {responding ? (
              <span className="text-[10px] uppercase text-coral font-bold" style={{ fontFamily: FF.mono }}>...</span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => handleRespond(e, "accept")}
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{ background: T.coral }}
                  aria-label="accept"
                >
                  <Icon name="check" size={12} color="#fff" stroke={3} />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleRespond(e, "decline")}
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{ background: "transparent", border: `1px solid ${T.coral}` }}
                  aria-label="decline"
                >
                  <Icon name="x" size={12} color={T.coral} stroke={2.5} />
                </button>
              </>
            )}
          </div>
        )}

        {extraCount > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onOpenCluster && onOpenCluster();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onOpenCluster && onOpenCluster();
              }
            }}
            className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase cursor-pointer"
            style={{
              background: "#fff",
              color: T.coral,
              border: `1.5px solid ${T.coral}`,
              fontFamily: FF.mono,
              letterSpacing: 0.4,
            }}
            aria-label={`see ${extraCount} more overlapping events`}
          >
            +{extraCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!clickable && !extraCount}
      className="absolute rounded-2xl overflow-hidden text-left flex flex-col"
      style={{
        ...baseStyle,
        background: T.lilac,
        color: T.ink,
        border: `1px solid ${T.lilacDk}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon name="calendar" size={compact ? 11 : 13} color={T.ink} />
        <span
          className="text-[10px] font-semibold uppercase truncate leading-none"
          style={{ fontFamily: FF.mono, color: T.ink, letterSpacing: 0.8 }}
        >
          event
        </span>
      </div>
      <div
        className="text-[11px] lowercase font-semibold truncate leading-tight w-full"
        style={{ fontFamily: FF.sans, color: T.ink, letterSpacing: -0.1 }}
      >
        {event.name}
      </div>
      {!compact && (
        <div
          className="text-[10px] lowercase truncate w-full"
          style={{ fontFamily: FF.mono, color: T.ink, opacity: 0.75, letterSpacing: 0.2 }}
        >
          {formatRange(startMin, endMin)}
          {event.location ? ` · ${event.location}` : ""}
        </div>
      )}

      {/* Participants AvatarStack */}
      {!compact && allUsers.length > 0 && (
        <div className="flex items-center -space-x-1.5 mt-auto mb-1">
          {allUsers.slice(0, 3).map((u, i) => (
            <ProfileAvatar
              key={i}
              profilePictureUrl={u.pic}
              name={(u.username || "?").slice(0, 2).toLowerCase()}
              bg={colorForUser(u.username || "")}
              fg={T.ink}
              size={20}
            />
          ))}
          {allUsers.length > 3 && (
            <span
              className="inline-flex items-center justify-center rounded-full font-semibold relative z-10"
              style={{
                width: 20,
                height: 20,
                fontSize: 8,
                background: T.ink,
                color: T.cream,
                fontFamily: FF.mono,
                boxShadow: `0 0 0 2px ${T.lilac}`,
                letterSpacing: -0.3,
              }}
            >
              +{allUsers.length - 3}
            </span>
          )}
        </div>
      )}

      {extraCount > 0 && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onOpenCluster && onOpenCluster();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onOpenCluster && onOpenCluster();
            }
          }}
          className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase cursor-pointer"
          style={{
            background: "#fff",
            color: T.lilacDk,
            border: `1.5px solid ${T.lilac}`,
            fontFamily: FF.mono,
            letterSpacing: 0.4,
          }}
          aria-label={`see ${extraCount} more overlapping events`}
        >
          +{extraCount}
        </span>
      )}
    </button>
  );
}
