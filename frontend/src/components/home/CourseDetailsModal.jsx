import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/utils/api";
import { T, FF, MonoLabel, Avatar, Icon } from "@/components/shared/brand";

const COURSE_PALETTE = [
  { bg: "#F4A28A", code: "#5F2614" },
  { bg: "#DCF5A9", code: "#3F5E14" },
  { bg: "#E5D5F2", code: "#5A3A85" },
  { bg: "#F6D9C1", code: "#7A4520" },
  { bg: "#CDE6D2", code: "#2D5538" },
  { bg: "#1F1A22", code: "#F8F4ED" },
];
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const paletteFor = (id) => COURSE_PALETTE[hashStr(id) % COURSE_PALETTE.length];

const fmtTime12 = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const ap = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, "0")}${ap}`;
};

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const ownerInitial = (name) => (name?.[0] || "?").toLowerCase();

// ─── Master row in the left list (cluster mode) ─────────────────────
const ClassRow = ({ entry, active, onSelect }) => {
  const pal = paletteFor(entry.courseId);
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="w-full flex items-center gap-3 rounded-2xl p-3 transition-colors text-left"
      style={{
        background: active ? T.ink : "#fff",
        color: active ? T.cream : T.ink,
        border: active ? "none" : `1px solid ${T.ink08}`,
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: pal.bg, color: pal.code }}
      >
        <span style={{ fontFamily: FF.serif, fontSize: 14, letterSpacing: -0.3 }}>
          {ownerInitial(entry.owners[0] || entry.courseId)}
        </span>
      </div>
      <div className="min-w-0">
        <div
          className="text-[11px] uppercase font-semibold leading-none"
          style={{ fontFamily: FF.mono, letterSpacing: 1 }}
        >
          {entry.courseId}
        </div>
        <div
          className="text-xs mt-1 truncate lowercase"
          style={{
            fontFamily: FF.sans,
            color: active ? "rgba(248,244,237,0.7)" : T.ink60,
          }}
        >
          {entry.location || "—"}
        </div>
      </div>
    </button>
  );
};

// ─── Right-hand details panel ────────────────────────────────────────
const DetailsPanel = ({ entry, fetchedCourse }) => {
  const pal = paletteFor(entry.courseId);
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const upcomingExams = (fetchedCourse?.exams || [])
    .filter((e) => new Date(e.exam_date) >= todayStart)
    .sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date))
    .slice(0, 4);
  const upcomingAssignments = (fetchedCourse?.assignments || [])
    .filter((a) => new Date(a.assignment_due) >= todayStart)
    .sort((a, b) => new Date(a.assignment_due) - new Date(b.assignment_due))
    .slice(0, 4);
  const currentWeek = (() => {
    const sorted = [...(fetchedCourse?.weeks || [])].sort(
      (a, b) => new Date(a.week_date) - new Date(b.week_date)
    );
    let cur = null;
    sorted.forEach((w) => {
      if (new Date(w.week_date) <= todayStart) cur = w;
    });
    return cur;
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Header banner */}
      <div
        className="rounded-2xl p-4 relative overflow-hidden"
        style={{ background: pal.bg, color: T.ink }}
      >
        <div
          className="text-[11px] uppercase font-semibold leading-none"
          style={{ fontFamily: FF.mono, color: pal.code, letterSpacing: 1 }}
        >
          {entry.courseId}
        </div>
        <h2
          className="text-3xl mt-1.5 lowercase leading-tight"
          style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}
        >
          {fetchedCourse?.course_name || entry.courseName || entry.course}
        </h2>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span
            className="text-[11px] uppercase"
            style={{ fontFamily: FF.mono, color: pal.code, letterSpacing: 0.8 }}
          >
            {entry.dayKey} · {fmtTime12(entry.startStr)}–{fmtTime12(entry.endStr)}
          </span>
          {entry.location && (
            <span
              className="text-[11px] uppercase"
              style={{ fontFamily: FF.mono, color: pal.code, opacity: 0.85 }}
            >
              · {entry.location}
            </span>
          )}
        </div>
      </div>

      {entry.owners?.length > 0 && (
        <div>
          <MonoLabel>who's in this</MonoLabel>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {entry.owners.slice(0, 6).map((o, i) => (
              <span
                key={`${o}-${i}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-ink-8 text-xs"
                style={{ fontFamily: FF.sans }}
              >
                <Avatar name={ownerInitial(o)} size={16} bg={pal.bg} fg={pal.code} />
                <span className="lowercase">{o === "Me" ? "u" : o}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {currentWeek && (
        <div>
          <MonoLabel>this week</MonoLabel>
          <p
            className="text-base text-ink mt-1.5 lowercase"
            style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}
          >
            <span className="font-semibold">wk {currentWeek.week_number}:</span>{" "}
            {currentWeek.week_topic}
          </p>
        </div>
      )}

      {(upcomingAssignments.length > 0 || upcomingExams.length > 0) && (
        <div>
          <MonoLabel>upcoming</MonoLabel>
          <div className="flex flex-col gap-2 mt-2">
            {upcomingExams.map((e, i) => (
              <div
                key={`ex-${i}`}
                className="flex items-start gap-2 bg-white rounded-xl p-3 border border-ink-8"
              >
                <span
                  className="text-[10px] uppercase font-semibold flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                  style={{
                    fontFamily: FF.mono,
                    background: T.coralLt,
                    color: T.coralDk,
                    letterSpacing: 0.8,
                  }}
                >
                  exam
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink lowercase">{e.exam_topic}</p>
                  <p
                    className="text-[10px] text-ink-60 mt-0.5"
                    style={{ fontFamily: FF.mono }}
                  >
                    {fmtDate(e.exam_date)}
                  </p>
                </div>
              </div>
            ))}
            {upcomingAssignments.map((a, i) => (
              <div
                key={`as-${i}`}
                className="flex items-start gap-2 bg-white rounded-xl p-3 border border-ink-8"
              >
                <span
                  className="text-[10px] uppercase font-semibold flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                  style={{
                    fontFamily: FF.mono,
                    background: "#E8F5D7",
                    color: "#3F5E14",
                    letterSpacing: 0.8,
                  }}
                >
                  due
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink lowercase">{a.assignment_topic}</p>
                  <p
                    className="text-[10px] text-ink-60 mt-0.5"
                    style={{ fontFamily: FF.mono }}
                  >
                    {fmtDate(a.assignment_due)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fetchedCourse?.has_ai_content && (
        <a
          href={`/class/${entry.baseCourse || entry.courseId}`}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold lowercase mt-1"
          style={{ background: T.ink, color: T.cream, fontFamily: FF.sans }}
        >
          full course page →
        </a>
      )}
    </div>
  );
};

// ─── Modal shell ────────────────────────────────────────────────────
const CourseDetailsModal = ({ cluster = [], onClose }) => {
  const [selected, setSelected] = useState(cluster[0] || null);
  const [coursesById, setCoursesById] = useState({});

  // Fetch courses once when modal opens; key by course_id (e.g. "CS 188").
  useEffect(() => {
    let cancelled = false;
    authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        const map = {};
        (Array.isArray(data) ? data : []).forEach((c) => {
          if (!c.parent_course) {
            map[c.course_id] = c;
          } else if (!map[c.course_id]) {
            map[c.course_id] = c;
          }
        });
        setCoursesById(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!selected) return null;
  const isCluster = cluster.length > 1;
  const matched =
    coursesById[selected.baseCourse] ||
    coursesById[selected.courseId] ||
    null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-cream w-full max-w-3xl rounded-3xl shadow-xl border border-ink-8 overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-8">
          <MonoLabel>
            {isCluster ? `overlapping · ${cluster.length} classes` : "class details"}
          </MonoLabel>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="w-8 h-8 rounded-full bg-white border border-ink-8 flex items-center justify-center hover:bg-ink hover:text-cream transition-colors"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Body */}
        <div
          className={`grid gap-4 overflow-y-auto p-5 ${
            isCluster ? "grid-cols-1 md:grid-cols-[200px_1fr]" : "grid-cols-1"
          }`}
        >
          {isCluster && (
            <aside className="flex flex-col gap-2">
              {cluster.map((c, i) => (
                <ClassRow
                  key={`${c.courseId}-${i}`}
                  entry={c}
                  active={selected === c}
                  onSelect={setSelected}
                />
              ))}
            </aside>
          )}
          <DetailsPanel entry={selected} fetchedCourse={matched} />
        </div>
      </div>
    </div>
  );
};

export default CourseDetailsModal;
