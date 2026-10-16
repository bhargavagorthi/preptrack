import { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import api from "../../api";
import { EXAM_LABEL } from "../constants";
import AttemptPage from "../exam/AttemptPage";

const when = (iso) =>
  new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function until(ms) {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${Math.max(1, mm)}m`;
}

function contestState(t, now) {
  if (!t.is_contest) return null;
  if (now < new Date(t.starts_at).getTime()) return "upcoming";
  if (now < new Date(t.ends_at).getTime()) return "live";
  return "ended";
}

const STATE_LABEL = { upcoming: "Upcoming", live: "Live now", ended: "Ended" };

function TestList() {
  const navigate = useNavigate();
  const [tests, setTests] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/student/tests")
      .then((r) => setTests(r.data.tests))
      .catch(() => setError("Couldn't load tests"));
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  async function start(t) {
    let msg = `Start "${t.title}"?\n\nYou'll have ${t.duration_minutes} minutes. The timer keeps running even if you close this page.`;
    if (t.is_contest) {
      const left = Math.floor((new Date(t.ends_at) - Date.now()) / 60000);
      const mins = Math.min(t.duration_minutes, left);
      msg = `Start the contest "${t.title}"?\n\nIt closes at ${when(t.ends_at)}, so you'll have ${mins} minutes.` +
        `\nResults and rankings open when the contest closes.`;
    }
    if (!confirm(msg)) return;
    try {
      const { data } = await api.post(`/student/tests/${t.id}/start`);
      navigate(`/studio/tests/attempt/${data.attempt_id}`);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't start the test");
    }
  }

  const minutesLeft = (deadline) => Math.max(0, Math.ceil((new Date(deadline) - Date.now()) / 60000));
  const open = (t) => navigate(`/studio/tests/attempt/${t.attempt_id}`);
  const board = (t) => <Link to={`/studio/leaderboard?contest=${t.id}`} className="small-link">Leaderboard</Link>;

  function footer(t, state) {
    if (t.attempt_status === "in_progress") {
      return (<><span className="muted">{minutesLeft(t.deadline)} min left</span><button onClick={() => open(t)}>Resume</button></>);
    }
    if (t.attempt_status === "submitted") {
      if (state === "live") {
        return (<><span className="muted">✅ Submitted · results {when(t.ends_at)}</span>
          <button className="ghost" onClick={() => open(t)}>View</button></>);
      }
      return (<>
        {t.score != null ? <span className="score-chip">{t.score} / {t.max_score}</span> : <span />}
        <div className="foot-actions">{state === "ended" && board(t)}
          <button className="ghost" onClick={() => open(t)}>View result</button></div>
      </>);
    }
    if (state === "upcoming") {
      return (<><span className="muted">Opens in {until(new Date(t.starts_at) - now)}</span>
        <button disabled>Not open yet</button></>);
    }
    if (state === "live") {
      return (<><span className="live-text">Closes in {until(new Date(t.ends_at) - now)}</span>
        <button onClick={() => start(t)}>Start contest</button></>);
    }
    if (state === "ended") return (<><span className="muted">Missed</span>{board(t)}</>);
    return (<><span /><button onClick={() => start(t)}>Start test</button></>);
  }

  const order = (t) => ({ live: 0, upcoming: 1 }[contestState(t, now)] ?? 2);
  const sorted = tests ? [...tests].sort((a, b) => order(a) - order(b)) : [];

  return (
    <div className="page">
      <div>
        <h1>Tests</h1>
        <p className="muted">Practice tests, mock exams and contests.</p>
      </div>
      {error && <p className="error">{error}</p>}
      {!tests ? (
        <p className="muted">Loading…</p>
      ) : tests.length === 0 ? (
        <div className="card empty"><p>No tests are available yet. Check back soon.</p></div>
      ) : (
        <div className="test-grid">
          {sorted.map((t) => {
            const state = contestState(t, now);
            return (
              <div className={`card test-card ${state === "live" ? "contest-live" : ""}`} key={t.id}>
                <div className="q-tags">
                  {t.is_contest && <span className="tag contest-tag">🏆 Contest</span>}
                  {state && <span className={`state-chip state-${state}`}>{STATE_LABEL[state]}</span>}
                  <span className="tag">{EXAM_LABEL[t.exam]}</span>
                  {t.attempt_status === "submitted" && <span className="tag diff-easy">Completed</span>}
                  {t.attempt_status === "in_progress" && <span className="tag diff-medium">In progress</span>}
                </div>
                <h3>{t.title}</h3>
                <div className="test-facts">
                  <span>📝 {t.question_count} questions</span>
                  <span>🎯 {t.total_marks} marks</span>
                  <span>⏱ {t.duration_minutes} min</span>
                </div>
                {t.is_contest && (
                  <div className="muted small">🗓 {when(t.starts_at)} – {when(t.ends_at)}</div>
                )}
                <div className="test-card-foot">{footer(t, state)}</div>
              </div>
            );
          })}
        </div>
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
