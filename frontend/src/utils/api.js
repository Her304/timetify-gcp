/**
 * A wrapper around fetch that automatically adds the Authorization header
 * and handles token refresh logic.
 */
// Helper to clean up URLs and avoid double slashes
const normalizeUrl = (url) => url.replace(/([^:]\/)\/+/g, "$1");

// Singleton promise to handle multiple simultaneous refreshes
let refreshPromise = null;

export const authenticatedFetch = async (url, options = {}) => {
  const cleanUrl = normalizeUrl(url);
  const currentToken = localStorage.getItem("access_token");
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (currentToken) {
    headers["Authorization"] = `Bearer ${currentToken}`;
  }

  // Don't set Content-Type if we're sending FormData
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  try {
    let response = await fetch(cleanUrl, { ...options, headers });

    // Handle 401 Unauthorized or 403 Forbidden (Token expired/invalid)
    if (response.status === 401 || response.status === 403) {
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          // If a refresh is already in progress, wait for it
          if (!refreshPromise) {
            refreshPromise = fetch(`${import.meta.env.VITE_API_URL}/api/token/refresh/`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refresh: refreshToken }),
            }).then(async (res) => {
              if (res.ok) {
                const data = await res.json();
                localStorage.setItem("access_token", data.access);
                if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
                
                window.dispatchEvent(new CustomEvent('token-refreshed', { detail: data.access }));
                return data.access;
              }
              throw new Error("Refresh failed");
            }).finally(() => {
              refreshPromise = null;
            });
          }

          const newAccessToken = await refreshPromise;

          // Retry original request with the new token
          const retryHeaders = {
            ...headers,
            "Authorization": `Bearer ${newAccessToken}`,
          };
          response = await fetch(cleanUrl, { ...options, headers: retryHeaders });
        } catch (err) {
          console.error("Token refresh failed:", err);
          handleLogout();
          return response; // Return original 401/403
        }
      } else {
        handleLogout();
      }
    }

    // Automatically notify listeners of server errors (5xx)
    if (response.status >= 500) {
      window.dispatchEvent(new CustomEvent('server-error', { detail: { status: response.status, url: cleanUrl } }));
    }

    return response;
  } catch (err) {
    // Notify listeners of network errors
    window.dispatchEvent(new CustomEvent('server-error', { detail: { error: err.message, url: cleanUrl } }));
    throw err;
  }
};

const handleLogout = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  window.location.href = "/login";
};
