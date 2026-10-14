import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AuthLayout from "../components/AuthLayout";

const ROLES = [
  { value: "student", label: "Student", hint: "Prepare for JEE and track your progress" },
  { value: "creator", label: "Content creator", hint: "Build chapters, questions and tests" },
  { value: "teacher", label: "Teacher", hint: "Guide and monitor students" },
  { value: "organiser", label: "Organiser", hint: "Run test series for your institution" },
];

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student" });
  const [error, setError] = useState("");
  const [pendingMsg, setPendingMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/studio" replace />;

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await signup(form);
      if (data.token) navigate("/studio");
      else setPendingMsg(data.message);
    } catch (err) {
      setError(err.response?.data?.error || "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  if (pendingMsg) {
    return (
      <AuthLayout>
        <div className="auth-form">
          <h2>Almost there</h2>
          <p className="muted">{pendingMsg}</p>
          <Link to="/login">Back to login</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Create your account</h2>
        <p className="muted">Choose how you'll use PrepTrack.</p>

        <div className="role-grid">
          {ROLES.map((r) => (
            <label key={r.value} className={`role-card ${form.role === r.value ? "selected" : ""}`}>
              <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={update} />
              <strong>{r.label}</strong>
              <small>{r.hint}</small>
            </label>
          ))}
        </div>

        <label>
          Full name
          <input name="name" value={form.name} onChange={update} required />
        </label>
        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={update} required />
        </label>
        <label>
          Password
          <input name="password" type="password" minLength={8} value={form.password} onChange={update} required />
        </label>
        {form.role !== "student" && (
          <p className="note">Non-student accounts are reviewed before activation.</p>
        )}
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{busy ? "Creating…" : "Sign up"}</button>
        <p className="muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
