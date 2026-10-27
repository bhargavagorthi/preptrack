import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { Ring, FxButton, Avatar } from "../components/Fx";
import { SECTIONS, CITY_HINTS, WELCOME_ORDER } from "../settings/fields";

const toForm = (v) => (v === null || v === undefined ? "" : String(v));
const ROLE_LABEL = { student: "Student", creator: "Content creator", teacher: "Teacher", organiser: "Organiser", admin: "Admin" };

function Toast({ toast }) {
  if (!toast) return null;
  return <div key={toast.key} className={`st-toast ${toast.kind || ""}`}>{toast.text}</div>;
}

/* ---------------- One field ---------------- */
function Field({ f, value, error, onChange, stateValue }) {
  const id = `f-${f.key}`;
  const clear = value !== "" && !f.required && (
    <button type="button" className="st-clear" title={`Clear ${f.label.toLowerCase()}`} onClick={() => onChange("")}>×</button>
  );
  let input;
  if (f.type === "select") {
    input = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (f.type === "city") {
    const hints = CITY_HINTS[stateValue] || [];
    input = (
      <>
        <input id={id} value={value} list={`${id}-list`} placeholder={stateValue ? "Type or pick a city" : "Pick a state first, or type"}
          onChange={(e) => onChange(e.target.value)} />
        <datalist id={`${id}-list`}>{hints.map((c) => <option key={c} value={c} />)}</datalist>
      </>
    );
  } else {
    input = (
      <input id={id} type={f.type === "tel" ? "tel" : f.type} value={value} placeholder={f.placeholder}
        inputMode={f.inputMode} maxLength={f.maxLength} step={f.step} min={f.min} max={f.max}
        onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <div className={`st-field ${f.full ? "full" : ""} ${error ? "has-error" : ""} ${value !== "" ? "filled" : ""}`}>
      <label htmlFor={id}>
        {f.label}
        {f.required ? <span className="st-req" title="Required">*</span>
          : f.key_field && <span className="st-key" title="Needed to complete your profile">•</span>}
      </label>
      <div className="st-input">{input}{clear}</div>
      {error ? <small className="st-err">{error}</small> : f.hint && <small className="st-hint">{f.hint}</small>}
    </div>
  );
}

/* ---------------- A section of profile fields ---------------- */
function SectionForm({ section, profile, onSaved, notify, welcome, onContinue, onSkip }) {
  const initial = useMemo(
    () => Object.fromEntries(section.fields.map((f) => [f.key, toForm(profile?.[f.key])])),
    [section, profile]
  );
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const changed = Object.keys(values).filter((k) => values[k] !== initial[k]);
  const filledCount = section.fields.filter((f) => initial[f.key] !== "").length;

  async function save(e) {
    e?.preventDefault();
    if (!changed.length) return welcome ? onContinue() : undefined;
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.patch("/profile", {
        section: section.id,
        values: Object.fromEntries(changed.map((k) => [k, values[k]])),
      });
      onSaved(data);
      notify({ text: `✓ ${section.title} saved` });
      if (welcome) onContinue();
    } catch (err) {
      setErrors(err.response?.data?.fields || {});
      notify({ text: err.response?.data?.error || "Couldn't save", kind: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setBusy(true);
    try {
      const { data } = await api.delete(`/profile/section/${section.id}`);
      onSaved(data);
      setConfirmClear(false);
      notify({ text: `${section.title} cleared` });
    } catch (err) {
      notify({ text: err.response?.data?.error || "Couldn't clear", kind: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="st-card" onSubmit={save}>
      <div className="st-card-head">
        <span className="st-card-icon">{section.icon}</span>
        <div>
          <h2>{section.title}</h2>
          <p>{section.blurb}</p>
        </div>
      </div>
      <div className="st-grid">
        {section.fields.map((f, i) => (
          <div key={f.key} className="st-cell" style={{ "--i": i }}>
            <Field f={f} value={values[f.key]} error={errors[f.key]} stateValue={values.state}
              onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          </div>
        ))}
      </div>
      <p className="st-legend"><span className="st-key">•</span> needed to complete your profile. Everything else is optional.</p>
      <div className="st-actions">
        {!welcome && filledCount > 0 && (
          confirmClear ? (
            <div className="st-confirm">
              <span>Delete everything in {section.title.toLowerCase()}?</span>
              <button type="button" className="ghost small" onClick={() => setConfirmClear(false)}>Keep</button>
              <button type="button" className="danger small" onClick={clearAll} disabled={busy}>Delete</button>
            </div>
          ) : (
            <button type="button" className="st-link-danger" onClick={() => setConfirmClear(true)}>🗑 Clear this section</button>
          )
        )}
        <div className="st-actions-right">
          {welcome ? (
            <>
              <button type="button" className="ghost" onClick={onSkip}>Skip for now</button>
              <FxButton type="submit" variant="big" busy={busy} busyText="Saving…">Save & continue →</FxButton>
            </>
          ) : (
            <>
              {changed.length > 0 && <button type="button" className="ghost" onClick={() => { setValues(initial); setErrors({}); }}>Discard</button>}
              <FxButton type="submit" busy={busy} busyText="Saving…" disabled={!changed.length}>
                {changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Saved"}
              </FxButton>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

/* ---------------- Notifications ---------------- */
function Notifications({ section, profile, onSaved, notify }) {
  const [busyKey, setBusyKey] = useState(null);
  async function toggle(key, value) {
    setBusyKey(key);
    try {
      const { data } = await api.patch("/profile", { section: "notifications", values: { [key]: value } });
      onSaved(data);
      notify({ text: value ? "✓ Turned on" : "Turned off" });
    } catch (err) {
      notify({ text: err.response?.data?.error || "Couldn't save", kind: "bad" });
    } finally {
      setBusyKey(null);
    }
  }
  const defaults = { notify_email: true, notify_whatsapp: false, notify_contests: true, notify_results: true };
  const consentDate = profile?.whatsapp_consent_at
    ? new Date(profile.whatsapp_consent_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
    : null;
  return (
    <div className="st-card">
      <div className="st-card-head">
        <span className="st-card-icon">{section.icon}</span>
        <div><h2>{section.title}</h2><p>{section.blurb}</p></div>
      </div>
      <ul className="st-toggles">
        {section.fields.map((f, i) => {
          const on = profile ? !!profile[f.key] : defaults[f.key];
          return (
            <li key={f.key} style={{ "--i": i }}>
              <div>
                <b>{f.label}</b>
                <small>{f.hint}</small>
                {f.consent && (
                  <small className={`st-consent ${on ? "on" : ""}`}>
                    {on
                      ? <>✓ You agreed to WhatsApp messages{consentDate ? ` on ${consentDate}` : ""}{profile?.phone ? ` · ${profile.phone}` : ""}</>
                      : profile?.phone ? "Off. Turning this on means you agree to receive WhatsApp messages." : "Add your mobile number in Personal details to turn this on."}
                  </small>
                )}
              </div>
              <button type="button" role="switch" aria-checked={on} aria-label={f.label}
                disabled={busyKey === f.key || (f.consent && !on && !profile?.phone)}
                className={`st-switch ${on ? "on" : ""}`} onClick={() => toggle(f.key, !on)}>
                <span />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- Account: photo, name, email ---------------- */
function Account({ data, onSaved, notify }) {
  const { user, profile } = data;
  const { setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, email: user.email, current_password: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);
  const emailChanged = form.email.trim().toLowerCase() !== user.email;
  const dirty = form.name.trim() !== user.name || emailChanged;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const { data: res } = await api.patch("/profile/account", form);
      onSaved(res);
      setUser((u) => ({ ...u, name: res.user.name, email: res.user.email }));
      setForm({ name: res.user.name, email: res.user.email, current_password: "" });
      notify({ text: "✓ Account updated" });
    } catch (err) {
      setErrors(err.response?.data?.fields || {});
      notify({ text: err.response?.data?.error || "Couldn't save", kind: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function upload(file) {
    if (!file) return;
    setPhotoBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data: res } = await api.post("/profile/photo", fd);
      onSaved(res);
      setUser((u) => ({ ...u, photo_url: res.profile?.photo_url }));
      notify({ text: "✓ Photo updated" });
    } catch (err) {
      notify({ text: err.response?.data?.error || "Upload failed", kind: "bad" });
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      const { data: res } = await api.delete("/profile/photo");
      onSaved(res);
      setUser((u) => ({ ...u, photo_url: null }));
      notify({ text: "Photo removed" });
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <form className="st-card" onSubmit={save}>
      <div className="st-card-head">
        <span className="st-card-icon">👤</span>
        <div><h2>Account</h2><p>Your photo, name and login email.</p></div>
      </div>
      <div className="st-photo-row">
        <div className={`st-photo ${photoBusy ? "busy" : ""}`}>
          {profile?.photo_url ? <img src={profile.photo_url} alt="Your profile" /> : <Avatar name={user.name} size={88} />}
        </div>
        <div className="st-photo-actions">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files[0])} />
          <button type="button" className="small" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
            {photoBusy ? "Working…" : profile?.photo_url ? "Change photo" : "Upload photo"}
          </button>
          {profile?.photo_url && <button type="button" className="ghost small" onClick={removePhoto} disabled={photoBusy}>Remove</button>}
          <small className="st-hint">PNG, JPG or WebP, up to 3 MB.</small>
        </div>
      </div>
      <div className="st-grid">
        <div className="st-cell"><div className={`st-field ${errors.name ? "has-error" : ""}`}>
          <label htmlFor="acc-name">Full name</label>
          <div className="st-input"><input id="acc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        </div></div>
        <div className="st-cell"><div className="st-field">
          <label htmlFor="acc-email">Login email</label>
          <div className="st-input"><input id="acc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div></div>
        {emailChanged && (
          <div className="st-cell full st-reveal"><div className={`st-field ${errors.current_password ? "has-error" : ""}`}>
            <label htmlFor="acc-pass">Current password (to confirm the email change)</label>
            <div className="st-input"><input id="acc-pass" type="password" value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })} autoComplete="current-password" /></div>
            {errors.current_password && <small className="st-err">{errors.current_password}</small>}
          </div></div>
        )}
      </div>
      <div className="st-meta">
        {user.student_code && (
          <div className="st-meta-item">
            <small>Student ID</small>
            <b>{user.student_code}</b>
            <button type="button" className="st-copy" onClick={() => { navigator.clipboard?.writeText(user.student_code); notify({ text: "✓ Student ID copied" }); }}>Copy</button>
          </div>
        )}
        <div className="st-meta-item"><small>Account type</small><b>{ROLE_LABEL[user.role]}</b></div>
        {user.created_at && <div className="st-meta-item"><small>Member since</small><b>{new Date(user.created_at).toLocaleDateString([], { month: "long", year: "numeric" })}</b></div>}
      </div>
      <div className="st-actions">
        <span />
        <div className="st-actions-right">
          {dirty && <button type="button" className="ghost" onClick={() => setForm({ name: user.name, email: user.email, current_password: "" })}>Discard</button>}
          <FxButton type="submit" busy={busy} busyText="Saving…" disabled={!dirty}>{dirty ? "Save changes" : "Saved"}</FxButton>
        </div>
      </div>
    </form>
  );
}

/* ---------------- Security: change password ---------------- */
function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

function Security({ data, notify }) {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const s = form.new_password ? (form.new_password.length < 8 ? 0 : strength(form.new_password)) : -1;
  const mismatch = form.confirm && form.confirm !== form.new_password;
  const ready = form.current_password && form.new_password.length >= 8 && form.confirm === form.new_password;
  const changedAt = data.user.password_changed_at;

  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setErrors({});
    setDone("");
    try {
      const { data: res } = await api.post("/auth/password", { current_password: form.current_password, new_password: form.new_password });
      localStorage.setItem("token", res.token);
      setForm({ current_password: "", new_password: "", confirm: "" });
      setDone(res.message);
      notify({ text: "🔒 Password changed" });
    } catch (err) {
      setErrors(err.response?.data?.fields || {});
      notify({ text: err.response?.data?.error || "Couldn't change password", kind: "bad" });
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <form className="st-card" onSubmit={submit}>
      <div className="st-card-head">
        <span className="st-card-icon">🔒</span>
        <div>
          <h2>Change password</h2>
          <p>{changedAt ? `Last changed ${new Date(changedAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}. ` : ""}Changing it signs you out on every other device.</p>
        </div>
      </div>
      {done && <p className="success st-reveal">✓ {done}</p>}
      <div className="st-grid one">
        <div className="st-cell"><div className={`st-field ${errors.current_password ? "has-error" : ""}`}>
          <label htmlFor="pw-cur">Current password</label>
          <div className="st-input"><input id="pw-cur" type={type} value={form.current_password} autoComplete="current-password"
            onChange={(e) => setForm({ ...form, current_password: e.target.value })} /></div>
          {errors.current_password && <small className="st-err">{errors.current_password}</small>}
        </div></div>
        <div className="st-cell"><div className={`st-field ${errors.new_password ? "has-error" : ""}`}>
          <label htmlFor="pw-new">New password</label>
          <div className="st-input"><input id="pw-new" type={type} value={form.new_password} autoComplete="new-password"
            onChange={(e) => setForm({ ...form, new_password: e.target.value })} /></div>
          {s >= 0 && (
            <div className={`st-strength s${s}`}>
              <div className="st-strength-bar">{[0, 1, 2, 3].map((i) => <span key={i} className={i < s ? "on" : ""} />)}</div>
              <small>{STRENGTH[s]}{s > 0 && s < 3 ? " · add numbers, capitals or symbols" : ""}</small>
            </div>
          )}
          {errors.new_password && <small className="st-err">{errors.new_password}</small>}
        </div></div>
        <div className="st-cell"><div className={`st-field ${mismatch ? "has-error" : ""}`}>
          <label htmlFor="pw-confirm">Confirm new password</label>
          <div className="st-input"><input id="pw-confirm" type={type} value={form.confirm} autoComplete="new-password"
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></div>
          {mismatch && <small className="st-err">Passwords don't match</small>}
        </div></div>
      </div>
      <div className="st-actions">
        <label className="st-show"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
        <div className="st-actions-right">
          <FxButton type="submit" busy={busy} busyText="Changing…" disabled={!ready}>Change password</FxButton>
        </div>
      </div>
    </form>
  );
}

/* ---------------- Page ---------------- */
export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const isStudent = user.role === "student";
  const welcome = isStudent && params.get("welcome") === "1";

  useEffect(() => {
    api.get("/profile").then((r) => setData(r.data)).catch(() => setError("Couldn't load your settings"));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = (t) => setToast({ ...t, key: Date.now() });
  const tabs = [
    { id: "account", icon: "👤", title: "Account" },
    ...SECTIONS.filter((s) => isStudent || !s.students),
    { id: "security", icon: "🔒", title: "Password & security" },
  ];
  const tab = welcome
    ? (WELCOME_ORDER.includes(params.get("tab")) ? params.get("tab") : WELCOME_ORDER[0])
    : (tabs.find((t) => t.id === params.get("tab"))?.id || "account");
  const go = (id) => setParams(welcome ? { welcome: "1", tab: id } : { tab: id });

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><div className="jr-skeleton hero" /><div className="jr-skeleton card" /></div>;

  const comp = data.completeness;
  const section = SECTIONS.find((s) => s.id === tab);
  const stepIndex = WELCOME_ORDER.indexOf(tab);
  const nextStep = () => {
    const next = WELCOME_ORDER[stepIndex + 1];
    if (next) go(next);
    else navigate("/studio?profile=done");
  };

  return (
    <div className="page st">
      {welcome ? (
        <div className="st-welcome">
          <div>
            <span className="db-eyebrow">Welcome to PrepTrack 🎉</span>
            <h1>Let's finish setting up, {data.user.name.split(" ")[0]}</h1>
            <p>A few more details, like those a coaching institute collects at admission. It takes about two minutes, and you can edit or delete anything later in Settings.</p>
          </div>
          <ol className="st-steps">
            {WELCOME_ORDER.map((id, i) => {
              const s = SECTIONS.find((x) => x.id === id);
              const c = comp.sections[id];
              return (
                <li key={id} className={`${id === tab ? "current" : ""} ${c.filled === c.total ? "done" : ""}`}>
                  <button type="button" onClick={() => go(id)}>
                    <span className="st-step-dot">{c.filled === c.total ? "✓" : i + 1}</span>
                    <span>{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <button type="button" className="st-later" onClick={() => navigate("/studio")}>I'll do this later →</button>
        </div>
      ) : (
        <div className="st-header">
          <div className="st-header-id">
            {data.profile?.photo_url ? <img className="st-header-photo" src={data.profile.photo_url} alt="" /> : <Avatar name={data.user.name} size={64} />}
            <div>
              <h1>Settings</h1>
              <p>{data.user.name} · {data.user.email}{data.user.student_code ? ` · ${data.user.student_code}` : ""}</p>
            </div>
          </div>
          {isStudent && (
            <div className="st-complete">
              <Ring pct={comp.pct} size={70} stroke={7} color={comp.pct === 100 ? "#1f9d63" : "var(--accent)"}><small style={{ color: "var(--text)", fontSize: 14 }}>{comp.pct}%</small></Ring>
              <div><b>{comp.pct === 100 ? "Profile complete 🎉" : "Profile completeness"}</b><small>{comp.pct === 100 ? "Thanks for keeping it up to date." : "Fill the • fields to reach 100%."}</small></div>
            </div>
          )}
        </div>
      )}

      <div className={`st-layout ${welcome ? "welcome" : ""}`}>
        {!welcome && (
          <nav className="st-tabs" aria-label="Settings sections">
            {tabs.map((t, i) => {
              const c = comp.sections[t.id];
              return (
                <button key={t.id} type="button" className={`st-tab ${tab === t.id ? "active" : ""}`} style={{ "--i": i }} onClick={() => go(t.id)}>
                  <span className="st-tab-icon">{t.icon}</span>
                  <span className="st-tab-title">{t.title}</span>
                  {isStudent && c && <span className={`st-tab-count ${c.filled === c.total ? "done" : ""}`}>{c.filled === c.total ? "✓" : `${c.filled}/${c.total}`}</span>}
                </button>
              );
            })}
          </nav>
        )}
        <div key={tab} className="st-panel">
          {tab === "account" && <Account data={data} onSaved={setData} notify={notify} />}
          {tab === "security" && <Security data={data} notify={notify} />}
          {section?.toggles && <Notifications section={section} profile={data.profile} onSaved={setData} notify={notify} />}
          {section && !section.toggles && (
            <SectionForm key={`${tab}-${data.profile?.updated_at || ""}`} section={section} profile={data.profile} onSaved={setData} notify={notify}
              welcome={welcome} onContinue={nextStep} onSkip={nextStep} />
          )}
        </div>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
