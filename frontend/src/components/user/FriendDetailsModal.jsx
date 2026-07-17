import { T, FF, ProfileAvatar, Icon, MonoLabel, PillBtn } from "@/components/shared/brand";

// Friend's info + destructive actions (remove / block), reached via the
// "details" button on a friend row. Mirrors GroupInfoModal's ink-panel shell.
export default function FriendDetailsModal({ friend, busy, onClose, onUnfriend, onBlock }) {
  if (!friend) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden flex flex-col"
        style={{ background: T.ink, color: "#fff", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,.08)" }}>
          <MonoLabel color="rgba(255,255,255,.55)" fs={10}>friend</MonoLabel>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: "rgba(255,255,255,.12)" }}
            aria-label="close"
          >
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>

        {/* profile */}
        <div className="px-5 py-5 flex flex-col items-center gap-3 text-center overflow-y-auto">
          <ProfileAvatar
            profilePictureUrl={friend.profile_picture_url}
            name={(friend.username || "?").slice(0, 2).toLowerCase()}
            bg={T.coral}
            fg="#fff"
            size={72}
          />
          <div>
            <h2 className="text-2xl leading-none lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
              {friend.username}
            </h2>
            <div className="text-xs mt-2 leading-relaxed" style={{ color: "rgba(255,255,255,.7)" }}>
              {friend.university && <>{friend.university}<br /></>}
              {friend.major && <>{friend.major}</>}
              {friend.grad_year && <> · class of <b>{friend.grad_year}</b></>}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t flex flex-col gap-2" style={{ borderColor: "rgba(255,255,255,.08)" }}>
          <PillBtn
            onClick={() => onUnfriend(friend)}
            disabled={busy}
            bg="rgba(255,255,255,.1)"
            fg="#fff"
            size="lg"
            style={{ border: "1px solid rgba(255,255,255,.16)" }}
          >
            {busy ? "…" : "remove friend"}
          </PillBtn>
          <PillBtn
            onClick={() => onBlock(friend)}
            disabled={busy}
            bg={T.coral}
            fg="#fff"
            size="lg"
          >
            {busy ? "…" : "block"}
          </PillBtn>
        </div>
      </div>
    </div>
  );
}
