import { useState, useEffect } from "react";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const Profile = ({ currentUser, Class_details = [] }) => {
    const [allCourses, setAllCourses] = useState([]);
    const [loadingCourses, setLoadingCourses] = useState(false);
    const displayClasses = Class_details;

    useEffect(() => {
        const fetchAllCourses = async () => {
            setLoadingCourses(true);
            try {
                const token = localStorage.getItem("access_token");
                const res = await fetch("http://127.0.0.1:8000/api/courses/", {
                    headers: token ? { "Authorization": `Bearer ${token}` } : {}
                });
                if (res.ok) {
                    const data = await res.json();
                    setAllCourses(data);
                }
            } catch (err) {
                console.error("Failed to fetch all courses", err);
            } finally {
                setLoadingCourses(false);
            }
        };
        fetchAllCourses();
    }, []);

    if (!currentUser) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-4 py-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded"></div>
                            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Helper to format date from YYYY-MM-DD to MM-DD-YYYY
    const formatDate = (dateString) => {
        if (!dateString) return "N/A";
        const [year, month, day] = dateString.split('-');
        return `${month}-${day}-${year}`;
    };

    return (
        <div className="space-y-8 pb-12">
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-6">
                    Hi, {currentUser.username}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">University</p>
                        <p className="text-lg font-bold text-gray-900">{currentUser.university || "Not set"}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Major</p>
                        <p className="text-lg font-bold text-gray-900">{currentUser.major || "Not set"}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Graduation Year</p>
                        <p className="text-lg font-bold text-gray-900">{currentUser.year || "Not set"}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-500">Email Address</p>
                        <p className="text-lg font-bold text-gray-900">{currentUser.email || "Not set"}</p>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 border-b pb-3 mb-6">My Enrolled Courses</h2>
                {loadingCourses ? (
                    <div className="space-y-4">
                        <div className="h-4 bg-gray-100 animate-pulse rounded w-3/4"></div>
                        <div className="h-4 bg-gray-100 animate-pulse rounded w-1/2"></div>
                    </div>
                ) : allCourses.length > 0 ? (
                    <ul className="space-y-3">
                        {allCourses.map((course) => (
                            <li key={course.id} className="text-lg text-gray-700 font-medium flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                <span className="text-blue-600 font-bold">{course.course_id}</span>: from {formatDate(course.start_date)} - {formatDate(course.end_date)}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-500 italic">No courses enrolled yet.</p>
                )}
            </div>

            <div className="px-6 py-6 bg-white rounded-xl shadow-sm border border-gray-100 w-full overflow-hidden">
                <h2 className="text-xl font-bold text-gray-900 border-b pb-3 mb-6">My Weekly Schedule</h2>

                <div className="flex flex-row overflow-x-auto gap-4 pb-4 min-h-[400px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    {days.map((day) => {
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
                                            <p className="text-[10px] text-gray-400 italic font-medium">No classes today</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};


export default Profile;