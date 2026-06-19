import { useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "@/utils/api";

// Polls /api/availability/friends/ every 60s (same cadence the old friends page
// used) and exposes a username → status map. Status ∈ "free"|"in_class"|
// "free_soon"|"unknown". Used only to bias the inbox sort ("free now" first).
export function useFriendsAvailability() {
  const [friendsAvail, setFriendsAvail] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAvail = async () => {
      try {
        const res = await authenticatedFetch(
          `${import.meta.env.VITE_API_URL}/api/availability/friends/`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setFriendsAvail(data || {});
      } catch {
        /* transient — keep last good map */
      }
    };
    fetchAvail();
    timerRef.current = setInterval(fetchAvail, 60000);
    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
    };
  }, []);

  // Response is keyed by friend id; entries carry { username, status, ... }.
  const statusByUsername = useMemo(() => {
    const m = new Map();
    Object.values(friendsAvail).forEach((v) => {
      if (v?.username) m.set(v.username, v.status || "unknown");
    });
    return m;
  }, [friendsAvail]);

  return { friendsAvail, statusByUsername };
}
