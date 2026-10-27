import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api";
import { Ring, FxButton, CountUp } from "../components/Fx";

const TIER = { bronze: "Bronze", silver: "Silver", gold: "Gold" };
const dayName = (d) => new Date(d + "T12:00:00").toLocaleDateString([], { weekday: "short" });
const fmtDate = (d) => new Date(d).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

// Pop-up for badges earned since the student last looked
export function NewBadges({ badges, onClose }) {
  if (!badges.length) return null;
  return (
    <div className="fx-overlay" onClick={onClose}>
      <div className="fx-dialog gl-celebrate" role="dialog" aria-modal="true" aria-label="New badges" onClick={(e) => e.stopPropagation()}>
        <div className="gl-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i} style={{ "--i": i }} />)}</div>
        <span className="db-eyebrow">🎉 New {badges.length === 1 ? "badge" : "badges"} unlocked</span>
        <div className="gl-new">
          {badges.map((b, i) => (
            <div key={b.id} className={`gl-badge earned tier-${b.tier}`} style={{ "--i": i }}>
              <span className="gl-medal">{b.icon}</span>
              <b>{b.name}</b>
              <small>{b.text}</small>
            </div>
          ))}
        </div>
        <FxButton variant="big" onClick={onClose}>Nice! →</FxButton>
      </div>
    </div>
  );
}

function GoalEditor({ goals, targets, onSaved }) {
  const [form, setForm] = useState({
    daily_questions: goals.daily_questions, weekly_tests: goals.weekly_tests, target_percentile: goals.target_percentile,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = form.daily_questions !== goals.daily_questions || form.weekly_tests !== goals.weekly_tests
    || Number(form.target_percentile) !== Number(goals.target_percentile) || !goals.set;
  const chosen = targets.find((t) => t.percentile === Number(form.target_percentile));

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const { data } = await api.put("/student/goals", { ...form, target_percentile: Number(form.target_percentile) });
      onSaved(data);
      setMsg("✓ Goals saved");
    } catch (e) {
      setMsg(e.response?.data?.error || "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card gl-editor">
      <div className="db-card-head">
        <h3>{goals.set ? "Your goals" : "Set your goals"}</h3>
        {!goals.set && <span className="gl-suggest">Suggested to start</span>}
      </div>
      <div className="gl-sliders">
        <label className="gl-slider">
          <span>Questions a day <b>{form.daily_questions}</b></span>
          <input type="range" min={5} max={200} step={5} value={form.daily_questions}
            onChange={(e) => setForm({ ...form, daily_questions: Number(e.target.value) })} />
          <small>Counts every question you attempt in tests and practice.</small>
        </label>
        <label className="gl-slider">
          <span>Tests a week <b>{form.weekly_tests}</b></span>
          <input type="range" min={0} max={14} step={1} value={form.weekly_tests}
            onChange={(e) => setForm({ ...form, weekly_tests: Number(e.target.value) })} />
          <small>Full tests, contests and practice sets all count.</small>
        </label>
        <div className="gl-slider">
          <span>Target JEE Main percentile</span>
          <div className="gl-targets" role="radiogroup" aria-label="Target percentile">
            {targets.map((t) => (
              <button key={t.percentile} type="button" role="radio" aria-checked={Number(form.target_percentile) === t.percentile}
                className={Number(form.target_percentile) === t.percentile ? "active" : ""}
                onClick={() => setForm({ ...form, target_percentile: t.percentile })}>
                {t.percentile}
              </button>
            ))}
          </div>
          {chosen && <small>Roughly <b>{chosen.marks}/300 marks</b>, about rank <b>{chosen.rank.toLocaleString("en-IN")}</b> (previous-year trends).</small>}
        </div>
      </div>
      <div className="st-actions">
        <span className={msg.startsWith("✓") ? "gl-ok" : "st-err"}>{msg}</span>
        <div className="st-actions-right">
          <FxButton busy={busy} busyText="Saving…" disabled={!dirty} onClick={save}>{goals.set ? "Save goals" : "Set these goals"}</FxButton>
        </div>
      </div>
    </div>
  );
}

export default function Goals() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [celebrate, setCelebrate] = useState([]);

  useEffect(() => {
    api.get("/student/goals")
      .then((r) => {
        setData(r.data);
        setCelebrate(r.data.badges.filter((b) => b.earned && !b.seen));
      })
      .catch(() => setError("Couldn't load your goals"));
  }, []);

  function closeCelebrate() {
    setCelebrate([]);
    api.post("/student/goals/badges/seen").catch(() => {});
  }
  function saved(next) {
    setData(next);
    const fresh = next.badges.filter((b) => b.earned && !b.seen);
    if (fresh.length) setCelebrate(fresh);
  }

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><div className="jr-skeleton hero" /><div className="jr-grid">{[0, 1, 2].map((i) => <div key={i} className="jr-skeleton card" />)}</div></div>;

  const { goals, progress: p, badges, targets } = data;
  const earned = badges.filter((b) => b.earned);
  const shown = filter === "earned" ? earned : filter === "locked" ? badges.filter((b) => !b.earned) : badges;
  const maxDay = Math.max(goals.daily_questions, ...p.last7.map((d) => d.questions));
  const todayPct = Math.min(100, (p.today.questions / p.today.goal) * 100);
  const weekPct = p.week.goal ? Math.min(100, (p.week.tests / p.week.goal) * 100) : 100;

  return (
    <div className="page gl">
      <div className="gl-banner">
        <div>
          <span className="db-eyebrow">Goals & badges</span>
          <h1>{p.today.met ? "Today's goal: done ✅" : `${p.today.goal - p.today.questions} questions to go today`}</h1>
          <p>Small daily targets add up. Hit them to grow your goal streak and unlock badges.</p>
        </div>
        <div className="gl-banner-stats">
          <div><strong><CountUp value={earned.length} /></strong><small>of {badges.length} badges</small></div>
          <div><strong>🔥 <CountUp value={p.goal_streak} /></strong><small>day goal streak</small></div>
        </div>
      </div>

      <div className="gl-rings">
        <div className={`gl-ring-card ${p.today.met ? "met" : ""}`} style={{ "--i": 0 }}>
          <Ring pct={todayPct} size={104} stroke={10} color={p.today.met ? "#1f9d63" : "#2563eb"}>
            <strong>{p.today.questions}</strong><small>/ {p.today.goal}</small>
          </Ring>
          <div><b>Questions today</b><small>{p.today.met ? "Goal met. Anything extra is a bonus." : "Practice sets are the quickest way to get there."}</small>
            {!p.today.met && <Link to="/studio/journey" className="db-more">Practise a topic →</Link>}</div>
        </div>
        <div className={`gl-ring-card ${p.week.met ? "met" : ""}`} style={{ "--i": 1 }}>
          <Ring pct={weekPct} size={104} stroke={10} color={p.week.met ? "#1f9d63" : "#7c4dcc"}>
            <strong>{p.week.tests}</strong><small>/ {p.week.goal}</small>
          </Ring>
          <div><b>Tests this week</b><small>{p.week.met ? "Weekly goal met." : "The week resets on Monday."}</small>
            {!p.week.met && <Link to="/studio/tests" className="db-more">Find a test →</Link>}</div>
        </div>
        <div className="gl-ring-card stack" style={{ "--i": 2 }}>
          <div className="gl-week" aria-label="Questions per day, last 7 days">
            <div className="gl-bars">
              <div className="gl-goal-line" style={{ bottom: `${(goals.daily_questions / maxDay) * 100}%` }} title={`Goal: ${goals.daily_questions}`} />
              {p.last7.map((d, i) => (
                <div key={d.day} className={`gl-day ${d.met ? "met" : ""}`} title={`${d.questions} questions`}>
                  <span style={{ height: `${Math.max(4, (d.questions / maxDay) * 100)}%`, "--i": i }} />
                </div>
              ))}
            </div>
            <div className="gl-labels">{p.last7.map((d, i) => <small key={d.day}>{i === 6 ? "Today" : dayName(d.day)}</small>)}</div>
          </div>
          <div><b>Last 7 days</b><small>Green days hit your goal of {goals.daily_questions}.</small></div>
        </div>
      </div>

      <GoalEditor goals={goals} targets={targets} onSaved={saved} />

      <div>
        <div className="jr-section-title">
          <h3>Badges</h3>
          <span className="muted">{earned.length} of {badges.length} unlocked</span>
        </div>
        <div className="ts-filters" style={{ margin: "10px 0" }}>
          {[["all", "All"], ["earned", "Unlocked"], ["locked", "Still to get"]].map(([k, l]) => (
            <button key={k} className={`ts-filter ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div key={filter} className="gl-badges">
          {shown.map((b, i) => (
            <div key={b.id} className={`gl-badge ${b.earned ? "earned" : "locked"} tier-${b.tier}`} style={{ "--i": i }}>
              <span className="gl-medal">{b.icon}</span>
              <b>{b.name}</b>
              <small>{b.text}</small>
              {b.earned ? (
                <span className="gl-when">{TIER[b.tier]} · {fmtDate(b.earned_at)}</span>
              ) : (
                <div className="gl-progress">
                  <div><span style={{ width: `${(b.value / b.target) * 100}%` }} /></div>
                  <small>{b.value}{b.unit || ""} / {b.target}{b.unit || ""}</small>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <NewBadges badges={celebrate} onClose={closeCelebrate} />
    </div>
  );
}
