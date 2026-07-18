/**
 * A wrapper around fetch that automatically adds the Authorization header
 * and handles token refresh logic.
 */
// Catch misconfigured builds where VITE_API_URL got inlined as "undefined".
if (!import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL === "undefined") {
  console.error(
    "VITE_API_URL is not set at build time — API requests will resolve against the current origin and fail. " +
    "Check that frontend/.env.production is present during `npm run build`."
  );
}

// Helper to clean up URLs and avoid double slashes
const normalizeUrl = (url) => url.replace(/([^:]\/)\/+/g, "$1");

// Singleton promise to handle multiple simultaneous refreshes
let refreshPromise = null;

// fetch with a couple of retries for transient network errors (e.g. Cloud Run
// cold-start connection drops). Only network-level throws are retried — a real
// HTTP response (any status) is returned as-is.
const fetchWithRetry = async (url, options, attempts = 2, delayMs = 300) => {
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
};

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
      if (!refreshToken) {
        handleLogout();
        return response;
      }

      // Step 1: obtain a fresh access token. A failure HERE is a genuine auth
      // failure (refresh token rejected/expired) → log out.
      let newAccessToken;
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

        newAccessToken = await refreshPromise;
      } catch (err) {
        console.error("Token refresh failed:", err);
        handleLogout();
        return response; // Return original 401/403
      }

      // Step 2: retry the original request with the new token. A network error
      // HERE is a transient failure (e.g. Cloud Run cold start), NOT an auth
      // failure — it must not destroy a freshly-refreshed session. Let it fall
      // through to the outer catch (server-error event + throw) so the caller
      // can handle it, exactly like any other network error.
      const retryHeaders = {
        ...headers,
        "Authorization": `Bearer ${newAccessToken}`,
      };
      // Don't set Content-Type if we're sending FormData
      if (options.body instanceof FormData) {
        delete retryHeaders["Content-Type"];
      }
      response = await fetchWithRetry(cleanUrl, { ...options, headers: retryHeaders });
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
