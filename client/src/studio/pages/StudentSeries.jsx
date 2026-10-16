import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import api from "../../api";
import { SERIES_EXAM_LABEL } from "../constants";

const when = (iso) =>
  new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function contestState(t) {
  if (!t.is_contest) return null;
  const now = Date.now();
  if (now < new Date(t.starts_at).getTime()) return "upcoming";
  if (now < new Date(t.ends_at).getTime()) return "live";
  return "ended";
}

function SeriesList() {
  const [list, setList] = useState(null);
  useEffect(() => {
    api.get("/series").then((r) => setList(r.data.series)).catch(() => setList([]));
  }, []);

  return (
    <div className="page">
      <div>
        <h1>Test Series</h1>
        <p className="muted">Structured sets of tests and contests. Free to join, and you can leave any time.</p>
      </div>
      {!list ? <p className="muted">Loading…</p> : list.length === 0 ? (
        <div className="card empty"><p>No test series yet. Check back soon.</p></div>
      ) : (
        <div className="test-grid">
          {list.map((s) => {
            const progress = s.test_count ? Math.round((s.completed / s.test_count) * 100) : 0;
            return (
              <Link key={s.id} to={`/studio/series/${s.id}`} className="card series-card">
                <div className="q-tags">
                  <span className="tag">{SERIES_EXAM_LABEL[s.exam]}</span>
                  {s.is_enrolled && <span className="tag diff-easy">Enrolled</span>}
                </div>
                <h3>{s.title}</h3>
                {s.description && <p className="muted series-desc">{s.description}</p>}
                <div className="test-facts">
                  <span>📝 {s.test_count} tests</span>
                  <span>👥 {s.enrolled} enrolled</span>
                </div>
                {s.is_enrolled && (
                  <div className="xp">
                    <div className="xp-track thin"><div className="xp-fill" style={{ width: `${progress}%` }} /></div>
                    <div className="xp-label muted">{s.completed} of {s.test_count} completed</div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeriesDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/series/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || "Couldn't load this series"));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function toggleEnrol() {
    if (data.series.is_enrolled && !confirm("Leave this series? Your test results are kept.")) return;
    setBusy(true);
    try {
      if (data.series.is_enrolled) await api.delete(`/series/${id}/enroll`);
      else await api.post(`/series/${id}/enroll`);
      load();
    } catch (e) {
      setError(e.response?.data?.error || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function start(t) {
    if (!confirm(`Start "${t.title}"?\n\nYou'll have ${t.duration_minutes} minutes. The timer keeps running even if you close this page.`)) return;
    try {
      const { data: res } = await api.post(`/student/tests/${t.id}/start`);
      navigate(`/studio/tests/attempt/${res.attempt_id}`);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't start the test");
    }
  }

  if (error && !data) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>;

  const { series: s, tests, progress } = data;
  const nextUp = tests.find((t) => !t.attempt_status && contestState(t) !== "ended" && contestState(t) !== "upcoming");
  const open = (t) => navigate(`/studio/tests/attempt/${t.attempt_id}`);

  function action(t) {
    const state = contestState(t);
    if (t.attempt_status === "in_progress") return <button className="small" onClick={() => open(t)}>Resume</button>;
    if (t.attempt_status === "submitted") {
      return state === "live"
        ? <span className="muted small">✅ Results {when(t.ends_at)}</span>
        : <button className="ghost small" onClick={() => open(t)}>View result</button>;
    }
    if (!s.is_enrolled) return null;
    if (state === "upcoming") return <span className="muted small">Opens {when(t.starts_at)}</span>;
    if (state === "ended") return <span className="muted small">Missed</span>;
    return <button className="small" onClick={() => start(t)}>{state === "live" ? "Start contest" : "Start"}</button>;
  }

  return (
    <div className="page">
      <div>
        <Link to="/studio/series" className="link-btn">← All series</Link>
        <div className="page-head">
          <div>
            <h1>{s.title}</h1>
            <p className="muted">{SERIES_EXAM_LABEL[s.exam]} · {tests.length} tests · {s.enrolled} enrolled · by {s.author}</p>
          </div>
          <button className={s.is_enrolled ? "ghost" : ""} onClick={toggleEnrol} disabled={busy}>
            {s.is_enrolled ? "Leave series" : "Enrol for free"}
          </button>
        </div>
        {s.description && <p className="series-about">{s.description}</p>}
      </div>

      {error && <p className="error">{error}</p>}

      {s.is_enrolled ? (
        <div className="stat-grid">
          <div className="stat-card"><span>Progress</span><strong>{progress.completed} / {progress.total}</strong></div>
          <div className="stat-card"><span>Completed</span><strong>{progress.pct}%</strong></div>
          <div className="stat-card"><span>Average score</span><strong>{progress.avg_pct ?? "—"}{progress.avg_pct != null && "%"}</strong></div>
          <div className="stat-card"><span>Next up</span><strong className="next-title">{nextUp ? nextUp.title : "All caught up 🎉"}</strong></div>
        </div>
      ) : (
        <p className="note">Enrol to start these tests and track your progress through the series.</p>
      )}

      <div className="card">
        <h3>Tests in this series</h3>
        {tests.length === 0 ? <p className="muted">No tests yet.</p> : (
          <ol className="series-steps">
            {tests.map((t, i) => {
              const state = contestState(t);
              const done = t.attempt_status === "submitted";
              return (
                <li key={t.id} className={done ? "step-done" : ""}>
                  <span className="sel-num">{done ? "✓" : i + 1}</span>
                  <div className="sel-body">
                    <b>{t.title}</b>
                    <div className="q-tags">
                      {t.is_contest && <span className="tag contest-tag">🏆 Contest · {when(t.starts_at)}</span>}
                      {state === "live" && <span className="state-chip state-live">Live now</span>}
                      <span className="tag">{t.question_count} Q · {t.total_marks} marks · {t.duration_minutes} min</span>
                      {done && t.score != null && <span className="tag diff-easy">{t.score} / {t.max_score}</span>}
                    </div>
                  </div>
                  <div>{action(t)}</div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

export default function StudentSeries() {
  return (
    <Routes>
      <Route index element={<SeriesList />} />
      <Route path=":id" element={<SeriesDetail />} />
    </Routes>
  );
}
