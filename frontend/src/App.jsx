import { useState, useEffect, useMemo } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import {
  BarChartSquare02,
  HomeLine,
  Plus,
  Rows01,
  User01,
  UsersPlus,
} from "@untitledui/icons";
import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple.jsx";
import { Snap } from "@/components/home/snap";
import { TotalClassSchedule } from "@/components/home/total_class";
import { ClassDetails } from "@/components/class/class";
import Register from "@/components/register/register";
import Login from "@/components/login/login";
import { HeaderNavigationBase } from "@/components/application/app-navigation/header-navigation";
import SearchFriend from "@/components/friend/friend";
import Add from "@/components/add/add";
import Profile from "@/components/user/profile";
import * as Sentry from "@sentry/react";
import { initLogger } from "@/utils/logger";
import { authenticatedFetch } from "@/utils/api";
import ErrorToast from "@/components/shared/ErrorToast";
import NotFound from "@/components/shared/NotFound";
import ProtectedRoute from "@/components/shared/ProtectedRoute";
import { Footer } from "@/components/application/footer/footer";
import About from "@/components/about/about";
import Help from "@/components/help/help";
import Privacy from "@/components/privacy/privacy";
import Terms from "@/components/terms/terms";
import Landing from "@/components/landing/Landing";
import { AppMark, T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

const simpleItems = [];
const HeaderNavigationSimpleDemo = () => <HeaderNavigationBase activeUrl="/" items={simpleItems} />;

// ---------- Mobile Top Navigation ----------
const MobileNav = ({ totalClasses, currentUser, logoutUser }) => {
  const location = useLocation();
  const path = location.pathname;
  const hash = location.hash;

  const isHome = path === "/";
  const isClass = path.startsWith("/class");
  const isFriend = path === "/friend";
  const isAdd = path === "/Add";
  const isProfile = path === "/profile";

  const courseNames = useMemo(
    () => Array.from(new Set(totalClasses.map((c) => c.base_course))),
    [totalClasses]
  );

  const pageLabel = isClass ? "My Class" : isFriend ? "Friend" : isAdd ? "Add" : isProfile ? "Profile" : "Home";

  let subtabs = [];
  if (isHome) {
    subtabs = [
      { label: "Snap", href: "/#snap" },
      { label: "My Schedule", href: "/#schedule" },
      { label: "Friends Schedule", href: "/#friend-schedule" },
    ];
  } else if (isClass) {
    subtabs = courseNames.map((name) => ({ label: name, href: `/class/${name}` }));
  } else if (isFriend) {
    subtabs = [
      { label: "Search", href: "/friend#search" },
      { label: "My Friends", href: "/friend#my-friends" },
      { label: "Schedule", href: "/friend#schedule" },
      { label: "Request", href: "/friend#request" },
    ];
  }

  const headTabs = [
    !isHome && { label: "Home", href: "/" },
    !isClass && { label: "My Class", href: "/class" },
    !isFriend && { label: "Friend", href: "/friend" },
    !isAdd && { label: "Add", href: "/Add" },
  ].filter(Boolean);

  const currentFull = path + hash;
  const isSubActive = (href) => currentFull === href;

  const avatarLetter = (currentUser?.username?.[0] || currentUser?.email?.[0] || "U").toUpperCase();

  return (
    <div className="md:hidden flex items-center bg-cream border-b border-ink-8 h-14 flex-shrink-0">
      {/* Scrollable section */}
      <div className="flex items-center flex-1 overflow-x-auto whitespace-nowrap px-3 gap-0 min-w-0">
        {/* Brand + avatar */}
        <div className="flex items-center gap-2 flex-shrink-0 pr-3">
          <AppMark size={28} />
          <span className="text-lg text-ink flex-shrink-0" style={{ fontFamily: FF.serif, letterSpacing: -0.4 }}>timetify</span>
          <a href="/profile" className="w-7 h-7 rounded-full bg-coral flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {avatarLetter}
          </a>
        </div>

        <div className="w-px h-5 bg-ink-15 flex-shrink-0" />

        {/* Current page + all subtabs */}
        <div className="flex items-center gap-1.5 px-3 flex-shrink-0">
          <span className="text-sm font-semibold text-ink lowercase">{pageLabel}</span>
          {subtabs.map((tab) => (
            <span key={tab.href} className="flex items-center gap-1.5">
              <span className="text-ink-40 text-sm">·</span>
              <a
                href={tab.href}
                className={`text-sm whitespace-nowrap lowercase ${isSubActive(tab.href) ? "font-semibold text-coral" : "text-ink-60 hover:text-ink"}`}
              >
                {tab.label}
              </a>
            </span>
          ))}
        </div>

        <div className="w-px h-5 bg-ink-15 flex-shrink-0" />

        {/* All head tabs (no Profile) */}
        <div className="flex items-center gap-3 px-3 flex-shrink-0">
          {headTabs.map((tab) => (
            <a key={tab.href} href={tab.href} className="text-sm text-ink-60 font-medium hover:text-ink whitespace-nowrap lowercase">
              {tab.label}
            </a>
          ))}
        </div>
      </div>

      {/* Log Out — always visible, pinned to the right */}
      <div className="flex-shrink-0 h-full flex items-center px-2">
        <button
          onClick={logoutUser}
          className="px-3 py-1.5 text-xs font-semibold text-cream bg-ink hover:opacity-90 rounded-full transition-opacity whitespace-nowrap"
        >
          log out
        </button>
      </div>
    </div>
  );
};

// ---------- Google AdSense unit ----------
const GoogleAd = () => {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {}
  }, []);
  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client="ca-pub-9825491172037028"
      data-ad-slot="5349227302"
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
};

// ---------- App ----------
const App = () => {
  const [personalSchedule, setPersonalSchedule] = useState([]);
  const [friendsSchedule, setFriendsSchedule] = useState([]);
  const [totalClasses, setTotalClasses] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [registrationErrors, setRegistrationErrors] = useState({});
  const [loginErrors, setLoginErrors] = useState({});
  const [courseErrors, setCourseErrors] = useState({});
  const [friendsList, setFriendsList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [snapsByCourse, setSnapsByCourse] = useState({});
  const [isErrorReportModalOpen, setIsErrorReportModalOpen] = useState(false);

  useEffect(() => { initLogger(); }, []);

  const [token, setToken] = useState(() => localStorage.getItem("access_token") || null);
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")) || null; }
    catch { return null; }
  });

  const logoutUser = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setToken(null);
    setCurrentUser(null);
    window.location.href = "/login";
  };

  useEffect(() => {
    const handleTokenRefresh = (e) => setToken(e.detail);
    const handleServerError = () => setIsErrorReportModalOpen(true);
    window.addEventListener("token-refreshed", handleTokenRefresh);
    window.addEventListener("server-error", handleServerError);
    return () => {
      window.removeEventListener("token-refreshed", handleTokenRefresh);
      window.removeEventListener("server-error", handleServerError);
    };
  }, []);

  useEffect(() => {
    if (!token) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        const response = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/`);
        if (!response.ok) throw new Error("Failed to fetch schedule");
        const data = await response.json();

        const daysShort = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        const currentDay = daysShort[new Date().getDay()];

        const mapClass = (cls, day) => {
          const baseCourseId = cls.parent_course_id || cls.course_id;
          const displayCourseId = cls.is_lab ? `${baseCourseId} Lab` : baseCourseId;
          return { ...cls, day, course: displayCourseId, base_course: baseCourseId, time: `${cls.start_time} - ${cls.end_time}`, location: cls.classroom };
        };

        const rawTodayClasses = data[currentDay] || [];
        const myClasses = rawTodayClasses.filter(c => c.owner === "Me").map(c => mapClass(c, currentDay));
        const otherClasses = rawTodayClasses.filter(c => c.owner !== "Me").map(c => ({ ...mapClass(c, currentDay), friend: c.owner }));

        const allSchedule = Object.keys(data)
          .filter(day => ["MON","TUE","WED","THU","FRI","SAT","SUN"].includes(day))
          .flatMap(day => data[day].filter(c => c.owner === "Me").map(c => mapClass(c, day)));

        const combinedSchedule = Object.keys(data)
          .filter(day => ["MON","TUE","WED","THU","FRI","SAT","SUN"].includes(day))
          .flatMap(day => data[day].map(c => mapClass(c, day)));

        setPersonalSchedule(myClasses);
        setFriendsSchedule(otherClasses);
        setTotalClasses(allSchedule);
        setAllClasses(combinedSchedule);
        setLoading(false);
      } catch (err) {
        Sentry.captureException(err);
        setError(err.message);
        setLoading(false);
        setIsErrorReportModalOpen(true);
      }
    };

    const fetchFriendsData = async () => {
      try {
        const friendsRes = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friends/`);
        if (friendsRes.ok) setFriendsList(await friendsRes.json());
        const requestsRes = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friend-requests/pending/`);
        if (requestsRes.ok) setFriendRequests(await requestsRes.json());
      } catch (err) {
        Sentry.captureException(err);
        console.error("Error fetching friends data:", err);
      }
    };

    fetchData();
    fetchFriendsData();
    fetchSnapFeed();
  }, [token]);

  const fetchSnapFeed = async () => {
    try {
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/snaps/feed/`);
      if (res.ok) {
        const data = await res.json();
        setSnapsByCourse(data.snaps_by_course || {});
      }
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  const loginUser = async (formData) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);
        localStorage.setItem("user", JSON.stringify(data.user));
        setToken(data.access);
        setCurrentUser(data.user);
        setLoginErrors({});
        window.location.href = "/";
      } else {
        setLoginErrors(data);
      }
    } catch (err) {
      console.error("Login error:", err);
      setLoginErrors({ non_field_errors: ["An unexpected error occurred."] });
      setIsErrorReportModalOpen(true);
    }
  };

  const registerUser = async (formData) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok) {
        setRegistrationErrors({});
        window.location.href = "/";
      } else {
        setRegistrationErrors(data);
      }
    } catch (err) {
      console.error("Registration error:", err);
      setRegistrationErrors({ non_field_errors: ["An unexpected error occurred."] });
      setIsErrorReportModalOpen(true);
    }
  };

  const addCourse = async (courseData) => {
    try {
      setCourseErrors({});
      const isFormData = courseData instanceof FormData;
      const headers = {};
      if (!isFormData) headers["Content-Type"] = "application/json";
      const response = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/`, {
        method: "POST",
        headers,
        body: isFormData ? courseData : JSON.stringify(courseData),
      });
      const data = await response.json();
      if (response.ok) { window.location.reload(); return { success: true }; }
      else { setCourseErrors(data); return { success: false }; }
    } catch (err) {
      setCourseErrors({ non_field_errors: ["An unexpected error occurred."] });
      return { success: false };
    }
  };

  const analyzeCourse = async (formData) => {
    try {
      setCourseErrors({});
      const response = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/analyze/`, { method: "POST", body: formData });
      const data = await response.json();
      if (response.ok) return { success: true, data };
      else { setCourseErrors(data); return { success: false }; }
    } catch (err) {
      setCourseErrors({ non_field_errors: ["An unexpected error occurred during analysis."] });
      return { success: false };
    }
  };

  const finalizeCourse = async (coursesData) => {
    try {
      setCourseErrors({});
      const response = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/courses/finalize/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: coursesData }),
      });
      const data = await response.json();
      if (response.ok) { window.location.reload(); return { success: true }; }
      else { setCourseErrors(data); return { success: false }; }
    } catch (err) {
      setCourseErrors({ non_field_errors: ["An unexpected error occurred during finalization."] });
      return { success: false };
    }
  };

  const searchFriends = async (query) => {
    try {
      const response = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friends/search/?q=${query}`);
      if (response.ok) return await response.json();
      return [];
    } catch (err) { return []; }
  };

  const sendFriendRequest = async (friendId) => {
    try {
      await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friend-requests/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friend: friendId }),
      });
    } catch (err) { console.error("Send friend request error:", err); }
  };

  const respondToFriendRequest = async (requestId, action) => {
    try {
      const response = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friend-requests/${requestId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        const requestsRes = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friend-requests/pending/`);
        if (requestsRes.ok) setFriendRequests(await requestsRes.json());
        const friendsRes = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friends/`);
        if (friendsRes.ok) setFriendsList(await friendsRes.json());
      }
    } catch (err) { console.error("Respond to friend request error:", err); }
  };

  const navItemsSimple = currentUser
    ? [
        {
          label: "Home",
          href: "/",
          icon: HomeLine,
          items: [
            { label: "Snap", href: "/#snap" },
            { label: "My Schedule", href: "/#schedule" },
            { label: "Me & My Friend Schedule", href: "/#friend-schedule" },
          ],
        },
        {
          label: "My Class",
          href: "/class",
          icon: BarChartSquare02,
          items: Array.from(new Set(totalClasses.map((cls) => cls.base_course))).map((name) => ({
            label: name,
            href: `/class/${name}`,
          })),
        },
        {
          label: "Friend",
          href: "/friend",
          icon: Rows01,
          items: [
            { label: "Search", href: "/friend#search" },
            { label: "My Friends", href: "/friend#my-friends" },
            { label: "Schedule", href: "/friend#schedule" },
            { label: "Request", href: "/friend#request" },
          ],
        },
      ]
    : [];

  const secondaryNavItems = currentUser
    ? [
        { label: "Add", href: "/Add", icon: Plus },
        { label: "Profile", href: "/profile", icon: User01 },
      ]
    : [{ label: "Register", href: "/register", icon: UsersPlus }];

  const LogOut = currentUser
    ? [{ label: "Log Out", href: "/logout", onClick: logoutUser }]
    : [{ label: "Log In", href: "/login" }];

  const todayStr = new Date().toLocaleDateString("en-US", { day: "numeric", month: "short" });

  return (
    <div className={`flex ${currentUser ? "md:flex-row flex-col" : "flex-col"} h-screen w-full ${currentUser ? "bg-cream" : "bg-white"} overflow-hidden`}>
      {currentUser ? (
        <SidebarNavigationSimple items={navItemsSimple} secondaryItems={secondaryNavItems} LogOut={LogOut} />
      ) : (
        <HeaderNavigationSimpleDemo />
      )}

      {/* Mobile top nav (only when logged in) */}
      {currentUser && (
        <MobileNavWrapper totalClasses={totalClasses} currentUser={currentUser} logoutUser={logoutUser} />
      )}

      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className={`flex-1 ${currentUser ? "p-6 md:p-8 max-w-5xl w-full mx-auto" : ""}`}>
          <Routes>
            <Route
              path="/"
              element={
                currentUser ? (
                  <div id="snap" className="space-y-10">
                    {/* Date header */}
                    <div className="flex items-end justify-between flex-wrap gap-3">
                      <div>
                        <MonoLabel>today</MonoLabel>
                        <h1 className="text-5xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.2 }}>{todayStr.toLowerCase()}</h1>
                      </div>
                    </div>

                    {loading ? (
                      <div className="space-y-3">
                        <div className="h-32 bg-ink-8 rounded-2xl animate-pulse" />
                        <div className="h-32 bg-ink-8 rounded-2xl animate-pulse" />
                      </div>
                    ) : error ? (
                      <div className="p-4 bg-coral-light border border-coral text-coral-dark rounded-2xl">
                        <p className="font-semibold">Error loading schedule</p>
                        <p className="text-sm">{error}</p>
                      </div>
                    ) : (
                      <>
                        {/* Snap: unified class block */}
                        <Snap
                          personalClasses={personalSchedule}
                          friendClasses={friendsSchedule}
                          snapsByCourse={snapsByCourse}
                          friendsList={friendsList}
                          currentUser={currentUser}
                          onSnapsChanged={fetchSnapFeed}
                        />

                        {/* My weekly schedule */}
                        <section id="schedule">
                          <div className="mb-4">
                            <MonoLabel>my week</MonoLabel>
                            <h2 className="text-3xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
                              ur week, ur ppl
                            </h2>
                          </div>
                          <TotalClassSchedule Class_details={totalClasses} />
                        </section>

                        {/* Me & My friends schedule */}
                        <section id="friend-schedule">
                          <FriendScheduleSection allClasses={allClasses} />
                        </section>

                        {/* AdSense ad unit */}
                        <GoogleAd />
                      </>
                    )}
                  </div>
                ) : (
                  <Landing />
                )
              }
            />
            <Route
              path="/friend"
              element={
                <ProtectedRoute currentUser={currentUser}>
                  <SearchFriend
                    searchfriends={searchFriends}
                    sendFriendRequest={sendFriendRequest}
                    friendsList={friendsList}
                    friendRequests={friendRequests}
                    respondToFriendRequest={respondToFriendRequest}
                    Class_details={allClasses}
                    currentUser={currentUser}
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/class"
              element={
                <ProtectedRoute currentUser={currentUser}>
                  <ClassDetails Class_details={totalClasses} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/class/:courseName"
              element={
                <ProtectedRoute currentUser={currentUser}>
                  <ClassDetails Class_details={totalClasses} />
                </ProtectedRoute>
              }
            />
            <Route path="/register" element={<Register registerUser={registerUser} errors={registrationErrors} />} />
            <Route path="/login" element={<Login loginUser={loginUser} errors={loginErrors} />} />
            <Route
              path="/Add"
              element={
                <ProtectedRoute currentUser={currentUser}>
                  <Add addCourse={addCourse} analyzeCourse={analyzeCourse} finalizeCourse={finalizeCourse} errors={courseErrors} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute currentUser={currentUser}>
                  <Profile currentUser={currentUser} setCurrentUser={setCurrentUser} Class_details={totalClasses} />
                </ProtectedRoute>
              }
            />
            <Route path="/about" element={<About />} />
            <Route path="/help" element={<Help />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
        <Footer currentUser={currentUser} />
      </main>

      <ErrorToast
        isOpen={isErrorReportModalOpen}
        onClose={() => setIsErrorReportModalOpen(false)}
      />
    </div>
  );
};

// Wrapper so MobileNav can use useLocation (must be inside Router)
const MobileNavWrapper = ({ totalClasses, currentUser, logoutUser }) => {
  return <MobileNav totalClasses={totalClasses} currentUser={currentUser} logoutUser={logoutUser} />;
};

// ---------- Me & My friends schedule section (on home page) ----------
const FriendScheduleSection = ({ allClasses }) => {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const uniqueOwners = useMemo(() => {
    const owners = new Set();
    allClasses.forEach((c) => { if (c.owner) owners.add(c.owner); });
    return Array.from(owners).sort((a, b) => {
      if (a === "Me") return -1;
      if (b === "Me") return 1;
      return a.localeCompare(b);
    });
  }, [allClasses]);

  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (uniqueOwners.length > 0 && selected === null) setSelected("all");
  }, [uniqueOwners]);

  const filteredClasses = useMemo(() => {
    if (!selected || selected === "all") return allClasses;
    return allClasses.filter((c) => c.owner === selected);
  }, [allClasses, selected]);

  return (
    <>
      <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
        <div>
          <MonoLabel>me &amp; friends</MonoLabel>
          <h2 className="text-3xl text-ink mt-1 leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
            who&apos;s where, when
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <MonoLabel>sort</MonoLabel>
          <div className="relative">
            <select
              value={selected || "all"}
              onChange={(e) => setSelected(e.target.value)}
              className="appearance-none bg-white text-ink text-sm font-medium px-4 py-2 pr-8 rounded-full border border-ink-15 outline-none cursor-pointer hover:border-ink-40 transition-colors"
            >
              <option value="all">all of my friends</option>
              {uniqueOwners.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-60 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-ink-8 p-5 w-full overflow-hidden">
        <div className="flex flex-row overflow-x-auto gap-3 pb-2 min-h-[280px]">
          {days.map((day, dayIdx) => {
            const rawDay = filteredClasses.filter(
              (c) =>
                c.day &&
                (c.day.toLowerCase() === day.toLowerCase() ||
                  c.day.toLowerCase() === day.slice(0, 3).toLowerCase())
            );
            const grouped = [];
            rawDay.forEach((course) => {
              const existing = grouped.find(
                (g) => g.course === course.course && g.time === course.time && g.location === course.location
              );
              if (existing) {
                const owners = new Set(existing.owner.split(/,\s*/).concat(course.owner.split(/,\s*/)));
                existing.owner = Array.from(owners).sort((a, b) => (a === "Me" ? -1 : b === "Me" ? 1 : a.localeCompare(b))).join(", ");
              } else {
                grouped.push({ ...course });
              }
            });

            const colorPalette = [T.coral, T.lilac, T.lime, "#b8d8c2", "#f0c4a8", T.coral, T.lilac];
            const dayColor = colorPalette[dayIdx % colorPalette.length];

            return (
              <div key={day} className="flex-1 min-w-[130px] flex flex-col gap-2">
                <div className="pb-2 mb-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: dayColor }} />
                  <h3 className="text-[10px] font-medium text-ink-60 uppercase tracking-widest" style={{ fontFamily: FF.mono }}>
                    {day.slice(0, 3)}
                  </h3>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  {grouped.length > 0 ? (
                    grouped.map((course, idx) => {
                      const isMine = course.owner === "Me" || course.owner?.startsWith("Me,");
                      return (
                        <div
                          key={idx}
                          className="flex flex-col p-2.5 rounded-xl"
                          style={{
                            background: isMine ? T.cream : "#fff",
                            border: `1px solid ${T.ink08}`,
                          }}
                        >
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full self-start mb-1"
                            style={{
                              background: isMine ? T.coralLt : T.lilac + "55",
                              color: isMine ? T.coralDk : T.lilacDk,
                              fontFamily: FF.mono,
                              letterSpacing: 0.5,
                            }}
                          >
                            {course.owner}
                          </span>
                          <h4 className="text-xs font-semibold text-ink line-clamp-2 leading-tight mb-1">
                            {course.course}
                          </h4>
                          <p className="text-[10px] text-ink-60" style={{ fontFamily: FF.mono }}>{course.time}</p>
                          <p className="text-[10px] text-ink-60 truncate">{course.location}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex-1 flex items-center justify-center min-h-[80px]">
                      <p className="text-[10px] text-ink-40">—</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {allClasses.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-ink-60 text-sm">add friends to see their schedule here.</p>
          </div>
        )}
      </div>
    </>
  );
};

export default App;
