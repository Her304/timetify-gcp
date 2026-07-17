import { T, FF, ProfileAvatar, Icon, MonoLabel } from "@/components/shared/brand";
import { colorForUser } from "./utils";

// Compact accept/reject list for incoming friend requests, salvaged from the
// retired friends page. Renders nothing when there are no pending requests.
export default function RequestsBanner({ friendRequests = [], onRespond }) {
  if (!friendRequests || friendRequests.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <MonoLabel fs={11}>requests · {friendRequests.length}</MonoLabel>
      <div className="bg-white border border-ink-8 rounded-2xl overflow-hidden">
        {friendRequests.map((fship, i) => {
          const r = fship.friend_details;
          if (!r) return null;
          const bg = colorForUser(r.username);
          const sub = [r.major, r.university].filter(Boolean).join(" • ");
          return (
            <div
              key={fship.id}
              className={`px-4 py-3 flex items-center gap-3 ${
                i > 0 ? "border-t border-ink-8" : ""
              }`}
            >
              <ProfileAvatar
                profilePictureUrl={r.profile_picture_url}
                name={r.username.slice(0, 2).toLowerCase()}
                bg={bg}
                fg={bg === T.coral ? "#fff" : T.ink}
                size={44}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-base text-ink leading-tight lowercase truncate"
                  style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                >
                  {r.username}
                </div>
                <div
                  className="text-xs text-ink-60 truncate mt-0.5 lowercase"
                  style={{ fontFamily: FF.sans }}
                >
                  {sub || "wants to connect"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRespond(fship.id, "accept")}
                aria-label="accept"
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: T.coral }}
              >
                <Icon name="check" size={15} color="#fff" stroke={2.4} />
              </button>
              <button
                type="button"
                onClick={() => onRespond(fship.id, "reject")}
                aria-label="reject"
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "#fff", border: `1px solid ${T.ink15}` }}
              >
                <Icon name="x" size={14} color={T.ink60} stroke={2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
