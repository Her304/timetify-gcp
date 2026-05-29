import { useMemo, useState } from "react";
import { seededShuffle } from "../utils";

export function useOrderedTiles({ acceptedFriends, snapsByUser, filter }) {
  const [randomSeed] = useState(() => Math.random());

  return useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const snappedToday = (f) =>
      f.last_snap_at && new Date(f.last_snap_at) >= startOfDay;
    const sharesClass = (f) => (f.shared_courses || []).length > 0;
    const hasSnap = (f) => snapsByUser.has(f.username);

    let primary = [];
    let rest = [];
    if (filter === "today") {
      primary = acceptedFriends.filter(snappedToday);
      rest = acceptedFriends.filter((f) => !snappedToday(f));
    } else if (filter === "my_classes") {
      primary = acceptedFriends.filter(sharesClass);
      rest = acceptedFriends.filter((f) => !sharesClass(f));
    } else {
      primary = acceptedFriends.filter(hasSnap);
      rest = acceptedFriends.filter((f) => !hasSnap(f));
    }

    primary.sort(
      (a, b) => new Date(b.last_snap_at || 0) - new Date(a.last_snap_at || 0)
    );
    const shuffledRest = seededShuffle(rest, randomSeed);

    return [...primary, ...shuffledRest].map((f) => ({
      username: f.username,
      friend: f,
      snaps: snapsByUser.get(f.username) || [],
      hasSnap: hasSnap(f),
    }));
  }, [acceptedFriends, snapsByUser, filter, randomSeed]);
}
