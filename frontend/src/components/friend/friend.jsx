import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { SearchLg as Search } from "@untitledui/icons";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];


const MyFriends = ({ friendsList }) => {
    const [showAll, setShowAll] = useState(false);

    if (!friendsList || friendsList.length === 0) {
        return (
            <div className="mb-12">
                <h2 id="my-friends" className="text-2xl font-bold text-black mb-4">My Friends</h2>
                <div className="p-8 bg-white rounded-xl border border-dashed border-secondary text-center">
                    <p className="text-tertiary">You haven't added any friends yet.</p>
                </div>
            </div>
        );
    }

    const displayedFriends = showAll ? friendsList : friendsList.slice(0, 5);

    return (
        <div className="mb-12">
            <h2 id="my-friends" className="text-2xl font-bold text-black mb-4">My Friends ({friendsList.length})</h2>
            <ul className="flex flex-col gap-4">
                {displayedFriends.map((fship) => {
                    const friend = fship.friend_details;
                    return (
                        <li className="flex flex-row justify-between items-center bg-white border border-secondary p-5 rounded-xl shadow-xs hover:shadow-sm transition-shadow" key={fship.id}>
                            <div className="flex flex-col gap-1">
                                <span className="text-lg text-black font-semibold">{friend.username}</span>
                                <div className="flex flex-col text-sm text-tertiary">
                                    <span>{friend.university}</span>
                                    <span>{friend.major} • Class of {friend.grad_year}</span>
                                </div>
                            </div>
                            <Button
                                className="text-white bg-green-500 !border-0 !ring-0 shadow-none pointer-events-none"
                                size="sm"
                                color="secondary"
                            >
                                Friends
                            </Button>
                        </li>
                    );
                })}
            </ul>
            {!showAll && friendsList.length > 5 && (
                <div className="mt-4 text-center">
                    <button
                        onClick={() => setShowAll(true)}
                        className="text-[#607196] font-semibold hover:underline"
                    >
                        Click here for more
                    </button>
                </div>
            )}
        </div>
    );
}

const FriendRequests = ({ friendRequests, respondToFriendRequest }) => {
    if (!friendRequests || friendRequests.length === 0) {
        return null;
    }

    return (
        <div className="mb-12">
            <h2 id="request" className="text-2xl font-bold text-black mb-4">Friend Requests ({friendRequests.length})</h2>
            <ul className="flex flex-col gap-4">
                {friendRequests.map((fship) => {
                    const requester = fship.friend_details;
                    return (
                        <li className="flex flex-row justify-between items-center bg-white border border-secondary p-5 rounded-xl shadow-xs hover:shadow-sm transition-shadow" key={fship.id}>
                            <div className="flex flex-col gap-1">
                                <span className="text-lg text-black font-semibold">{requester.username}</span>
                                <div className="flex flex-col text-sm text-tertiary">
                                    <span>{requester.university}</span>
                                    <span>{requester.major} • Class of {requester.grad_year}</span>
                                </div>
                            </div>
                            <div className="flex flex-row gap-2">
                                <Button
                                    className="text-white bg-green-500 hover:bg-green-600 !border-0 !ring-0 shadow-none px-4"
                                    size="sm"
                                    color="secondary"
                                    onClick={() => respondToFriendRequest(fship.id, 'accept')}
                                >
                                    Connect
                                </Button>
                                <Button
                                    className="text-white bg-red-400 hover:bg-red-500 !border-0 !ring-0 shadow-none px-4"
                                    size="sm"
                                    color="secondary"
                                    onClick={() => respondToFriendRequest(fship.id, 'reject')}
                                >
                                    Reject
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

const SearchFriend = ({ searchfriends, sendFriendRequest, friendsList, friendRequests, respondToFriendRequest, Class_details = [], currentUser }) => {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [popup, setPopup] = useState(false);
    
    // Get unique owners from Class_details
    const uniqueOwners = useMemo(() => {
        const owners = new Set();
        Class_details.forEach(course => {
            if (course.owner) owners.add(course.owner);
        });
        // Sort with "Me" always first, then others alphabetically
        return Array.from(owners).sort((a, b) => {
            if (a === "Me") return -1;
            if (b === "Me") return 1;
            return a.localeCompare(b);
        });
    }, [Class_details]);

    const [selectedOwners, setSelectedOwners] = useState([]);

    // Initialize selectedOwners when uniqueOwners change for the first time
    useEffect(() => {
        if (uniqueOwners.length > 0 && selectedOwners.length === 0) {
            setSelectedOwners(uniqueOwners);
        }
    }, [uniqueOwners]);

    const toggleOwner = (owner) => {
        setSelectedOwners(prev => 
            prev.includes(owner) 
                ? prev.filter(o => o !== owner)
                : [...prev, owner]
        );
    };

    const filteredClasses = useMemo(() => {
        return Class_details.filter(course => 
            selectedOwners.includes(course.owner)
        );
    }, [Class_details, selectedOwners]);

    const handleSearch = async () => {
        const data = await searchfriends(query);
        setResults(data);
    }

    const handleAddFriend = async (id) => {
        await sendFriendRequest(id);
        setPopup(true);
        setTimeout(() => {
            setPopup(false);
            window.location.reload();
        }, 1500);
    };

    return (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto p-4 lg:p-8">
            {popup && (
                <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                    Friend request sent!
                </div>
            )}

            <FriendRequests friendRequests={friendRequests} respondToFriendRequest={respondToFriendRequest} />

            <MyFriends friendsList={friendsList} />

            <div className="bg-white border border-secondary p-8 rounded-2xl shadow-xs">
                <h2 id="search" className="text-2xl font-bold text-black mb-6">Search For New Friends</h2>
                <div className="flex flex-row gap-4 w-full items-center">
                    <Input
                        wrapperClassName="flex-1 !focus-within:ring-0"
                        icon={Search}
                        type="text"
                        name="query"
                        placeholder="Search for friends by name..."
                        value={query}
                        onChange={(value) => setQuery(value)}
                    />
                    <Button 
                        color="secondary" 
                        size='md' 
                        onClick={handleSearch}
                        className="px-8 h-11"
                    >
                        Search
                    </Button>
                </div>

                <ul className="flex flex-col gap-4 mt-8">
                    {results.length === 0 && query && (
                        <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed">
                            <p className="text-tertiary">No results found for "{query}"</p>
                        </div>
                    )}
                    {results.map((friend) => (
                        <li className="flex flex-row justify-between items-center bg-white border border-secondary p-5 rounded-xl shadow-xs hover:shadow-sm transition-all" key={friend.id}>
                            <div className="flex flex-col gap-1">
                                <span className="text-lg text-black font-semibold">{friend.username}</span>
                                <div className="flex flex-col text-sm text-tertiary">
                                    <span>{friend.university}</span>
                                    <span>{friend.major} • Class of {friend.grad_year}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {friend.status === 0 ? (
                                    <Button
                                        className="text-white bg-[#607196] !border-0 !ring-0 shadow-none opacity-80"
                                        size="sm"
                                        color="tertiary"
                                        disabled
                                    >
                                        Pending request
                                    </Button>
                                ) : friend.status === 1 ? (
                                    <Button
                                        className="text-white bg-green-500 !border-0 !ring-0 shadow-none pointer-events-none"
                                        size="sm"
                                        color="tertiary"
                                    >
                                        Friends
                                    </Button>
                                ) : (
                                    <Button
                                        className="text-black bg-[#ffc759] hover:bg-[#ffc759]/90 !border-0 !ring-0 shadow-none px-6"
                                        size="sm"
                                        color="tertiary"
                                        onClick={() => handleAddFriend(friend.id)}
                                    >
                                        Add Friend
                                    </Button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-12">
                <h2 id="schedule" className="text-2xl font-bold text-black mb-6">Friend's and My Schedule</h2>
                <div className="mb-6 flex flex-wrap gap-2">
                    {uniqueOwners.map(owner => (
                        <button
                            key={owner}
                            onClick={() => toggleOwner(owner)}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                                selectedOwners.includes(owner)
                                    ? "bg-[#607196] text-white border-[#607196]"
                                    : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                            }`}
                        >
                            {owner}
                        </button>
                    ))}
                </div>

                <div className="p-6 bg-white rounded-2xl shadow-xs border border-secondary w-full overflow-hidden">
                    <div className="flex flex-row overflow-x-auto gap-1 pb-4 min-h-[450px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                        {days.map((day) => {
                            const dayClasses = filteredClasses.filter(course =>
                                course.day && (
                                    course.day.toLowerCase() === day.toLowerCase() ||
                                    course.day.toLowerCase() === day.slice(0, 3).toLowerCase()
                                )
                            );

                            return (
                                <div key={day} className="flex-1 min-w-[160px] flex flex-col gap-4 border-r border-gray-100 last:border-r-0 px-3 first:pl-0 last:pr-0">
                                    <div className="sticky top-0 bg-white z-10 pb-3 border-b-2 border-blue-500 mb-2">
                                        <h3 className="text-xs font-bold text-gray-800 text-center uppercase tracking-wide">
                                            {day}
                                        </h3>
                                    </div>

                                    <div className="flex flex-col gap-3 flex-1">
                                        {dayClasses.length > 0 ? (
                                            dayClasses.map((course, index) => (
                                                <div
                                                    key={index}
                                                    className={`flex flex-col p-4 rounded-xl border transition-all hover:shadow-sm group ${
                                                        course.owner === "Me" 
                                                        ? "bg-blue-50/50 border-blue-100 hover:border-blue-200" 
                                                        : "bg-gray-50 border-gray-200 hover:border-gray-300"
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                            course.owner === "Me" ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-700"
                                                        }`}>
                                                            {course.owner === "Me" ? "Me" : course.owner}
                                                        </span>
                                                    </div>
                                                    <h4 className="text-xs font-bold text-gray-800 mb-2 line-clamp-2 leading-relaxed">
                                                        {course.course}
                                                    </h4>
                                                    <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-gray-100/50">
                                                        <p className="text-[10px] text-gray-600 flex items-center">
                                                            <svg className="w-3 h-3 mr-1.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {course.time}
                                                        </p>
                                                        <p className="text-[10px] text-gray-600 flex items-center truncate">
                                                            <svg className="w-3 h-3 mr-1.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            </svg>
                                                            {course.location}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex-1 flex items-center justify-center p-4 text-center bg-gray-50/30 rounded-xl border border-dashed border-gray-200 min-h-[120px]">
                                                <p className="text-[10px] text-gray-400 italic">No classes</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filteredClasses.length === 0 && (
                        <div className="p-12 text-center bg-gray-50 rounded-xl border border-dashed border-secondary">
                            <p className="text-gray-500">
                                {selectedOwners.length === 0 
                                    ? "Select at least one person to see their schedule." 
                                    : "No classes found for the selection."}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SearchFriend;
