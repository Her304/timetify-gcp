import { useState, useEffect } from "react";
import { authenticatedFetch } from "../../utils/api";
import { T, FF, MonoLabel, Avatar, PillBtn, Blob, Star, Icon } from "@/components/shared/brand";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const Profile = ({ currentUser, setCurrentUser, Class_details = [], onLogout }) => {
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
    return `${m}/${day}/${y}`;
  };

  const inputClasses = "w-full px-3 py-2 border border-ink-15 bg-white rounded-full text-sm outline-none focus:ring-2 focus:ring-coral/20 focus:border-coral transition-all";

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse space-y-4 w-full max-w-md">
          <div className="h-8 bg-ink-8 rounded-full w-3/4" />
          <div className="h-6 bg-ink-8 rounded-full" />
          <div className="h-6 bg-ink-8 rounded-full w-5/6" />
        </div>
      </div>
    );
  }

  const filteredCourses =
    courseFilter === "past"
      ? allCourses.filter((c) => c.end_date && new Date(c.end_date) < new Date())
      : allCourses;

  const dayColors = [T.coral, T.lilac, T.lime, "#b8d8c2", "#f0c4a8", T.coral, T.lilac];

  const totalClasses = new Set(Class_details.map(c => c.base_course || c.course)).size;

  return (
    <div className="space-y-8 pb-12">
      <div>
        <MonoLabel>me</MonoLabel>
        <h1 className="text-4xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
          settings &amp; such
        </h1>
      </div>

      {/* Profile card (dark) */}
      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-5">
        <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: T.ink, color: T.cream }}>
          <Blob color={T.lime} size={140} seed={3} style={{ position: 'absolute', top: -40, right: -40, opacity: 0.85 }}/>
          <Star color={T.coral} size={24} style={{ position: 'absolute', top: 22, right: 28, transform: 'rotate(-10deg)' }}/>

          <div className="relative flex flex-col items-start gap-4">
            <Avatar
              name={currentUser.username?.charAt(0).toLowerCase()}
              bg={T.coral} fg="#fff" size={72}
            />
            <div>
              <MonoLabel color="rgba(248,244,237,.65)">@{currentUser.username}</MonoLabel>
              <div className="text-3xl leading-none mt-1.5 lowercase" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
                {currentUser.username}
              </div>
            </div>
            <div className="text-xs leading-relaxed" style={{ color: 'rgba(248,244,237,.85)' }}>
              {currentUser.university && <>{currentUser.university}<br/></>}
              {currentUser.major && <>{currentUser.major}</>}
              {currentUser.grad_year && <> · class of <b>{currentUser.grad_year}</b></>}
            </div>
            <PillBtn onClick={handleEdit} bg={T.coral} fg="#fff" size="sm">edit profile</PillBtn>
          </div>

          <div className="mt-5 pt-4 border-t grid grid-cols-3 gap-2" style={{ borderColor: 'rgba(248,244,237,.18)' }}>
            <div>
              <div className="text-2xl leading-none" style={{ fontFamily: FF.serif }}>{allCourses.length}</div>
              <MonoLabel color="rgba(248,244,237,.6)" fs={9}>classes</MonoLabel>
            </div>
            <div>
              <div className="text-2xl leading-none" style={{ fontFamily: FF.serif }}>{totalClasses}</div>
              <MonoLabel color="rgba(248,244,237,.6)" fs={9}>this week</MonoLabel>
            </div>
            <div>
              <div className="text-2xl leading-none" style={{ fontFamily: FF.serif }}>{currentUser.grad_year || '—'}</div>
              <MonoLabel color="rgba(248,244,237,.6)" fs={9}>grad</MonoLabel>
            </div>
          </div>
        </div>

        {/* Edit form column / details */}
        <div className="bg-white rounded-3xl border border-ink-8 p-6">
          {isEditing ? (
            <div className="space-y-4">
              <MonoLabel>edit details</MonoLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>username</label>
                  <input name="username" value={formData.username} onChange={handleChange} className={inputClasses} />
                  {error?.username && <p className="text-xs text-coral-dark mt-1">{error.username[0]}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>email</label>
                  <input name="email" type="email" value={formData.email} onChange={handleChange} className={inputClasses} />
                  {error?.email && <p className="text-xs text-coral-dark mt-1">{error.email[0]}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>university</label>
                  <input name="university" value={formData.university} onChange={handleChange} className={inputClasses} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>major</label>
                  <input name="major" value={formData.major} onChange={handleChange} className={inputClasses} />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-60 uppercase tracking-widest mb-1 block" style={{ fontFamily: FF.mono }}>grad year</label>
                  <input name="grad_year" value={formData.grad_year} onChange={handleChange} placeholder="2027" className={inputClasses} />
                </div>
              </div>
              {error?.non_field_errors && (
                <p className="text-sm text-coral-dark">{error.non_field_errors[0]}</p>
              )}
              <div className="flex gap-3 pt-1">
                <PillBtn onClick={handleSave} disabled={saving} bg={T.coral} fg="#fff" size="md">
                  {saving ? "saving…" : "save changes"}
                </PillBtn>
                <PillBtn onClick={handleCancel} disabled={saving} bg="#fff" fg={T.ink} size="md" style={{ border: `1px solid ${T.ink15}` }}>
                  cancel
                </PillBtn>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <MonoLabel>profile details</MonoLabel>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <MonoLabel fs={10}>username</MonoLabel>
                  <p className="text-sm font-medium text-ink mt-1">{currentUser.username}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>email</MonoLabel>
                  <p className="text-sm text-ink mt-1 truncate">{currentUser.email || '—'}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>university</MonoLabel>
                  <p className="text-sm text-ink mt-1">{currentUser.university || '—'}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>major</MonoLabel>
                  <p className="text-sm text-ink mt-1">{currentUser.major || '—'}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>grad year</MonoLabel>
                  <p className="text-sm text-ink mt-1" style={{ fontFamily: FF.mono }}>{currentUser.grad_year || '—'}</p>
                </div>
                <div>
                  <MonoLabel fs={10}>member since</MonoLabel>
                  <p className="text-sm text-ink mt-1" style={{ fontFamily: FF.mono }}>—</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* My Weekly Schedule */}
      <section>
        <div className="mb-4">
          <MonoLabel>my week</MonoLabel>
          <h2 className="text-2xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
            weekly schedule
          </h2>
        </div>
        <div className="bg-white border border-ink-8 rounded-2xl p-5 w-full overflow-hidden">
          <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[200px]">
            {days.map((day, dayIdx) => {
              const dayClasses = Class_details.filter(
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
                        <div key={idx} className="bg-cream rounded-xl p-2.5 border border-ink-8">
                          <p className="text-xs font-semibold text-ink line-clamp-2 lowercase">{cls.course}</p>
                          <p className="text-[10px] text-ink-60 mt-1" style={{ fontFamily: FF.mono }}>{cls.time}</p>
                          <p className="text-[10px] text-ink-60 truncate">{cls.location}</p>
                        </div>
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
      </section>

      {/* All My Courses */}
      <section>
        <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
          <div>
            <MonoLabel>archive</MonoLabel>
            <h2 className="text-2xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.8 }}>
              all my courses
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <MonoLabel>sort</MonoLabel>
            <div className="relative">
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className="appearance-none bg-white text-ink text-sm font-medium px-4 py-2 pr-8 rounded-full border border-ink-15 outline-none cursor-pointer hover:border-ink-40 transition-colors"
              >
                <option value="all">all courses</option>
                <option value="past">past courses</option>
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-60 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        <div className="bg-white border border-ink-8 rounded-2xl p-5">
          {loadingCourses ? (
            <div className="space-y-3">
              <div className="h-12 bg-ink-8 animate-pulse rounded-xl" />
              <div className="h-12 bg-ink-8 animate-pulse rounded-xl" />
            </div>
          ) : filteredCourses.length > 0 ? (
            <div className="space-y-2">
              {filteredCourses.map((course) => (
                <div key={course.id} className="bg-cream rounded-xl p-4 flex items-center justify-between border border-ink-8">
                  <div>
                    <span className="font-semibold text-ink lowercase" style={{ fontFamily: FF.serif, fontSize: 16, letterSpacing: -0.3 }}>{course.course_id}</span>
                    {course.course_name && (
                      <span className="text-xs text-ink-60 ml-2 lowercase">{course.course_name}</span>
                    )}
                  </div>
                  <span className="text-xs text-ink-60" style={{ fontFamily: FF.mono }}>
                    {formatDate(course.start_date)} – {formatDate(course.end_date)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-ink-40 text-sm">no courses found.</p>
            </div>
          )}
        </div>
      </section>

      {/* Mobile-only log out pill — desktop has it in the header nav. */}
      {onLogout && (
        <div className="md:hidden mt-6">
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-3 rounded-full text-sm font-semibold lowercase hover:opacity-90 transition-opacity"
            style={{ background: T.coral, color: "#fff", fontFamily: FF.sans }}
          >
            log out
          </button>
        </div>
      )}
    </div>
  );
};

export default Profile;
