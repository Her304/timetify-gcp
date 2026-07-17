import { T, FF, ProfileAvatar } from "@/components/shared/brand";
import { timeAgo, colorForUser, isLiveSnap } from "./utils";

const resolveMediaUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${import.meta.env.VITE_API_URL}${url}`;
};

// One friend's snap-preview card: the latest snap thumbnail with the friend's
// avatar tucked into the bottom-right corner, username underneath. Coral ring
// when the snap is still live (< 30 min).
function SnapPreviewCard({ tile, onClick }) {
  const snap = tile.snaps[0];
  const mediaUrl = resolveMediaUrl(snap?.media_url);
  const live = tile.snaps.some((s) => isLiveSnap(s.created_at));
  const bg = colorForUser(tile.username);
  return (
    <button
      type="button"
      onClick={() => onClick(tile)}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 hover:opacity-90 transition-opacity"
    >
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          width: 92,
          height: 116,
          background: "#2a2226",
          boxShadow: live ? `0 0 0 2px ${T.coral}` : `0 0 0 1px ${T.ink15}`,
        }}
      >
        {mediaUrl ? (
          snap.media_type === "video" ? (
            <video
              src={mediaUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full" style={{ background: bg, opacity: 0.4 }} />
        )}
        <div className="absolute bottom-1 right-1">
          <ProfileAvatar
            profilePictureUrl={tile.friend?.profile_picture_url}
            name={tile.username.slice(0, 2).toLowerCase()}
            bg={bg}
            fg={bg === T.coral ? "#fff" : T.ink}
            size={28}
            ring="#fff"
          />
        </div>
      </div>
      <span
        className="text-[11px] font-medium text-ink-60 leading-none truncate max-w-[92px] lowercase"
        style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}
      >
        {tile.username}
      </span>
    </button>
  );
}

export default function AvatarRow({
  orderedTiles,
  currentUser,
  myStatus,
  addDisabled,
  onAddClick,
  onTileClick,
}) {
  const snapTiles = orderedTiles.filter((t) => t.hasSnap);
  return (
    <div className="flex md:flex-wrap gap-4 overflow-x-auto md:overflow-visible -mx-1 px-2 pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* me / add-a-snap tile — mirrors the snap-card footprint so the row lines up */}
      <button
        type="button"
        onClick={onAddClick}
        disabled={addDisabled}
        className="flex flex-col items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <div
          className="relative rounded-2xl flex items-center justify-center"
          style={{ width: 92, height: 116, background: T.cream, boxShadow: `0 0 0 1px ${T.ink15}` }}
        >
          <div className="relative">
            <ProfileAvatar
              profilePictureUrl={currentUser?.profile_picture_url}
              name="me"
              bg={T.coral}
              fg="#fff"
              size={48}
              ring={T.coral}
            />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-sm font-bold leading-none"
              style={{ background: T.ink, color: "#fff", border: `2px solid ${T.cream}` }}
            >
              +
            </span>
          </div>
        </div>
        {myStatus ? (
          <span
            className="text-[11px] font-medium leading-none lowercase truncate max-w-[92px]"
            style={{ fontFamily: FF.mono, color: T.coralDk, letterSpacing: 0.4 }}
          >
            {myStatus.snappedAt ? `snapped ${timeAgo(myStatus.snappedAt)}` : `snap ${myStatus.courseCode}`}
          </span>
        ) : (
          <span
            className="text-[11px] font-medium text-ink-60 leading-none"
            style={{ fontFamily: FF.mono, letterSpacing: 0.4 }}
          >
            u
          </span>
        )}
      </button>

      {snapTiles.map((t) => (
        <SnapPreviewCard key={t.username} tile={t} onClick={onTileClick} />
      ))}
    </div>
  );
}
