import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import {
  Archive,
  BarChartSquare02,
  CheckDone01,
  CurrencyDollarCircle,
  Grid03,
  HomeLine,
  LayoutAlt01,
  LineChartUp03,
  MessageChatCircle,
  NotificationBox,
  Package,
  PieChart03,
  Plus,
  Rows01,
  Settings01,
  Star01,
  User01,
  Users01,
  UsersPlus,
  AlertCircle,
} from "@untitledui/icons";
import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple.jsx";
import { BadgeWithDot } from "@/components/base/badges/badges.tsx";
import { Today } from "@/components/home/today";
import { Today_friend } from "@/components/home/today_friend";
import { TotalClassSchedule } from "@/components/home/total_class";
import { ClassDetails } from "@/components/class/class";
import Register from "@/components/register/register";
import Login from "@/components/login/login";
import { HeaderNavigationBase } from "@/components/application/app-navigation/header-navigation";
import SearchFriend from "@/components/friend/friend";
import Add from "@/components/add/add";
import Profile from "@/components/user/profile";
import { initLogger } from "@/utils/logger";
import ErrorReportModal from "@/components/shared/ErrorReportModal";
import NotFound from "@/components/shared/NotFound";
import ProtectedRoute from "@/components/shared/ProtectedRoute";
import { Footer } from "@/components/application/footer/footer";
import About from "@/components/about/about";
import Help from "@/components/help/help";
import Privacy from "@/components/privacy/privacy";
import Terms from "@/components/terms/terms";


const simpleItems = [
];

const HeaderNavigationSimpleDemo = () => <HeaderNavigationBase activeUrl="/" items={simpleItems} />;




const App = () => {
  const [personalSchedule, setPersonalSchedule] = useState([]);
  const [friendsSchedule, setFriendsSchedule] = useState([]);
  const [totalClasses, setTotalClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [registrationErrors, setRegistrationErrors] = useState({});
  const [loginErrors, setLoginErrors] = useState({});
  const [courseErrors, setCourseErrors] = useState({});
  const [friendsList, setFriendsList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [isErrorReportModalOpen, setIsErrorReportModalOpen] = useState(false);

  // ---------- Init Logger ----------
  useEffect(() => {
    initLogger();
  }, []);

  // ---------- Auth state (persisted in localStorage) ----------
  const [token, setToken] = useState(() => localStorage.getItem("access_token") || null);
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")) || null; }
    catch { return null; }
  });

  // ---------- Auth helpers ----------
  const logoutUser = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setToken(null);
    setCurrentUser(null);
    window.location.href = "/login";
  };

  const authenticatedFetch = async (url, options = {}) => {
    let currentToken = localStorage.getItem("access_token");
    const headers = {
      ...options.headers,
      "Authorization": `Bearer ${currentToken}`,
    };

    try {
      let response = await fetch(url, { ...options, headers });

      if (response.status === 401) {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          try {
            const refreshRes = await fetch("http://127.0.0.1:8000/api/token/refresh/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh: refreshToken }),
            });

            if (refreshRes.ok) {
              const data = await refreshRes.json();
              localStorage.setItem("access_token", data.access);
              setToken(data.access);

              // Retry original request with new token
              const retryHeaders = {
                ...options.headers,
                "Authorization": `Bearer ${data.access}`,
              };
              response = await fetch(url, { ...options, headers: retryHeaders });
            } else {
              logoutUser();
            }
          } catch (err) {
            console.error("Token refresh failed:", err);
            logoutUser();
          }
        } else {
          logoutUser();
        }
      }

      // Automatically trigger Error Report Modal for server errors (5xx)
      if (response.status >= 500) {
        console.error(`Server error: ${response.status} at ${url}`);
        setIsErrorReportModalOpen(true);
      }

      return response;
    } catch (err) {
      // Trigger modal for network errors or other fetch failures
      console.error("Network or fetch error:", err);
      setIsErrorReportModalOpen(true);
      throw err;
    }
  };

  useEffect(() => {
    if (token) {
      const fetchData = async () => {
        try {
          // Use authenticatedFetch for the home schedule
          const response = await authenticatedFetch("http://127.0.0.1:8000/");
          if (!response.ok) {
            throw new Error("Failed to fetch schedule");
          }

          // convert data from api
          const data = await response.json();

          // Get today's day string (e.g., "MON")
          const daysShort = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
          const currentDay = daysShort[new Date().getDay()];

          const mapClass = (cls, day) => {
            const baseCourseId = cls.parent_course_id || cls.course_id;
            const displayCourseId = cls.is_lab ? `${baseCourseId} Lab` : baseCourseId;
            return {
              ...cls,
              day: day,
              course: displayCourseId,
              base_course: baseCourseId,
              time: `${cls.start_time} - ${cls.end_time}`,
              location: cls.classroom
            };
          };

          // get today's classes
          const rawTodayClasses = data[currentDay] || [];

          // Split into personal and friend schedules
          const myClasses = rawTodayClasses
            .filter(cls => cls.owner === "Me")
            .map(cls => mapClass(cls, currentDay));

          const otherClasses = rawTodayClasses
            .filter(cls => cls.owner !== "Me")
            .map(cls => ({
              ...mapClass(cls, currentDay),
              friend: cls.owner
            }));

          // Flatten all classes for the weekly schedule
          const allSchedule = Object.keys(data)
            .filter(day => ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].includes(day))
            .flatMap(day =>
              data[day].map(cls => mapClass(cls, day))
            );

          setPersonalSchedule(myClasses);
          setFriendsSchedule(otherClasses);
          setTotalClasses(allSchedule);
          setLoading(false);
        } catch (err) {
          setError(err.message);
          setLoading(false);
          // Automatically trigger Error Report Modal for critical data fetch errors
          setIsErrorReportModalOpen(true);
        }
      };

      const fetchFriendsData = async () => {
        try {
          // Fetch friends list
          const friendsRes = await authenticatedFetch("http://127.0.0.1:8000/api/friends/");
          if (friendsRes.ok) {
            const friendsData = await friendsRes.json();
            setFriendsList(friendsData);
          }

          // Fetch pending friend requests
          const requestsRes = await authenticatedFetch("http://127.0.0.1:8000/api/friend-requests/pending/");
          if (requestsRes.ok) {
            const requestsData = await requestsRes.json();
            setFriendRequests(requestsData);
          }
        } catch (err) {
          console.error("Error fetching friends data:", err);
        }
      };

      fetchData();
      fetchFriendsData();
    } else {
      setLoading(false);
    }
  }, [token]);

  // ---------- Auth helpers ----------
  const loginUser = async (formData) => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/login/", {
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
      const response = await fetch("http://127.0.0.1:8000/api/register/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        console.log("Registration successful:", data);
        setRegistrationErrors({});
        // Redirect to home or login after registration
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

      const response = await authenticatedFetch("http://127.0.0.1:8000/api/courses/", {
        method: "POST",
        headers,
        body: isFormData ? courseData : JSON.stringify(courseData),
      });

      const data = await response.json();
      if (response.ok) {
        // Refresh data
        window.location.reload();
        return { success: true };
      } else {
        setCourseErrors(data);
        return { success: false };
      }
    } catch (err) {
      console.error("Add course error:", err);
      setCourseErrors({ non_field_errors: ["An unexpected error occurred."] });
      return { success: false };
    }
  };

  const analyzeCourse = async (formData) => {
    try {
      setCourseErrors({});
      const response = await authenticatedFetch("http://127.0.0.1:8000/api/courses/analyze/", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        return { success: true, data };
      } else {
        setCourseErrors(data);
        return { success: false };
      }
    } catch (err) {
      console.error("Analyze course error:", err);
      setCourseErrors({ non_field_errors: ["An unexpected error occurred during analysis."] });
      return { success: false };
    }
  };

  const finalizeCourse = async (coursesData) => {
    try {
      setCourseErrors({});
      const response = await authenticatedFetch("http://127.0.0.1:8000/api/courses/finalize/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: coursesData }),
      });

      const data = await response.json();
      if (response.ok) {
        window.location.reload();
        return { success: true };
      } else {
        setCourseErrors(data);
        return { success: false };
      }
    } catch (err) {
      console.error("Finalize course error:", err);
      setCourseErrors({ non_field_errors: ["An unexpected error occurred during finalization."] });
      return { success: false };
    }
  };

  const searchFriends = async (query) => {
    try {
      const response = await authenticatedFetch(`http://127.0.0.1:8000/api/friends/search/?q=${query}`);
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (err) {
      console.error("Search friends error:", err);
      return [];
    }
  };

  const sendFriendRequest = async (friendId) => {
    try {
      const response = await authenticatedFetch("http://127.0.0.1:8000/api/friend-requests/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ friend: friendId }),
      });
      if (!response.ok) {
        const data = await response.json();
        console.error("Failed to send friend request:", data);
      }
    } catch (err) {
      console.error("Send friend request error:", err);
    }
  };

  const respondToFriendRequest = async (requestId, action) => {
    try {
      const response = await authenticatedFetch(`http://127.0.0.1:8000/api/friend-requests/${requestId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        // Refresh friend requests
        const requestsRes = await authenticatedFetch("http://127.0.0.1:8000/api/friend-requests/pending/");
        if (requestsRes.ok) {
          setFriendRequests(await requestsRes.json());
        }
        // Also refresh friends list
        const friendsRes = await authenticatedFetch("http://127.0.0.1:8000/api/friends/");
        if (friendsRes.ok) {
          setFriendsList(await friendsRes.json());
        }
      }
    } catch (err) {
      console.error("Respond to friend request error:", err);
    }
  };

  const navItemsSimple = currentUser ? [
    {
      label: "Home",
      href: "/",
      icon: HomeLine,
      items: [
        { label: "Today", href: "/#today" },
        { label: "My Schedule", href: "/#schedule" },

      ],
    },
    {
      label: "My Class",
      href: "/class",
      icon: BarChartSquare02,
      items: Array.from(new Set(totalClasses.map((cls) => cls.base_course))).map((courseName) => ({
        label: courseName,
        href: `/class/${courseName}`,
      })),
    },
    {
      label: "Friend",
      href: "/friend",
      icon: Rows01,
      items: [
        { label: "My Friends", href: "/friend#my-friends" },
        { label: "Search", href: "/friend#search" },
        { label: "Schedule", href: "/friend#schedule" },
      ],
    },
  ] : [];

  const secondaryNavItems = currentUser ? [
    {
      label: "Add",
      href: "/Add",
      icon: Plus,
    },
    {
      label: "Profile",
      href: "/profile",
      icon: User01,
    },
  ] : [
    { label: "Register", href: "/register", icon: UsersPlus },
  ];

  const LogOut = currentUser
    ? [{ label: "Log Out", href: "/logout", onClick: logoutUser }]
    : [{ label: "Log In", href: "/login" }];

  const todayStr = new Date().toDateString();

  return (
    <div className={`flex ${currentUser ? "flex-row" : "flex-col"} h-screen w-full bg-gray-50 overflow-hidden`}>
      {currentUser ? (
        <SidebarNavigationSimple items={navItemsSimple} secondaryItems={secondaryNavItems} LogOut={LogOut} />
      ) : (
        <HeaderNavigationSimpleDemo />
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          <Routes>
            <Route
              path="/"
              element={
                currentUser ? (
                  <div id="today" className="space-y-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">{todayStr}</h1>
                    {loading ? (
                      <p className="text-gray-500 animate-pulse">Loading schedule...</p>
                    ) : error ? (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                        <p className="font-semibold">Error loading schedule</p>
                        <p className="text-sm">{error}</p>
                      </div>
                    ) : (
                      <>
                        <section>
                          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span className="w-2 h-6 bg-[#ffc759] rounded-full"></span>
                            Today's Class
                          </h2>
                          {personalSchedule.length === 0 ? (
                            <div className="p-8 bg-white rounded-xl border border-dashed border-gray-200 text-center">
                              <p className="text-gray-500">You have no classes scheduled for today.</p>
                            </div>
                          ) : (
                            <Today Class_details={personalSchedule} />
                          )}
                        </section>

                        <section>
                          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span className="w-2 h-6 bg-[#ffc759] rounded-full"></span>
                            Friends' Class Today
                          </h2>
                          {friendsSchedule.length === 0 ? (
                            <div className="p-8 bg-white rounded-xl border border-dashed border-gray-200 text-center">
                              <p className="text-gray-500">None of your friends have classes today.</p>
                            </div>
                          ) : (
                            <Today_friend Class_details={friendsSchedule} />
                          )}
                        </section>
                        <section id="schedule">
                          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <span className="w-2 h-6 bg-[#ffc759] rounded-full"></span>
                            My Class Schedule
                          </h2>
                          <TotalClassSchedule Class_details={totalClasses} />
                        </section>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full space-y-6 text-center py-20">
                    <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">Welcome to Timetify</h1>
                    <p className="text-xl text-gray-600 max-w-2xl">
                      Your personal and social schedule manager. Keep track of your classes and sync up with friends effortlessly.
                    </p>
                    <div className="flex gap-4 mt-8">
                      <a href="/login" className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                        Log In
                      </a>
                      <a href="/register" className="px-6 py-3 bg-white text-blue-600 border border-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors shadow-sm">
                        Register
                      </a>
                    </div>
                  </div>
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
                    Class_details={totalClasses}
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
                  <Add
                    addCourse={addCourse}
                    analyzeCourse={analyzeCourse}
                    finalizeCourse={finalizeCourse}
                    errors={courseErrors}
                  />
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

      <ErrorReportModal
        isOpen={isErrorReportModalOpen}
        onClose={() => setIsErrorReportModalOpen(false)}
        currentUser={currentUser}
        authenticatedFetch={authenticatedFetch}
      />
    </div>
  );
};

export default App;
