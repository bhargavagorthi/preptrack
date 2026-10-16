import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../auth/AuthContext";
import LevelBar from "../components/LevelBar";

const CONTENT = {
  creator: {
    stats: [["Chapters", "—"], ["Questions", "—"], ["Tests", "—"], ["Notes", "—"]],
    next: ["Set up subjects and chapters", "Add questions or import them from Excel", "Build and publish a test"],
  },
  teacher: {
    stats: [["Students", "0"], ["Assignments", "0"], ["Avg. class score", "—"], ["Reports", "0"]],
    next: ["Invite your students", "Assign your first test"],
  },
  organiser: {
    stats: [["Test series", "0"], ["Participants", "0"], ["Upcoming tests", "0"], ["Results", "0"]],
    next: ["Create a test series from published tests", "Publish it so students can enrol", "Track results in Students & results"],
  },
  admin: {
    stats: [["Pending approvals", "—"], ["Users", "—"], ["Tests", "—"], ["Organisations", "1"]],
    next: ["Review pending accounts in Approvals"],
  },
};

function HowToEarn({ rules }) {
  return (
    <div className="card">
      <h3>How to earn points</h3>
      <ul className="points-list">
        <li><span>Correct answer: easy / medium / hard</span>
          <b>{rules.perCorrect.easy} / {rules.perCorrect.medium} / {rules.perCorrect.hard}</b></li>
        <li><span>Complete a test</span><b>+{rules.completion}</b></li>
        {rules.accuracyBonus.map((r) => (
          <li key={r.min}><span>{r.min}%+ accuracy</span><b>+{r.points}</b></li>
        ))}
        <li><span>Daily streak (first test each day)</span><b>+{rules.streakPerDay} / day</b></li>
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isStudent = user.role === "student";
  const [live, setLive] = useState(null);
  const [prog, setProg] = useState(null);

  useEffect(() => {
    if (!isStudent) return;
    api.get("/student/analytics").then((r) => setLive(r.data)).catch(() => {});
    api.get("/student/progress").then((r) => setProg(r.data)).catch(() => {});
  }, [isStudent]);

  let stats, next;
  if (isStudent) {
    const o = live?.overview;
    stats = [
      ["Tests taken", o ? o.tests_taken : "…"],
      ["Avg. score", o?.avg_score_pct != null ? `${o.avg_score_pct}%` : "—"],
      ["Accuracy", o?.accuracy != null ? `${o.accuracy}%` : "—"],
      ["Points", prog ? prog.points : "…"],
    ];
    const weak = live?.insights.weak[0];
    next = [
      o?.tests_taken ? "Take another test to track your progress" : "Take your first practice test",
      weak ? `Practise ${weak.name} (${weak.accuracy}% accuracy)` : "Check your Analytics after each test",
      "Check Tests for live and upcoming contests",
    ];
  } else {
    ({ stats, next } = CONTENT[user.role]);
  }

  return (
    <div className="page">
      <h1>Welcome, {user.name.split(" ")[0]}</h1>
      <p className="muted">Here's your {user.role} overview.</p>

      {isStudent && prog && (
        <div className="card level-card">
          <div className="level-badge">
            <span>LEVEL</span>
            <strong>{prog.level}</strong>
          </div>
          <div className="level-info">
            <div className="level-title">
              <h3>{prog.name}</h3>
              <span className="points-total">⭐ {prog.points} points</span>
            </div>
            <LevelBar level={prog} />
            <div className="streak-row">
              {prog.streak > 0
                ? <span className="streak">🔥 {prog.streak}-day streak</span>
                : <span className="muted">No active streak</span>}
              {!prog.active_today && (
                <span className="muted">
                  Take a test today to {prog.streak ? "keep it going" : "start one"}.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="stat-grid">
        {stats.map(([label, value]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className={isStudent && prog ? "builder-cols" : ""}>
        <div className="card">
          <h3>Next steps</h3>
          <ul>{next.map((n) => <li key={n}>{n}</li>)}</ul>
          {isStudent && live?.overview.tests_taken > 0 && (
            <Link to="/studio/analytics">See full analytics →</Link>
          )}
        </div>
        {isStudent && prog && (
          prog.recent.length ? (
            <div className="card">
              <h3>Recent points</h3>
              <ul className="points-list">
                {prog.recent.map((e) => (
                  <li key={e.id}>
                    <span>{e.label}{e.title && <span className="muted small"> · {e.title}</span>}</span>
                    <b>+{e.points}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <HowToEarn rules={prog.rules} />
          )
        )}
      </div>
      {isStudent && prog?.recent.length > 0 && <HowToEarn rules={prog.rules} />}
    </div>
  );
}
