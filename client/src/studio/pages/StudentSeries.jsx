import { useCallback, useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import api from "../../api";
import { SERIES_EXAM_LABEL } from "../constants";
import { Ring, CountUp, FxButton, StartDialog } from "../components/Fx";
import { SUBJECT_COLORS, when, pctOf } from "../components/fxUtils";

function contestState(t) {
  if (!t.is_contest) return null;
  const now = Date.now();
  if (now < new Date(t.starts_at).getTime()) return "upcoming";
  if (now < new Date(t.ends_at).getTime()) return "live";
  return "ended";
}

const COVER_ICONS = ["🚀", "🧪", "📐", "⚛️", "🧠", "🎯"];
const colorFor = (id) => SUBJECT_COLORS[id % SUBJECT_COLORS.length];

function SeriesList() {
  const [list, setList] = useState(null);
  const [tab, setTab] = useState("all");
  useEffect(() => {
    api.get("/series").then((r) => setList(r.data.series)).catch(() => setList([]));
  }, []);

  const mine = (list || []).filter((s) => s.is_enrolled);
  const shown = tab === "mine" ? mine : list || [];

  return (
    <div className="page sr">
      <div className="sr-banner">
        <div>
          <span className="db-eyebrow">Free for everyone</span>
          <h1>Test Series</h1>
          <p>Structured sets of tests and contests. Free to join, and you can leave any time.</p>
        </div>
        <div className="sr-banner-stats">
          <div><strong><CountUp value={list ? list.length : 0} /></strong><small>series</small></div>
          <div><strong><CountUp value={mine.length} /></strong><small>enrolled</small></div>
        </div>
      </div>

      {list && list.length > 0 && (
        <div className="ts-filters">
          <button className={`ts-filter ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>All series<span>{list.length}</span></button>
          <button className={`ts-filter ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>My series<span>{mine.length}</span></button>
        </div>
      )}

      {!list ? (
        <div className="jr-grid">{[0, 1, 2].map((i) => <div key={i} className="jr-skeleton card" />)}</div>
      ) : shown.length === 0 ? (
        <div className="card db-empty big">
          <span>📚</span>
          <p>{tab === "mine" ? "You haven't joined a series yet." : "No test series yet. Check back soon."}</p>
          {tab === "mine" && <button className="ghost small" onClick={() => setTab("all")}>Browse all series</button>}
        </div>
      ) : (
        <div key={tab} className="sr-grid">
          {shown.map((s, i) => {
            const progress = s.test_count ? Math.round((s.completed / s.test_count) * 100) : 0;
            return (
              <Link key={s.id} to={`/studio/series/${s.id}`} className="sr-card" style={{ "--i": i, "--subject": colorFor(s.id) }}>
                <div className="sr-cover">
                  <span className="sr-cover-icon">{COVER_ICONS[s.id % COVER_ICONS.length]}</span>
                  <span className="sr-exam">{SERIES_EXAM_LABEL[s.exam]}</span>
                  {s.is_enrolled && <span className="sr-enrolled">✓ Enrolled</span>}
                </div>
                <div className="sr-card-body">
                  <h3>{s.title}</h3>
                  {s.description && <p className="sr-desc">{s.description}</p>}
                  <div className="ts-facts">
                    <span><b>{s.test_count}</b> tests</span>
                    <span><b>{s.enrolled}</b> enrolled</span>
                  </div>
                  <div className="sr-card-foot">
                    {s.is_enrolled ? (
                      <div className="sr-progress">
                        <Ring pct={progress} size={44} stroke={5} color="var(--subject)"><small style={{ color: "var(--text)" }}>{progress}%</small></Ring>
                        <span>{s.completed} of {s.test_count} done</span>
                      </div>
                    ) : <span className="sr-free">Free</span>}
                    <span className="jr-open">{s.is_enrolled ? "Continue →" : "View →"}</span>
                  </div>
                </div>
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
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    return api.get(`/series/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || "Couldn't load this series"));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function toggleEnrol() {
    const leaving = data.series.is_enrolled;
    setBusy(true);
    setError("");
    try {
      if (leaving) await api.delete(`/series/${id}/enroll`);
      else await api.post(`/series/${id}/enroll`);
      await load();
      setConfirmLeave(false);
      if (!leaving) {
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 2600);
      }
    } catch (e) {
      setError(e.response?.data?.error || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setStarting(true);
    try {
      const { data: res } = await api.post(`/student/tests/${confirming.id}/start`);
      navigate(`/studio/tests/attempt/${res.attempt_id}`);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't start the test");
      setStarting(false);
      setConfirming(null);
    }
  }

  if (error && !data) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><div className="jr-skeleton hero" /><div className="jr-skeleton card" /></div>;

  const { series: s, tests, progress } = data;
  const nextUp = tests.find((t) => !t.attempt_status && contestState(t) !== "ended" && contestState(t) !== "upcoming");
  const open = (t) => navigate(`/studio/tests/attempt/${t.attempt_id}`);
  const color = colorFor(s.id);

  function action(t) {
    const state = contestState(t);
    if (t.attempt_status === "in_progress") return <FxButton onClick={() => open(t)}>⏳ Resume</FxButton>;
    if (t.attempt_status === "submitted") {
      return state === "live"
        ? <span className="ts-time">✅ Results {when(t.ends_at)}</span>
        : <button className="ghost small" onClick={() => open(t)}>View result →</button>;
    }
    if (!s.is_enrolled) return <span className="sr-lock">🔒 Enrol to start</span>;
    if (state === "upcoming") return <span className="ts-time">Opens {when(t.starts_at)}</span>;
    if (state === "ended") return <span className="ts-time muted">Missed</span>;
    return <FxButton variant={t.id === nextUp?.id ? "" : "soft"} onClick={() => setConfirming(t)}>{state === "live" ? "Start contest →" : "▶ Start"}</FxButton>;
  }

  return (
    <div className="page sr" style={{ "--subject": color }}>
      <Link to="/studio/series" className="link-btn">← All series</Link>

      <div className="sr-hero">
        <span className="sr-hero-icon">{COVER_ICONS[s.id % COVER_ICONS.length]}</span>
        <div className="sr-hero-text">
          <span className="db-eyebrow">{SERIES_EXAM_LABEL[s.exam]} · by {s.author}</span>
          <h1>{s.title}</h1>
          {s.description && <p>{s.description}</p>}
          <div className="sr-hero-facts">
            <span>📝 {tests.length} tests</span>
            <span>👥 {s.enrolled} enrolled</span>
            <span>💸 Free</span>
          </div>
        </div>
        <div className="sr-hero-action">
          {s.is_enrolled ? (
            confirmLeave ? (
              <div className="sr-leave">
                <span>Leave? Your results are kept.</span>
                <div>
                  <button className="ghost small" onClick={() => setConfirmLeave(false)} disabled={busy}>Stay</button>
                  <button className="danger small" onClick={toggleEnrol} disabled={busy}>Leave</button>
                </div>
              </div>
            ) : (
              <button className="sr-leave-btn" onClick={() => setConfirmLeave(true)}>✓ Enrolled · Leave</button>
            )
          ) : (
            <FxButton variant="glow" busy={busy} busyText="Enrolling…" onClick={toggleEnrol}>Enrol for free →</FxButton>
          )}
        </div>
        {celebrate && (
          <div className="sr-confetti" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => <span key={i} style={{ "--i": i }} />)}
          </div>
        )}
      </div>

      {celebrate && <div className="sr-toast">🎉 You're in! Start with the first test below.</div>}
      {error && <p className="error">{error}</p>}

      {s.is_enrolled ? (
        <div className="sr-progress-row">
          <div className="sr-progress-card">
            <Ring pct={progress.pct} size={92} stroke={9} color={color}>
              <strong>{Math.round(progress.pct)}%</strong><small>done</small>
            </Ring>
            <div>
              <b>{progress.completed} of {progress.total} tests</b>
              <small>completed so far</small>
            </div>
          </div>
          <div className="db-stat" style={{ "--i": 1, "--tile": "#1f9d63" }}>
            <span className="db-stat-icon">📊</span>
            <div><span className="db-stat-label">Average score</span>
              <strong>{progress.avg_pct != null ? <CountUp value={progress.avg_pct} suffix="%" /> : "—"}</strong></div>
          </div>
          <div className="db-stat" style={{ "--i": 2, "--tile": "#e07a1f" }}>
            <span className="db-stat-icon">⏭</span>
            <div><span className="db-stat-label">Next up</span>
              <strong className="sr-next">{nextUp ? nextUp.title : "All caught up 🎉"}</strong></div>
          </div>
        </div>
      ) : (
        <div className="sr-note">✨ Enrol to unlock these tests and track your progress through the series.</div>
      )}

      <div className="card">
        <h3>Your roadmap</h3>
        {tests.length === 0 ? <p className="muted">No tests yet.</p> : (
          <ol className="sr-road">
            {tests.map((t, i) => {
              const state = contestState(t);
              const done = t.attempt_status === "submitted";
              const current = t.id === nextUp?.id && s.is_enrolled;
              const pct = done && t.score != null ? pctOf(t.score, t.max_score) : null;
              return (
                <li key={t.id} className={`sr-step ${done ? "done" : ""} ${current ? "current" : ""}`} style={{ "--i": i }}>
                  <span className="sr-node">{done ? "✓" : i + 1}</span>
                  <div className="sr-step-card">
                    <div className="sr-step-text">
                      <b>{t.title}</b>
                      <div className="ts-tags">
                        {current && <span className="ts-badge b-open">Up next</span>}
                        {t.is_contest && <span className="ts-tag">🏆 Contest · {when(t.starts_at)}</span>}
                        {state === "live" && <span className="ts-badge b-live">Live now</span>}
                        <span className="ts-tag">{t.question_count} Q · {t.total_marks} marks · {t.duration_minutes} min</span>
                        {pct != null && <span className="ts-badge b-completed">{t.score} / {t.max_score} · {pct}%</span>}
                      </div>
                    </div>
                    <div className="sr-step-action">{action(t)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {confirming && (
        <StartDialog test={confirming} busy={starting} onCancel={() => setConfirming(null)} onConfirm={start} />
      )}
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
