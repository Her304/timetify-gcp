import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { authenticatedFetch } from "../../utils/api";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const AccordionSection = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="bg-[#e8e9ed]  overflow-hidden cursor-pointer"
      onClick={() => setOpen((o) => !o)}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <span className="font-bold text-gray-800">{title}</span>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <div className="px-5 pb-4 border-t border-white/60" onClick={(e) => e.stopPropagation()}>
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

  // Syllabus processing
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

  // Derive schedule info for the selected course
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

  return (
    <div className="space-y-10 pb-12">
      {/* Page header */}
      <h1 className="text-3xl font-extrabold text-gray-900">My Class</h1>

      {courseName ? (
        <div className="space-y-6">
          {/* Course name heading */}
          <h2 className="text-2xl font-extrabold text-gray-900">{courseName}</h2>
          {fetchedCourse?.course_name && (
            <p className="text-gray-500 -mt-4 text-sm font-medium">{fetchedCourse.course_name}</p>
          )}

          {/* Course detail card */}
          <div className="bg-[#e8e9ed]  p-5 space-y-4">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-white/60 rounded w-3/4" />
                <div className="h-4 bg-white/60 rounded w-1/2" />
              </div>
            ) : (
              <>
                {/* Schedule info */}
                {scheduleLines && (
                  <div className="space-y-1">
                    {scheduleLines.time && (
                      <p className="font-bold text-gray-800">{scheduleLines.time} every {scheduleLines.repeatDays}</p>
                    )}
                    {scheduleLines.location && (
                      <p className="text-sm text-gray-500">@{scheduleLines.location}</p>
                    )}
                  </div>
                )}

                {/* Ongoing week */}
                {fetchedCourse?.has_ai_content && ongoingWeek && (
                  <>
                    <hr className="border-white/60" />
                    <div>
                      <p className="font-bold text-gray-800 mb-1">Ongoing:</p>
                      <p className="text-sm text-gray-700">
                        Week {ongoingWeek.week_number}: {ongoingWeek.week_topic}
                      </p>
                    </div>

                    {/* This week's assignments */}
                    {(upcomingAssignmentsThisWeek.length > 0 || upcomingExamsThisWeek.length > 0) && (
                      <div>
                        <p className="font-bold text-gray-800 mb-2">Upcoming Assignments on Week {ongoingWeek.week_number}:</p>
                        <div className="space-y-2">
                          {upcomingExamsThisWeek.map((e, idx) => (
                            <div key={`ex-${idx}`} className="flex items-start gap-2 bg-white  p-3">
                              <span className="text-[#607196] mt-0.5">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-gray-800">{e.exam_topic}</p>
                                <p className="text-xs text-gray-500">Exam — {new Date(e.exam_date).toLocaleDateString()}</p>
                              </div>
                            </div>
                          ))}
                          {upcomingAssignmentsThisWeek.map((a, idx) => (
                            <div key={`as-${idx}`} className="flex items-start gap-2 bg-white  p-3">
                              <span className="text-[#607196] mt-0.5">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-gray-800">{a.assignment_topic}</p>
                                <p className="text-xs text-gray-500">Due on {new Date(a.assignment_due).toLocaleDateString()}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {fetchedCourse?.has_ai_content && <hr className="border-white/60" />}

                {/* Accordion sections */}
                {fetchedCourse?.has_ai_content && (
                  <div className="space-y-2">
                    <AccordionSection title="Future Assignments">
                      {futureAssignments.length > 0 ? (
                        <div className="space-y-2 pt-3">
                          {futureAssignments.map((a, idx) => (
                            <div key={idx} className="bg-white  p-3 flex justify-between items-center">
                              <p className="text-sm font-semibold text-gray-800">{a.assignment_topic}</p>
                              <p className="text-xs text-gray-500">{new Date(a.assignment_due).toLocaleDateString()}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic pt-3">No future assignments.</p>
                      )}
                    </AccordionSection>

                    <AccordionSection title="Upcoming Midterm / Exam">
                      {futureExams.length > 0 ? (
                        <div className="space-y-2 pt-3">
                          {futureExams.map((e, idx) => (
                            <div key={idx} className="bg-white  p-3 flex justify-between items-center">
                              <p className="text-sm font-semibold text-gray-800">{e.exam_topic}</p>
                              <p className="text-xs text-gray-500">{new Date(e.exam_date).toLocaleDateString()}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic pt-3">No upcoming exams.</p>
                      )}
                    </AccordionSection>

                    <AccordionSection title="Upcoming Weeks">
                      {upcomingWeeks.length > 0 ? (
                        <div className="space-y-2 pt-3">
                          {upcomingWeeks.map((w, idx) => (
                            <div key={idx} className="bg-white  p-3">
                              <p className="text-xs font-bold text-[#607196]">Week {w.week_number}</p>
                              <p className="text-sm text-gray-800">{w.week_topic}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic pt-3">No upcoming weeks.</p>
                      )}
                    </AccordionSection>

                    <AccordionSection title="Past Weeks">
                      {pastWeeks.length > 0 ? (
                        <div className="space-y-2 pt-3">
                          {[...pastWeeks].reverse().map((w, idx) => (
                            <div key={idx} className="bg-white  p-3 opacity-70">
                              <p className="text-xs font-bold text-gray-400">Week {w.week_number}</p>
                              <p className="text-sm text-gray-700">{w.week_topic}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic pt-3">No past weeks.</p>
                      )}
                    </AccordionSection>

                    <AccordionSection title="Past Assignments">
                      {pastAssignments.length > 0 || pastExams.length > 0 ? (
                        <div className="space-y-2 pt-3">
                          {pastExams.map((e, idx) => (
                            <div key={`pe-${idx}`} className="bg-white  p-3 flex justify-between items-center opacity-70">
                              <p className="text-sm text-gray-700">{e.exam_topic}</p>
                              <span className="text-xs text-gray-400">Past</span>
                            </div>
                          ))}
                          {pastAssignments.map((a, idx) => (
                            <div key={`pa-${idx}`} className="bg-white  p-3 flex justify-between items-center opacity-70">
                              <p className="text-sm text-gray-700">{a.assignment_topic}</p>
                              <span className="text-xs text-gray-400">Past</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic pt-3">No past assignments.</p>
                      )}
                    </AccordionSection>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        /* No course selected: show weekly schedule grid */
        <div className="space-y-4">
          <p className="text-gray-500 text-sm">Select a course from the sidebar to view details.</p>
          <div className="bg-[#e8e9ed]  p-5 w-full overflow-hidden">
            <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[240px]">
              {days.map((day) => {
                const dayClasses = displayClasses.filter(
                  (cls) =>
                    cls.day &&
                    (cls.day.toLowerCase() === day.toLowerCase() ||
                      cls.day.toLowerCase() === day.slice(0, 3).toLowerCase())
                );
                return (
                  <div key={day} className="flex-1 min-w-[120px] flex flex-col gap-2">
                    <div className="pb-2 border-b-2 border-[#607196] mb-1">
                      <h3 className="text-[10px] font-bold text-[#607196] text-center uppercase tracking-widest">
                        {day.slice(0, 3)}
                      </h3>
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      {dayClasses.length > 0 ? (
                        dayClasses.map((cls, idx) => (
                          <a key={idx} href={`/class/${cls.base_course}`} className="bg-white  p-2.5 shadow-sm block hover:shadow-md transition-shadow">
                            <p className="text-xs font-bold text-gray-800 line-clamp-2">{cls.course}</p>
                            <p className="text-[10px] text-gray-500 mt-1">{cls.time}</p>
                            <p className="text-[10px] text-gray-500 truncate">{cls.location}</p>
                          </a>
                        ))
                      ) : (
                        <div className="flex-1 flex items-center justify-center min-h-[60px]">
                          <p className="text-[10px] text-gray-400 italic">—</p>
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
