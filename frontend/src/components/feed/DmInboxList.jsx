import { T, FF, Avatar, MonoLabel } from "@/components/shared/brand";
import { timeAgo, colorForUser } from "./utils";

const DM_CAP = 10;

export default function DmInboxList({
  inboxRows,
  filteredRows,
  search,
  expanded,
  onToggleExpanded,
  onOpenChat,
  creatingDmFor,
}) {
  const q = search.trim();
  const visibleRows = q || expanded ? filteredRows : filteredRows.slice(0, DM_CAP);

  return (
    <div className="flex flex-col gap-2">
      <MonoLabel fs={11}>messages</MonoLabel>
      {inboxRows.length === 0 ? (
        <div className="bg-white border border-ink-8 rounded-2xl p-10 text-center">
          <p className="text-ink-60 text-sm lowercase">
            no friends yet. add some on the friends page.
          </p>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="bg-white border border-ink-8 rounded-2xl p-6 text-center">
          <p className="text-ink-60 text-sm lowercase">no chats match "{search}"</p>
        </div>
      ) : (
        <div className="bg-white border border-ink-8 rounded-2xl overflow-hidden">
          {visibleRows.map((t, i) => {
            const lm = t.chat?.last_message;
            const unread = t.chat?.unread_count || 0;
            const busy = creatingDmFor === t.username;
            let preview;
            if (lm) {
              if (lm.is_removed) {
                preview = (
                  <span className="italic" style={{ color: T.ink40 }}>
                    [message removed]
                  </span>
                );
              } else {
                preview = lm.content;
              }
            } else if (t.hasSnap) {
              preview = `snapped ${timeAgo(t.friend.last_snap_at)}`;
            } else {
              preview = "tap to chat";
            }
            const timeChip = lm
              ? timeAgo(lm.created_at)
              : t.hasSnap
              ? "snap"
              : null;
            return (
              <button
                key={t.username}
                type="button"
                onClick={() => onOpenChat(t.friend)}
                disabled={busy}
                className={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-cream transition-colors disabled:opacity-60 ${
                  i > 0 ? "border-t border-ink-8" : ""
                }`}
              >
                <Avatar
                  name={t.username.slice(0, 2).toLowerCase()}
                  bg={colorForUser(t.username)}
                  fg={colorForUser(t.username) === T.coral ? "#fff" : T.ink}
                  size={44}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="text-base text-ink leading-tight lowercase truncate"
                      style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                    >
                      {t.username}
                    </div>
                    {unread > 0 && (
                      <span
                        className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none"
                        style={{
                          background: T.coral,
                          color: "#fff",
                          fontFamily: FF.mono,
                        }}
                      >
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-xs text-ink-60 truncate mt-0.5"
                    style={{
                      fontFamily: FF.sans,
                      fontWeight: unread > 0 ? 600 : 400,
                      color: unread > 0 ? T.ink : T.ink60,
                    }}
                  >
                    {preview}
                  </div>
                </div>
                {busy ? (
                  <span
                    className="inline-block w-4 h-4 rounded-full border-2 border-ink-15 border-t-coral animate-spin"
                    aria-label="opening"
                  />
                ) : timeChip ? (
                  <span
                    className="text-[10px] font-semibold uppercase whitespace-nowrap"
                    style={{
                      color: T.ink60,
                      fontFamily: FF.mono,
                      letterSpacing: 0.8,
                    }}
                  >
                    {timeChip}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {!q && filteredRows.length > DM_CAP && (
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
            : `view ${filteredRows.length - DM_CAP} more`}
        </button>
      )}
    </div>
  );
}
