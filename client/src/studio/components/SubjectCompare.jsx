// Physics, Chemistry and Maths overlaid on one chart, test by test.
// Students pick one, two or all subjects, the measure, and lines or bars.
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { SUBJECT_COLORS } from "./fxUtils";

const NAMED = { physics: "#2563eb", chemistry: "#1f9d63", mathematics: "#e07a1f", maths: "#e07a1f" };
const ICON = { physics: "⚛️", chemistry: "🧪", mathematics: "📐", maths: "📐" };
const colorOf = (s, i) => NAMED[s.name.toLowerCase()] || SUBJECT_COLORS[i % SUBJECT_COLORS.length];
const iconOf = (s) => ICON[s.name.toLowerCase()] || "📘";

const METRICS = [
  { id: "accuracy", label: "Accuracy", unit: "%", hint: "Correct out of the questions you attempted", domain: [0, 100] },
  { id: "score_pct", label: "Score", unit: "%", hint: "Marks scored out of marks available (after negatives)", domain: ["auto", 100] },
  { id: "avg_time", label: "Time / question", unit: "s", hint: "Average seconds per attempted question. Lower is faster.", lowerBetter: true },
  { id: "attempted", label: "Attempted", unit: "", hint: "How many questions you attempted" },
];
const MODES = [
  { n: 1, label: "One" },
  { n: 2, label: "Two" },
  { n: 3, label: "All three" },
];

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};
const fmt = (v, m) => (v == null ? "—" : `${Math.round(v * 10) / 10}${m.unit}`);
// A difference between two percentages is in points, not percent
const fmtGap = (v, m) => (m.unit === "%" ? `${Math.round(v * 10) / 10} points` : fmt(v, m));

function Tip({ active, payload, label, subjects, metric, points }) {
  if (!active || !payload?.length) return null;
  const pt = points.find((p) => p.label === label);
  // Best first (for time, fastest first); subjects missing from this test go last
  const rank = (v) => (v == null ? Infinity : metric.lowerBetter ? v : -v);
  const rows = subjects
    .map((s) => ({ s, v: pt?.by_subject[s.id]?.[metric.id] ?? null }))
    .sort((a, b) => rank(a.v) - rank(b.v));
  return (
    <div className="sc-tip">
      <b>{pt?.title ?? label}</b>
      {rows.map(({ s, v }, i) => (
        <div key={s.id} className="sc-tip-row">
          <i style={{ background: s.color }} />
          <span>{s.name}</span>
          <strong>{fmt(v, metric)}</strong>
          {i === 0 && v != null && rows.length > 1 && <em>{metric.lowerBetter ? "fastest" : "best"}</em>}
        </div>
      ))}
    </div>
  );
}

export default function SubjectCompare({ data }) {
  const all = useMemo(() => data.subjects.map((s, i) => ({ ...s, color: colorOf(s, i), icon: iconOf(s) })), [data.subjects]);
  const ids = all.map((s) => s.id);
  const max = Math.min(3, all.length);

  const [metricId, setMetricId] = useState(() => load("sc-metric", "accuracy"));
  const [style, setStyle] = useState(() => load("sc-style", "area"));
  const [picked, setPicked] = useState(() => {
    const saved = load("sc-picked", null);
    const valid = Array.isArray(saved) ? saved.filter((id) => ids.includes(id)) : [];
    return valid.length ? valid : ids.slice(0, max);
  });
  const metric = METRICS.find((m) => m.id === metricId) || METRICS[0];
  const selected = all.filter((s) => picked.includes(s.id));
  const mode = picked.length;

  const update = (next) => { setPicked(next); save("sc-picked", next); };
  function setMode(n) {
    if (n >= max) return update(ids.slice(0, max));
    // keep what's already chosen, trimmed or topped up to n
    const keep = picked.filter((id) => ids.includes(id)).slice(0, n);
    for (const id of ids) if (keep.length < n && !keep.includes(id)) keep.push(id);
    update(keep);
  }
  function toggle(id) {
    if (mode === 1) return update([id]);
    if (picked.includes(id)) {
      if (picked.length > 1) update(picked.filter((x) => x !== id));
      return;
    }
    // in "Two" mode a third pick replaces the oldest one
    const next = [...picked, id];
    update(mode === 2 && max > 2 ? next.slice(-2) : next);
  }

  const rows = data.points.map((p) => {
    const row = { label: p.label };
    for (const s of all) row[`s${s.id}`] = p.by_subject[s.id]?.[metric.id] ?? null;
    return row;
  });

  // Summary per selected subject: latest, change since first test, average, best
  const summary = selected.map((s) => {
    const vals = data.points.map((p) => ({ label: p.label, title: p.title, v: p.by_subject[s.id]?.[metric.id] })).filter((x) => x.v != null);
    if (!vals.length) return { s, empty: true };
    const first = vals[0].v, last = vals[vals.length - 1].v;
    const avg = vals.reduce((a, x) => a + x.v, 0) / vals.length;
    const best = vals.reduce((b, x) => ((metric.lowerBetter ? x.v < b.v : x.v > b.v) ? x : b));
    const change = vals.length > 1 ? last - first : null;
    const good = change == null ? null : metric.lowerBetter ? change < 0 : change > 0;
    return { s, last, avg, best, change, good, tests: vals.length, lastLabel: vals[vals.length - 1].label };
  });

  // One headline sentence about the selected subjects
  const live = summary.filter((x) => !x.empty);
  let headline = null;
  if (live.length >= 2) {
    const byLast = [...live].sort((a, b) => (metric.lowerBetter ? a.last - b.last : b.last - a.last));
    const top = byLast[0], bottom = byLast[byLast.length - 1];
    const gap = Math.abs(top.last - bottom.last);
    const improver = [...live].filter((x) => x.change != null).sort((a, b) => (metric.lowerBetter ? a.change - b.change : b.change - a.change))[0];
    const name = (x) => <b style={{ color: x.s.color }}>{x.s.name}</b>;
    headline = (
      <>
        {gap > 0
          ? <>In your latest tests, {name(top)} is ahead of {name(bottom)} by <b>{fmtGap(gap, metric)}</b>{metric.lowerBetter ? " per question" : ""}.</>
          : <>{name(top)} and {name(bottom)} are level in your latest tests.</>}
        {improver?.good && <> Most improved: {name(improver)} ({improver.change > 0 ? "+" : "−"}{fmtGap(Math.abs(improver.change), metric)} since your first test).</>}
      </>
    );
  } else if (live.length === 1) {
    const x = live[0];
    headline = x.change == null
      ? <>Take more tests to see how <b style={{ color: x.s.color }}>{x.s.name}</b> is trending.</>
      : <><b style={{ color: x.s.color }}>{x.s.name}</b> {x.good ? "has improved" : "has slipped"} by <b>{fmtGap(Math.abs(x.change), metric)}</b> since your first test.</>;
  }

  if (!data.points.length || !all.length) return null;

  const Chart = style === "bar" ? BarChart : AreaChart;
  return (
    <div className="card sc">
      <div className="sc-head">
        <div>
          <h3>Compare subjects</h3>
          <small className="muted">{metric.hint}</small>
        </div>
        <div className="sc-style" role="group" aria-label="Chart style">
          <button type="button" className={style === "area" ? "active" : ""} onClick={() => { setStyle("area"); save("sc-style", "area"); }} title="Overlaid lines">〰 Lines</button>
          <button type="button" className={style === "bar" ? "active" : ""} onClick={() => { setStyle("bar"); save("sc-style", "bar"); }} title="Side-by-side bars">▮▮ Bars</button>
        </div>
      </div>

      <div className="sc-controls">
        {max > 1 && (
          <div className="sc-modes" role="group" aria-label="How many subjects">
            <span>Show</span>
            {MODES.filter((m) => m.n <= max).map((m) => (
              <button key={m.n} type="button" className={mode === m.n ? "active" : ""} onClick={() => setMode(m.n)}>
                {m.n === max && max !== 3 ? "All" : m.label}
              </button>
            ))}
          </div>
        )}
        <div className="sc-chips" role="group" aria-label="Subjects">
          {all.map((s) => {
            const on = picked.includes(s.id);
            return (
              <button key={s.id} type="button" aria-pressed={on} className={`sc-chip ${on ? "on" : ""}`} style={{ "--c": s.color }}
                onClick={() => toggle(s.id)}>
                <span className="sc-chip-dot">{on ? "✓" : ""}</span>{s.icon} {s.name}
              </button>
            );
          })}
        </div>
        <div className="sc-metrics" role="tablist" aria-label="Measure">
          {METRICS.map((m) => (
            <button key={m.id} role="tab" aria-selected={m.id === metric.id} type="button" className={m.id === metric.id ? "active" : ""}
              onClick={() => { setMetricId(m.id); save("sc-metric", m.id); }}>{m.label}</button>
          ))}
        </div>
      </div>

      {headline && <p className="sc-headline">💡 {headline}</p>}

      <div className="sc-chart" key={`${style}-${metric.id}`}>
        <ResponsiveContainer width="100%" height={300}>
          <Chart data={rows} margin={{ top: 10, right: 12, left: -12, bottom: 0 }} barGap={3} barCategoryGap="22%">
            <defs>
              {all.map((s) => (
                <linearGradient key={s.id} id={`sc-g-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={selected.length === 1 ? 0.35 : 0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8ebf2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis domain={metric.domain || [0, "auto"]} unit={metric.unit} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<Tip subjects={selected} metric={metric} points={data.points} />} cursor={style === "bar" ? { fill: "#f1f5f9" } : { stroke: "#94a3b8", strokeDasharray: "4 4" }} />
            {selected.map((s, i) =>
              style === "bar" ? (
                <Bar key={s.id} dataKey={`s${s.id}`} name={s.name} fill={s.color} radius={[6, 6, 0, 0]} maxBarSize={34}
                  animationDuration={700} animationBegin={i * 120} />
              ) : (
                <Area key={s.id} type="monotone" dataKey={`s${s.id}`} name={s.name} stroke={s.color} strokeWidth={3}
                  fill={`url(#sc-g-${s.id})`} connectNulls dot={{ r: 4, fill: "#fff", strokeWidth: 2.5 }}
                  activeDot={{ r: 7, strokeWidth: 0 }} animationDuration={1000} animationBegin={i * 150} />
              )
            )}
          </Chart>
        </ResponsiveContainer>
      </div>

      <div className="sc-summary">
        {summary.map((x, i) => (
          <div key={x.s.id} className="sc-sub" style={{ "--c": x.s.color, "--i": i }}>
            <div className="sc-sub-head"><span>{x.s.icon}</span><b>{x.s.name}</b></div>
            {x.empty ? <small className="muted">No questions from this subject yet.</small> : (
              <>
                <div className="sc-sub-main">
                  <strong>{fmt(x.last, metric)}</strong>
                  {x.change != null && x.change !== 0 && (
                    <span className={`sc-delta ${x.good ? "up" : "down"}`}>
                      {x.change > 0 ? "▲" : "▼"} {fmtGap(Math.abs(x.change), metric).replace(" points", " pts")}
                    </span>
                  )}
                </div>
                <small>latest ({x.lastLabel}) · avg {fmt(x.avg, metric)} · best {fmt(x.best.v, metric)} in {x.best.label}</small>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
