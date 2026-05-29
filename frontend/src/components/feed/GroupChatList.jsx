import { T, FF, Avatar, MonoLabel } from "@/components/shared/brand";
import { timeAgo, colorForUser } from "./utils";

const GROUP_CAP = 5;

export default function GroupChatList({
  groupChats,
  filteredGroups,
  search,
  expanded,
  onToggleExpanded,
  onOpenChat,
  onOpenCreate,
}) {
  const q = search.trim();
  const visibleGroups = q || expanded ? filteredGroups : filteredGroups.slice(0, GROUP_CAP);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <MonoLabel fs={11}>group chats</MonoLabel>
        <button
          type="button"
          onClick={onOpenCreate}
          className="text-[10px] lowercase px-2.5 py-1 rounded-full"
          style={{
            background: T.ink, color: T.cream,
            fontFamily: FF.mono, letterSpacing: 0.4,
          }}
        >
          + new group
        </button>
      </div>
      {groupChats.length === 0 ? (
        <button
          type="button"
          onClick={onOpenCreate}
          className="bg-white border border-dashed border-ink-15 rounded-2xl px-4 py-5 text-left hover:bg-cream transition-colors"
        >
          <div className="text-sm lowercase" style={{ color: T.ink60 }}>
            start a group chat with friends →
          </div>
        </button>
      ) : visibleGroups.length === 0 ? (
        <div className="bg-white border border-ink-8 rounded-2xl p-6 text-center">
          <p className="text-ink-60 text-sm lowercase">no groups match "{search}"</p>
        </div>
      ) : (
        <div className="bg-white border border-ink-8 rounded-2xl overflow-hidden">
          {visibleGroups.map((g, i) => {
            const lm = g.last_message;
            const unread = g.unread_count || 0;
            const previewSender = lm?.sender_username
              ? `${lm.sender_username}: `
              : "";
            const previewBody = lm
              ? lm.is_removed
                ? "[message removed]"
                : lm.content
              : "tap to chat";
            const timeChip = lm ? timeAgo(lm.created_at) : null;
            const preview3 = (g.members_preview || []).slice(0, 3);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onOpenChat(g.id)}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-cream transition-colors ${
                  i > 0 ? "border-t border-ink-8" : ""
                }`}
              >
                <div className="relative w-12 h-12 flex-shrink-0">
                  {preview3.map((u, j) => (
                    <div
                      key={u.id}
                      className="absolute"
                      style={{
                        left: j === 0 ? 0 : j === 1 ? 14 : 7,
                        top: j === 2 ? 18 : 0,
                        zIndex: 3 - j,
                      }}
                    >
                      <Avatar
                        name={u.username.slice(0, 2).toLowerCase()}
                        bg={colorForUser(u.username)}
                        fg={colorForUser(u.username) === T.coral ? "#fff" : T.ink}
                        size={28}
                        ring="#fff"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="text-base text-ink leading-tight lowercase truncate"
                      style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                    >
                      {g.name}
                    </div>
                    <span
                      className="text-[10px] uppercase px-1.5 py-0.5 rounded-full"
                      style={{
                        background: T.ink8, color: T.ink60,
                        fontFamily: FF.mono, letterSpacing: 0.5,
                      }}
                    >
                      {g.member_count}
                    </span>
                    {unread > 0 && (
                      <span
                        className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none"
                        style={{
                          background: T.coral, color: "#fff",
                          fontFamily: FF.mono,
                        }}
                      >
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-xs truncate mt-0.5"
                    style={{
                      fontFamily: FF.sans,
                      fontWeight: unread > 0 ? 600 : 400,
                      color: unread > 0 ? T.ink : T.ink60,
                    }}
                  >
                    {previewSender}
                    {lm?.is_removed ? (
                      <span className="italic" style={{ color: T.ink40 }}>
                        {previewBody}
                      </span>
                    ) : (
                      previewBody
                    )}
                  </div>
                </div>
                {timeChip && (
                  <span
                    className="text-[10px] font-semibold uppercase whitespace-nowrap"
                    style={{
                      color: T.ink60, fontFamily: FF.mono, letterSpacing: 0.8,
                    }}
                  >
                    {timeChip}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {!q && filteredGroups.length > GROUP_CAP && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="self-start text-[11px] lowercase px-3 py-1 rounded-full"
          style={{
            background: T.ink8, color: T.ink,
            fontFamily: FF.mono, letterSpacing: 0.4,
          }}
        >
          {expanded
            ? "view less"
            : `view ${filteredGroups.length - GROUP_CAP} more`}
        </button>
      )}
    </div>
  );
}
