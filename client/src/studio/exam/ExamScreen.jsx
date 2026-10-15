import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import { TYPE_LABEL } from "../constants";

const hasAnswer = (r) =>
  r != null && (Array.isArray(r) ? r.length > 0 : String(r.value ?? "").trim() !== "");

function fromServer(q, row) {
  if (!row || row.response == null) return null;
  return q.type === "numerical" ? { value: String(row.response.value) } : row.response;
}

function formatClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export default function ExamScreen({ data, onSubmitted }) {
  const navigate = useNavigate();
  const { attempt, questions } = data;

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(questions.map((q) => {
      const row = data.answers.find((a) => a.question_id === q.id);
      return [q.id, { response: fromServer(q, row), marked: row?.marked_for_review || false }];
    }))
  );
  const [visited, setVisited] = useState(
    () => new Set([...data.answers.map((a) => a.question_id), questions[0]?.id])
  );
  const [offset] = useState(() => new Date(data.server_now).getTime() - Date.now());
  const deadline = new Date(attempt.deadline).getTime();
  const [remaining, setRemaining] = useState(() => deadline - (Date.now() + offset));
  const [saveError, setSaveError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const clockStart = useRef(Date.now());       // when the student opened the current question
  const queue = useRef(Promise.resolve());     // saves run one after another, in order
  const submittedRef = useRef(false);
  const latest = useRef({});

  const q = questions[current];
  const entry = answers[q.id];

  // Keep a reference to the latest question and answer for timers
  useEffect(() => {
    latest.current = { q: questions[current], entry: answers[questions[current].id] };
  });

  // Send one question's answer plus the time spent on it since the last save
  const flush = useCallback((question, item) => {
    const now = Date.now();
    const delta = Math.round((now - clockStart.current) / 1000);
    clockStart.current = now;
    const response = hasAnswer(item.response) ? item.response : null;
    queue.current = queue.current
      .then(() => api.put(`/student/attempts/${attempt.id}/answers/${question.id}`, {
        response, marked_for_review: item.marked, time_spent_delta: delta,
      }))
      .then(() => setSaveError(""))
      .catch((e) => setSaveError(e.response?.data?.error || "Couldn't save your last answer. Check your connection."));
    return queue.current;
  }, [attempt.id]);

  const submit = useCallback(async (auto) => {
    if (submittedRef.current) return;
    if (!auto) {
      const answered = Object.values(latest.current.entry ? answers : {}).filter((a) => hasAnswer(a.response)).length;
      const ok = confirm(
        `Submit the test?\n\nAnswered: ${answered} of ${questions.length}\n` +
        `You can't change your answers after submitting.`
      );
      if (!ok) return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    await flush(latest.current.q, latest.current.entry);
    try {
      await api.post(`/student/attempts/${attempt.id}/submit`);
    } catch (e) {
      if (!auto) {
        submittedRef.current = false;
        setSubmitting(false);
        setSaveError(e.response?.data?.error || "Couldn't submit. Try again.");
        return;
      }
    }
    onSubmitted();
  }, [answers, attempt.id, flush, onSubmitted, questions.length]);

  // Countdown, using the server's clock
  useEffect(() => {
    const t = setInterval(() => setRemaining(deadline - (Date.now() + offset)), 1000);
    return () => clearInterval(t);
  }, [deadline, offset]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (remaining <= 0) submit(true);
  }, [remaining, submit]);

  // Autosave the current question every 20 seconds
  useEffect(() => {
    const t = setInterval(() => {
      const { q: cq, entry: ce } = latest.current;
      if (cq && !submittedRef.current) flush(cq, ce);
    }, 20000);
    return () => clearInterval(t);
  }, [flush]);

  function moveTo(i) {
    setCurrent(i);
    setVisited((v) => new Set(v).add(questions[i].id));
  }

  function go(i) {
    if (i === current) return;
    flush(q, entry);
    moveTo(i);
  }

  const update = (patch) => setAnswers((a) => ({ ...a, [q.id]: { ...a[q.id], ...patch } }));

  function toggleOption(id) {
    if (q.type === "single") return update({ response: [id] });
    const picked = entry.response || [];
    update({ response: picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id] });
  }

  function saveNext() {
    flush(q, entry);
    if (current < questions.length - 1) moveTo(current + 1);
  }

  function markNext() {
    const item = { ...entry, marked: !entry.marked };
    update({ marked: item.marked });
    flush(q, item);
    if (!entry.marked && current < questions.length - 1) moveTo(current + 1);
  }

  function clearResponse() {
    const item = { ...entry, response: null };
    update({ response: null });
    flush(q, item);
  }

  async function exit() {
    await flush(q, entry);
    navigate("/studio/tests");
  }

  function statusOf(question) {
    const a = answers[question.id];
    const answered = hasAnswer(a.response);
    if (a.marked && answered) return "answered-marked";
    if (a.marked) return "marked";
    if (answered) return "answered";
    if (visited.has(question.id)) return "not-answered";
    return "not-visited";
  }

  const counts = questions.reduce((acc, x) => {
    const s = statusOf(x);
    return { ...acc, [s]: (acc[s] || 0) + 1 };
  }, {});

  const lowTime = remaining < 5 * 60 * 1000;

  return (
    <div className="exam">
      <div className="exam-top">
        <div>
          <div className="muted small-caps">{attempt.exam.replace("_", " ")}</div>
          <h2>{attempt.title}</h2>
        </div>
        <div className={`timer ${lowTime ? "low" : ""}`}>⏱ {formatClock(remaining)}</div>
      </div>

      {saveError && <p className="error">{saveError}</p>}

      <div className="exam-body">
        <div className="card exam-question">
          <div className="exam-q-head">
            <b>Question {current + 1} of {questions.length}</b>
            <div className="q-tags">
              <span className="tag">{q.subject}</span>
              <span className="tag">{TYPE_LABEL[q.type]}</span>
              <span className="tag">+{q.marks_correct} / {q.marks_wrong}</span>
            </div>
          </div>

          <p className="exam-text">{q.text}</p>

          {q.type === "numerical" ? (
            <input
              className="num-input"
              type="number"
              step="any"
              placeholder="Enter your answer"
              value={entry.response?.value ?? ""}
              onChange={(e) => update({ response: { value: e.target.value } })}
            />
          ) : (
            <div className="exam-options">
              {q.options.map((o) => {
                const picked = (entry.response || []).includes(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    className={`exam-option ${picked ? "picked" : ""}`}
                    onClick={() => toggleOption(o.id)}
                  >
                    <span className={`opt-mark ${q.type === "single" ? "round" : ""}`}>{picked ? "✓" : o.id}</span>
                    {o.text}
                  </button>
                );
              })}
              {q.type === "multiple" && <p className="muted">Select every correct option.</p>}
            </div>
          )}

          <div className="exam-actions">
            <button className="ghost" onClick={() => go(current - 1)} disabled={current === 0}>← Previous</button>
            <button className="ghost" onClick={clearResponse} disabled={!hasAnswer(entry.response)}>Clear</button>
            <button className="ghost mark-btn" onClick={markNext}>
              {entry.marked ? "Unmark review" : "Mark for review & next"}
            </button>
            <button onClick={saveNext}>
              {current === questions.length - 1 ? "Save" : "Save & next →"}
            </button>
          </div>
        </div>

        <aside className="card exam-side">
          <h3>Questions</h3>
          <div className="palette">
            {questions.map((x, i) => (
              <button
                key={x.id}
                className={`pal pal-${statusOf(x)} ${i === current ? "pal-current" : ""}`}
                onClick={() => go(i)}
                title={x.subject}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <ul className="legend">
            <li><span className="pal pal-answered" />Answered ({counts.answered || 0})</li>
            <li><span className="pal pal-not-answered" />Not answered ({counts["not-answered"] || 0})</li>
            <li><span className="pal pal-not-visited" />Not visited ({counts["not-visited"] || 0})</li>
            <li><span className="pal pal-marked" />Marked ({counts.marked || 0})</li>
            <li><span className="pal pal-answered-marked" />Answered &amp; marked ({counts["answered-marked"] || 0})</li>
          </ul>
          <p className="muted legend-note">Answered &amp; marked questions are still scored.</p>
          <button className="submit-btn" onClick={() => submit(false)} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit test"}
          </button>
          <button className="link-btn exit-btn" onClick={exit}>
            Save and exit (timer keeps running)
          </button>
        </aside>
      </div>
    </div>
  );
}
