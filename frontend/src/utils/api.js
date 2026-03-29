/**
 * A wrapper around fetch that automatically adds the Authorization header
 * and handles token refresh logic.
 */
export const authenticatedFetch = async (url, options = {}) => {
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
    let response = await fetch(url, { ...options, headers });

    // Handle 401 Unauthorized (Token expired)
    if (response.status === 401) {
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${import.meta.env.VITE_API_URL}/api/token/refresh/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: refreshToken }),
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            localStorage.setItem("access_token", data.access);
            
            // Dispatch custom event to notify listeners (like App.jsx) that token has changed
            window.dispatchEvent(new CustomEvent('token-refreshed', { detail: data.access }));

            // Retry original request with new token
            const retryHeaders = {
              ...headers,
              "Authorization": `Bearer ${data.access}`,
            };
            response = await fetch(url, { ...options, headers: retryHeaders });
          } else {
            handleLogout();
          }
        } catch (err) {
          console.error("Token refresh failed:", err);
          handleLogout();
        }
      } else {
        handleLogout();
      }
    }

    return response;
  } catch (err) {
    throw err;
  }
};

const handleLogout = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  window.location.href = "/login";
};
