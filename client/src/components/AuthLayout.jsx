export default function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div className="brand">PrepTrack</div>
        <h1>Your IIT-JEE journey, mapped and measured.</h1>
        <ul className="hero-points">
          <li><span>📈</span> Analytics on every test you take</li>
          <li><span>🧭</span> A guided path through the full syllabus</li>
          <li><span>🏆</span> Weekly contests and live leaderboards</li>
          <li><span>🎯</span> Levels and points that track your growth</li>
        </ul>
        <p className="hero-foot">Built for students, creators, teachers and institutions.</p>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  );
}
