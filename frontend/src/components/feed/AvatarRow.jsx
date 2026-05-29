import { T, FF, Avatar, ProfileAvatar } from "@/components/shared/brand";
import { timeAgo, colorForUser } from "./utils";

export default function AvatarRow({
  orderedTiles,
  currentUser,
  myStatus,
  addDisabled,
  onAddClick,
  onTileClick,
}) {
  return (
    <div className="flex md:flex-wrap gap-5 overflow-x-auto md:overflow-visible -mx-1 px-2 pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={onAddClick}
        disabled={addDisabled}
        className="flex flex-col items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <br/>
        <div className="relative">
          <ProfileAvatar
            profilePictureUrl={currentUser?.profile_picture_url}
            name="me"
            bg={T.coral}
            fg="#fff"
            size={56}
            ring={T.coral}
          />
          <span
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-sm font-bold leading-none"
            style={{ background: T.ink, color: "#fff", border: `2px solid ${T.cream}` }}
          >
            +
          </span>
        </div>
        {myStatus ? (
          <div className="flex flex-col items-center gap-0.5 leading-tight max-w-[88px]">
            {myStatus.snappedAt ? (
              <>
                <span
                  className="text-[10px] font-medium leading-none lowercase truncate max-w-full"
                  style={{ fontFamily: FF.mono, color: T.coralDk, letterSpacing: 0.3 }}
                >
                  snapped {timeAgo(myStatus.snappedAt)}
                </span>
                <span
                  className="text-[10px] font-medium leading-none lowercase truncate max-w-full"
                  style={{ fontFamily: FF.mono, color: T.ink60, letterSpacing: 0.3 }}
                >
                  for {myStatus.courseCode}
                </span>
              </>
            ) : (
              <span
                className="text-[11px] font-medium leading-none lowercase truncate max-w-full"
                style={{ fontFamily: FF.mono, color: T.coralDk, letterSpacing: 0.4 }}
              >
                snap for {myStatus.courseCode}
              </span>
            )}
          </div>
        ) : (
          <span
            className="text-[11px] font-medium text-ink-60 leading-none"
            style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}
          >
            u
          </span>
        )}
      </button>

      {orderedTiles.map((t) => (
        <button
          key={t.username}
          type="button"
          onClick={() => onTileClick(t)}
          className="flex flex-col items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity"
        >
          <br/>
          <div className={t.hasSnap ? "" : "opacity-60"}>
            <Avatar
              name={t.username.slice(0, 2).toLowerCase()}
              bg={colorForUser(t.username)}
              fg={colorForUser(t.username) === T.coral ? "#fff" : T.ink}
              size={56}
              ring={t.hasSnap ? T.coral : T.ink15}
            />
          </div>
          <span
            className="text-[11px] font-medium text-ink-60 leading-none truncate max-w-[68px] lowercase"
            style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}
          >
            {t.username}
          </span>
        </button>
      ))}
    </div>
  );
}
