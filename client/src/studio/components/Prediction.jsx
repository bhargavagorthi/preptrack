// Predicted JEE Main percentile, rank and marks, with PrepTrack standing.
// `compact` is the small dashboard version.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from "recharts";
import api from "../../api";
import { CountUp } from "./Fx";

const n = (v) => Math.round(v).toLocaleString("en-IN");
const CONF = {
  good: { label: "Good estimate", hint: "Based on 5+ tests" },
  fair: { label: "Rough estimate", hint: "Take a few more tests to sharpen it" },
  low: { label: "Early estimate", hint: "Based on fewer than 3 tests" },
};

function MarksScale({ e, target }) {
  const at = (m) => `${(Math.max(0, Math.min(300, m)) / 300) * 100}%`;
  return (
    <div className="pr-scale" aria-label={`Predicted ${e.marks} marks out of 300, likely ${e.marks_low} to ${e.marks_high}`}>
      <div className="pr-track">
        <div className="pr-band" style={{ left: at(e.marks_low), width: `calc(${at(e.marks_high)} - ${at(e.marks_low)})` }} />
        <div className="pr-dot" style={{ left: at(e.marks) }} />
        {target && <div className="pr-target" style={{ left: at(target.marks) }} title={`Target: ${target.percentile} percentile`}><span>🎯</span></div>}
      </div>
      <div className="pr-ticks">{[0, 60, 120, 180, 240, 300].map((m) => <span key={m} style={{ left: at(m) }}>{m}</span>)}</div>
    </div>
  );
}

export default function Prediction({ compact = false }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.get("/student/prediction").then((r) => setData(r.data)).catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  if (!data) return <div className={`jr-skeleton ${compact ? "" : "card"}`} style={{ height: compact ? 150 : 260 }} />;
  const { estimate: e, history, standing, target, method } = data;

  if (!e) {
    return (
      <div className={`pr ${compact ? "compact" : ""} empty`}>
        <span className="pr-empty-icon">🔮</span>
        <div>
          <b>Your predicted JEE Main percentile</b>
          <small>Take a full test or contest and we'll estimate your percentile and All-India rank.</small>
        </div>
        <Link to="/studio/tests" className="db-more">Find a test →</Link>
      </div>
    );
  }

  const ahead = target.gap <= 0;
  const conf = CONF[e.confidence];
  const headline = (
    <div className="pr-main">
      <div className="pr-pct">
        <strong><CountUp value={e.percentile} decimals={2} /></strong>
        <span>percentile</span>
      </div>
      <div className="pr-facts">
        <div><small>All-India rank</small><b>~{n(e.rank)}</b><em>{n(e.rank_best)} – {n(e.rank_worst)}</em></div>
        <div><small>JEE Main marks</small><b>{e.marks}<span>/300</span></b><em>{e.marks_low} – {e.marks_high}</em></div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <Link to="/studio/analytics" className="pr compact">
        <div className="pr-head">
          <span className="db-eyebrow">🔮 Predicted JEE Main</span>
          <span className={`pr-conf ${e.confidence}`}>{conf.label}</span>
        </div>
        {headline}
        <div className="pr-foot">
          {ahead
            ? <span className="pr-ok">🎯 On track for your {target.percentile} percentile target</span>
            : <span>🎯 ~{target.gap} more marks for {target.percentile} percentile</span>}
          {standing?.percentile != null && <span>· Ahead of {standing.percentile}% on PrepTrack</span>}
        </div>
      </Link>
    );
  }

  return (
    <div className="card pr">
      <div className="pr-head">
        <div>
          <h3>🔮 Predicted JEE Main result</h3>
          <small className="muted">From your last {e.tests_used} test{e.tests_used === 1 ? "" : "s"}, recent ones counting more.</small>
        </div>
        <span className={`pr-conf ${e.confidence}`} title={conf.hint}>{conf.label}</span>
      </div>

      <div className="pr-body">
        <div className="pr-left">
          {headline}
          <MarksScale e={e} target={target} />
          <div className={`pr-target-line ${ahead ? "ok" : ""}`}>
            {ahead
              ? <>✅ You're above your <b>{target.percentile} percentile</b> target (~{target.marks} marks). Keep it there.</>
              : <>🎯 Your <b>{target.percentile} percentile</b> target needs about <b>{target.marks} marks</b>, which is <b>{target.gap} more</b> than now.</>}
            {!target.from_goals && <> <Link to="/studio/goals">Set your own target →</Link></>}
          </div>
        </div>

        <div className="pr-right">
          {standing && (
            <div className="pr-standing">
              <small>On PrepTrack right now</small>
              <b>#{standing.rank} <span>of {standing.students}</span></b>
              {standing.percentile != null
                ? <em>Ahead of {standing.percentile}% of students</em>
                : <em>You're the first to take a test. Others will join you here.</em>}
            </div>
          )}
          {history.length > 1 && (
            <div className="pr-trend">
              <small>How your estimate moved</small>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={history} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                  <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip formatter={(v) => [`${v} percentile`, "Estimate"]} labelFormatter={(l, p) => p?.[0]?.payload?.title ?? l} />
                  <Line type="monotone" dataKey="percentile" stroke="#7c4dcc" strokeWidth={2.5} dot={{ r: 3 }} animationDuration={1100} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <details className="pr-method">
        <summary>How is this worked out?</summary>
        <p>
          We take your score in your last {method.window} PrepTrack tests and contests (not topic practice sets), weight recent ones more,
          and scale it to 300 marks. That's mapped to a percentile using {method.sources.table}, and to a rank using {method.sources.candidates}.
          The range widens when you've taken few tests or your scores vary a lot.
        </p>
        <p className="muted">{method.note}</p>
      </details>
    </div>
  );
}
