// Small shared pieces for the student pages: rings, count-up numbers,
// ripple buttons, avatars and a "ready to start?" dialog.
import { useEffect, useRef, useState } from "react";
import { when } from "./fxUtils";

// Animated circular progress
export function Ring({ pct = 0, size = 64, stroke = 7, color = "var(--accent)", track = "#e2e8f0", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct ?? 0)) / 100);
  return (
    <div className="jr-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          className="jr-ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ "--c": c, "--o": offset }} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="jr-ring-label">{children ?? `${Math.round(pct ?? 0)}%`}</div>
    </div>
  );
}

// A number that counts up when it first appears
export function CountUp({ value, duration = 900, suffix = "", decimals = 0 }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const target = Number(value);
    if (!Number.isFinite(target)) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    const length = reduce ? 1 : duration;
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / length);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(start + (target - start) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (value == null || !Number.isFinite(Number(value))) return <>—</>;
  return <>{shown.toFixed(decimals)}{suffix}</>;
}

// Button with a ripple, and a spinner while busy
export function FxButton({ onClick, busy, busyText = "Starting…", disabled, children, variant = "", type = "button", title }) {
  const [ripple, setRipple] = useState(null);
  function click(e) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });
    onClick?.(e);
  }
  return (
    <button type={type} title={title} className={`jr-btn ${variant} ${busy ? "launching" : ""}`} disabled={disabled || busy} onClick={click}>
      {ripple && <span key={ripple.key} className="jr-ripple" style={{ left: ripple.x, top: ripple.y }} />}
      {busy ? <><span className="jr-spinner" /> {busyText}</> : children}
    </button>
  );
}

const AVATAR_COLORS = ["#2563eb", "#1f9d63", "#e07a1f", "#c2417a", "#1d7fb8", "#7c4dcc", "#0f766e", "#b45309"];
export function Avatar({ name = "?", size = 36 }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="fx-avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}>
      {initials}
    </span>
  );
}

// "Ready to start?" dialog used before a test or contest begins
export function StartDialog({ test, onCancel, onConfirm, busy }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);
  const [openedAt] = useState(() => Date.now());
  if (!test) return null;
  const contest = test.is_contest;
  const minsLeft = contest ? Math.floor((new Date(test.ends_at) - openedAt) / 60000) : null;
  const mins = contest ? Math.max(0, Math.min(test.duration_minutes, minsLeft)) : test.duration_minutes;
  return (
    <div className="fx-overlay" onClick={() => !busy && onCancel()}>
      <div className="fx-dialog" role="dialog" aria-modal="true" aria-label={`Start ${test.title}`} onClick={(e) => e.stopPropagation()}>
        <div className={`fx-dialog-top ${contest ? "contest" : ""}`}>
          <span className="fx-dialog-icon">{contest ? "🏆" : "🚀"}</span>
          <div>
            <div className="fx-eyebrow">{contest ? "Contest" : "Ready when you are"}</div>
            <h3>{test.title}</h3>
          </div>
        </div>
        <div className="fx-dialog-facts">
          <div><b>{test.question_count}</b><span>questions</span></div>
          <div><b>{test.total_marks}</b><span>marks</span></div>
          <div><b>{mins}</b><span>minutes</span></div>
        </div>
        <ul className="fx-dialog-notes">
          <li>⏱ The timer keeps running even if you close this page.</li>
          {contest && <li>🔒 It closes at {when(test.ends_at)}. Results and rankings open then.</li>}
          {!contest && <li>📊 Your score and analytics update as soon as you submit.</li>}
        </ul>
        <div className="fx-dialog-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}>Not now</button>
          <FxButton variant="big" busy={busy} onClick={onConfirm}>
            {contest ? "Start contest →" : "Start test →"}
          </FxButton>
        </div>
      </div>
    </div>
  );
}
