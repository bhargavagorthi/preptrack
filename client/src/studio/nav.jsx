import Dashboard from "./pages/Dashboard";
import Journey from "./pages/Journey";
import ComingSoon from "./pages/ComingSoon";
import Approvals from "./pages/Approvals";
import Syllabus from "./pages/Syllabus";
import QuestionBank from "./pages/QuestionBank";
import Tests from "./pages/Tests";
import StudentTests from "./pages/StudentTests";
import Analytics from "./pages/Analytics";

const soon = (title, text) => <ComingSoon title={title} text={text} />;
const home = { path: "", label: "Dashboard", icon: "🏠", element: <Dashboard /> };

export const NAV = {
  student: [
    home,
    { path: "journey", label: "Syllabus Journey", icon: "🧭", element: <Journey /> },
    { path: "tests", label: "Tests", icon: "📝", element: <StudentTests /> },
    { path: "analytics", label: "Analytics", icon: "📈", element: <Analytics /> },
    { path: "leaderboard", label: "Leaderboard", icon: "🏆", element: soon("Leaderboard", "Weekly contest rankings.") },
  ],
  creator: [
    home,
    { path: "syllabus", label: "Syllabus", icon: "📚", element: <Syllabus /> },
    { path: "questions", label: "Question Bank", icon: "❓", element: <QuestionBank /> },
    { path: "tests", label: "Tests", icon: "🧩", element: <Tests /> },
    { path: "notes", label: "Notes", icon: "🗒️", element: soon("Notes", "Study notes for each topic.") },
  ],
  teacher: [
    home,
    { path: "students", label: "My Students", icon: "👥", element: soon("My Students", "Track your students' progress.") },
    { path: "assignments", label: "Assignments", icon: "📝", element: soon("Assignments", "Assign tests to your students.") },
    { path: "reports", label: "Reports", icon: "📊", element: soon("Reports", "Class performance reports.") },
  ],
  organiser: [
    home,
    { path: "series", label: "Test Series", icon: "🗓️", element: soon("Test Series", "Create and schedule test series.") },
    { path: "participants", label: "Participants", icon: "👥", element: soon("Participants", "Manage who takes your tests.") },
    { path: "results", label: "Results", icon: "🏅", element: soon("Results", "Scores and rankings for your series.") },
  ],
  admin: [
    home,
    { path: "syllabus", label: "Syllabus", icon: "📚", element: <Syllabus /> },
    { path: "questions", label: "Question Bank", icon: "❓", element: <QuestionBank /> },
    { path: "tests", label: "Tests", icon: "🧩", element: <Tests /> },
    { path: "approvals", label: "Approvals", icon: "✅", element: <Approvals /> },
    { path: "users", label: "Users", icon: "👤", element: soon("Users", "Manage all accounts.") },
  ],
};
