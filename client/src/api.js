import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A session that has ended (password changed elsewhere, account blocked, token expired)
// sends the person back to the login page instead of leaving a half-broken screen.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || "";
    if (status === 401 && localStorage.getItem("token") && !url.startsWith("/auth/login") && !url.startsWith("/auth/password")) {
      localStorage.removeItem("token");
      const msg = err.response?.data?.error;
      if (msg) sessionStorage.setItem("authNotice", JSON.stringify({ msg, at: Date.now() }));
      if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
    }
    return Promise.reject(err);
  }
);

export default api;
