import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { Ring, CountUp, FxButton } from "../components/Fx";
import { until, when } from "../components/fxUtils";

const CONTENT = {
  creator: {
    stats: [["📚", "Chapters", "—"], ["❓", "Questions", "—"], ["📝", "Tests", "—"], ["🗒️", "Notes", "—"]],
    next: ["Set up subjects and chapters", "Add questions or import them from Excel", "Build and publish a test"],
  },
  teacher: {
    stats: [["👩‍🎓", "Students", "0"], ["📌", "Assignments", "0"], ["📈", "Avg. class score", "—"], ["📄", "Reports", "0"]],
    next: ["Invite your students", "Assign your first test"],
  },
  organiser: {
    stats: [["📚", "Test series", "0"], ["👥", "Participants", "0"], ["🗓", "Upcoming tests", "0"], ["🏁", "Results", "0"]],
    next: ["Create a test series from published tests", "Publish it so students can enrol", "Track results in Students & results"],
  },
  admin: {
    stats: [["🛂", "Pending approvals", "—"], ["👥", "Users", "—"], ["📝", "Tests", "—"], ["🏢", "Organisations", "1"]],
    next: ["Review pending accounts in Approvals"],
  },
};

const TILE_COLORS = ["#2563eb", "#1f9d63", "#e07a1f", "#7c4dcc"];

const QUICK = [
  { to: "/studio/journey", icon: "🧭", title: "Syllabus Journey", text: "Master topics one by one" },
  { to: "/studio/tests", icon: "📝", title: "Tests", text: "Practice tests and contests" },
  { to: "/studio/series", icon: "📚", title: "Test Series", text: "Free structured series" },
  { to: "/studio/analytics", icon: "📈", title: "Analytics", text: "Strengths and focus areas" },
  { to: "/studio/leaderboard", icon: "🏆", title: "Leaderboard", text: "See where you stand" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function StatTile({ icon, label, value, suffix = "", index, color }) {
  const numeric = typeof value === "number";
  return (
    <div className="db-stat" style={{ "--i": index, "--tile": color }}>
      <span className="db-stat-icon">{icon}</span>
      <div>
        <span className="db-stat-label">{label}</span>
        <strong>{numeric ? <CountUp value={value} suffix={suffix} /> : value}</strong>
      </div>
    </div>
  );
}

function HowToEarn({ rules }) {
  const items = [
    ["✅", "Correct answer", `${rules.perCorrect.easy} / ${rules.perCorrect.medium} / ${rules.perCorrect.hard}`, "easy / medium / hard"],
    ["🏁", "Complete a test", `+${rules.completion}`],
    ...rules.accuracyBonus.map((r) => ["🎯", `${r.min}%+ accuracy`, `+${r.points}`]),
    ["🔥", "Daily streak", `+${rules.streakPerDay}`, "first test each day"],
  ];
  return (
    <div className="card db-earn">
      <h3>How to earn points</h3>
      <div className="db-earn-grid">
        {items.map(([icon, label, pts, sub], i) => (
          <div key={label} className="db-earn-item" style={{ "--i": i }}>
            <span className="db-earn-icon">{icon}</span>
            <div><b>{label}</b>{sub && <small>{sub}</small>}</div>
            <span className="db-earn-pts">{pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffDashboard({ user }) {
  const { stats, next } = CONTENT[user.role];
  return (
    <div className="page">
      <div className="db-hero staff">
        <div className="db-hero-main">
          <span className="db-eyebrow">{user.role} studio</span>
          <h1>{greeting()}, {user.name.split(" ")[0]} 👋</h1>
          <p>Here's your {user.role} overview.</p>
        </div>
      </div>
      <div className="db-stats">
        {stats.map(([icon, label, value], i) => (
          <StatTile key={label} icon={icon} label={label} value={value} index={i} color={TILE_COLORS[i % 4]} />
        ))}
      </div>
      <div className="card">
        <h3>Next steps</h3>
        <ol className="db-steps">{next.map((n, i) => <li key={n} style={{ "--i": i }}><span>{i + 1}</span>{n}</li>)}</ol>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  if (user.role !== "student") return <StaffDashboard user={user} />;
  return <StudentDashboard user={user} />;
}

function StudentDashboard({ user }) {
  const navigate = useNavigate();
  const [live, setLive] = useState(null);
  const [prog, setProg] = useState(null);
  const [journey, setJourney] = useState(null);
  const [tests, setTests] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [profile, setProfile] = useState(null);
  const [params, setParams] = useSearchParams();
  const profileDone = params.get("profile") === "done";

  useEffect(() => {
    api.get("/student/analytics").then((r) => setLive(r.data)).catch(() => {});
    api.get("/student/progress").then((r) => setProg(r.data)).catch(() => {});
    api.get("/student/journey").then((r) => setJourney(r.data)).catch(() => {});
    api.get("/student/tests").then((r) => setTests(r.data.tests)).catch(() => setTests([]));
    api.get("/profile").then((r) => setProfile(r.data)).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  async function practise(nodeId) {
    setError("");
    setBusy(nodeId);
    try {
      const { data } = await api.post("/student/journey/practice", { node_id: nodeId });
      navigate(`/studio/tests/attempt/${data.attempt_id}`);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't start practice");
      setBusy(null);
    }
  }

  const o = live?.overview;
  const next = journey?.next_up;
  const weak = live?.insights.weak[0];

  // What's happening right now: tests in progress, live and upcoming contests
  const happening = (tests || [])
    .map((t) => {
      const starts = t.starts_at ? new Date(t.starts_at).getTime() : 0;
      const ends = t.ends_at ? new Date(t.ends_at).getTime() : 0;
      if (t.attempt_status === "in_progress") return { t, kind: "resume", order: 0 };
      if (t.is_contest && now >= starts && now < ends && !t.attempt_status) return { t, kind: "live", order: 1 };
      if (t.is_contest && now < starts) return { t, kind: "upcoming", order: 2 };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .slice(0, 4);

  return (
    <div className="page db">
      {/* ---------- Hero ---------- */}
      <div className="db-hero">
        <div className="db-hero-main">
          <span className="db-eyebrow">Student dashboard</span>
          <h1>{greeting()}, {user.name.split(" ")[0]} 👋</h1>
          {prog ? (
            <div className="db-level">
              <Ring pct={prog.progress_pct} size={84} stroke={8} color="#fff" track="rgba(255,255,255,0.25)">
                <small className="db-level-small">LEVEL</small><strong>{prog.level}</strong>
              </Ring>
              <div className="db-level-info">
                <div className="db-level-name">{prog.name}</div>
                <div className="db-points">⭐ <CountUp value={prog.points} /> points</div>
                <div className="db-xp"><div style={{ width: `${prog.progress_pct}%` }} /></div>
                <small>{prog.next - prog.points} points to Level {prog.level + 1}</small>
              </div>
            </div>
          ) : <div className="db-level-skeleton" />}
          {prog && (
            <div className="db-streak-row">
              {prog.streak > 0
                ? <span className="db-streak"><span className="db-flame">🔥</span> {prog.streak}-day streak</span>
                : <span className="db-streak off">🔥 No active streak</span>}
              {!prog.active_today && <span className="db-hint">Take a test today to {prog.streak ? "keep it going" : "start one"}.</span>}
            </div>
          )}
        </div>

        <div className="db-mission">
          <span className="db-eyebrow">🎯 Today's mission</span>
          {next ? (
            <>
              <h3>{next.name}</h3>
              <div className="db-mission-path">{next.subject} › {next.chapter}</div>
              <p>{next.reason}</p>
              <FxButton variant="glow" busy={busy === next.id} busyText="Building your set…" disabled={busy != null}
                onClick={() => practise(next.id)}>▶ Practise now</FxButton>
            </>
          ) : (
            <>
              <h3>{o?.tests_taken ? "Keep the momentum going" : "Take your first test"}</h3>
              <p>Every test you take sharpens your analytics and earns points.</p>
              <FxButton variant="glow" onClick={() => navigate("/studio/tests")}>Browse tests →</FxButton>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {profileDone && (
        <div className="db-done" role="status">
          <span>🎉</span><b>Your profile is saved.</b><span className="muted">You can change any detail in Settings.</span>
          <button className="ghost small" onClick={() => setParams({})}>Dismiss</button>
        </div>
      )}

      {profile && profile.completeness.pct < 100 && (
        <div className="db-profile">
          <Ring pct={profile.completeness.pct} size={64} stroke={7}><small style={{ color: "var(--text)", fontSize: 13 }}>{profile.completeness.pct}%</small></Ring>
          <div className="db-profile-text">
            <b>Complete your profile</b>
            <small>
              Still to add: {Object.entries(profile.completeness.sections).filter(([, c]) => c.filled < c.total)
                .map(([k]) => ({ personal: "personal details", address: "address", academic: "academic details", guardian: "parent / guardian" }[k])).join(", ")}
            </small>
          </div>
          <FxButton variant="soft" onClick={() => navigate("/studio/settings?welcome=1")}>Finish now →</FxButton>
        </div>
      )}

      {/* ---------- Stats ---------- */}
      <div className="db-stats">
        <StatTile icon="📝" label="Tests taken" value={o ? o.tests_taken : "…"} index={0} color={TILE_COLORS[0]} />
        <StatTile icon="📊" label="Avg. score" value={o?.avg_score_pct ?? "—"} suffix="%" index={1} color={TILE_COLORS[1]} />
        <StatTile icon="🎯" label="Accuracy" value={o?.accuracy ?? "—"} suffix="%" index={2} color={TILE_COLORS[2]} />
        <StatTile icon="⭐" label="Points" value={prog ? prog.points : "…"} index={3} color={TILE_COLORS[3]} />
      </div>

      {/* ---------- Happening now + recent points ---------- */}
      <div className="db-cols">
        <div className="card db-now">
          <div className="db-card-head">
            <h3>Happening now</h3>
            <Link to="/studio/tests" className="db-more">All tests →</Link>
          </div>
          {tests === null ? (
            <div className="jr-skeleton" style={{ height: 120 }} />
          ) : happening.length === 0 ? (
            <div className="db-empty">
              <span>🌤️</span>
              <p>No live contests right now.<br /><span className="muted">Practice tests are always open.</span></p>
            </div>
          ) : (
            <ul className="db-now-list">
              {happening.map(({ t, kind }, i) => (
                <li key={t.id} className={`db-now-item ${kind}`} style={{ "--i": i }}>
                  <span className="db-now-badge">{kind === "resume" ? "⏳" : kind === "live" ? "🔴" : "🗓"}</span>
                  <div className="db-now-text">
                    <b>{t.title}</b>
                    <small>
                      {kind === "resume" && `In progress · ${Math.max(0, Math.ceil((new Date(t.deadline) - now) / 60000))} min left`}
                      {kind === "live" && `Live · closes in ${until(new Date(t.ends_at) - now)}`}
                      {kind === "upcoming" && `Opens in ${until(new Date(t.starts_at) - now)} · ${when(t.starts_at)}`}
                    </small>
                  </div>
                  {kind === "resume" && <button className="small" onClick={() => navigate(`/studio/tests/attempt/${t.attempt_id}`)}>Resume</button>}
                  {kind === "live" && <button className="small" onClick={() => navigate("/studio/tests")}>Join</button>}
                  {kind === "upcoming" && <span className="db-soon">Soon</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card db-recent">
          <div className="db-card-head">
            <h3>Recent points</h3>
            <Link to="/studio/leaderboard?tab=points" className="db-more">Standings →</Link>
          </div>
          {!prog ? (
            <div className="jr-skeleton" style={{ height: 120 }} />
          ) : prog.recent.length === 0 ? (
            <div className="db-empty"><span>⭐</span><p>Your first points land here after your first test.</p></div>
          ) : (
            <ul className="db-timeline">
              {prog.recent.slice(0, 6).map((e, i) => (
                <li key={e.id} style={{ "--i": i }}>
                  <span className="db-timeline-dot" />
                  <div><b>{e.label}</b>{e.title && <small>{e.title}</small>}</div>
                  <span className="db-plus">+{e.points}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---------- Focus area ---------- */}
      {weak && (
        <div className="db-focus">
          <span className="db-focus-icon">🎯</span>
          <div className="db-focus-text">
            <span className="db-eyebrow">Focus area</span>
            <b>{weak.name}</b>
            <small>{weak.subject} › {weak.chapter} · {weak.accuracy}% accuracy</small>
          </div>
          <FxButton variant="soft" busy={busy === weak.id} busyText="Building your set…" disabled={busy != null}
            onClick={() => practise(weak.id)}>Practise this</FxButton>
        </div>
      )}

      {/* ---------- Quick links ---------- */}
      <div className="db-quick">
        {QUICK.map((q, i) => (
          <Link key={q.to} to={q.to} className="db-quick-card" style={{ "--i": i }}>
            <span className="db-quick-icon">{q.icon}</span>
            <b>{q.title}</b>
            <small>{q.text}</small>
            <span className="db-quick-arrow">→</span>
          </Link>
        ))}
      </div>

      {prog && <HowToEarn rules={prog.rules} />}
    </div>
  );
}
