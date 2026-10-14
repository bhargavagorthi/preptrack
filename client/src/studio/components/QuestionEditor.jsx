import { useState } from "react";
import api from "../../api";
import SyllabusPicker from "./SyllabusPicker";
import { TYPE_LABEL, DEFAULT_MARKS } from "../constants";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const blankOptions = () => LETTERS.slice(0, 4).map((id) => ({ id, text: "" }));

export default function QuestionEditor({ tree, question, onCancel, onSaved }) {
  const isEdit = Boolean(question.id);
  const isNum = question.type === "numerical";

  const [form, setForm] = useState(() => ({
    subject_id: question.subject_id ? String(question.subject_id) : "",
    chapter_id: question.chapter_id ? String(question.chapter_id) : "",
    topic_id: question.topic_id ? String(question.topic_id) : "",
    type: question.type || "single",
    text: question.text || "",
    options: question.options || blankOptions(),
    correct: Array.isArray(question.answer) ? question.answer : [],
    numValue: isNum ? String(question.answer.value) : "",
    numTol: isNum ? String(question.answer.tolerance) : "0",
    difficulty: question.difficulty || "medium",
    marks_correct: String(question.marks_correct ?? DEFAULT_MARKS.single[0]),
    marks_wrong: String(question.marks_wrong ?? DEFAULT_MARKS.single[1]),
    solution: question.solution || "",
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  function changeType(type) {
    const [mc, mw] = DEFAULT_MARKS[type];
    set({ type, correct: [], marks_correct: String(mc), marks_wrong: String(mw) });
  }

  function toggleCorrect(id) {
    if (form.type === "single") return set({ correct: [id] });
    set({
      correct: form.correct.includes(id)
        ? form.correct.filter((c) => c !== id)
        : [...form.correct, id],
    });
  }

  function setOptionText(i, text) {
    set({ options: form.options.map((o, j) => (j === i ? { ...o, text } : o)) });
  }

  function addOption() {
    if (form.options.length < 6)
      set({ options: [...form.options, { id: LETTERS[form.options.length], text: "" }] });
  }

  function removeOption() {
    if (form.options.length <= 2) return;
    const last = form.options[form.options.length - 1].id;
    set({ options: form.options.slice(0, -1), correct: form.correct.filter((c) => c !== last) });
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = {
      topic_id: Number(form.topic_id) || null,
      type: form.type,
      text: form.text,
      difficulty: form.difficulty,
      marks_correct: Number(form.marks_correct),
      marks_wrong: Number(form.marks_wrong),
      solution: form.solution,
      ...(form.type === "numerical"
        ? { answer: { value: form.numValue, tolerance: form.numTol } }
        : { options: form.options, answer: form.correct }),
    };
    try {
      if (isEdit) await api.patch(`/questions/${question.id}`, payload);
      else await api.post("/questions", payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't save the question");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="page" onSubmit={save}>
      <div className="page-head">
        <h1>{isEdit ? "Edit question" : "New question"}</h1>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
          <button disabled={busy}>{busy ? "Saving…" : "Save question"}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card form-grid">
        <div className="field full">
          <span className="label">Topic</span>
          <div className="picker-row">
            <SyllabusPicker tree={tree} value={form} onChange={set} />
          </div>
        </div>

        <div className="field full">
          <span className="label">Question type</span>
          <div className="seg">
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <button
                type="button"
                key={v}
                className={form.type === v ? "seg-btn active" : "seg-btn"}
                onClick={() => changeType(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <label className="field full">
          <span className="label">Question</span>
          <textarea
            rows={4}
            value={form.text}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="Type the question…"
          />
        </label>

        {form.type === "numerical" ? (
          <>
            <label className="field">
              <span className="label">Correct answer</span>
              <input type="number" step="any" value={form.numValue}
                onChange={(e) => set({ numValue: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Tolerance (±)</span>
              <input type="number" step="any" min="0" value={form.numTol}
                onChange={(e) => set({ numTol: e.target.value })} />
            </label>
          </>
        ) : (
          <div className="field full">
            <span className="label">
              Options: {form.type === "single" ? "select the one correct answer" : "select every correct answer"}
            </span>
            {form.options.map((o, i) => (
              <div className="option-row" key={o.id}>
                <input
                  type={form.type === "single" ? "radio" : "checkbox"}
                  name="correct"
                  checked={form.correct.includes(o.id)}
                  onChange={() => toggleCorrect(o.id)}
                />
                <b>{o.id}</b>
                <input
                  value={o.text}
                  onChange={(e) => setOptionText(i, e.target.value)}
                  placeholder={`Option ${o.id}`}
                />
              </div>
            ))}
            <div className="option-tools">
              <button type="button" className="ghost" onClick={addOption} disabled={form.options.length >= 6}>
                + Option
              </button>
              <button type="button" className="ghost" onClick={removeOption} disabled={form.options.length <= 2}>
                − Option
              </button>
            </div>
          </div>
        )}

        <label className="field">
          <span className="label">Difficulty</span>
          <select value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>

        <div className="field">
          <span className="label">Marks (correct / wrong)</span>
          <div className="marks-row">
            <input type="number" step="any" value={form.marks_correct}
              onChange={(e) => set({ marks_correct: e.target.value })} />
            <input type="number" step="any" value={form.marks_wrong}
              onChange={(e) => set({ marks_wrong: e.target.value })} />
          </div>
        </div>

        <label className="field full">
          <span className="label">Solution (optional)</span>
          <textarea
            rows={3}
            value={form.solution}
            onChange={(e) => set({ solution: e.target.value })}
            placeholder="Explain how to solve it. Students see this after the test."
          />
        </label>
      </div>
    </form>
  );
}
