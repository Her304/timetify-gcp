import { useEffect, useMemo, useState } from "react";
import { T, FF, Avatar, Icon, MonoLabel } from "@/components/shared/brand";
import { colorForUser } from "./utils";

// Unified people finder. Replaces the old chat-only search box: one input that
// searches everyone, then splits results into known friends (status === 1) and
// new people. Friend rows get chat + snap actions; new-people rows get connect.
// `value`/`onChange` are owned by the parent so it can hide the default feed
// while a query is active.

const subtitleFor = (u) =>
  [u.major, u.university].filter(Boolean).join(" • ");

function FriendRow({ user, onChat, onSnap, busyChat }) {
  const bg = colorForUser(user.username);
  return (
    <div className="w-full px-4 py-3 flex items-center gap-3 bg-white border border-ink-8 rounded-2xl">
      <Avatar
        name={user.username.slice(0, 2).toLowerCase()}
        bg={bg}
        fg={bg === T.coral ? "#fff" : T.ink}
        size={44}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-base text-ink leading-tight lowercase truncate"
          style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
        >
          {user.username}
        </div>
        <div
          className="text-xs text-ink-60 truncate mt-0.5 lowercase"
          style={{ fontFamily: FF.sans }}
        >
          {subtitleFor(user) || "friend"}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChat(user)}
        disabled={busyChat}
        aria-label={`chat with ${user.username}`}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50"
        style={{ background: T.ink }}
      >
        {busyChat ? (
          <span className="inline-block w-4 h-4 rounded-full border-2 border-cream/40 border-t-cream animate-spin" />
        ) : (
          <Icon name="msg" size={16} color={T.cream} />
        )}
      </button>
      <button
        type="button"
        onClick={() => onSnap(user)}
        aria-label={`send a snap to ${user.username}`}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: T.coral }}
      >
        <Icon name="cam" size={16} color="#fff" />
      </button>
    </div>
  );
}

function StrangerRow({ user, onConnect }) {
  const bg = colorForUser(user.username);
  let action;
  if (user.status === 0) {
    action = (
      <span className="text-xs text-ink-60 lowercase pr-2 whitespace-nowrap">
        pending
      </span>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={() => onConnect(user.id)}
        aria-label={`connect with ${user.username}`}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold flex-shrink-0 lowercase"
        style={{ background: T.coral, color: "#fff", fontFamily: FF.sans }}
      >
        <Icon name="plus" size={15} color="#fff" />
        connect
      </button>
    );
  }
  return (
    <div className="w-full px-4 py-3 flex items-center gap-3 bg-white border border-ink-8 rounded-2xl">
      <Avatar
        name={user.username.slice(0, 2).toLowerCase()}
        bg={bg}
        fg={bg === T.coral ? "#fff" : T.ink}
        size={44}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-base text-ink leading-tight lowercase truncate"
          style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
        >
          {user.username}
        </div>
        <div
          className="text-xs text-ink-60 truncate mt-0.5 lowercase"
          style={{ fontFamily: FF.sans }}
        >
          {subtitleFor(user) || "tap connect to add"}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function PeopleSearch({
  value,
  onChange,
  searchfriends,
  acceptedFriends = [],
  onChat,
  onSnap,
  onConnect,
  creatingDmFor,
}) {
  // `searchfriends` (GET /api/friends/search/) excludes existing friends by
  // design, so it only ever feeds the "new people" list. Known friends are
  // matched locally against the accepted-friends list the feed already holds.
  const [results, setResults] = useState([]);
  const q = value.trim();

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchfriends(q).then((data) => {
        if (!cancelled) setResults(Array.isArray(data) ? data : []);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, searchfriends]);

  const friends = useMemo(() => {
    const needle = q.toLowerCase();
    if (!needle) return [];
    return acceptedFriends.filter((u) => {
      const haystack = [
        u.username,
        u.major,
        u.university,
        ...(u.shared_courses || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [acceptedFriends, q]);

  // The endpoint already omits friends; keep a guard in case that ever changes.
  // Gated on `q` so stale results from a cleared box don't linger.
  const strangers = useMemo(
    () => (q ? results.filter((u) => u.status !== 1) : []),
    [results, q]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 bg-white border border-ink-8 rounded-full px-4 py-2.5">
        <Icon name="search" size={14} color={T.ink60} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="search ppl — friends & new faces"
          className="flex-1 bg-transparent outline-none text-sm lowercase min-w-0"
          style={{ fontFamily: FF.sans, color: T.ink }}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[10px] lowercase px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              background: T.ink8,
              color: T.ink60,
              fontFamily: FF.mono,
              letterSpacing: 0.4,
            }}
          >
            clear
          </button>
        )}
      </div>

      {q && (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <MonoLabel fs={11}>your friends · {friends.length}</MonoLabel>
            {friends.length === 0 ? (
              <div className="bg-white border border-ink-8 rounded-2xl p-5 text-center">
                <p className="text-ink-60 text-sm lowercase">
                  no friends match "{q}"
                </p>
              </div>
            ) : (
              friends.map((u) => (
                <FriendRow
                  key={u.id}
                  user={u}
                  onChat={onChat}
                  onSnap={onSnap}
                  busyChat={creatingDmFor === u.username}
                />
              ))
            )}
          </section>

          <div className="border-t border-ink-15" />

          <section className="flex flex-col gap-2">
            <MonoLabel fs={11}>add new people · {strangers.length}</MonoLabel>
            {strangers.length === 0 ? (
              <div className="bg-white border border-ink-8 rounded-2xl p-5 text-center">
                <p className="text-ink-60 text-sm lowercase">
                  no new people match "{q}"
                </p>
              </div>
            ) : (
              strangers.map((u) => (
                <StrangerRow key={u.id} user={u} onConnect={onConnect} />
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
