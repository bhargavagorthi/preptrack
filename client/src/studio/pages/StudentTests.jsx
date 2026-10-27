import { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import api from "../../api";
import { EXAM_LABEL } from "../constants";
import AttemptPage from "../exam/AttemptPage";
import { Ring, FxButton, StartDialog } from "../components/Fx";
import { until, when, pctOf } from "../components/fxUtils";

function contestState(t, now) {
  if (!t.is_contest) return null;
  if (now < new Date(t.starts_at).getTime()) return "upcoming";
  if (now < new Date(t.ends_at).getTime()) return "live";
  return "ended";
}

// One bucket per card, used for the filter chips and the card colour
function bucket(t, now) {
  if (t.attempt_status === "in_progress") return "in_progress";
  if (t.attempt_status === "submitted") return "completed";
  const s = contestState(t, now);
  if (s === "live") return "live";
  if (s === "upcoming") return "upcoming";
  if (s === "ended") return "missed";
  return "open";
}

const FILTERS = [
  ["all", "All"],
  ["live", "🔴 Live"],
  ["upcoming", "🗓 Upcoming"],
  ["open", "📝 Practice"],
  ["in_progress", "⏳ In progress"],
  ["completed", "✅ Completed"],
];
const BADGE = {
  live: "Live now", upcoming: "Upcoming", open: "Open", in_progress: "In progress", completed: "Completed", missed: "Ended",
};
const ORDER = { in_progress: 0, live: 1, upcoming: 2, open: 3, completed: 4, missed: 5 };

function TestList() {
  const navigate = useNavigate();
  const [tests, setTests] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [confirming, setConfirming] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.get("/student/tests")
      .then((r) => setTests(r.data.tests))
      .catch(() => setError("Couldn't load tests"));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function start() {
    setStarting(true);
    try {
      const { data } = await api.post(`/student/tests/${confirming.id}/start`);
      navigate(`/studio/tests/attempt/${data.attempt_id}`);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't start the test");
      setStarting(false);
      setConfirming(null);
    }
  }

  const open = (t) => navigate(`/studio/tests/attempt/${t.attempt_id}`);
  const minutesLeft = (deadline) => Math.max(0, Math.ceil((new Date(deadline) - now) / 60000));

  const all = (tests || []).map((t) => ({ ...t, b: bucket(t, now), state: contestState(t, now) }));
  const counts = all.reduce((m, t) => ({ ...m, [t.b]: (m[t.b] || 0) + 1 }), {});
  const shown = all
    .filter((t) => filter === "all" || t.b === filter)
    .sort((a, b) => ORDER[a.b] - ORDER[b.b]);
  const featured = all.find((t) => t.b === "live") || all.find((t) => t.b === "upcoming");

  function action(t) {
    if (t.b === "in_progress") return <FxButton onClick={() => open(t)}>⏳ Resume</FxButton>;
    if (t.b === "completed") {
      return t.state === "live"
        ? <button className="ghost small" onClick={() => open(t)}>View answers</button>
        : <button className="ghost small" onClick={() => open(t)}>View result →</button>;
    }
    if (t.b === "upcoming") return <button className="small" disabled>🔒 Not open yet</button>;
    if (t.b === "live") return <FxButton onClick={() => setConfirming(t)}>Start contest →</FxButton>;
    if (t.b === "missed") return <Link to={`/studio/leaderboard?contest=${t.id}`} className="db-more">Leaderboard →</Link>;
    return <FxButton onClick={() => setConfirming(t)}>▶ Start test</FxButton>;
  }

  function status(t) {
    if (t.b === "in_progress") return <span className="ts-time warn">⏳ {minutesLeft(t.deadline)} min left</span>;
    if (t.b === "live") return <span className="ts-time live">Closes in {until(new Date(t.ends_at) - now)}</span>;
    if (t.b === "upcoming") return <span className="ts-time">Opens in {until(new Date(t.starts_at) - now)}</span>;
    if (t.b === "completed" && t.state === "live") return <span className="ts-time">Results {when(t.ends_at)}</span>;
    if (t.b === "missed") return <span className="ts-time muted">You missed this one</span>;
    return null;
  }

  return (
    <div className="page ts">
      <div className="page-head">
        <div>
          <h1>Tests</h1>
          <p className="muted">Practice tests, mock exams and contests.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {featured && (
        <div className={`ts-feature ${featured.b}`}>
          <div className="ts-feature-text">
            <span className="db-eyebrow">{featured.b === "live" ? "🔴 Live contest" : "🗓 Next contest"}</span>
            <h2>{featured.title}</h2>
            <p>{featured.question_count} questions · {featured.total_marks} marks · {featured.duration_minutes} min · {EXAM_LABEL[featured.exam]}</p>
          </div>
          <div className="ts-countdown">
            <small>{featured.b === "live" ? "Closes in" : "Starts in"}</small>
            <strong>{until(new Date(featured.b === "live" ? featured.ends_at : featured.starts_at) - now)}</strong>
            {featured.b === "live"
              ? <FxButton variant="glow" onClick={() => setConfirming(featured)}>Join now →</FxButton>
              : <span className="ts-countdown-when">{when(featured.starts_at)}</span>}
          </div>
        </div>
      )}

      {tests && tests.length > 0 && (
        <div className="ts-filters" role="tablist">
          {FILTERS.filter(([k]) => k === "all" || counts[k]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={`ts-filter ${filter === k ? "active" : ""}`}
              onClick={() => setFilter(k)}>
              {label}<span>{k === "all" ? all.length : counts[k]}</span>
            </button>
          ))}
        </div>
      )}

      {!tests ? (
        <div className="jr-grid">{[0, 1, 2].map((i) => <div key={i} className="jr-skeleton card" />)}</div>
      ) : tests.length === 0 ? (
        <div className="card db-empty big"><span>📝</span><p>No tests are available yet. Check back soon.</p></div>
      ) : (
        <div key={filter} className="ts-grid">
          {shown.map((t, i) => {
            const pct = t.score != null ? pctOf(t.score, t.max_score) : null;
            return (
              <div key={t.id} className={`ts-card b-${t.b}`} style={{ "--i": i }}>
                <div className="ts-card-band" />
                <div className="ts-card-body">
                  <div className="ts-card-top">
                    <div className="ts-tags">
                      <span className={`ts-badge b-${t.b}`}>{BADGE[t.b]}</span>
                      {t.is_contest && <span className="ts-tag">🏆 Contest</span>}
                      <span className="ts-tag">{EXAM_LABEL[t.exam]}</span>
                    </div>
                    {pct != null && (
                      <Ring pct={pct} size={50} stroke={5} color={pct >= 75 ? "#1f9d63" : pct >= 40 ? "#2563eb" : "#e05656"}>
                        <small style={{ color: "var(--text)" }}>{pct}%</small>
                      </Ring>
                    )}
                  </div>
                  <h3>{t.title}</h3>
                  <div className="ts-facts">
                    <span><b>{t.question_count}</b> questions</span>
                    <span><b>{t.total_marks}</b> marks</span>
                    <span><b>{t.duration_minutes}</b> min</span>
                  </div>
                  {t.is_contest && <div className="ts-when">🗓 {when(t.starts_at)} – {when(t.ends_at)}</div>}
                  <div className="ts-foot">
                    {t.b === "completed" && t.score != null
                      ? <span className="ts-score">{t.score} <small>/ {t.max_score}</small></span>
                      : status(t) || <span />}
                    {action(t)}
                  </div>
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <div className="card db-empty"><span>🔍</span><p>Nothing here right now.</p></div>}
        </div>
      )}

      {confirming && (
        <StartDialog test={confirming} busy={starting} onCancel={() => setConfirming(null)} onConfirm={start} />
      )}
    </div>
  );
}

export default function StudentTests() {
  return (
    <Routes>
      <Route index element={<TestList />} />
      <Route path="attempt/:id" element={<AttemptPage />} />
    </Routes>
  );
}
