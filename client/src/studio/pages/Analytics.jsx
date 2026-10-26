import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import api from "../../api";
import { TYPE_LABEL, SYLLABUS_LABEL } from "../constants";
import ExamSwitch from "../syllabus/ExamSwitch";
import { useAuth } from "../../auth/AuthContext";

const fmtTime = (s) => (s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);
const band = (a) => (a == null ? "" : a >= 75 ? "good" : a >= 50 ? "mid" : "low");

function AccBar({ value }) {
  return (
    <div className="acc">
      <div className="acc-track">
        <div className={`acc-fill ${band(value)}`} style={{ width: `${Math.max(0, value ?? 0)}%` }} />
      </div>
      <span>{value == null ? "—" : `${value}%`}</span>
    </div>
  );
}

function InsightCard({ title, hint, items, detail, empty }) {
  return (
    <div className="card insight-card">
      <h3>{title}</h3>
      <p className="muted">{hint}</p>
      {items.length === 0 ? (
        <p className="muted insight-empty">{empty}</p>
      ) : (
        <ul>
          {items.map((t) => (
            <li key={t.id}>
              <div>
                <b>{t.name}</b>
                <div className="muted small">{t.subject} › {t.chapter}</div>
              </div>
              <span className="insight-value">{detail(t)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BreakdownTable({ title, rows, label }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <table className="table">
        <thead><tr><th></th><th>Accuracy</th><th>Attempted</th><th>Avg. time</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="cap"><b>{label(r.key)}</b></td>
              <td className="acc-cell"><AccBar value={r.accuracy} /></td>
              <td>{r.attempted} / {r.seen}</td>
              <td>{fmtTime(r.avg_time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const [exam, setExam] = useState(user?.target_exam || "jee_main");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/student/analytics", { params: { exam } })
      .then((r) => setData(r.data))
      .catch(() => setError("Couldn't load your analytics"));
  }, [exam]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>;

  const { overview: o, trend, subjects, by_difficulty, by_type, insights } = data;

  if (o.tests_taken === 0) {
    return (
      <div className="page">
        <h1>Analytics</h1>
        <div className="card empty">
          <p>Take your first test to see your accuracy, speed and topic strengths here.</p>
          <Link to="/studio/tests"><button>Go to tests</button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div>
        <div className="page-head">
          <h1>Analytics</h1>
          <ExamSwitch value={exam} onChange={setExam} />
        </div>
        <p className="muted">
          Based on {o.tests_taken} completed test{o.tests_taken === 1 ? "" : "s"}. Topic breakdown uses the {SYLLABUS_LABEL[data.exam]} syllabus.
          {data.outside_tree > 0 && <> {data.outside_tree} answered question{data.outside_tree === 1 ? " isn't" : "s aren't"} tagged in this syllabus, so they count in your totals but not in the topic breakdown.</>}
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><span>Tests taken</span><strong>{o.tests_taken}</strong></div>
        <div className="stat-card"><span>Average score</span><strong>{o.avg_score_pct ?? "—"}%</strong></div>
        <div className="stat-card"><span>Best score</span><strong>{o.best_score_pct ?? "—"}%</strong></div>
        <div className="stat-card"><span>Accuracy</span><strong className={band(o.accuracy)}>{o.accuracy ?? "—"}%</strong></div>
        <div className="stat-card"><span>Avg. time / question</span><strong>{fmtTime(o.avg_time)}</strong></div>
        <div className="stat-card"><span>Marks lost to wrong answers</span><strong className="bad">{o.negative}</strong></div>
      </div>

      <div className="card">
        <h3>Progress across tests</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trend} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e5ee" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis domain={[(min) => Math.min(0, Math.floor(min)), 100]} unit="%" tick={{ fontSize: 12 }} />
            <Tooltip
              labelFormatter={(label, payload) => payload?.[0]?.payload?.title ?? label}
              formatter={(value, name) => [`${value}%`, name]}
            />
            <Legend />
            <ReferenceLine y={0} stroke="#c9cbe0" />
            <Line type="monotone" dataKey="score_pct" name="Score %" stroke="#5b5bf6" strokeWidth={2.5} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="accuracy" name="Accuracy %" stroke="#3fb97a" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="insight-grid">
        <InsightCard
          title="💪 Strengths"
          hint="Topics where you're 75%+ accurate."
          items={insights.strong}
          detail={(t) => `${t.accuracy}%`}
          empty={`Attempt at least ${insights.min_attempted} questions in a topic to see strengths.`}
        />
        <InsightCard
          title="🎯 Focus areas"
          hint="Topics under 60% accuracy. Practise these next."
          items={insights.weak}
          detail={(t) => `${t.accuracy}%`}
          empty="No weak topics yet. Nice work."
        />
        <InsightCard
          title="🐢 Slow topics"
          hint={`Taking much longer than your ${fmtTime(o.avg_time)} average.`}
          items={insights.slow}
          detail={(t) => fmtTime(t.avg_time)}
          empty="Your pace is consistent across topics."
        />
      </div>

      <div className="card">
        <h3>By subject</h3>
        <p className="muted">Click a subject to see its chapters and topics.</p>
        <div className="subject-list">
          {subjects.map((s) => (
            <details key={s.id} className="subject-block">
              <summary>
                <b>{s.name}</b>
                <AccBar value={s.accuracy} />
                <span className="muted">{s.attempted} / {s.seen} attempted</span>
                <span className="muted">{s.marks} marks</span>
              </summary>
              <table className="table">
                <thead>
                  <tr><th>Chapter</th><th>Topic</th><th>Accuracy</th><th>Attempted</th><th>Avg. time</th><th>Marks</th></tr>
                </thead>
                <tbody>
                  {s.chapters.flatMap((c) =>
                    c.topics.map((t, i) => (
                      <tr key={t.id}>
                        <td>{i === 0 ? <><b>{c.name}</b>{c.cluster && <div className="muted small">{c.cluster}</div>}</> : ""}</td>
                        <td>{t.name}</td>
                        <td className="acc-cell"><AccBar value={t.accuracy} /></td>
                        <td>{t.attempted} / {t.seen}</td>
                        <td>{fmtTime(t.avg_time)}</td>
                        <td className={t.marks < 0 ? "bad" : ""}>{t.marks}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      </div>

      <div className="builder-cols">
        <BreakdownTable title="By difficulty" rows={by_difficulty} label={(k) => k} />
        <BreakdownTable title="By question type" rows={by_type} label={(k) => TYPE_LABEL[k] || k} />
      </div>
    </div>
  );
}
