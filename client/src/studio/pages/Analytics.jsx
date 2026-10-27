import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import api from "../../api";
import { TYPE_LABEL, SYLLABUS_LABEL } from "../constants";
import ExamSwitch from "../syllabus/ExamSwitch";
import { useAuth } from "../../auth/AuthContext";
import { Ring, CountUp } from "../components/Fx";
import { SUBJECT_COLORS } from "../components/fxUtils";

const fmtTime = (s) => (s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const band = (a) => (a == null ? "" : a >= 75 ? "good" : a >= 50 ? "mid" : "low");
const bandColor = (a) => (a == null ? "#cbd5e1" : a >= 75 ? "#1f9d63" : a >= 50 ? "#e0a100" : "#e05656");
const DIFF_COLOR = { easy: "#1f9d63", medium: "#e0a100", hard: "#e05656" };

function AccBar({ value }) {
  return (
    <div className="acc">
      <div className="acc-track">
        <div className={`acc-fill an-grow ${band(value)}`} style={{ width: `${Math.max(0, value ?? 0)}%` }} />
      </div>
      <span>{value == null ? "—" : `${value}%`}</span>
    </div>
  );
}

function InsightCard({ tone, icon, title, hint, items, detail, empty, index }) {
  return (
    <div className={`an-insight ${tone}`} style={{ "--i": index }}>
      <div className="an-insight-head">
        <span className="an-insight-icon">{icon}</span>
        <div><h3>{title}</h3><small>{hint}</small></div>
      </div>
      {items.length === 0 ? (
        <p className="an-insight-empty">{empty}</p>
      ) : (
        <ul>
          {items.map((t, i) => (
            <li key={t.id} style={{ "--i": i }}>
              <div>
                <b>{t.name}</b>
                <small>{t.subject} › {t.chapter}</small>
              </div>
              <span className="an-insight-value">{detail(t)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="an-tip">
      <b>{p.title ?? p.label}</b>
      <div><i style={{ background: "#2563eb" }} /> Score {p.score_pct ?? "—"}%</div>
      <div><i style={{ background: "#1f9d63" }} /> Accuracy {p.accuracy ?? "—"}%</div>
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const [exam, setExam] = useState(user?.target_exam || "jee_main");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [openSubject, setOpenSubject] = useState(null);

  useEffect(() => {
    api.get("/student/analytics", { params: { exam } })
      .then((r) => setData(r.data))
      .catch(() => setError("Couldn't load your analytics"));
  }, [exam]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) {
    return (
      <div className="page">
        <div className="jr-skeleton hero" />
        <div className="jr-grid">{[0, 1, 2].map((i) => <div key={i} className="jr-skeleton card" />)}</div>
      </div>
    );
  }

  const { overview: o, trend, subjects, by_difficulty, by_type, insights } = data;

  if (o.tests_taken === 0) {
    return (
      <div className="page">
        <h1>Analytics</h1>
        <div className="card db-empty big">
          <span>📈</span>
          <p>Take your first test to see your accuracy, speed and topic strengths here.</p>
          <Link to="/studio/tests"><button>Go to tests →</button></Link>
        </div>
      </div>
    );
  }

  const maxTypeSeen = Math.max(1, ...by_type.map((r) => r.seen));

  return (
    <div className="page an">
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="muted">
            Based on {o.tests_taken} completed test{o.tests_taken === 1 ? "" : "s"}. Topic breakdown uses the {SYLLABUS_LABEL[data.exam]} syllabus.
            {data.outside_tree > 0 && <> {data.outside_tree} answered question{data.outside_tree === 1 ? " isn't" : "s aren't"} tagged in this syllabus, so they count in your totals but not in the topic breakdown.</>}
          </p>
        </div>
        <ExamSwitch value={exam} onChange={setExam} />
      </div>

      {/* ---------- Headline rings ---------- */}
      <div className="an-hero">
        <div className="an-ring-card" style={{ "--i": 0 }}>
          <Ring pct={o.avg_score_pct} size={96} stroke={9} color="#2563eb"><strong>{o.avg_score_pct ?? "—"}%</strong></Ring>
          <div><b>Average score</b><small>across {o.tests_taken} tests</small></div>
        </div>
        <div className="an-ring-card" style={{ "--i": 1 }}>
          <Ring pct={o.accuracy} size={96} stroke={9} color={bandColor(o.accuracy)}><strong>{o.accuracy ?? "—"}%</strong></Ring>
          <div><b>Accuracy</b><small>of questions you attempted</small></div>
        </div>
        <div className="an-ring-card" style={{ "--i": 2 }}>
          <Ring pct={o.best_score_pct} size={96} stroke={9} color="#7c4dcc"><strong>{o.best_score_pct ?? "—"}%</strong></Ring>
          <div><b>Best score</b><small>your personal best</small></div>
        </div>
      </div>

      <div className="db-stats">
        <div className="db-stat" style={{ "--i": 3, "--tile": "#2563eb" }}>
          <span className="db-stat-icon">📝</span>
          <div><span className="db-stat-label">Tests taken</span><strong><CountUp value={o.tests_taken} /></strong></div>
        </div>
        <div className="db-stat" style={{ "--i": 4, "--tile": "#1d7fb8" }}>
          <span className="db-stat-icon">⏱</span>
          <div><span className="db-stat-label">Avg. time / question</span><strong>{fmtTime(o.avg_time)}</strong></div>
        </div>
        <div className="db-stat" style={{ "--i": 5, "--tile": "#e05656" }}>
          <span className="db-stat-icon">➖</span>
          <div><span className="db-stat-label">Marks lost to wrong answers</span><strong className="bad"><CountUp value={o.negative} /></strong></div>
        </div>
      </div>

      {/* ---------- Trend ---------- */}
      <div className="card an-chart">
        <div className="db-card-head">
          <h3>Progress across tests</h3>
          <div className="an-legend"><span><i style={{ background: "#2563eb" }} />Score</span><span><i style={{ background: "#1f9d63" }} />Accuracy</span></div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={trend} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="anScore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="anAcc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1f9d63" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#1f9d63" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis domain={[(min) => Math.min(0, Math.floor(min)), 100]} unit="%" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTip />} />
            <ReferenceLine y={0} stroke="#c9cbe0" />
            <Area type="monotone" dataKey="score_pct" name="Score %" stroke="#2563eb" strokeWidth={2.5} fill="url(#anScore)"
              dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={1100} />
            <Area type="monotone" dataKey="accuracy" name="Accuracy %" stroke="#1f9d63" strokeWidth={2} strokeDasharray="5 4"
              fill="url(#anAcc)" dot={{ r: 3 }} animationDuration={1300} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ---------- Insights ---------- */}
      <div className="an-insights">
        <InsightCard index={0} tone="good" icon="💪" title="Strengths" hint="Topics where you're 75%+ accurate."
          items={insights.strong} detail={(t) => `${t.accuracy}%`}
          empty={`Attempt at least ${insights.min_attempted} questions in a topic to see strengths.`} />
        <InsightCard index={1} tone="bad" icon="🎯" title="Focus areas" hint="Under 60% accuracy. Practise these next."
          items={insights.weak} detail={(t) => `${t.accuracy}%`} empty="No weak topics yet. Nice work." />
        <InsightCard index={2} tone="slow" icon="🐢" title="Slow topics" hint={`Much slower than your ${fmtTime(o.avg_time)} average.`}
          items={insights.slow} detail={(t) => fmtTime(t.avg_time)} empty="Your pace is consistent across topics." />
      </div>

      {/* ---------- Subjects ---------- */}
      <div>
        <div className="jr-section-title"><h3>By subject</h3><span className="muted">Tap a subject to see its chapters and topics.</span></div>
        <div className="an-subjects">
          {subjects.map((s, i) => {
            const color = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
            const isOpen = openSubject === s.id;
            return (
              <div key={s.id} className={`an-subject ${isOpen ? "open" : ""}`} style={{ "--subject": color, "--i": i }}>
                <button className="an-subject-head" onClick={() => setOpenSubject(isOpen ? null : s.id)} aria-expanded={isOpen}>
                  <Ring pct={s.accuracy} size={58} stroke={6} color={color}><small style={{ color: "var(--text)" }}>{s.accuracy ?? "—"}{s.accuracy != null && "%"}</small></Ring>
                  <div className="an-subject-text">
                    <b>{s.name}</b>
                    <small>{s.attempted} / {s.seen} attempted · {s.marks} marks</small>
                  </div>
                  <span className="an-chevron">▾</span>
                </button>
                <div className="an-subject-body">
                  <div>
                    {s.chapters.length === 0 ? <p className="muted">No answers in this subject yet.</p> : s.chapters.map((c) => (
                      <div key={c.name} className="an-chapter">
                        <div className="an-chapter-name"><b>{c.name}</b>{c.cluster && <small>{c.cluster}</small>}</div>
                        <ul>
                          {c.topics.map((t) => (
                            <li key={t.id}>
                              <span className="an-topic-name">{t.name}</span>
                              <AccBar value={t.accuracy} />
                              <span className="an-topic-meta">{t.attempted}/{t.seen} · {fmtTime(t.avg_time)} · <span className={t.marks < 0 ? "bad" : ""}>{t.marks} marks</span></span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- Difficulty + type ---------- */}
      <div className="builder-cols">
        <div className="card">
          <h3>By difficulty</h3>
          <div className="an-diff">
            {by_difficulty.map((r, i) => (
              <div key={r.key} className="an-diff-item" style={{ "--i": i }}>
                <Ring pct={r.accuracy} size={78} stroke={8} color={DIFF_COLOR[r.key] || "#2563eb"}>
                  <strong style={{ fontSize: 17 }}>{r.accuracy ?? "—"}{r.accuracy != null && "%"}</strong>
                </Ring>
                <b className="cap">{r.key}</b>
                <small>{r.attempted}/{r.seen} · {fmtTime(r.avg_time)}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>By question type</h3>
          <ul className="an-types">
            {by_type.map((r, i) => (
              <li key={r.key} style={{ "--i": i }}>
                <div className="an-type-head"><b>{TYPE_LABEL[r.key] || r.key}</b><span>{r.accuracy ?? "—"}{r.accuracy != null && "%"}</span></div>
                <div className="an-type-bar">
                  <div className="an-type-seen" style={{ width: `${(r.seen / maxTypeSeen) * 100}%` }}>
                    <div className={`an-type-acc an-grow ${band(r.accuracy)}`} style={{ width: `${Math.max(0, r.accuracy ?? 0)}%` }} />
                  </div>
                </div>
                <small>{r.attempted} / {r.seen} attempted · {fmtTime(r.avg_time)} avg</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
