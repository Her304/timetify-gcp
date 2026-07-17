import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../../utils/api";
import { T, FF, MonoLabel, Icon, PillBtn } from "@/components/shared/brand";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const editInputCls = "w-full px-3 py-2 text-sm rounded-xl border border-ink-15 bg-cream focus:outline-none focus:border-coral";
// Fields nested inside a cream item card (weeks/exams/assignments) get a white
// fill instead — cream-on-cream made the boundary between card and field
// unreadable, and an empty flex-1 input with no min-w-0 was collapsing down to
// its intrinsic min-content size (a tiny nub) instead of filling the row.
const nestedInputCls = "w-full min-w-0 px-3 py-2 text-sm rounded-xl border border-ink-15 bg-white focus:outline-none focus:border-coral";
const fieldLabelCls = "text-[10px] text-ink-40 uppercase tracking-widest";

// Icon-only delete button for an item row — round touch target with a hover fill,
// sized to match the ~36px row height of a nestedInputCls field.
const RemoveItemBtn = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 hover:bg-white transition-colors"
  >
    <Icon name="trash" size={14} color={T.coralDk} />
  </button>
);

const EditorSectionHead = ({ label, onAdd }) => (
  <div className="flex justify-between items-center border-b border-ink-8 pb-2">
    <MonoLabel>{label}</MonoLabel>
    <button type="button" onClick={onAdd} className="text-xs font-semibold text-coral hover:text-coral-dark lowercase flex items-center gap-1">
      <Icon name="plus" size={12} stroke={2.6} />
      add
    </button>
  </div>
);

// Inline editor for a saved course: core fields + add/edit/delete of weeks,
// exams and assignments. Kept at module scope so it isn't re-created each render.
const CourseEditor = ({ draft, setDraft, onSave, onCancel, saving, error, onDelete, dropping }) => {
  const [confirmDrop, setConfirmDrop] = useState(false);
  const setField = (f, v) => setDraft((d) => ({ ...d, [f]: v }));
  const setItem = (kind, i, f, v) => setDraft((d) => {
    const arr = [...d[kind]];
    arr[i] = { ...arr[i], [f]: v };
    return { ...d, [kind]: arr };
  });
  const removeItem = (kind, i) => setDraft((d) => ({ ...d, [kind]: d[kind].filter((_, idx) => idx !== i) }));
  const addItem = (kind) => setDraft((d) => {
    const blank = kind === "weeks"
      ? { week_number: d.weeks.reduce((m, w) => Math.max(m, Number(w.week_number) || 0), 0) + 1, week_topic: "", week_date: d.start_date || "" }
      : kind === "exams"
        ? { exam_topic: "", exam_date: "", exam_details: "" }
        : { assignment_topic: "", assignment_due: "", assignment_detail: "" };
    return { ...d, [kind]: [...d[kind], blank] };
  });

  return (
    <div className="bg-white border border-ink-8 rounded-2xl p-5 space-y-6 shadow-sm">
      {/* core info */}
      <div className="space-y-3">
        <MonoLabel>class info</MonoLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-ink-60 lowercase">name</span>
            <input className={editInputCls} value={draft.course_name} onChange={(e) => setField("course_name", e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-ink-60 lowercase">classroom</span>
            <input className={editInputCls} value={draft.classroom} onChange={(e) => setField("classroom", e.target.value)} placeholder="e.g. SB212" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-ink-60 lowercase">days</span>
            <input className={editInputCls} value={draft.rep_date} onChange={(e) => setField("rep_date", e.target.value)} placeholder="Monday,Wednesday" />
          </label>
          <div className="block space-y-1">
            <span className="text-xs text-ink-60 lowercase">time</span>
            <div className="flex items-center gap-2">
              <input className={editInputCls} value={draft.start_time} onChange={(e) => setField("start_time", e.target.value)} placeholder="13:30" />
              <span className="text-ink-40">→</span>
              <input className={editInputCls} value={draft.end_time} onChange={(e) => setField("end_time", e.target.value)} placeholder="15:30" />
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-ink-60 lowercase">starts</span>
            <input type="date" className={editInputCls} value={draft.start_date} onChange={(e) => setField("start_date", e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-ink-60 lowercase">ends</span>
            <input type="date" className={editInputCls} value={draft.end_date} onChange={(e) => setField("end_date", e.target.value)} />
          </label>
        </div>
      </div>

      {/* weeks */}
      <div className="space-y-3">
        <EditorSectionHead label="weeks" onAdd={() => addItem("weeks")} />
        {draft.weeks.map((w, i) => (
          <div key={i} className="bg-cream rounded-xl border border-ink-8 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="text-xs text-ink-60 shrink-0 px-2.5 py-2 rounded-lg bg-white border border-ink-8"
                style={{ fontFamily: FF.mono }}
              >
                wk {w.week_number}
              </span>
              <input className={`${nestedInputCls} flex-1`} placeholder="topic" value={w.week_topic} onChange={(e) => setItem("weeks", i, "week_topic", e.target.value)} />
              <RemoveItemBtn onClick={() => removeItem("weeks", i)} label={`remove week ${w.week_number}`} />
            </div>
            <label className="block space-y-1">
              <span className={fieldLabelCls} style={{ fontFamily: FF.mono }}>starts</span>
              <input type="date" className={`${nestedInputCls} sm:w-52`} value={w.week_date} onChange={(e) => setItem("weeks", i, "week_date", e.target.value)} />
            </label>
          </div>
        ))}
        {draft.weeks.length === 0 && <p className="text-xs text-ink-40">no weeks.</p>}
      </div>

      {/* exams */}
      <div className="space-y-3">
        <EditorSectionHead label="exams" onAdd={() => addItem("exams")} />
        {draft.exams.map((e, i) => (
          <div key={i} className="bg-cream rounded-xl border border-ink-8 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input className={`${nestedInputCls} flex-1`} placeholder="exam title" value={e.exam_topic} onChange={(ev) => setItem("exams", i, "exam_topic", ev.target.value)} />
              <RemoveItemBtn onClick={() => removeItem("exams", i)} label="remove exam" />
            </div>
            <label className="block space-y-1">
              <span className={fieldLabelCls} style={{ fontFamily: FF.mono }}>date</span>
              <input type="date" className={`${nestedInputCls} sm:w-52`} value={e.exam_date} onChange={(ev) => setItem("exams", i, "exam_date", ev.target.value)} />
            </label>
            <input className={nestedInputCls} placeholder="details (optional)" value={e.exam_details || ""} onChange={(ev) => setItem("exams", i, "exam_details", ev.target.value)} />
          </div>
        ))}
        {draft.exams.length === 0 && <p className="text-xs text-ink-40">no exams.</p>}
      </div>

      {/* assignments */}
      <div className="space-y-3">
        <EditorSectionHead label="assignments" onAdd={() => addItem("assignments")} />
        {draft.assignments.map((a, i) => (
          <div key={i} className="bg-cream rounded-xl border border-ink-8 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input className={`${nestedInputCls} flex-1`} placeholder="assignment title" value={a.assignment_topic} onChange={(ev) => setItem("assignments", i, "assignment_topic", ev.target.value)} />
              <RemoveItemBtn onClick={() => removeItem("assignments", i)} label="remove assignment" />
            </div>
            <label className="block space-y-1">
              <span className={fieldLabelCls} style={{ fontFamily: FF.mono }}>due</span>
              <input type="date" className={`${nestedInputCls} sm:w-52`} value={a.assignment_due} onChange={(ev) => setItem("assignments", i, "assignment_due", ev.target.value)} />
            </label>
            <input className={nestedInputCls} placeholder="details (optional)" value={a.assignment_detail || ""} onChange={(ev) => setItem("assignments", i, "assignment_detail", ev.target.value)} />
          </div>
        ))}
        {draft.assignments.length === 0 && <p className="text-xs text-ink-40">no assignments.</p>}
      </div>

      {/* footer */}
      <div className="flex flex-col gap-2 pt-4 border-t border-ink-8">
        {error && <p className="text-xs text-coral-dark lowercase" style={{ fontFamily: FF.mono }}>{error}</p>}
        <div className="flex gap-3">
          <PillBtn onClick={onCancel} bg="#fff" fg={T.ink60} size="lg" style={{ flex: 1, border: `1px solid ${T.ink15}` }}>
            cancel
          </PillBtn>
          <PillBtn onClick={onSave} disabled={saving} bg={T.ink} fg={T.cream} size="lg" style={{ flex: 2 }}>
            {saving ? "saving…" : "save all →"}
          </PillBtn>
        </div>
      </div>

      {/* danger zone: drop the whole course */}
      <div className="flex flex-col gap-2 pt-4 border-t border-ink-8">
        <MonoLabel color={T.coralDk} fs={10}>danger zone</MonoLabel>
        {!confirmDrop ? (
          <button
            type="button"
            onClick={() => setConfirmDrop(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-coral-dark hover:text-coral lowercase"
          >
            <Icon name="trash" size={13} />
            drop this class
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2 bg-cream rounded-xl p-3 border border-ink-8">
            <p className="text-xs text-ink-60 lowercase text-center">this permanently removes the class and all its weeks, exams &amp; assignments.</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setConfirmDrop(false)} className="text-xs font-semibold text-ink-40 hover:text-ink-60 lowercase">
                keep it
              </button>
              <PillBtn onClick={onDelete} disabled={dropping} bg={T.coral} fg="#fff" size="sm">
                {dropping ? "dropping…" : "yes, drop it"}
              </PillBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AccordionSection = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="bg-white rounded-2xl border border-ink-8 overflow-hidden cursor-pointer"
      onClick={() => setOpen((o) => !o)}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-base text-ink lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.3 }}>{title}</span>
        <div className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <Icon name="chevD" size={16} color={T.ink60}/>
        </div>
      </div>
      {open && (
        <div className="px-5 pb-4 border-t border-ink-8 pt-3" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
};

export const ClassDetails = ({ Class_details = [] }) => {
  const { courseName } = useParams();
  const navigate = useNavigate();
  const [fetchedCourse, setFetchedCourse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const startEdit = () => {
    const c = fetchedCourse;
    if (!c) return;
    setDraft({
      id: c.id,
      course_name: c.course_name || "",
      classroom: c.classroom || "",
      start_time: c.start_time || "",
      end_time: c.end_time || "",
      rep_date: c.rep_date || "",
      start_date: c.start_date || "",
      end_date: c.end_date || "",
      weeks: (c.weeks || []).map((w) => ({ id: w.id, week_number: w.week_number, week_topic: w.week_topic || "", week_date: (w.week_date || "").slice(0, 10) })),
      exams: (c.exams || []).map((e) => ({ id: e.id, exam_topic: e.exam_topic || "", exam_date: (e.exam_date || "").slice(0, 10), exam_details: e.exam_details || "" })),
      assignments: (c.assignments || []).map((a) => ({ id: a.id, assignment_topic: a.assignment_topic || "", assignment_due: (a.assignment_due || "").slice(0, 10), assignment_detail: a.assignment_detail || "" })),
    });
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); setSaveError(null); };

  const [dropping, setDropping] = useState(false);
  const dropCourse = async () => {
    if (!draft?.id) return;
    setDropping(true);
    setSaveError(null);
    const base = import.meta.env.VITE_API_URL;
    try {
      // DELETE cascades to child courses, weeks, exams and assignments server-side.
      await req(`${base}/api/courses/${draft.id}/`, "DELETE");
      window.location.href = "/class";
    } catch (err) {
      console.error("Failed to drop course", err);
      setSaveError("couldn't drop this class. please try again.");
      setDropping(false);
    }
  };

  const req = async (url, method, body) => {
    const res = await authenticatedFetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`);
    return res;
  };

  const saveEdit = async () => {
    const d = draft;
    const bad =
      d.weeks.some((w) => !w.week_topic.trim() || !w.week_date) ||
      d.exams.some((e) => !e.exam_topic.trim() || !e.exam_date) ||
      d.assignments.some((a) => !a.assignment_topic.trim() || !a.assignment_due);
    if (bad) { setSaveError("every week, exam and assignment needs a title and a date."); return; }
    setSaving(true);
    setSaveError(null);
    const base = import.meta.env.VITE_API_URL;
    const toDT = (s) => `${s}T00:00:00Z`;
    try {
      await req(`${base}/api/courses/${d.id}/`, "PATCH", {
        course_name: d.course_name,
        classroom: d.classroom,
        start_time: d.start_time,
        end_time: d.end_time,
        rep_date: d.rep_date,
        start_date: d.start_date || null,
        end_date: d.end_date || null,
      });
      const sync = async (kind, orig, arr, payload) => {
        const keptIds = new Set(arr.filter((x) => x.id).map((x) => x.id));
        for (const o of (orig || [])) {
          if (!keptIds.has(o.id)) await req(`${base}/api/${kind}/${o.id}/`, "DELETE");
        }
        for (const it of arr) {
          const p = payload(it);
          if (it.id) await req(`${base}/api/${kind}/${it.id}/`, "PATCH", p);
          else await req(`${base}/api/${kind}/`, "POST", p);
        }
      };
      await sync("weeks", fetchedCourse.weeks, d.weeks, (w) => ({ course: d.id, week_number: Number(w.week_number) || 1, week_topic: w.week_topic, week_date: w.week_date }));
      await sync("exams", fetchedCourse.exams, d.exams, (e) => ({ course: d.id, exam_topic: e.exam_topic, exam_date: toDT(e.exam_date), exam_details: e.exam_details || "" }));
      await sync("assignments", fetchedCourse.assignments, d.assignments, (a) => ({ course: d.id, assignment_topic: a.assignment_topic, assignment_due: toDT(a.assignment_due), assignment_detail: a.assignment_detail || "" }));
      window.location.reload();
    } catch (err) {
      console.error("Failed to save course edits", err);
      setSaveError("couldn't save changes. please try again.");
      setSaving(false);
    }
  };

  const displayClasses = courseName
    ? Class_details.filter((cls) => cls.base_course === courseName)
    : Class_details;

  useEffect(() => {
    if (!courseName) return;
    const fetchCourseDetails = async () => {
      setLoading(true);
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/`);
        if (res.ok) {
          const data = await res.json();
          const matches = data.filter((c) => c.course_id === courseName || c.parent_course_id === courseName);
          if (matches.length > 0) {
            setFetchedCourse(matches.find((c) => !c.parent_course) || matches[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch detailed course info", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCourseDetails();
  }, [courseName]);

  let ongoingWeek = null;
  let upcomingWeeks = [];
  let pastWeeks = [];
  let upcomingExamsThisWeek = [];
  let futureExams = [];
  let pastExams = [];
  let upcomingAssignmentsThisWeek = [];
  let futureAssignments = [];
  let pastAssignments = [];

  if (fetchedCourse) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sorted = [...(fetchedCourse.weeks || [])].sort((a, b) => new Date(a.week_date) - new Date(b.week_date));

    for (const w of sorted) {
      if (new Date(w.week_date) <= todayStart) ongoingWeek = w;
    }
    if (ongoingWeek) {
      pastWeeks = sorted.filter((w) => new Date(w.week_date) < new Date(ongoingWeek.week_date));
      upcomingWeeks = sorted.filter((w) => new Date(w.week_date) > new Date(ongoingWeek.week_date));
    } else {
      upcomingWeeks = sorted;
    }

    const activeWeekStart = ongoingWeek ? new Date(ongoingWeek.week_date) : new Date(todayStart);
    const activeWeekEnd = new Date(activeWeekStart);
    activeWeekEnd.setDate(activeWeekEnd.getDate() + 7);

    (fetchedCourse.exams || []).forEach((e) => {
      const d = new Date(e.exam_date);
      if (d < todayStart) pastExams.push(e);
      else if (d <= activeWeekEnd) upcomingExamsThisWeek.push(e);
      else futureExams.push(e);
    });

    (fetchedCourse.assignments || []).forEach((a) => {
      const d = new Date(a.assignment_due);
      if (d < todayStart) pastAssignments.push(a);
      else if (d <= activeWeekEnd) upcomingAssignmentsThisWeek.push(a);
      else futureAssignments.push(a);
    });
  }

  const scheduleLines = displayClasses.length > 0
    ? (() => {
        const times = new Set();
        const rooms = new Set();
        const repeatDays = new Set();
        displayClasses.forEach((c) => {
          if (c.time) times.add(c.time);
          if (c.location) rooms.add(c.location);
          if (c.day) repeatDays.add(c.day);
        });
        return {
          time: Array.from(times).join(", "),
          location: Array.from(rooms).join(", "),
          repeatDays: Array.from(repeatDays).join(", "),
        };
      })()
    : null;

  const dayColors = [T.coral, T.lilac, T.lime, "#b8d8c2", "#f0c4a8", T.coral, T.lilac];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex justify-between items-start gap-3">
        <div>
          <MonoLabel>my classes</MonoLabel>
          <h1 className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
            {courseName ? courseName.toLowerCase() : 'pick a class'}
          </h1>
          {fetchedCourse?.course_name && (
            <p className="text-ink-60 text-sm mt-1 lowercase">{fetchedCourse.course_name}</p>
          )}
        </div>
        {courseName && fetchedCourse && !editing && (
          <PillBtn onClick={startEdit} bg="#fff" fg={T.coral} size="sm" style={{ border: `1px solid ${T.coral}` }}>
            <Icon name="edit" size={14} />
            edit
          </PillBtn>
        )}
      </div>

      {courseName ? (
        editing && draft ? (
          <CourseEditor draft={draft} setDraft={setDraft} onSave={saveEdit} onCancel={cancelEdit} saving={saving} error={saveError} onDelete={dropCourse} dropping={dropping} />
        ) : !loading && !fetchedCourse && displayClasses.length === 0 ? (
          <div className="bg-white border border-ink-8 rounded-2xl p-8 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-cream border border-ink-8 flex items-center justify-center">
              <Icon name="plus" size={20} color={T.coral} stroke={2.4} />
            </div>
            <h2 className="text-2xl text-ink lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>
              {courseName.toLowerCase()} isn't on your timetify yet
            </h2>
            <p className="text-sm text-ink-60 lowercase max-w-sm">
              you haven't added this class. add it to your schedule and we'll parse your outline into weeks, exams and assignments for you.
            </p>
            <PillBtn onClick={() => navigate("/Add")} bg={T.coral} fg="#fff" size="lg" style={{ marginTop: 8 }}>
              add {courseName.toLowerCase()} →
            </PillBtn>
          </div>
        ) : (
        <div className="space-y-5">
          <div className="bg-white border border-ink-8 rounded-2xl p-5 space-y-4">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-ink-8 rounded-full w-3/4" />
                <div className="h-4 bg-ink-8 rounded-full w-1/2" />
              </div>
            ) : (
              <>
                {scheduleLines && (
                  <div className="space-y-1">
                    {scheduleLines.time && (
                      <p className="text-base text-ink">
                        <span style={{ fontFamily: FF.mono }}>{scheduleLines.time}</span> every <span className="lowercase">{scheduleLines.repeatDays}</span>
                      </p>
                    )}
                    {scheduleLines.location && (
                      <p className="text-sm text-ink-60">@{scheduleLines.location}</p>
                    )}
                  </div>
                )}

                {fetchedCourse?.has_ai_content && ongoingWeek && (
                  <>
                    <hr className="border-ink-8" />
                    <div>
                      <MonoLabel>ongoing</MonoLabel>
                      <p className="text-base text-ink mt-1.5">
                        <span className="font-semibold">wk {ongoingWeek.week_number}:</span> {ongoingWeek.week_topic}
                      </p>
                    </div>

                    {(upcomingAssignmentsThisWeek.length > 0 || upcomingExamsThisWeek.length > 0) && (
                      <div>
                        <MonoLabel>due this week</MonoLabel>
                        <div className="space-y-2 mt-2">
                          {upcomingExamsThisWeek.map((e, idx) => (
                            <div key={`ex-${idx}`} className="flex items-start gap-2 bg-cream rounded-xl p-3 border border-ink-8">
                              <span className="mt-0.5" style={{ color: T.coral }}>
                                <Icon name="check" size={14}/>
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-ink">{e.exam_topic}</p>
                                <p className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>exam · {new Date(e.exam_date).toLocaleDateString()}</p>
                              </div>
                            </div>
                          ))}
                          {upcomingAssignmentsThisWeek.map((a, idx) => (
                            <div key={`as-${idx}`} className="flex items-start gap-2 bg-cream rounded-xl p-3 border border-ink-8">
                              <span className="mt-0.5" style={{ color: T.coral }}>
                                <Icon name="check" size={14}/>
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-ink">{a.assignment_topic}</p>
                                <p className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>due {new Date(a.assignment_due).toLocaleDateString()}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {fetchedCourse?.has_ai_content && <hr className="border-ink-8" />}

                {fetchedCourse?.has_ai_content && (
                  <div className="space-y-2">
                    <AccordionSection title="future assignments">
                      {futureAssignments.length > 0 ? (
                        <div className="space-y-2">
                          {futureAssignments.map((a, idx) => (
                            <div key={idx} className="bg-cream rounded-xl p-3 flex justify-between items-center border border-ink-8">
                              <p className="text-sm font-medium text-ink">{a.assignment_topic}</p>
                              <p className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>{new Date(a.assignment_due).toLocaleDateString()}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-ink-40">no future assignments.</p>
                      )}
                    </AccordionSection>

                    <AccordionSection title="upcoming midterm / exam">
                      {futureExams.length > 0 ? (
                        <div className="space-y-2">
                          {futureExams.map((e, idx) => (
                            <div key={idx} className="bg-cream rounded-xl p-3 flex justify-between items-center border border-ink-8">
                              <p className="text-sm font-medium text-ink">{e.exam_topic}</p>
                              <p className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>{new Date(e.exam_date).toLocaleDateString()}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-ink-40">no upcoming exams.</p>
                      )}
                    </AccordionSection>

                    <AccordionSection title="upcoming weeks">
                      {upcomingWeeks.length > 0 ? (
                        <div className="space-y-2">
                          {upcomingWeeks.map((w, idx) => (
                            <div key={idx} className="bg-cream rounded-xl p-3 border border-ink-8">
                              <span className="text-xs font-medium text-coral" style={{ fontFamily: FF.mono, letterSpacing: 0.5 }}>wk {w.week_number}</span>
                              <p className="text-sm text-ink">{w.week_topic}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-ink-40">no upcoming weeks.</p>
                      )}
                    </AccordionSection>

                    <AccordionSection title="past weeks">
                      {pastWeeks.length > 0 ? (
                        <div className="space-y-2">
                          {[...pastWeeks].reverse().map((w, idx) => (
                            <div key={idx} className="bg-cream rounded-xl p-3 border border-ink-8 opacity-70">
                              <span className="text-xs font-medium text-ink-40" style={{ fontFamily: FF.mono, letterSpacing: 0.5 }}>wk {w.week_number}</span>
                              <p className="text-sm text-ink-60">{w.week_topic}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-ink-40">no past weeks.</p>
                      )}
                    </AccordionSection>

                    <AccordionSection title="past assignments">
                      {pastAssignments.length > 0 || pastExams.length > 0 ? (
                        <div className="space-y-2">
                          {pastExams.map((e, idx) => (
                            <div key={`pe-${idx}`} className="bg-cream rounded-xl p-3 flex justify-between items-center border border-ink-8 opacity-70">
                              <p className="text-sm text-ink-60">{e.exam_topic}</p>
                              <span className="text-xs text-ink-40" style={{ fontFamily: FF.mono }}>past</span>
                            </div>
                          ))}
                          {pastAssignments.map((a, idx) => (
                            <div key={`pa-${idx}`} className="bg-cream rounded-xl p-3 flex justify-between items-center border border-ink-8 opacity-70">
                              <p className="text-sm text-ink-60">{a.assignment_topic}</p>
                              <span className="text-xs text-ink-40" style={{ fontFamily: FF.mono }}>past</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-ink-40">no past assignments.</p>
                      )}
                    </AccordionSection>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        )
      ) : (
        <div className="space-y-4">
          <p className="text-ink-60 text-sm lowercase">select a course from the sidebar to view details.</p>
          <div className="bg-white border border-ink-8 rounded-2xl p-5 w-full overflow-hidden">
            <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[240px]">
              {days.map((day, dayIdx) => {
                const dayClasses = displayClasses.filter(
                  (cls) =>
                    cls.day &&
                    (cls.day.toLowerCase() === day.toLowerCase() ||
                      cls.day.toLowerCase() === day.slice(0, 3).toLowerCase())
                );
                const dayColor = dayColors[dayIdx % dayColors.length];
                return (
                  <div key={day} className="flex-1 min-w-[120px] flex flex-col gap-2">
                    <div className="pb-2 mb-1 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: dayColor }}/>
                      <h3 className="text-[10px] font-medium text-ink-60 uppercase tracking-widest" style={{ fontFamily: FF.mono }}>
                        {day.slice(0, 3)}
                      </h3>
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      {dayClasses.length > 0 ? (
                        dayClasses.map((cls, idx) => (
                          <a key={idx} href={`/class/${cls.base_course}`} className="bg-cream rounded-xl p-2.5 border border-ink-8 hover:border-coral transition-colors block">
                            <p className="text-xs font-semibold text-ink line-clamp-2 lowercase">{cls.course}</p>
                            <p className="text-[10px] text-ink-60 mt-1" style={{ fontFamily: FF.mono }}>{cls.time}</p>
                            <p className="text-[10px] text-ink-60 truncate">{cls.location}</p>
                          </a>
                        ))
                      ) : (
                        <div className="flex-1 flex items-center justify-center min-h-[60px]">
                          <p className="text-[10px] text-ink-40">—</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
