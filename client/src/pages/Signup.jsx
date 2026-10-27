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
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", role: "student", target_exam: "jee_main", whatsapp_consent: false,
  });
  const [error, setError] = useState("");
  const [pendingMsg, setPendingMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // While signing up, let handleSubmit decide where to go (new students → profile steps)
  if (user && !busy) return <Navigate to="/studio" replace />;

  const update = (e) =>
    setForm({ ...form, [e.target.name]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = { ...form };
      if (form.role !== "student") delete payload.target_exam;
      const data = await signup(payload);
      // New students go straight to the short "complete your profile" steps
      // (busy stays on so the "already logged in" redirect above doesn't win the race)
      if (data.token) {
        navigate(form.role === "student" ? "/studio/settings?welcome=1" : "/studio", { replace: true });
        return;
      }
      setPendingMsg(data.message);
    } catch (err) {
      setError(err.response?.data?.error || "Signup failed");
    }
    setBusy(false);
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
          Mobile number
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number"
            pattern="[+]?[0-9 ]{10,15}" title="Enter a 10-digit mobile number" value={form.phone} onChange={update} required />
        </label>
        <label className="consent">
          <input type="checkbox" name="whatsapp_consent" checked={form.whatsapp_consent} onChange={update} />
          <span>I agree to receive test reminders, results and updates from PrepTrack on WhatsApp. I can turn this off any time in Settings.</span>
        </label>
        <label>
          Password
          <input name="password" type="password" minLength={8} value={form.password} onChange={update} required />
        </label>
        {form.role === "student" && (
          <div className="exam-pick">
            <span>I'm preparing for</span>
            <div className="exam-pick-row">
              {[["jee_main", "JEE Main"], ["jee_advanced", "JEE Main + Advanced"]].map(([v, l]) => (
                <label key={v} className={`exam-chip ${form.target_exam === v ? "selected" : ""}`}>
                  <input type="radio" name="target_exam" value={v} checked={form.target_exam === v} onChange={update} />
                  {l}
                </label>
              ))}
            </div>
            <small className="muted">Just the essentials now. You can add the rest of your details after signing up.</small>
          </div>
        )}
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
