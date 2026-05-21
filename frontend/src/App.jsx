import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { HeaderNavApp } from "@/components/application/app-navigation/header-nav-app.jsx";
import { MobileBottomNav } from "@/components/application/app-navigation/mobile-bottom-nav.jsx";
import { MobileTopBar } from "@/components/application/app-navigation/mobile-top-bar.jsx";
import { WeekView } from "@/components/home/week_view";
import { Feed } from "@/components/feed/feed";
import { ChatThread } from "@/components/chat/ChatThread";
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

const simpleItems = [];
const HeaderNavigationSimpleDemo = () => <HeaderNavigationBase activeUrl="/" items={simpleItems} />;

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

  return (
    <AppShell
      currentUser={currentUser}
      logoutUser={logoutUser}
      loading={loading}
      error={error}
      personalSchedule={personalSchedule}
      friendsSchedule={friendsSchedule}
      totalClasses={totalClasses}
      allClasses={allClasses}
      snapsByCourse={snapsByCourse}
      friendsList={friendsList}
      friendRequests={friendRequests}
      fetchSnapFeed={fetchSnapFeed}
      searchFriends={searchFriends}
      sendFriendRequest={sendFriendRequest}
      respondToFriendRequest={respondToFriendRequest}
      setCurrentUser={setCurrentUser}
      addCourse={addCourse}
      analyzeCourse={analyzeCourse}
      finalizeCourse={finalizeCourse}
      registerUser={registerUser}
      registrationErrors={registrationErrors}
      loginUser={loginUser}
      loginErrors={loginErrors}
      courseErrors={courseErrors}
      isErrorReportModalOpen={isErrorReportModalOpen}
      setIsErrorReportModalOpen={setIsErrorReportModalOpen}
    />
  );
};

// AppShell — uses useNavigate so it must live inside <Router>. App itself sits
// directly inside the router in main.jsx so the same applies, but extracting
// keeps the hook usage explicit & lets the camera button push routes.
const AppShell = ({
  currentUser,
  logoutUser,
  loading,
  error,
  personalSchedule,
  friendsSchedule,
  totalClasses,
  allClasses,
  snapsByCourse,
  friendsList,
  friendRequests,
  fetchSnapFeed,
  searchFriends,
  sendFriendRequest,
  respondToFriendRequest,
  setCurrentUser,
  addCourse,
  analyzeCourse,
  finalizeCourse,
  registerUser,
  registrationErrors,
  loginUser,
  loginErrors,
  courseErrors,
  isErrorReportModalOpen,
  setIsErrorReportModalOpen,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Chat thread has its own pinned input bar + header; hiding the floating
  // mobile pill AND the mobile top bar prevents either from competing with
  // the chat's own chrome.
  const isChatThread = location.pathname.startsWith("/chat/");
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // 30s poll for the global chat unread badge while authed. Also re-runs when
  // the user enters /chat/<id> so the per-room read state catches up quickly
  // (otherwise the badge lags by up to 30s after marking read on the server).
  // No synchronous reset on logout: the badge nav surfaces (HeaderNavApp +
  // MobileBottomNav) only render when currentUser is set, so a stale count is
  // never displayed.
  useEffect(() => {
    if (!currentUser) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await authenticatedFetch(
          `${import.meta.env.VITE_API_URL}/api/chats/unread/`
        );
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setUnreadChatCount(Number(data.total) || 0);
      } catch {
        // transient; next interval will retry
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [currentUser, location.pathname]);

  return (
    <div className={`flex flex-col h-screen w-full ${currentUser ? "bg-cream" : "bg-white"} overflow-hidden`}>
      {currentUser ? (
        <HeaderNavApp
          currentUser={currentUser}
          onLogout={logoutUser}
          onRespondToRequest={respondToFriendRequest}
          unreadChatCount={unreadChatCount}
        />
      ) : (
        <HeaderNavigationSimpleDemo />
      )}
      {currentUser && !isChatThread && (
        <MobileTopBar
          currentUser={currentUser}
          onRespondToRequest={respondToFriendRequest}
        />
      )}

      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className={`flex-1 ${currentUser ? "p-4 md:p-8 max-w-7xl w-full mx-auto" : ""}`}>
          <Routes>
            <Route
              path="/"
              element={
                currentUser ? (
                  loading ? (
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
                    <WeekView
                      allClasses={allClasses}
                      currentUser={currentUser}
                      onAddClass={() => navigate("/Add")}
                    />
                  )
                ) : (
                  <Landing />
                )
              }
            />
            <Route
              path="/feed"
              element={
                <ProtectedRoute currentUser={currentUser}>
                  <Feed
                    snapsByCourse={snapsByCourse}
                    personalSchedule={personalSchedule}
                    allMyCourses={totalClasses}
                    friendsList={friendsList}
                    currentUser={currentUser}
                    onSnapsChanged={fetchSnapFeed}
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat/:roomId"
              element={
                <ProtectedRoute currentUser={currentUser}>
                  <ChatThread
                    currentUser={currentUser}
                    allClasses={allClasses}
                    snapsByCourse={snapsByCourse}
                  />
                </ProtectedRoute>
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
                    currentUser={currentUser}
                    allClasses={allClasses}
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
                  <Profile currentUser={currentUser} setCurrentUser={setCurrentUser} Class_details={totalClasses} onLogout={logoutUser} />
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
        <div className="hidden md:block">
          <Footer currentUser={currentUser} />
        </div>
      </main>

      {currentUser && !isChatThread && (
        <MobileBottomNav
          currentUser={currentUser}
          unreadChatCount={unreadChatCount}
        />
      )}

      <ErrorToast
        isOpen={isErrorReportModalOpen}
        onClose={() => setIsErrorReportModalOpen(false)}
      />
    </div>
  );
};

export default App;
