import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../auth/AuthContext";

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
    next: ["Create your first test series", "Invite participants"],
  },
  admin: {
    stats: [["Pending approvals", "—"], ["Users", "—"], ["Tests", "—"], ["Organisations", "1"]],
    next: ["Review pending accounts in Approvals"],
  },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [live, setLive] = useState(null);

  useEffect(() => {
    if (user.role !== "student") return;
    api.get("/student/analytics").then((r) => setLive(r.data)).catch(() => {});
  }, [user.role]);

  let stats, next;
  if (user.role === "student") {
    const o = live?.overview;
    stats = [
      ["Tests taken", o ? o.tests_taken : "…"],
      ["Avg. score", o?.avg_score_pct != null ? `${o.avg_score_pct}%` : "—"],
      ["Accuracy", o?.accuracy != null ? `${o.accuracy}%` : "—"],
      ["Level", "—"],
    ];
    const weak = live?.insights.weak[0];
    next = [
      o?.tests_taken ? "Take another test to track your progress" : "Take your first practice test",
      weak ? `Practise ${weak.name} (${weak.accuracy}% accuracy)` : "Check your Analytics after each test",
      "Join this week's contest (coming soon)",
    ];
  } else {
    ({ stats, next } = CONTENT[user.role]);
  }

  return (
    <div className="page">
      <h1>Welcome, {user.name.split(" ")[0]}</h1>
      <p className="muted">Here's your {user.role} overview.</p>
      <div className="stat-grid">
        {stats.map(([label, value]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Next steps</h3>
        <ul>{next.map((n) => <li key={n}>{n}</li>)}</ul>
        {user.role === "student" && live?.overview.tests_taken > 0 && (
          <Link to="/studio/analytics">See full analytics →</Link>
        )}
      </div>
    </div>
  );
}
