import { useAuth } from "../../auth/AuthContext";

const CONTENT = {
  student: {
    stats: [["Tests taken", "0"], ["Avg. score", "—"], ["Level", "1"], ["Points", "0"]],
    next: ["Start your syllabus journey", "Take your first practice test", "Join this week's contest"],
  },
  creator: {
    stats: [["Chapters", "0"], ["Questions", "0"], ["Tests", "0"], ["Notes", "0"]],
    next: ["Set up subjects and chapters", "Add your first questions", "Build a test from a question bank"],
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
  const c = CONTENT[user.role];
  return (
    <div className="page">
      <h1>Welcome, {user.name.split(" ")[0]}</h1>
      <p className="muted">Here's your {user.role} overview.</p>
      <div className="stat-grid">
        {c.stats.map(([label, value]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Next steps</h3>
        <ul>{c.next.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
    </div>
  );
}
