import { useState, useEffect } from "react";
import { authenticatedFetch } from "../../utils/api";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const Profile = ({ currentUser, setCurrentUser, Class_details = [] }) => {
  const [allCourses, setAllCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: currentUser?.username || "",
    email: currentUser?.email || "",
    university: currentUser?.university || "",
    major: currentUser?.major || "",
    grad_year: currentUser?.grad_year || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [courseFilter, setCourseFilter] = useState("all");

  useEffect(() => {
    const fetchAllCourses = async () => {
      setLoadingCourses(true);
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/`);
        if (res.ok) setAllCourses(await res.json());
      } catch (err) {
        console.error("Failed to fetch all courses", err);
      } finally {
        setLoadingCourses(false);
      }
    };
    fetchAllCourses();
  }, []);

  const handleEdit = () => {
    setFormData({
      username: currentUser.username,
      email: currentUser.email,
      university: currentUser.university || "",
      major: currentUser.major || "",
      grad_year: currentUser.grad_year || "",
    });
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => { setIsEditing(false); setError(null); };
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/user/`, {
        method: "PATCH",
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
        setIsEditing(false);
      } else {
        setError(await res.json());
      }
    } catch (err) {
      setError({ non_field_errors: ["An unexpected error occurred."] });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return "N/A";
    const [y, m, day] = d.split("-");
    return `${m}-${day}-${y}`;
  };

  const inputClasses =
    "w-full px-3 py-2 border border-[#e8e9ed] bg-white  text-sm outline-none focus:ring-2 focus:ring-[#607196]/20 focus:border-[#607196] transition-all";

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse space-y-4 w-full max-w-md">
          <div className="h-8 bg-[#e8e9ed] rounded w-3/4" />
          <div className="h-6 bg-[#e8e9ed] rounded" />
          <div className="h-6 bg-[#e8e9ed] rounded w-5/6" />
        </div>
      </div>
    );
  }

  const filteredCourses =
    courseFilter === "past"
      ? allCourses.filter((c) => c.end_date && new Date(c.end_date) < new Date())
      : allCourses;

  return (
    <div className="space-y-10 pb-12">
      {/* User header */}
      <h1 className="text-3xl font-extrabold text-gray-900">User</h1>

      {/* User info card */}
      <div className="bg-[#e8e9ed]  p-5">
        <div className="flex items-center gap-5">
          {/* Avatar circle */}
          <div className="w-16 h-16 rounded-full bg-[#607196]/10 text-[#607196] flex items-center justify-center text-2xl font-extrabold flex-shrink-0">
            {currentUser.username?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Username</label>
                    <input name="username" value={formData.username} onChange={handleChange} className={inputClasses} />
                    {error?.username && <p className="text-xs text-red-500 mt-1">{error.username[0]}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Email</label>
                    <input name="email" type="email" value={formData.email} onChange={handleChange} className={inputClasses} />
                    {error?.email && <p className="text-xs text-red-500 mt-1">{error.email[0]}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">University</label>
                    <input name="university" value={formData.university} onChange={handleChange} className={inputClasses} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Major</label>
                    <input name="major" value={formData.major} onChange={handleChange} className={inputClasses} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Grad Year</label>
                    <input name="grad_year" value={formData.grad_year} onChange={handleChange} placeholder="e.g. 2026" className={inputClasses} />
                  </div>
                </div>
                {error?.non_field_errors && (
                  <p className="text-sm text-red-600">{error.non_field_errors[0]}</p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-5 py-2 bg-[#607196] text-white text-sm font-bold  hover:bg-[#4a5a7a] disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    className="px-5 py-2 bg-white text-gray-700 text-sm font-bold  hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold text-gray-900 text-lg">{currentUser.username}</p>
                    {currentUser.university && (
                      <p className="text-sm text-gray-500">@{currentUser.university}</p>
                    )}
                    {(currentUser.major || currentUser.grad_year) && (
                      <p className="text-sm text-gray-500">
                        {currentUser.major}
                        {currentUser.grad_year ? ` | Graduate by ${currentUser.grad_year}` : ""}
                      </p>
                    )}
                    {currentUser.email && (
                      <p className="text-xs text-gray-400 mt-1">{currentUser.email}</p>
                    )}
                  </div>
                  <button
                    onClick={handleEdit}
                    className="text-sm font-semibold text-[#607196] hover:underline flex-shrink-0"
                  >
                    edit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* My Weekly Schedule */}
      <section>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-4">My weekly schedules</h2>
        <div className="bg-[#e8e9ed]  p-5 w-full overflow-hidden">
          <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[200px]">
            {days.map((day) => {
              const dayClasses = Class_details.filter(
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
                        <div key={idx} className="bg-white  p-2.5 shadow-sm">
                          <p className="text-xs font-bold text-gray-800 line-clamp-2">{cls.course}</p>
                          <p className="text-[10px] text-gray-500 mt-1">{cls.time}</p>
                          <p className="text-[10px] text-gray-500 truncate">{cls.location}</p>
                        </div>
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
      </section>

      {/* All My Courses */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-2xl font-extrabold text-gray-900">All My Courses</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium">Sort:</span>
            <div className="relative">
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="appearance-none bg-[#e8e9ed] text-gray-800 text-sm font-semibold px-4 py-2 pr-8  border-none outline-none cursor-pointer"
              >
                <option value="all">All Courses</option>
                <option value="past">Only Past Courses</option>
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-[#e8e9ed]  p-5">
          {loadingCourses ? (
            <div className="space-y-3">
              <div className="h-12 bg-white/60 animate-pulse " />
              <div className="h-12 bg-white/60 animate-pulse " />
            </div>
          ) : filteredCourses.length > 0 ? (
            <div className="space-y-2">
              {filteredCourses.map((course) => (
                <div key={course.id} className="bg-white  p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <span className="font-extrabold text-gray-900">{course.course_id}</span>
                    {course.course_name && (
                      <span className="text-sm text-gray-500 ml-2">{course.course_name}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(course.start_date)} – {formatDate(course.end_date)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-gray-400 text-sm italic">No courses found.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Profile;
