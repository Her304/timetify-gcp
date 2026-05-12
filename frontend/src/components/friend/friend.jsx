import { useState, useMemo, useEffect } from "react";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const AvatarCircle = ({ name, size = "md" }) => {
  const initials = name ? name.charAt(0).toUpperCase() : "?";
  const sizeClasses = size === "lg" ? "w-14 h-14 text-xl" : "w-10 h-10 text-sm";
  return (
    <div className={`${sizeClasses} rounded-full bg-[#607196]/10 text-[#607196] flex items-center justify-center font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
};

const FriendCard = ({ name, university, major, gradYear, onAction, actionLabel, actionVariant = "primary", onReject, showDetails }) => (
  <div className="flex items-center bg-[#e8e9ed]  p-4 gap-4">
    <AvatarCircle name={name} size="lg" />
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-extrabold text-gray-900">{name}</span>
        {university && <span className="text-sm text-gray-500">@{university}</span>}
      </div>
      {(major || gradYear) && (
        <p className="text-sm text-gray-500 mt-0.5">
          {major}{gradYear ? ` | Graduate by ${gradYear}` : ""}
        </p>
      )}
    </div>
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      {showDetails && (
        <span className="text-xs text-gray-400 cursor-pointer hover:text-[#607196]">Click for more details</span>
      )}
      {onAction && actionLabel && (
        <div className="flex gap-2">
          <button
            onClick={onAction}
            className={`px-4 py-2  text-sm font-bold transition-colors ${
              actionVariant === "primary"
                ? "bg-[#607196] text-white hover:bg-[#4a5a7a]"
                : actionVariant === "connect"
                ? "bg-white border border-[#607196] text-[#607196] hover:bg-[#607196] hover:text-white"
                : actionVariant === "accent"
                ? "bg-[#ffc759] text-gray-900 hover:bg-[#e5b34e]"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
          >
            {actionLabel}
          </button>
          {onReject && (
            <button
              onClick={onReject}
              className="px-4 py-2  text-sm font-bold bg-white border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
            >
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);

const SearchFriend = ({
  searchfriends,
  sendFriendRequest,
  friendsList,
  friendRequests,
  respondToFriendRequest,
  Class_details = [],
  currentUser,
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

  return (
    <div className="space-y-10 pb-12">
      {popup && (
        <div className="fixed top-4 right-4 bg-[#607196] text-white px-6 py-3  shadow-xl z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          Friend request sent!
        </div>
      )}

      {/* Search */}
      <section>
        <h2 id="search" className="text-3xl font-extrabold text-gray-900 mb-5">Search</h2>
        <div className="bg-[#e8e9ed]  px-4 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            placeholder="Find your Friends here!"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400 text-sm font-medium"
          />
          <button
            onClick={handleSearch}
            className="px-5 py-2 bg-[#607196] text-white text-sm font-bold  hover:bg-[#4a5a7a] transition-colors"
          >
            Search
          </button>
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
                    ? "Pending"
                    : friend.status === 1
                    ? "Friends ✓"
                    : "Add Friend"
                }
                actionVariant={friend.status === 0 || friend.status === 1 ? "muted" : "accent"}
              />
            ))}
          </div>
        )}
        {results.length === 0 && query && (
          <div className="mt-4 p-8 bg-[#e8e9ed]  text-center">
            <p className="text-gray-400 text-sm">No results found for "{query}"</p>
          </div>
        )}
      </section>

      {/* My Friends */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 id="my-friends" className="text-3xl font-extrabold text-gray-900">
            My Friends {friendsList.length > 0 && `(${friendsList.length})`}
          </h2>
          {!showAllFriends && friendsList.length > 3 && (
            <button onClick={() => setShowAllFriends(true)} className="text-sm font-semibold text-gray-400 hover:text-[#607196] transition-colors">
              View more friends
            </button>
          )}
        </div>
        {friendsList.length === 0 ? (
          <div className="bg-[#e8e9ed]  p-8 text-center">
            <p className="text-gray-400 text-sm">You haven't added any friends yet.</p>
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
                  actionLabel="Friends ✓"
                  actionVariant="muted"
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Me & My friends schedule */}
      <section id="schedule">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h2 className="text-3xl font-extrabold text-gray-900">Me &amp; My friends schedule</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium">Sort:</span>
            <div className="relative">
              <select
                value={selectedOwner}
                onChange={(e) => setSelectedOwner(e.target.value)}
                className="appearance-none bg-[#e8e9ed] text-gray-800 text-sm font-semibold px-4 py-2 pr-8  border-none outline-none cursor-pointer"
              >
                <option value="all">All of my friend</option>
                {uniqueOwners.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-[#e8e9ed]  p-5 w-full overflow-hidden">
          <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[280px]">
            {days.map((day) => {
              const dayItems = deduped.filter(
                (c) =>
                  c.day &&
                  (c.day.toLowerCase() === day.toLowerCase() ||
                    c.day.toLowerCase() === day.slice(0, 3).toLowerCase())
              );
              return (
                <div key={day} className="flex-1 min-w-[130px] flex flex-col gap-2">
                  <div className="pb-2 border-b-2 border-[#607196] mb-1">
                    <h3 className="text-[10px] font-bold text-[#607196] text-center uppercase tracking-widest">
                      {day.slice(0, 3)}
                    </h3>
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    {dayItems.length > 0 ? (
                      dayItems.map((course, idx) => (
                        <div
                          key={idx}
                          className="bg-white  p-2.5 shadow-sm flex flex-col gap-1"
                        >
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full self-start ${
                              course.owner === "Me"
                                ? "bg-[#607196]/10 text-[#607196]"
                                : "bg-[#ffc759]/20 text-amber-700"
                            }`}
                          >
                            {course.owner}
                          </span>
                          <h4 className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight">
                            {course.course}
                          </h4>
                          <p className="text-[10px] text-gray-500">{course.time}</p>
                          <p className="text-[10px] text-gray-500 truncate">{course.location}</p>
                        </div>
                      ))
                    ) : (
                      <div className="flex-1 flex items-center justify-center min-h-[80px]">
                        <p className="text-[10px] text-gray-400 italic">—</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {Class_details.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-gray-400 text-sm">Add friends to see their schedule here.</p>
            </div>
          )}
        </div>
      </section>

      {/* Friend Requests */}
      {friendRequests && friendRequests.length > 0 && (
        <section id="request">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-3xl font-extrabold text-gray-900">
              Request ({friendRequests.length})
            </h2>
            {!showAllRequests && friendRequests.length > 3 && (
              <button onClick={() => setShowAllRequests(true)} className="text-sm font-semibold text-gray-400 hover:text-[#607196] transition-colors">
                View more request
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
