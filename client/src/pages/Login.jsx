import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AuthLayout from "../components/AuthLayout";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  // Why the last session ended (e.g. password changed on another device)
  // (kept for a minute, because the page may load twice on the way here)
  const [notice] = useState(() => {
    try {
      const n = JSON.parse(sessionStorage.getItem("authNotice") || "null");
      return n && Date.now() - n.at < 60000 ? n.msg : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/studio" replace />;

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(form.email, form.password);
      try { sessionStorage.removeItem("authNotice"); } catch { /* storage unavailable */ }
      navigate("/studio");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Welcome back</h2>
        <p className="muted">Log in to continue your prep.</p>
        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={update} required />
        </label>
        <label>
          Password
          <input name="password" type="password" value={form.password} onChange={update} required />
        </label>
        {notice && !error && <p className="note">{notice}</p>}
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        <p className="muted">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
