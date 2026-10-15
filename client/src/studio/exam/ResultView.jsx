import { useState } from "react";
import { Link } from "react-router-dom";
import { TYPE_LABEL } from "../constants";

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const outcome = (q) => (q.is_correct === true ? "correct" : q.is_correct === false ? "wrong" : "skipped");

export default function ResultView({ data }) {
  const { attempt, questions } = data;
  const [filter, setFilter] = useState("all");

  const attempted = attempt.correct_count + attempt.wrong_count;
  const accuracy = attempted ? Math.round((attempt.correct_count / attempted) * 100) : 0;
  const timeUsed = (new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 1000;

  const subjects = Object.values(questions.reduce((acc, q) => {
    const s = acc[q.subject] || { name: q.subject, score: 0, max: 0, correct: 0, wrong: 0, skipped: 0, time: 0 };
    s.score += q.marks_awarded || 0;
    s.max += q.marks_correct;
    s[outcome(q)] += 1;
    s.time += q.time_spent_seconds;
    acc[q.subject] = s;
    return acc;
  }, {}));

  const shown = filter === "all" ? questions : questions.filter((q) => outcome(q) === filter);

  return (
    <div className="page">
      <div>
        <Link to="/studio/tests" className="link-btn">← All tests</Link>
        <h1>{attempt.title}: Result</h1>
        {attempt.auto_submitted && <p className="note">Time ran out, so this test was submitted automatically.</p>}
      </div>

      <div className="stat-grid">
        <div className="stat-card score-card">
          <span>Score</span>
          <strong>{attempt.score} <small>/ {attempt.max_score}</small></strong>
        </div>
        <div className="stat-card"><span>Correct</span><strong className="good">{attempt.correct_count}</strong></div>
        <div className="stat-card"><span>Wrong</span><strong className="bad">{attempt.wrong_count}</strong></div>
        <div className="stat-card"><span>Skipped</span><strong>{attempt.unattempted_count}</strong></div>
        <div className="stat-card"><span>Accuracy</span><strong>{accuracy}%</strong></div>
        <div className="stat-card"><span>Time used</span><strong>{formatDuration(timeUsed)}</strong></div>
      </div>

      <div className="card">
        <h3>By subject</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Subject</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Time spent</th></tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.name}>
                  <td><b>{s.name}</b></td>
                  <td>{Math.round(s.score * 100) / 100} / {s.max}</td>
                  <td className="good">{s.correct}</td>
                  <td className="bad">{s.wrong}</td>
                  <td>{s.skipped}</td>
                  <td>{formatDuration(s.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-head">
        <h3 style={{ margin: 0 }}>Review answers</h3>
        <div className="seg">
          {[["all", "All"], ["correct", "Correct"], ["wrong", "Wrong"], ["skipped", "Skipped"]].map(([v, l]) => (
            <button key={v} className={filter === v ? "seg-btn active" : "seg-btn"} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="q-list">
        {shown.map((q) => {
          const o = outcome(q);
          const mine = Array.isArray(q.response) ? q.response : [];
          return (
            <div className={`card q-card review-${o}`} key={q.id}>
              <div className="exam-q-head">
                <b>Q{q.position}. {o === "correct" ? "✅ Correct" : o === "wrong" ? "❌ Wrong" : "➖ Skipped"}</b>
                <div className="q-tags">
                  <span className="tag">{q.subject} › {q.topic}</span>
                  <span className="tag">{TYPE_LABEL[q.type]}</span>
                  <span className="tag">{q.marks_awarded > 0 ? "+" : ""}{q.marks_awarded ?? 0} marks</span>
                  <span className="tag">⏱ {formatDuration(q.time_spent_seconds)}</span>
                </div>
              </div>
              <p className="q-text">{q.text}</p>

              {q.type === "numerical" ? (
                <div className="num-review">
                  <span>Your answer: <b>{q.response?.value ?? "—"}</b></span>
                  <span>Correct answer: <b>{q.answer.value}</b>{q.answer.tolerance ? ` (± ${q.answer.tolerance})` : ""}</span>
                </div>
              ) : (
                <ol className="q-options">
                  {q.options.map((opt) => {
                    const isKey = q.answer.includes(opt.id);
                    const isMine = mine.includes(opt.id);
                    return (
                      <li key={opt.id} className={`${isKey ? "correct" : ""} ${isMine && !isKey ? "picked-wrong" : ""}`}>
                        <b>{opt.id}.</b> {opt.text}
                        {isMine && <span className="your-pick">Your answer</span>}
                      </li>
                    );
                  })}
                </ol>
              )}

              {q.solution && (
                <details className="solution">
                  <summary>Solution</summary>
                  <p>{q.solution}</p>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
