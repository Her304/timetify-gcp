import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/utils/api";
import { T, FF, MonoLabel, Avatar, Blob, Icon } from "@/components/shared/brand";
import CourseDetailsModal from "@/components/home/CourseDetailsModal";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const JS_TO_KEY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Stable per-course palette. The block treats `bg` as the fill and `dot` as the
// avatar-ring color so each course owns a coherent two-tone identity.
const COURSE_PALETTE = [
  { bg: "#F4A28A", dot: T.lime,    code: "#5F2614", label: T.ink,   tone: "coral" },
  { bg: "#DCF5A9", dot: T.coral,   code: "#3F5E14", label: T.ink,   tone: "lime"  },
  { bg: "#E5D5F2", dot: T.lime,    code: "#5A3A85", label: T.ink,   tone: "lilac" },
  { bg: "#F6D9C1", dot: T.lime,    code: "#7A4520", label: T.ink,   tone: "peach" },
  { bg: "#CDE6D2", dot: T.coral,   code: "#2D5538", label: T.ink,   tone: "mint"  },
  { bg: "#1F1A22", dot: T.coral,   code: "#F8F4ED", label: T.cream, tone: "ink"   },
];

const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const paletteFor = (courseId) => COURSE_PALETTE[hashStr(courseId) % COURSE_PALETTE.length];

const formatHourLabel = (h) => {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
};

const formatTime12 = (mins) => {
  if (mins == null) return "";
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
};

const formatRange = (s, e) => {
  if (s == null || e == null) return "";
  const fmt = (mins) => {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h24 >= 12 ? "pm" : "am";
    const h = ((h24 + 11) % 12) + 1;
    return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, "0")}${ap}`;
  };
  return `${fmt(s)}–${fmt(e)}`;
};

const weekDates = () => {
  const today = new Date();
  const dow = today.getDay();
  const offsetToMon = (dow + 6) % 7;
  const mon = new Date(today);
  mon.setDate(today.getDate() - offsetToMon);
  const out = {};
  DAYS.forEach((k, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    out[k] = d;
  });
  return out;
};

const normalizeDayKey = (raw) => {
  if (!raw) return null;
  const v = String(raw).toUpperCase().slice(0, 3);
  return DAYS.includes(v) ? v : null;
};

// Group a day's entries into time clusters (any pairwise overlap merges).
// Returns: array of clusters, each cluster a sorted list of entries.
const buildClusters = (entries) => {
  const sorted = [...entries].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const clusters = [];
  let cur = null;
  let curMaxEnd = -Infinity;
  sorted.forEach((e) => {
    if (e.start == null || e.end == null) return;
    if (!cur || e.start >= curMaxEnd) {
      cur = [e];
      curMaxEnd = e.end;
      clusters.push(cur);
    } else {
      cur.push(e);
      curMaxEnd = Math.max(curMaxEnd, e.end);
    }
  });
  return clusters;
};

const ownerInitial = (name) => (name?.[0] || "?").toLowerCase();
const avatarBgFor = (name) =>
  name === "Me"
    ? T.coral
    : COURSE_PALETTE[hashStr(name) % (COURSE_PALETTE.length - 1)].bg;

// Stack of friend avatars; up to `max` chips, then a "+N" pill.
const AvatarStack = ({ owners = [], max = 3, size = 20, currentUser, ring = "#fff" }) => {
  const shown = owners.slice(0, max);
  const rest = Math.max(0, owners.length - shown.length);
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((o, i) => {
        const isMe = o === "Me" || o === currentUser?.username;
        return (
          <Avatar
            key={`${o}-${i}`}
            name={ownerInitial(o)}
            bg={isMe ? T.coral : avatarBgFor(o)}
            fg={isMe ? "#fff" : T.ink}
            size={size}
            ring={ring}
          />
        );
      })}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full font-semibold"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.42,
            background: T.ink,
            color: T.cream,
            fontFamily: FF.mono,
            boxShadow: `0 0 0 2px ${ring}`,
            letterSpacing: -0.3,
          }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
};

export const WeekView = ({ allClasses = [], currentUser, onAddClass }) => {
  const dates = useMemo(() => weekDates(), []);
  const todayKey = JS_TO_KEY[new Date().getDay()];

  // Live clock — updates the header pill every 30s.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Modal state — opened by clicking a block or its "+N" chip.
  const [modalCluster, setModalCluster] = useState(null);

  // One-shot fetch of full course list so the "reminders for today" block
  // can read today's assignments/exams without an extra round-trip per row.
  const [myCourses, setMyCourses] = useState([]);
  useEffect(() => {
    let cancelled = false;
    authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setMyCourses(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const classesByDay = useMemo(() => {
    const out = {};
    DAYS.forEach((k) => (out[k] = []));
    const seen = new Map();
    allClasses.forEach((c) => {
      const k = normalizeDayKey(c.day);
      if (!k) return;
      const mapKey = `${k}|${c.course}|${c.start_time}|${c.classroom}`;
      if (seen.has(mapKey)) {
        const existing = seen.get(mapKey);
        const owners = new Set(existing.owners);
        (c.owner || "").split(/[,&]\s*/).forEach((o) => o && owners.add(o.trim()));
        existing.owners = Array.from(owners);
      } else {
        const owners = (c.owner || "")
          .split(/[,&]\s*/)
          .map((o) => o.trim())
          .filter(Boolean);
        const entry = {
          dayKey: k,
          course: c.course,
          baseCourse: c.base_course || c.course,
          courseId: c.course_id || c.base_course || c.course,
          location: c.classroom || c.location,
          start: toMinutes(c.start_time),
          end: toMinutes(c.end_time),
          startStr: c.start_time,
          endStr: c.end_time,
          courseName: c.course_name,
          owners,
          rawId: c.id,
        };
        seen.set(mapKey, entry);
        out[k].push(entry);
      }
    });
    DAYS.forEach((k) => out[k].sort((a, b) => (a.start ?? 0) - (b.start ?? 0)));
    return out;
  }, [allClasses]);

  // Auto-clamp the visible hour range to data, falling back to 8–18.
  const { startHour, endHour } = useMemo(() => {
    let minM = 8 * 60;
    let maxM = 18 * 60;
    Object.values(classesByDay).forEach((arr) =>
      arr.forEach((e) => {
        if (e.start != null) minM = Math.min(minM, e.start);
        if (e.end != null) maxM = Math.max(maxM, e.end);
      })
    );
    const startHour = Math.max(0, Math.floor(minM / 60));
    const endHour = Math.min(24, Math.ceil(maxM / 60));
    return { startHour, endHour: Math.max(endHour, startHour + 4) };
  }, [classesByDay]);

  const HOUR_PX = 64;
  const gridHeight = (endHour - startHour) * HOUR_PX;

  const liveNow = useMemo(
    () =>
      (classesByDay[todayKey] || []).filter(
        (e) => e.start != null && e.end != null && nowMins >= e.start && nowMins <= e.end
      ),
    [classesByDay, todayKey, nowMins]
  );

  const upNext = useMemo(
    () =>
      (classesByDay[todayKey] || [])
        .filter((e) => e.start != null && e.start > nowMins)
        .slice(0, 3),
    [classesByDay, todayKey, nowMins]
  );

  const todayCount = (classesByDay[todayKey] || []).length;

  const weekOfLabel = useMemo(() => {
    const mon = dates.MON;
    if (!mon) return "";
    return mon.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [dates]);

  const friendsLiveCount = useMemo(() => {
    const friends = new Set();
    liveNow.forEach((e) => e.owners.forEach((o) => o !== "Me" && friends.add(o)));
    return friends.size;
  }, [liveNow]);

  const dayLabel = todayKey;
  const timeLabel = useMemo(() => {
    const h24 = now.getHours();
    const m = now.getMinutes();
    const ap = h24 >= 12 ? "PM" : "AM";
    const h = ((h24 + 11) % 12) + 1;
    return `${h}:${String(m).padStart(2, "0")} ${ap}`;
  }, [now]);

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* ───── Header ───── */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <MonoLabel>week of {weekOfLabel.toLowerCase()}</MonoLabel>
          <h1
            className="text-5xl md:text-6xl text-ink mt-1 leading-none"
            style={{ fontFamily: FF.serif, letterSpacing: -1.4 }}
          >
            ur week, ur ppl
          </h1>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase text-white"
              style={{ background: T.coral, fontFamily: FF.mono, letterSpacing: 1.2 }}
            >
              <ClockGlyph />
              {dayLabel} · {timeLabel}
            </span>
            {friendsLiveCount > 0 && (
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase"
                style={{
                  background: T.coralLt,
                  color: T.coralDk,
                  fontFamily: FF.mono,
                  letterSpacing: 1.2,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: T.coral }} />
                {friendsLiveCount} friend{friendsLiveCount === 1 ? "" : "s"} live now
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onAddClass}
          className="px-5 py-2.5 rounded-full text-sm font-semibold text-cream bg-ink hover:opacity-90 transition-opacity lowercase"
        >
          + add class
        </button>
      </div>

      {/* ───── Calendar + side rail ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Calendar */}
        <div className="bg-white rounded-3xl border border-ink-8 overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 720 }}>
              {/* Day headers */}
              <div
                className="grid border-b border-ink-8"
                style={{ gridTemplateColumns: `56px repeat(${DAYS.length}, 1fr)` }}
              >
                <div />
                {DAYS.map((k) => {
                  const d = dates[k];
                  const isToday = k === todayKey;
                  return (
                    <div
                      key={k}
                      className="px-3 py-3"
                      style={{ background: isToday ? T.coralLt : "transparent" }}
                    >
                      <div
                        className="text-[10px] font-medium uppercase"
                        style={{
                          fontFamily: FF.mono,
                          color: isToday ? T.coralDk : T.ink60,
                          letterSpacing: 1.2,
                        }}
                      >
                        {k}
                      </div>
                      <div
                        className="text-2xl mt-0.5 leading-none"
                        style={{
                          fontFamily: FF.serif,
                          color: isToday ? T.coralDk : T.ink,
                          letterSpacing: -0.6,
                        }}
                      >
                        {d ? d.getDate() : ""}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Time grid */}
              <div
                className="grid relative"
                style={{
                  gridTemplateColumns: `56px repeat(${DAYS.length}, 1fr)`,
                  height: gridHeight,
                }}
              >
                {/* Time labels gutter */}
                <div className="relative">
                  {Array.from({ length: endHour - startHour }, (_, i) => {
                    const h = startHour + i;
                    return (
                      <div
                        key={h}
                        className="absolute left-0 right-0"
                        style={{ top: i * HOUR_PX }}
                      >
                        <span
                          className="absolute -top-2 right-3 text-[10px]"
                          style={{ fontFamily: FF.mono, color: T.ink40, letterSpacing: 0.5 }}
                        >
                          {formatHourLabel(h)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Day columns */}
                {DAYS.map((k) => {
                  const items = classesByDay[k] || [];
                  const isToday = k === todayKey;
                  const clusters = buildClusters(items);
                  return (
                    <div
                      key={k}
                      className="relative border-l border-ink-8"
                      style={{ background: isToday ? "rgba(237,106,74,0.05)" : "transparent" }}
                    >
                      {/* Hour grid lines */}
                      {Array.from({ length: endHour - startHour }, (_, i) => (
                        <div
                          key={i}
                          className="absolute left-0 right-0 border-t border-ink-8"
                          style={{ top: i * HOUR_PX }}
                        />
                      ))}

                      {/* Now line */}
                      {isToday && nowMins >= startHour * 60 && nowMins <= endHour * 60 && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none"
                          style={{
                            top: ((nowMins - startHour * 60) / 60) * HOUR_PX,
                            height: 2,
                            background: T.coral,
                          }}
                        >
                          <span
                            className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full"
                            style={{ background: T.coral }}
                          />
                        </div>
                      )}

                      {/* Class blocks — one tile per cluster, with a floating
                          "+N" chip when more than one class overlaps. */}
                      {clusters.map((cluster, cIdx) => {
                        const primary = cluster[0];
                        const extra = cluster.length - 1;
                        if (primary.start == null || primary.end == null) return null;
                        const top = ((primary.start - startHour * 60) / 60) * HOUR_PX;
                        const height = Math.max(
                          40,
                          ((primary.end - primary.start) / 60) * HOUR_PX - 4
                        );
                        return (
                          <CourseBlock
                            key={`c-${cIdx}`}
                            entry={primary}
                            cluster={cluster}
                            top={top}
                            height={height}
                            isLive={
                              isToday &&
                              nowMins >= primary.start &&
                              nowMins <= primary.end
                            }
                            extraCount={extra}
                            currentUser={currentUser}
                            onOpen={() => setModalCluster([primary])}
                            onOpenCluster={() => setModalCluster(cluster)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ───── Side rail ───── */}
        <div className="flex flex-col gap-4">
          <LiveNowCard liveNow={liveNow} currentUser={currentUser} />
          <TodayCard
            todayKey={todayKey}
            todayDate={dates[todayKey]}
            count={todayCount}
            liveNow={liveNow}
            upNext={upNext}
          />
          <RemindersCard myCourses={myCourses} />
        </div>
      </div>

      {modalCluster && (
        <CourseDetailsModal
          cluster={modalCluster}
          onClose={() => setModalCluster(null)}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

const ClockGlyph = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const CourseBlock = ({
  entry,
  top,
  height,
  isLive,
  extraCount = 0,
  currentUser,
  onOpen,
  onOpenCluster,
}) => {
  const pal = paletteFor(entry.courseId);
  const isDark = pal.tone === "ink";
  const ringColor = isDark ? T.ink : pal.bg;

  // Vertical layout when the block isn't tall enough for a horizontal split
  // (avatar left + two-line text right). Below ~52px we stack to keep all
  // three rows — course id, location, owner avatars — readable.
  const compact = height < 56;
  const avatarSize = compact ? 18 : 22;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute rounded-2xl overflow-hidden text-left flex"
      style={{
        top,
        left: 4,
        right: 4,
        height,
        background: pal.bg,
        color: pal.label,
        border: isLive ? `2px solid ${T.coral}` : "1px solid rgba(0,0,0,0.04)",
        boxShadow: isLive ? "0 0 0 3px rgba(237,106,74,0.25)" : "none",
        cursor: "pointer",
        padding: compact ? "6px 8px" : "8px 10px",
        gap: compact ? 6 : 8,
        flexDirection: compact ? "column" : "row",
        alignItems: compact ? "flex-start" : "center",
        justifyContent: compact ? "space-between" : "flex-start",
      }}
    >
      {!compact && (
        <div className="flex-shrink-0">
          <AvatarStack
            owners={entry.owners}
            currentUser={currentUser}
            max={2}
            size={avatarSize}
            ring={ringColor}
          />
        </div>
      )}
      <div className="min-w-0 flex-1 w-full">
        <div
          className="text-[10px] font-semibold uppercase truncate leading-none"
          style={{ fontFamily: FF.mono, color: pal.code, letterSpacing: 0.8 }}
        >
          {entry.courseId}
          {isLive && (
            <span className="ml-1.5" style={{ color: T.coral }}>
              · live
            </span>
          )}
        </div>
        {entry.location && (
          <div
            className="text-[10px] mt-1 lowercase truncate"
            style={{
              fontFamily: FF.mono,
              color: pal.code,
              opacity: 0.85,
              letterSpacing: 0.2,
            }}
          >
            · {entry.location}
          </div>
        )}
      </div>
      {compact && (
        <div>
          <AvatarStack
            owners={entry.owners}
            currentUser={currentUser}
            max={2}
            size={avatarSize}
            ring={ringColor}
          />
        </div>
      )}

      {extraCount > 0 && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onOpenCluster && onOpenCluster();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onOpenCluster && onOpenCluster();
            }
          }}
          className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase cursor-pointer"
          style={{
            background: "#fff",
            color: T.coralDk,
            border: `1.5px solid ${T.coral}`,
            fontFamily: FF.mono,
            letterSpacing: 0.4,
          }}
          aria-label={`see ${extraCount} more overlapping classes`}
        >
          +{extraCount}
        </span>
      )}
    </button>
  );
};

const LiveNowCard = ({ liveNow, currentUser }) => {
  const first = liveNow[0];
  const friendsInClass = first ? first.owners.filter((o) => o !== "Me") : [];
  return (
    <div
      className="rounded-3xl p-5 relative overflow-hidden"
      style={{ background: T.ink, color: T.cream, minHeight: 170 }}
    >
      <Blob
        color={T.coral}
        size={170}
        seed={2}
        style={{ position: "absolute", right: -50, bottom: -55, opacity: 0.85 }}
      />
      <div className="relative">
        <div
          className="text-[10px] uppercase font-medium flex items-center gap-2"
          style={{
            fontFamily: FF.mono,
            color: "rgba(248,244,237,0.65)",
            letterSpacing: 1.2,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.coral }} />
          live now
        </div>
        {!first ? (
          <p
            className="mt-3 text-xl"
            style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}
          >
            nothing live rn.
          </p>
        ) : (
          <>
            <h3
              className="text-3xl mt-1 leading-tight lowercase"
              style={{ fontFamily: FF.serif, letterSpacing: -1 }}
            >
              {friendsInClass.length > 0
                ? `${friendsInClass.length} friend${friendsInClass.length === 1 ? "" : "s"} in ${first.courseId.toLowerCase()}`
                : `ur in ${first.courseId.toLowerCase()}`}
            </h3>
            <div className="flex items-center gap-3 mt-4">
              <AvatarStack
                owners={first.owners.length ? first.owners : [currentUser?.username || "me"]}
                currentUser={currentUser}
                max={3}
                size={32}
                ring={T.ink}
              />
              <a
                href="/feed"
                className="text-xs font-medium text-cream/80 hover:text-cream lowercase"
                style={{ fontFamily: FF.sans }}
              >
                + more
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Reminders for today (assignments + exams due today across courses) ──
const RemindersCard = ({ myCourses = [] }) => {
  const items = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const isToday = (iso) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d >= todayStart && d < todayEnd;
    };
    const out = [];
    myCourses.forEach((c) => {
      (c.exams || []).forEach((e) => {
        if (isToday(e.exam_date)) {
          out.push({
            kind: "exam",
            courseId: c.course_id,
            topic: e.exam_topic,
            date: e.exam_date,
          });
        }
      });
      (c.assignments || []).forEach((a) => {
        if (isToday(a.assignment_due)) {
          out.push({
            kind: "due",
            courseId: c.course_id,
            topic: a.assignment_topic,
            date: a.assignment_due,
          });
        }
      });
    });
    return out.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [myCourses]);

  return (
    <div className="bg-white rounded-3xl border border-ink-8 p-5">
      <div className="flex items-center justify-between">
        <MonoLabel>reminders for today</MonoLabel>
        <MonoLabel>
          {items.length} item{items.length === 1 ? "" : "s"}
        </MonoLabel>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-60 lowercase">all clear today ✓</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-cream rounded-xl px-3 py-2 border border-ink-8"
            >
              <span
                className="text-[9px] uppercase font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
                style={{
                  fontFamily: FF.mono,
                  background: it.kind === "exam" ? T.coralLt : "#E8F5D7",
                  color: it.kind === "exam" ? T.coralDk : "#3F5E14",
                  letterSpacing: 0.8,
                }}
              >
                {it.kind}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm lowercase truncate"
                  style={{ fontFamily: FF.serif, letterSpacing: -0.2 }}
                >
                  {it.topic}
                </p>
                <p
                  className="text-[10px] text-ink-60 mt-0.5 uppercase"
                  style={{ fontFamily: FF.mono, letterSpacing: 0.8 }}
                >
                  {it.courseId}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TodayCard = ({ todayKey, todayDate, count, liveNow, upNext }) => {
  const live = liveNow[0];
  const livePal = live ? paletteFor(live.courseId) : null;
  const dateLabel = todayDate ? todayDate.getDate() : "";
  return (
    <div className="bg-white rounded-3xl border border-ink-8 p-5">
      <div className="flex items-center justify-between">
        <MonoLabel>
          today · {todayKey.toLowerCase()} {dateLabel}
        </MonoLabel>
        <MonoLabel>
          {count} class{count === 1 ? "" : "es"}
        </MonoLabel>
      </div>

      {live && (
        <div
          className="relative rounded-2xl p-4 mt-4 overflow-hidden"
          style={{ background: livePal.bg, color: livePal.label }}
        >
          <Blob
            color={livePal.dot}
            size={120}
            seed={3}
            style={{
              position: "absolute",
              right: -35,
              bottom: -45,
              opacity: 0.35,
              pointerEvents: "none",
            }}
          />
          <div className="relative flex items-start justify-between gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] uppercase font-semibold"
              style={{
                background: "#fff",
                color: T.coralDk,
                fontFamily: FF.mono,
                letterSpacing: 1,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: T.coral }} />
              happening now
            </span>
            <span
              className="text-[10px] uppercase whitespace-nowrap"
              style={{ fontFamily: FF.mono, color: livePal.code, letterSpacing: 0.5 }}
            >
              {formatRange(live.start, live.end)}
            </span>
          </div>
          <div
            className="relative text-[11px] uppercase font-semibold mt-3"
            style={{ fontFamily: FF.mono, color: livePal.code, letterSpacing: 1 }}
          >
            {live.courseId}
          </div>
          <div
            className="relative text-2xl mt-1 lowercase leading-tight"
            style={{ fontFamily: FF.serif, letterSpacing: -0.6 }}
          >
            {live.courseName || live.course}
          </div>
          {live.location && (
            <div
              className="relative text-[11px] mt-2 lowercase"
              style={{ fontFamily: FF.mono, color: livePal.code, opacity: 0.85 }}
            >
              · {live.location}
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <MonoLabel>coming up</MonoLabel>
        {upNext.length === 0 ? (
          <p className="mt-3 text-sm text-ink-60 lowercase">nothing else today.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {upNext.map((e, i) => {
              const pal = paletteFor(e.courseId);
              return (
                <div key={i} className="flex items-start gap-3 relative">
                  <div className="flex flex-col items-center pt-1">
                    <span
                      className="w-3 h-3 rounded-full border-2"
                      style={{ borderColor: pal.dot, background: "#fff" }}
                    />
                    {i < upNext.length - 1 && (
                      <span
                        className="w-px flex-1 mt-1"
                        style={{ background: T.ink08, minHeight: 24 }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-sm font-semibold lowercase"
                        style={{ fontFamily: FF.sans }}
                      >
                        {formatTime12(e.start).toLowerCase().replace(" ", "")}
                      </span>
                      <span
                        className="text-[10px] uppercase"
                        style={{ fontFamily: FF.mono, color: T.ink60, letterSpacing: 0.8 }}
                      >
                        {e.courseId}
                      </span>
                    </div>
                    <div
                      className="text-base lowercase leading-tight mt-0.5"
                      style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
                    >
                      {e.courseName || e.course}
                    </div>
                    {e.location && (
                      <div
                        className="text-[10px] mt-1 lowercase"
                        style={{ fontFamily: FF.mono, color: T.ink60 }}
                      >
                        · {e.location}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
