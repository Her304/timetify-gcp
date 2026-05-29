import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/utils/api";

export function useChats() {
  const [chatsByFriendId, setChatsByFriendId] = useState({});
  const [groupChats, setGroupChats] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await authenticatedFetch(
          `${import.meta.env.VITE_API_URL}/api/chats/`
        );
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const dmMap = {};
        const groups = [];
        (data.chats || []).forEach((c) => {
          if (c.room_type === "group") groups.push(c);
          else if (c.other_user) dmMap[c.other_user.id] = c;
        });
        setChatsByFriendId(dmMap);
        setGroupChats(groups);
      } catch {
        // network blip — keep last good map; next focus/mount will retry
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { chatsByFriendId, groupChats };
}
