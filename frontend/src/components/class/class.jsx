import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const ClassDetails = ({ Class_details = [] }) => {
    const { courseName } = useParams();
    const [fetchedCourse, setFetchedCourse] = useState(null);
    const [loading, setLoading] = useState(false);

    // Filter by base_course to match exactly what is passed in the URL from App.jsx
    const displayClasses = courseName
        ? Class_details.filter(cls => cls.base_course === courseName)
        : Class_details;

    // Fetch the detailed course from the new serializer that contains nested arrays
    useEffect(() => {
        if (!courseName) return;
        const fetchCourseDetails = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem("access_token");
                const res = await fetch("http://127.0.0.1:8000/api/courses/", {
                    headers: token ? { "Authorization": `Bearer ${token}` } : {}
                });
                if (res.ok) {
                    const data = await res.json();

                    // Filter courses matching the name
                    const matches = data.filter(c => c.course_id === courseName || c.parent_course_id === courseName);

                    if (matches.length > 0) {
                        // Prioritize the main course (no parent) OR the one with most content
                        const bestMatch = matches.find(c => !c.parent_course) || matches[0];
                        setFetchedCourse(bestMatch);
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

    // ---- Syllabus Processing Logic ----
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

        const sortedWeeks = [...(fetchedCourse.weeks || [])].sort((a, b) => new Date(a.week_date) - new Date(b.week_date));

        for (let i = 0; i < sortedWeeks.length; i++) {
            const wDate = new Date(sortedWeeks[i].week_date);
            if (wDate <= todayStart) {
                ongoingWeek = sortedWeeks[i];
            }
        }

        if (ongoingWeek) {
            pastWeeks = sortedWeeks.filter(w => new Date(w.week_date) < new Date(ongoingWeek.week_date));
            upcomingWeeks = sortedWeeks.filter(w => new Date(w.week_date) > new Date(ongoingWeek.week_date));
        } else {
            upcomingWeeks = sortedWeeks;
        }

        const activeWeekStart = ongoingWeek ? new Date(ongoingWeek.week_date) : new Date(todayStart);
        const activeWeekEnd = new Date(activeWeekStart);
        activeWeekEnd.setDate(activeWeekEnd.getDate() + 7);

        const exams = fetchedCourse.exams || [];
        exams.forEach(e => {
            const d = new Date(e.exam_date);
            if (d < todayStart) pastExams.push(e);
            else if (d >= todayStart && d <= activeWeekEnd) upcomingExamsThisWeek.push(e);
            else futureExams.push(e);
        });

        const assignments = fetchedCourse.assignments || [];
        assignments.forEach(a => {
            const d = new Date(a.assignment_due);
            if (d < todayStart) pastAssignments.push(a);
            else if (d >= todayStart && d <= activeWeekEnd) upcomingAssignmentsThisWeek.push(a);
            else futureAssignments.push(a);
        });
    }

    return (
        <div className="space-y-8 pb-12">
            <div className="flex items-center justify-between border-b border-gray-100 pb-5 mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                        {courseName ? `${courseName}` : "Your Classes"}
                    </h2>
                    {fetchedCourse?.course_name && (
                        <p className="text-lg text-gray-500 mt-1 font-medium">{fetchedCourse.course_name}</p>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex animate-pulse space-x-4 p-4">
                    <div className="flex-1 space-y-4 py-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded"></div>
                            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="px-6 py-6 bg-white rounded-xl shadow-sm border border-gray-100 w-full overflow-hidden">
                    <h2 className="text-xl font-bold text-gray-900 border-b pb-3 mb-6">Weekly Schedule for {courseName || "All Classes"}</h2>

                    <div className="flex flex-row overflow-x-auto gap-4 pb-4 min-h-[400px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                        {days.map((day) => {
                            // Filter classes for the current day
                            const dayClasses = displayClasses.filter(cls =>
                                cls.day && (cls.day.toLowerCase() === day.toLowerCase() ||
                                    cls.day.toLowerCase() === day.slice(0, 3).toLowerCase())
                            );

                            return (
                                <div key={day} className="flex-1 min-w-[180px] flex flex-col gap-4 border-r border-gray-100 last:border-r-0 pr-4 last:pr-0">
                                    <div className="sticky top-0 bg-white z-10 pb-2 border-b-2 border-blue-500 mb-2">
                                        <h3 className="text-xs font-bold text-gray-800 text-center uppercase tracking-wider">
                                            {day}
                                        </h3>
                                    </div>

                                    <div className="flex flex-col gap-3 flex-1">
                                        {dayClasses.length > 0 ? (
                                            dayClasses.map((cls, index) => (
                                                <div
                                                    key={index}
                                                    className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-200 transition-all hover:border-blue-300 hover:shadow-sm group"
                                                >
                                                    <h4 className="text-xs font-bold text-gray-800 mb-2 line-clamp-2">
                                                        {cls.course}
                                                    </h4>
                                                    <div className="flex flex-col gap-1.5 mt-auto">
                                                        <p className="text-[10px] text-gray-500 flex items-center">
                                                            <span className="w-1 h-1 rounded-full bg-blue-400 mr-1.5"></span>
                                                            {cls.time}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500 flex items-center truncate">
                                                            <span className="w-1 h-1 rounded-full bg-green-400 mr-1.5"></span>
                                                            {cls.location}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex-1 flex items-center justify-center p-4 text-center bg-gray-50/50 rounded-lg border border-dashed border-gray-200 min-h-[120px]">
                                                <p className="text-[10px] text-gray-400 italic font-medium">No {courseName || "classes"} today</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* --- AI Syllabus Content --- */}
            {fetchedCourse?.has_ai_content && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ">

                    {/* HERO ROW: Ongoing Week & Action Items */}
                    <div className="space-y-6">

                        {/* Ongoing Week Card */}
                        <div className="relative overflow-hidden bg-[#ffc759] rounded-3xl p-8 ">
                            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-2xl"></div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-6">
                                    <h3 className="text-xl font-bold text-black">Ongoing Week</h3>
                                </div>
                                {ongoingWeek ? (
                                    <div>
                                        <p className="text-4xl font-extrabold text-black mb-2">
                                            Week {ongoingWeek.week_number}
                                        </p>
                                        <p className="text-lg font-medium text-black">{ongoingWeek.week_topic}</p>
                                    </div>
                                ) : (
                                    <p className="text-gray-300 italic">No ongoing week detected.</p>
                                )}
                            </div>
                        </div>

                        {/* This Week's Actions */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-red-50 relative overflow-hidden">
                            <div className="relative z-10">
                                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                                    Due This Week
                                </h3>

                                {upcomingExamsThisWeek.length === 0 && upcomingAssignmentsThisWeek.length === 0 && (
                                    <div className="h-full flex items-center justify-center py-6">
                                        <p className="text-gray-400 font-medium italic">Smooth sailing! Nothing due this week.</p>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    {upcomingExamsThisWeek.map((e, idx) => (
                                        <div key={`ex-${idx}`} className="p-4 rounded-xl bg-red-50 border border-red-100 flex justify-between items-center group hover:bg-red-100 transition-colors">
                                            <div className="flex gap-3">
                                                <div className="w-10 h-10 rounded-full bg-red-200 text-red-600 flex items-center justify-center font-bold">EX</div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{e.exam_topic}</p>
                                                    <p className="text-xs text-red-600 font-medium">{new Date(e.exam_date).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {upcomingAssignmentsThisWeek.map((a, idx) => (
                                        <div key={`as-${idx}`} className="p-4 rounded-xl bg-orange-50 border border-orange-100 flex justify-between items-center group hover:bg-orange-100 transition-colors">
                                            <div className="flex gap-3">
                                                <div className="w-10 h-10 rounded-full bg-orange-200 text-orange-600 flex items-center justify-center font-bold">HW</div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{a.assignment_topic}</p>
                                                    <p className="text-xs text-orange-600 font-medium">{new Date(a.assignment_due).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* TWO-COLUMN GRID: Future & Past */}
                    <div className="space-y-4">

                        {/* Future Block */}
                        <div className="group flex flex-col space-y-4">
                            {/* Future Weeks */}
                            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900 mb-4 px-2">Upcoming Weeks</h3>
                                <div className="space-y-3">
                                    {upcomingWeeks.length > 0 ? upcomingWeeks.map((w, idx) => (
                                        <div key={`uw-${idx}`} className="py-3 px-4 rounded-2xl flex items-center gap-4 hover:bg-blue-50 transition-colors group">
                                            <div className="text-left">
                                                <p className="text-xs font-bold text-blue-400 uppercase">Week {w.week_number}</p>
                                                <p className="text-[10px] text-gray-400">{w.week_date}</p>
                                            </div>
                                            <h2 className="text-md font-semibold text-gray-700 hover:text-blue-900 pl-2">{w.week_topic}</h2>
                                        </div>
                                    )) : <p className="text-gray-400 italic text-sm px-2">No upcoming weeks recorded.</p>}
                                </div>
                            </div>

                            {/* Future Deliverables */}
                            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900 mb-4 px-2">Future Assignments & Exams</h3>
                                <div className="space-y-3">
                                    {futureExams.map((e, idx) => (
                                        <div key={`fe-${idx}`} className="py-3 px-4 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-center">
                                            <div>
                                                <span className="text-xs font-bold text-red-500 uppercase mr-2">EXAM</span>
                                                <span className="text-md font-semibold text-gray-800 pl-4">{e.exam_topic}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 font-medium">{new Date(e.exam_date).toLocaleDateString()}</p>
                                        </div>
                                    ))}
                                    {futureAssignments.map((a, idx) => (
                                        <div key={`fa-${idx}`} className="py-3 px-4 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-center">
                                            <div>
                                                <span className="text-xs font-bold text-orange-500 uppercase mr-2">ASGN</span>
                                                <span className="text-sm font-semibold text-gray-800">{a.assignment_topic}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 font-medium">{new Date(a.assignment_due).toLocaleDateString()}</p>
                                        </div>
                                    ))}
                                    {(futureExams.length === 0 && futureAssignments.length === 0) && (
                                        <p className="text-gray-400 italic text-sm px-2">No future deliverables recorded.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Past Block */}
                        <div className="space-y-6">
                            {/* Past Weeks */}
                            <div className="bg-gray-50/50 rounded-3xl p-6 bg-[#babfd1]">
                                <h3 className="text-lg font-bold text-black mb-4 px-2">Past Weeks</h3>
                                <div className="space-y-2 opacity-75">
                                    {pastWeeks.length > 0 ? pastWeeks.map((w, idx) => (
                                        <div key={`pw-${idx}`} className="py-2 px-4 flex items-center gap-4">
                                            <div className="w-12 text-center opacity-50">
                                                <p className="text-[10px] font-bold text-black uppercase">Week {w.week_number}</p>
                                            </div>
                                            <p className="text-sm text-black">{w.week_topic}</p>
                                        </div>
                                    )) : <p className="text-gray-400 italic text-sm px-2">No past weeks.</p>}
                                </div>
                            </div>

                            {/* Past Deliverables */}
                            <div className="bg-gray-50/50 rounded-3xl p-6 bg-[#babfd1]">
                                <h3 className="text-lg font-bold text-black mb-4 px-2">Completed Iterations</h3>
                                <div className="space-y-3 opacity-60">
                                    {pastExams.map((e, idx) => (
                                        <div key={`pe-${idx}`} className="py-2 px-3 flex justify-between items-center bg-gray-100 rounded-lg">
                                            <span className="text-xs font-medium text-black">{e.exam_topic}</span>
                                            <span className="text-xs text-black">Past</span>
                                        </div>
                                    ))}
                                    {pastAssignments.map((a, idx) => (
                                        <div key={`pa-${idx}`} className="py-2 px-3 flex justify-between items-center bg-gray-100 rounded-lg">
                                            <span className="text-xs font-medium text-black">{a.assignment_topic}</span>
                                            <span className="text-xs text-black">Past</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};