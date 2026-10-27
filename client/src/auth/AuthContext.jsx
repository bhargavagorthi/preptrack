import { createContext, useContext, useEffect, useState } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Only wait for the server when there is a saved token to check
  const [loading, setLoading] = useState(() => !!localStorage.getItem("token"));

  // On page load, if a token exists, ask the server who we are
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    api
      .get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    setUser(data.user);
    // Pick up extras such as the profile photo
    api.get("/auth/me").then((r) => setUser(r.data.user)).catch(() => {});
    return data.user;
  }

  async function signup(form) {
    const { data } = await api.post("/auth/signup", form);
    if (data.token) {
      localStorage.setItem("token", data.token);
      setUser(data.user);
    }
    return data;
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
