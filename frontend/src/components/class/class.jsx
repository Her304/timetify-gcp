import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { authenticatedFetch } from "../../utils/api";
import { T, FF, MonoLabel, Icon } from "@/components/shared/brand";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
  const [fetchedCourse, setFetchedCourse] = useState(null);
  const [loading, setLoading] = useState(false);

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
      <div>
        <MonoLabel>my classes</MonoLabel>
        <h1 className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
          {courseName ? courseName.toLowerCase() : 'pick a class'}
        </h1>
        {fetchedCourse?.course_name && (
          <p className="text-ink-60 text-sm mt-1 lowercase">{fetchedCourse.course_name}</p>
        )}
      </div>

      {courseName ? (
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
