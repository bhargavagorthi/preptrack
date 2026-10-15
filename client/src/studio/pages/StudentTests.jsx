import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import api from "../../api";
import { EXAM_LABEL } from "../constants";
import AttemptPage from "../exam/AttemptPage";

function TestList() {
  const navigate = useNavigate();
  const [tests, setTests] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/student/tests")
      .then((r) => setTests(r.data.tests))
      .catch(() => setError("Couldn't load tests"));
  }, []);

  async function start(t) {
    const ok = confirm(
      `Start "${t.title}"?\n\nYou'll have ${t.duration_minutes} minutes. ` +
      `The timer keeps running even if you close this page.`
    );
    if (!ok) return;
    try {
      const { data } = await api.post(`/student/tests/${t.id}/start`);
      navigate(`/studio/tests/attempt/${data.attempt_id}`);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't start the test");
    }
  }

  const minutesLeft = (deadline) => Math.max(0, Math.ceil((new Date(deadline) - Date.now()) / 60000));

  return (
    <div className="page">
      <div>
        <h1>Tests</h1>
        <p className="muted">Practice tests and mock exams available to you.</p>
      </div>
      {error && <p className="error">{error}</p>}
      {!tests ? (
        <p className="muted">Loading…</p>
      ) : tests.length === 0 ? (
        <div className="card empty"><p>No tests are available yet. Check back soon.</p></div>
      ) : (
        <div className="test-grid">
          {tests.map((t) => (
            <div className="card test-card" key={t.id}>
              <div className="q-tags">
                <span className="tag">{EXAM_LABEL[t.exam]}</span>
                {t.attempt_status === "submitted" && <span className="tag diff-easy">Completed</span>}
                {t.attempt_status === "in_progress" && <span className="tag diff-medium">In progress</span>}
              </div>
              <h3>{t.title}</h3>
              <div className="test-facts">
                <span>📝 {t.question_count} questions</span>
                <span>🎯 {t.total_marks} marks</span>
                <span>⏱ {t.duration_minutes} min</span>
              </div>
              {t.attempt_status === "submitted" ? (
                <div className="test-card-foot">
                  <span className="score-chip">{t.score} / {t.max_score}</span>
                  <button className="ghost" onClick={() => navigate(`/studio/tests/attempt/${t.attempt_id}`)}>
                    View result
                  </button>
                </div>
              ) : t.attempt_status === "in_progress" ? (
                <div className="test-card-foot">
                  <span className="muted">{minutesLeft(t.deadline)} min left</span>
                  <button onClick={() => navigate(`/studio/tests/attempt/${t.attempt_id}`)}>Resume</button>
                </div>
              ) : (
                <div className="test-card-foot">
                  <span />
                  <button onClick={() => start(t)}>Start test</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StudentTests() {
  return (
    <Routes>
      <Route index element={<TestList />} />
      <Route path="attempt/:id" element={<AttemptPage />} />
    </Routes>
  );
}
