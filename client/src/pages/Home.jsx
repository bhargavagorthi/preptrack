import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Logo from "../components/Logo";

const STEPS = [
  { icon: "🎯", title: "Pick your exam", text: "Follow the JEE Main or JEE Advanced syllabus, and switch any time." },
  { icon: "🧭", title: "Walk the syllabus", text: "Every chapter, topic and subtopic, with your mastery shown at each step." },
  { icon: "📝", title: "Practise topic by topic", text: "One click builds a practice set, with questions you haven't seen first." },
  { icon: "🏆", title: "Compete every week", text: "Timed contests with live rankings and percentiles against other aspirants." },
  { icon: "📈", title: "Analyse and improve", text: "See accuracy, speed and weak topics, then practise exactly those." },
];

const FEATURES = [
  { icon: "📊", title: "Smart test analytics", text: "Time per question, accuracy by topic and difficulty, and marks lost to negative marking." },
  { icon: "🥇", title: "Live leaderboards", text: "Contest ranks with NTA-style percentiles, plus weekly and all-time points tables." },
  { icon: "🗺️", title: "Syllabus journey", text: "Clusters, chapters and topics, each marked Not started, Practising, Needs work or Mastered." },
  { icon: "📚", title: "Free test series", text: "Structured series of mocks and contests. Enrol in one click and track your progress." },
  { icon: "🔥", title: "Points, levels and streaks", text: "Earn points for new correct answers, keep a daily streak and level up." },
  { icon: "∑", title: "Real JEE formats", text: "Single-correct, multiple-correct and numerical questions, with formulas and diagrams." },
];

const ROLES = [
  { icon: "✍️", title: "Content creators", text: "Build the syllabus, write or bulk-import questions from Excel, and assemble tests and contests." },
  { icon: "🗓️", title: "Organisers", text: "Bundle published tests into free test series and follow how enrolled students perform." },
  { icon: "👩‍🏫", title: "Teachers", text: "Guide students through the syllabus with the same analytics they see." },
];

function HeroPreview() {
  // An illustration of the student dashboard, built from the app's own styles
  return (
    <div className="home-preview" aria-hidden="true">
      <div className="hp-top">
        <span className="hp-badge">LEVEL 4</span>
        <div>
          <b>Achiever</b>
          <div className="hp-bar"><span style={{ width: "68%" }} /></div>
        </div>
        <span className="hp-streak">🔥 6-day streak</span>
      </div>
      <div className="hp-grid">
        <div className="hp-card">
          <span>Accuracy</span>
          <strong>78%</strong>
          <svg viewBox="0 0 120 40" className="hp-spark">
            <polyline points="0,32 20,28 40,30 60,20 80,22 100,12 120,8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="hp-card">
          <span>Contest rank</span>
          <strong>#18</strong>
          <em>Percentile 97.4</em>
        </div>
      </div>
      <div className="hp-chapter">
        <div className="hp-chapter-head"><b>Kinematics</b><span>5 / 7 mastered</span></div>
        <div className="hp-chips">
          <span className="hp-chip ok">🏆 Projectile Motion</span>
          <span className="hp-chip ok">🏆 Relative Motion</span>
          <span className="hp-chip warn">⚠️ Circular Motion</span>
        </div>
      </div>
      <div className="hp-live"><span className="dot" /> Weekly Contest is live · closes in 1h 20m</div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  if (user) return <Navigate to="/studio" replace />;

  return (
    <div className="home">
      <nav className="home-nav">
        <div className="home-wrap home-nav-inner">
          <Logo />
          <div className="home-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#educators">For educators</a>
          </div>
          <div className="home-nav-actions">
            <Link to="/login" className="btn ghost">Log in</Link>
            <Link to="/signup" className="btn primary">Sign up</Link>
          </div>
        </div>
      </nav>

      <header className="home-hero">
        <div className="home-wrap home-hero-grid">
          <div className="home-hero-text rise">
            <span className="home-eyebrow">JEE Main &amp; Advanced preparation</span>
            <h1>Your journey to IIT starts here</h1>
            <p>
              Track your prep, take tests and climb the leaderboard. A guided path through the full syllabus, with analytics
              on every test you take, so you always know what to practise next.
            </p>
            <div className="home-ctas">
              <Link to="/signup" className="btn primary lg">Start for free</Link>
              <Link to="/login" className="btn ghost lg">I have an account</Link>
            </div>
            <ul className="home-facts">
              <li><b>2</b> syllabi: Main and Advanced</li>
              <li><b>3</b> JEE question formats</li>
              <li><b>Weekly</b> live contests</li>
            </ul>
          </div>
          <div className="rise delay-2"><HeroPreview /></div>
        </div>
      </header>

      <section id="how" className="home-section tinted">
        <div className="home-wrap">
          <h2>Your roadmap to IIT success</h2>
          <p className="home-lead">Five steps, repeated every week until exam day.</p>
          <ol className="home-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="home-card rise" style={{ animationDelay: `${0.08 * i}s` }}>
                <div className="home-card-head">
                  <span className="home-icon">{s.icon}</span>
                  <span className="home-step-no">Step {i + 1}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="home-section">
        <div className="home-wrap">
          <h2>Everything you need to prepare</h2>
          <p className="home-lead">Built around how JEE is actually scored.</p>
          <div className="home-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="home-card">
                <div className="home-card-head"><span className="home-icon">{f.icon}</span><h3>{f.title}</h3></div>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="educators" className="home-section tinted">
        <div className="home-wrap">
          <h2>For educators too</h2>
          <p className="home-lead">Creator, teacher and organiser accounts are reviewed before they're activated.</p>
          <div className="home-roles">
            {ROLES.map((r) => (
              <div key={r.title} className="home-card">
                <div className="home-card-head"><span className="home-icon">{r.icon}</span><h3>{r.title}</h3></div>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta">
        <div className="home-wrap home-cta-inner">
          <div>
            <h3>Ready to start your IIT journey?</h3>
            <p>Join PrepTrack and practise with a plan, not guesswork.</p>
          </div>
          <div className="home-cta-actions">
            <Link to="/signup" className="btn white lg">Get started</Link>
            <Link to="/login" className="btn outline-white lg">Log in</Link>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <div className="home-wrap home-footer-inner">
          <div>
            <Logo size={32} />
            <p className="muted">IIT-JEE preparation, simplified.</p>
          </div>
          <div className="home-footer-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <Link to="/signup">Sign up</Link>
            <Link to="/login">Log in</Link>
          </div>
        </div>
        <div className="home-wrap home-footer-base">
          <span>© {new Date().getFullYear()} PrepTrack</span>
          <span>Made with ♥ for IIT aspirants</span>
        </div>
      </footer>
    </div>
  );
}
