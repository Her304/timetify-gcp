import { T } from "@/components/shared/brand";

export const timeAgo = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const AVATAR_BG = [T.coral, T.lilac, "#f0c4a8", "#b8d8c2", T.lime];

export const colorForUser = (name) => AVATAR_BG[hashStr(name) % AVATAR_BG.length];

export const todayLabel = () => {
  const d = new Date();
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return `${day} · ${month} ${d.getDate()}`;
};

export const minutesSince = (iso) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

export const isLiveSnap = (iso) => minutesSince(iso) < 30;

export const seededShuffle = (arr, seed) => {
  const a = [...arr];
  let s = Math.floor(seed * 4294967296) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const toMins = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
