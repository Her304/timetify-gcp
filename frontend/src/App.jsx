import { useState, useEffect, useRef, useMemo } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { HeaderNavApp } from "@/components/application/app-navigation/header-nav-app.jsx";
import { MobileBottomNav } from "@/components/application/app-navigation/mobile-bottom-nav.jsx";
import { MobileTopBar } from "@/components/application/app-navigation/mobile-top-bar.jsx";
import { WeekView } from "@/components/home/week_view";
import { Feed } from "@/components/feed/feed";
import { ChatThread } from "@/components/chat/ChatThread";
import { ClassDetails } from "@/components/class/class";
import Register from "@/components/register/register";
import InviteLanding from "@/components/invite/inviteLanding";
import Login from "@/components/login/login";
import ForgotPassword from "@/components/login/ForgotPassword";
import ResetPasswordConfirm from "@/components/login/ResetPasswordConfirm";
import { HeaderNavigationBase } from "@/components/application/app-navigation/header-navigation";
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
import Blog from "@/components/blog/Blog";
import BlogPost from "@/components/blog/BlogPost";
import Help from "@/components/help/help";
import Privacy from "@/components/privacy/privacy";
import Terms from "@/components/terms/terms";
import Community from "@/components/community/community";
import Landing from "@/components/landing/Landing";
import AddEventPage from "@/components/events/AddEventPage";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

// New-user coach-mark tour. Each step spotlights a real nav anchor
// (data-tour="…") in the header / bottom bar, in the order the user meets them.
const ONBOARDING_STEPS = [
  { target: "schedule", title: "your schedule", body: "your week at a glance — every class and event lives right here." },
  { target: "bell", title: "notifications", body: "friend requests, event invites and snaps all land in here." },
  { target: "profile", title: "your profile", body: "tweak your details and profile picture anytime you like." },
  { target: "add", title: "add & upload", body: "tap + to add classes or events. start by uploading your schedule — we'll parse it for you." },
  { target: "feed", title: "the feed", body: "your social hub — friends, snaps and study plans. jump in!" },
];

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
  const [events, setEvents] = useState([]);
  // Per-occurrence skips: course/event blocks the user chose to drop in favor
  // of an event. The week view hides the matching tiles.
  const [scheduleSkips, setScheduleSkips] = useState({ course_skips: [], event_skips: [] });

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

    // currentUser is seeded from localStorage for instant paint, but that cache
    // goes stale when the profile is edited elsewhere (e.g. on the deployed site
    // while a dev tab is open). Re-sync from the server on load so name/avatar
    // reflect the account's current state, then refresh the cache.
    const fetchCurrentUser = async () => {
      try {
        const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/user/`);
        if (!res.ok) return;
        const { user } = await res.json();
        if (!user) return;
        setCurrentUser(user);
        localStorage.setItem("user", JSON.stringify(user));
      } catch (err) {
        Sentry.captureException(err);
        console.error("Error fetching current user:", err);
      }
    };

    fetchData();
    fetchCurrentUser();
    fetchFriendsData();
    fetchSnapFeed();
    fetchEvents();
    fetchScheduleSkips();
  }, [token]);

  const currentMonday = () => {
    const d = new Date();
    const day = d.getDay(); // 0 = Sun
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const fetchScheduleSkips = async () => {
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/schedule-skips/?week=${currentMonday()}`
      );
      if (res.ok) setScheduleSkips(await res.json());
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  const fetchEvents = async () => {
    try {
      const monday = (() => {
        const d = new Date();
        const day = d.getDay(); // 0 = Sun
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
      })();
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/events/?week=${monday}`);
      if (res.ok) setEvents(await res.json());
      // Skips can change whenever events do (create/accept/edit), keep in sync.
      fetchScheduleSkips();
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  const respondToEventInvite = async (inviteId, action, resolution) => {
    try {
      const res = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/api/events/invites/${inviteId}/`,
        {
          method: "PATCH",
          body: JSON.stringify(
            resolution ? { action, conflict_resolution: resolution } : { action }
          ),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchEvents();
        fetchScheduleSkips();
      }
      // Surface the 409 conflict payload so the caller can prompt skip/keep.
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: {} };
    }
  };

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
      // Step 2 sends a FormData (multipart) when an avatar is attached; otherwise
      // a plain object goes up as JSON. Let the browser set the multipart boundary.
      const isFormData = formData instanceof FormData;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/register/`, {
        method: "POST",
        headers: isFormData ? {} : { "Content-Type": "application/json" },
        body: isFormData ? formData : JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok) {
        setRegistrationErrors({});
        // Auto-login with the credentials we just registered so the user lands
        // signed in rather than bouncing to /login. Pull them from whichever
        // shape came in (multipart when an avatar was attached, else JSON).
        const username = isFormData ? formData.get("username") : formData.username;
        const password = isFormData ? formData.get("password") : formData.password;
        try {
          const loginRes = await fetch(`${import.meta.env.VITE_API_URL}/api/login/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          if (loginRes.ok) {
            const loginData = await loginRes.json();
            localStorage.setItem("access_token", loginData.access);
            localStorage.setItem("refresh_token", loginData.refresh);
            localStorage.setItem("user", JSON.stringify(loginData.user));
            setToken(loginData.access);
            setCurrentUser(loginData.user);
            window.location.href = "/";
            return;
          }
        } catch (err) {
          console.error("Auto-login after registration failed:", err);
        }
        // Account exists but auto-login didn't take — send them to sign in.
        window.location.href = "/login";
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
      // No reload here — the Add page shows its own "ur all set" screen and the
      // user navigates to the schedule from there (a full load that refetches).
      if (response.ok) return { success: true };
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
      // Rate-limit response carries its own shape; surface to caller without overwriting other course errors.
      if (response.status === 429) return { success: false, rateLimited: true, data };
      setCourseErrors(data);
      return { success: false };
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
      // No reload — the Add page's "ur all set" screen handles navigation.
      if (response.ok) return { success: true };
      setCourseErrors(data);
      // Surface the failure payload so callers (e.g. the Add page) can route to
      // a dedicated screen for structured errors like {error: "overlap"}.
      return { success: false, data };
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
      const res = await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/friend-requests/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friend: friendId }),
      });
      return res.ok;
    } catch (err) { console.error("Send friend request error:", err); return false; }
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
      events={events}
      scheduleSkips={scheduleSkips}
      respondToEventInvite={respondToEventInvite}
      onEventsChanged={fetchEvents}
      fetchEvents={fetchEvents}
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
  events,
  scheduleSkips,
  respondToEventInvite,
  onEventsChanged,
  fetchEvents,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  // username → profile-picture URL, so schedule views (where a class "owner"
  // is only a username string) can show a real avatar instead of initials.
  const picByUsername = useMemo(() => {
    const map = {};
    (friendsList || []).forEach((f) => {
      const d = f.friend_details;
      if (d?.username) map[d.username] = d.profile_picture_url || null;
    });
    if (currentUser?.username) map[currentUser.username] = currentUser.profile_picture_url || null;
    return map;
  }, [friendsList, currentUser]);
  // Chat thread has its own pinned input bar + header; hiding the floating
  // mobile pill AND the mobile top bar prevents either from competing with
  // the chat's own chrome.
  const isChatThread = location.pathname.startsWith("/chat/");
  // Landing uses scroll-driven animations (sticky + framer-motion useScroll).
  // Those depend on the document being the scroller, so for the logged-out
  // landing route we drop the app's h-screen/overflow-hidden wrapper and let
  // the page scroll naturally.
  const isLandingRoute = !currentUser && location.pathname === "/";
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  // <main> is the scroll container (overflow-y-auto), so window.scrollTo is
  // a no-op. Reset its scrollTop on every route change so footer links and
  // other in-app navigation land at the top of the new page.
  const mainRef = useRef(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

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

  // Show the tour for freshly-registered users. Persist completion so it never
  // reappears; update optimistically so the overlay closes instantly.
  const completeOnboarding = async () => {
    setCurrentUser((prev) => {
      const updated = { ...prev, onboarding_completed: true };
      localStorage.setItem("user", JSON.stringify(updated));
      return updated;
    });
    try {
      await authenticatedFetch(`${import.meta.env.VITE_API_URL}/api/user/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch {
      // Non-fatal: the optimistic local flag still dismisses the tour.
    }
  };

  // Chat threads hide the mobile nav, so its anchors are missing there — gate the
  // tour to routes where the nav is fully present.
  const showOnboarding =
    !!currentUser && currentUser.onboarding_completed === false && !loading && !isChatThread;

  return (
    <div className={`flex flex-col w-full ${currentUser ? "bg-cream" : "bg-white"} ${isLandingRoute ? "min-h-screen" : "h-screen overflow-hidden"}`}>
      {currentUser ? (
        <HeaderNavApp
          currentUser={currentUser}
          onLogout={logoutUser}
          onRespondToRequest={respondToFriendRequest}
          onRespondToEventInvite={respondToEventInvite}
          onAddClass={() => navigate("/Add")}
          onAddEvent={() => navigate("/add-event")}
          unreadChatCount={unreadChatCount}
        />
      ) : (
        <div className={isLandingRoute ? "fixed top-0 left-0 right-0 z-50" : ""}>
          <HeaderNavigationSimpleDemo />
        </div>
      )}
      {currentUser && !isChatThread && (
        <MobileTopBar
          currentUser={currentUser}
          onRespondToRequest={respondToFriendRequest}
          onRespondToEventInvite={respondToEventInvite}
        />
      )}

      <main ref={mainRef} className={`flex-1 ${isLandingRoute ? "pt-16" : "overflow-y-auto"} flex flex-col`}>
        <div className={`flex-1 ${(currentUser && location.pathname !== "/add-event") || ["/about", "/help", "/privacy", "/terms", "/community"].includes(location.pathname) || location.pathname.startsWith("/blog") ? "p-4 md:p-8 max-w-7xl w-full mx-auto" : ""}`}>
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
                      events={events}
                      scheduleSkips={scheduleSkips}
                      currentUser={currentUser}
                      picByUsername={picByUsername}
                      onEventsChanged={onEventsChanged}
                      respondToEventInvite={respondToEventInvite}
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
                    friendRequests={friendRequests}
                    searchfriends={searchFriends}
                    sendFriendRequest={sendFriendRequest}
                    respondToFriendRequest={respondToFriendRequest}
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
            <Route
              path="/invite/:code"
              element={
                <InviteLanding
                  currentUser={currentUser}
                  registerUser={registerUser}
                  registrationErrors={registrationErrors}
                />
              }
            />
            <Route path="/login" element={<Login loginUser={loginUser} errors={loginErrors} />} />
            <Route path="/reset-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPasswordConfirm />} />
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
            <Route
              path="/add-event"
              element={
                <ProtectedRoute currentUser={currentUser}>
                  <AddEventPage
                    friendsList={friendsList}
                    currentUser={currentUser}
                    onCreated={() => { fetchEvents(); navigate("/"); }}
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/about" element={<About />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/help" element={<Help />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/community" element={<Community />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
        <div className={currentUser ? "hidden md:block" : ""}>
          <Footer currentUser={currentUser} />
        </div>
      </main>

      {currentUser && !isChatThread && (
        <MobileBottomNav
          currentUser={currentUser}
          unreadChatCount={unreadChatCount}
          onAddClass={() => navigate("/Add")}
          onAddEvent={() => navigate("/add-event")}
        />
      )}

      {showOnboarding && (
        <OnboardingTour
          steps={ONBOARDING_STEPS}
          onFinish={async () => {
            await completeOnboarding();
            navigate("/Add");
          }}
          onSkip={completeOnboarding}
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
