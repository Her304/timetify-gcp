import { useState, useMemo } from "react";
import { T, FF, MonoLabel, Avatar, Icon, PillBtn, Star } from "@/components/shared/brand";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Stable color palette for friend avatars based on first-letter
const avatarPalette = [T.lime, T.lilac, "#f0c4a8", "#b8d8c2", T.coral];
const colorFor = (name) => {
  if (!name) return T.lilac;
  const code = name.charCodeAt(0);
  return avatarPalette[code % avatarPalette.length];
};
const isCoral = (c) => c === T.coral;

const FriendCard = ({ name, university, major, gradYear, onAction, actionLabel, actionVariant = "primary", onReject, showDetails }) => {
  const bg = colorFor(name);
  return (
    <div className="flex items-center bg-white border border-ink-8 rounded-2xl p-4 gap-4 hover:border-coral transition-colors">
      <Avatar name={(name?.[0] || "?").toLowerCase()} bg={bg} fg={isCoral(bg) ? '#fff' : T.ink} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-ink text-lg lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}>{name}</span>
          {university && <span className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>@{university}</span>}
        </div>
        {(major || gradYear) && (
          <p className="text-xs text-ink-60 mt-0.5 lowercase">
            {major}{gradYear ? ` · class of ${gradYear}` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {showDetails && (
          <span className="text-[10px] text-ink-40" style={{ fontFamily: FF.mono, letterSpacing: 0.5 }}>tap for more</span>
        )}
        {onAction && actionLabel && (
          <div className="flex gap-2">
            <PillBtn
              onClick={onAction}
              bg={
                actionVariant === "primary" ? T.ink :
                actionVariant === "connect" ? T.coral :
                actionVariant === "accent" ? T.coral :
                T.cream
              }
              fg={
                actionVariant === "primary" ? T.cream :
                actionVariant === "connect" ? "#fff" :
                actionVariant === "accent" ? "#fff" :
                T.ink60
              }
              size="sm"
              style={actionVariant === "muted" ? { border: `1px solid ${T.ink15}` } : {}}
            >
              {actionLabel}
            </PillBtn>
            {onReject && (
              <PillBtn onClick={onReject} bg="#fff" fg={T.ink60} size="sm" style={{ border: `1px solid ${T.ink15}` }}>
                reject
              </PillBtn>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const SearchFriend = ({
  searchfriends,
  sendFriendRequest,
  friendsList,
  friendRequests,
  respondToFriendRequest,
  Class_details = [],
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [popup, setPopup] = useState(false);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);

  const uniqueOwners = useMemo(() => {
    const owners = new Set();
    Class_details.forEach((c) => { if (c.owner) owners.add(c.owner); });
    return Array.from(owners).sort((a, b) => (a === "Me" ? -1 : b === "Me" ? 1 : a.localeCompare(b)));
  }, [Class_details]);

  const [selectedOwner, setSelectedOwner] = useState("all");

  const filteredClasses = useMemo(() => {
    if (selectedOwner === "all") return Class_details;
    return Class_details.filter((c) => c.owner === selectedOwner);
  }, [Class_details, selectedOwner]);

  const deduped = useMemo(() => {
    const grouped = [];
    filteredClasses.forEach((course) => {
      const existing = grouped.find(
        (g) => g.course === course.course && g.time === course.time && g.location === course.location
      );
      if (existing) {
        const owners = new Set(existing.owner.split(/,\s*/).concat(course.owner.split(/,\s*/)));
        existing.owner = Array.from(owners).sort((a, b) => (a === "Me" ? -1 : b === "Me" ? 1 : a.localeCompare(b))).join(", ");
      } else {
        grouped.push({ ...course });
      }
    });
    return grouped;
  }, [filteredClasses]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    const data = await searchfriends(query);
    setResults(data);
  };

  const handleAddFriend = async (id) => {
    await sendFriendRequest(id);
    setPopup(true);
    setTimeout(() => { setPopup(false); window.location.reload(); }, 1500);
  };

  const displayedFriends = showAllFriends ? friendsList : friendsList.slice(0, 3);
  const displayedRequests = showAllRequests ? friendRequests : friendRequests.slice(0, 3);

  const dayColors = [T.coral, T.lilac, T.lime, "#b8d8c2", "#f0c4a8", T.coral, T.lilac];

  return (
    <div className="space-y-10 pb-12">
      {popup && (
        <div className="fixed top-4 right-4 px-5 py-3 rounded-full shadow-xl z-50 text-sm font-semibold"
             style={{ background: T.coral, color: '#fff' }}>
          friend request sent!
        </div>
      )}

      {/* Header */}
      <div>
        <MonoLabel>find ppl · {uniqueOwners.length} u know</MonoLabel>
        <h1 id="search" className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
          ppl u might<br/>actually like
          <span className="inline-block ml-2 align-middle">
            <Star color={T.coral} size={22}/>
          </span>
        </h1>
      </div>

      {/* Search */}
      <section>
        <div className="bg-white rounded-full border border-ink-15 px-5 py-2 flex items-center gap-3">
          <Icon name="search" size={16} color={T.ink60}/>
          <input
            type="text"
            placeholder="search by name, class, or major"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 bg-transparent outline-none text-ink placeholder-ink-40 text-sm"
          />
          <PillBtn onClick={handleSearch} bg={T.coral} fg="#fff" size="sm">
            search
          </PillBtn>
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-3">
            {results.map((friend) => (
              <FriendCard
                key={friend.id}
                name={friend.username}
                university={friend.university}
                major={friend.major}
                gradYear={friend.grad_year}
                showDetails
                onAction={
                  friend.status === null || friend.status === undefined || friend.status === 2
                    ? () => handleAddFriend(friend.id)
                    : undefined
                }
                actionLabel={
                  friend.status === 0
                    ? "pending"
                    : friend.status === 1
                    ? "friends ✓"
                    : "add friend"
                }
                actionVariant={friend.status === 0 || friend.status === 1 ? "muted" : "accent"}
              />
            ))}
          </div>
        )}
        {results.length === 0 && query && (
          <div className="mt-4 p-8 bg-white border border-ink-8 rounded-2xl text-center">
            <p className="text-ink-60 text-sm lowercase">no results found for &ldquo;{query}&rdquo;</p>
          </div>
        )}
      </section>

      {/* My Friends */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <MonoLabel>my ppl</MonoLabel>
            <h2 id="my-friends" className="text-3xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
              my friends{friendsList.length > 0 && ` (${friendsList.length})`}
            </h2>
          </div>
          {!showAllFriends && friendsList.length > 3 && (
            <button onClick={() => setShowAllFriends(true)} className="text-xs font-semibold text-coral hover:text-coral-dark lowercase">
              view more friends
            </button>
          )}
        </div>
        {friendsList.length === 0 ? (
          <div className="bg-white border border-ink-8 rounded-2xl p-8 text-center">
            <p className="text-ink-60 text-sm lowercase">u haven&apos;t added any friends yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedFriends.map((fship) => {
              const f = fship.friend_details;
              return (
                <FriendCard
                  key={fship.id}
                  name={f.username}
                  university={f.university}
                  major={f.major}
                  gradYear={f.grad_year}
                  showDetails
                  actionLabel="friends ✓"
                  actionVariant="muted"
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Schedule */}
      <section id="schedule">
        <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
          <div>
            <MonoLabel>schedules</MonoLabel>
            <h2 className="text-3xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
              me &amp; my friends
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <MonoLabel>sort</MonoLabel>
            <div className="relative">
              <select
                value={selectedOwner}
                onChange={(e) => setSelectedOwner(e.target.value)}
                className="appearance-none bg-white text-ink text-sm font-medium px-4 py-2 pr-8 rounded-full border border-ink-15 outline-none cursor-pointer hover:border-ink-40 transition-colors"
              >
                <option value="all">all of my friends</option>
                {uniqueOwners.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-60 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-ink-8 p-5 w-full overflow-hidden">
          <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[280px]">
            {days.map((day, dayIdx) => {
              const dayItems = deduped.filter(
                (c) =>
                  c.day &&
                  (c.day.toLowerCase() === day.toLowerCase() ||
                    c.day.toLowerCase() === day.slice(0, 3).toLowerCase())
              );
              const dayColor = dayColors[dayIdx % dayColors.length];
              return (
                <div key={day} className="flex-1 min-w-[130px] flex flex-col gap-2">
                  <div className="pb-2 mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: dayColor }} />
                    <h3 className="text-[10px] font-medium text-ink-60 uppercase tracking-widest" style={{ fontFamily: FF.mono }}>
                      {day.slice(0, 3)}
                    </h3>
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    {dayItems.length > 0 ? (
                      dayItems.map((course, idx) => {
                        const isMine = course.owner === "Me" || course.owner?.startsWith("Me,");
                        return (
                          <div
                            key={idx}
                            className="rounded-xl p-2.5 flex flex-col gap-1 border"
                            style={{ background: isMine ? T.cream : '#fff', borderColor: T.ink08 }}
                          >
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full self-start"
                              style={{
                                background: isMine ? T.coralLt : T.lilac + "55",
                                color: isMine ? T.coralDk : T.lilacDk,
                                fontFamily: FF.mono, letterSpacing: 0.5,
                              }}
                            >
                              {course.owner}
                            </span>
                            <h4 className="text-xs font-semibold text-ink line-clamp-2 leading-tight lowercase">
                              {course.course}
                            </h4>
                            <p className="text-[10px] text-ink-60" style={{ fontFamily: FF.mono }}>{course.time}</p>
                            <p className="text-[10px] text-ink-60 truncate">{course.location}</p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex-1 flex items-center justify-center min-h-[80px]">
                        <p className="text-[10px] text-ink-40">—</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {Class_details.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-ink-60 text-sm lowercase">add friends to see their schedule here.</p>
            </div>
          )}
        </div>
      </section>

      {/* Friend Requests */}
      {friendRequests && friendRequests.length > 0 && (
        <section id="request">
          <div className="flex items-center justify-between mb-5">
            <div>
              <MonoLabel>inbox</MonoLabel>
              <h2 className="text-3xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                requests ({friendRequests.length})
              </h2>
            </div>
            {!showAllRequests && friendRequests.length > 3 && (
              <button onClick={() => setShowAllRequests(true)} className="text-xs font-semibold text-coral hover:text-coral-dark lowercase">
                view more
              </button>
            )}
          </div>
          <div className="space-y-3">
            {displayedRequests.map((fship) => {
              const r = fship.friend_details;
              return (
                <FriendCard
                  key={fship.id}
                  name={r.username}
                  university={r.university}
                  major={r.major}
                  gradYear={r.grad_year}
                  showDetails
                  onAction={() => respondToFriendRequest(fship.id, "accept")}
                  actionLabel="connect"
                  actionVariant="connect"
                  onReject={() => respondToFriendRequest(fship.id, "reject")}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default SearchFriend;
