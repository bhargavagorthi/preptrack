import { useState } from "react";
import api from "../../api";
import NodePicker from "../syllabus/NodePicker";
import MathText from "./MathText";
import ImageUpload from "./ImageUpload";
import { TYPE_LABEL, DEFAULT_MARKS, SYLLABUS_EXAMS, SYLLABUS_LABEL } from "../constants";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const blankOptions = () => LETTERS.slice(0, 4).map((id) => ({ id, text: "", image: "" }));

export default function QuestionEditor({ question, onCancel, onSaved }) {
  const isEdit = Boolean(question.id);
  const isNum = question.type === "numerical";

  const [form, setForm] = useState(() => ({
    tags: {
      jee_main: question.tags?.jee_main?.node_id || null,
      jee_advanced: question.tags?.jee_advanced?.node_id || null,
    },
    type: question.type || "single",
    text: question.text || "",
    image_url: question.image_url || "",
    options: question.options ? question.options.map((o) => ({ image: "", ...o })) : blankOptions(),
    correct: Array.isArray(question.answer) ? question.answer : [],
    numValue: isNum ? String(question.answer.value) : "",
    numTol: isNum ? String(question.answer.tolerance) : "0",
    difficulty: question.difficulty || "medium",
    marks_correct: String(question.marks_correct ?? DEFAULT_MARKS.single[0]),
    marks_wrong: String(question.marks_wrong ?? DEFAULT_MARKS.single[1]),
    solution: question.solution || "",
  }));
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(!!question.locked); // question is in a published test: only tags can change
  const [busy, setBusy] = useState(false);
  const setTag = (exam, nodeId) => setForm((f) => ({ ...f, tags: { ...f.tags, [exam]: nodeId } }));

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  function changeType(type) {
    const [mc, mw] = DEFAULT_MARKS[type];
    set({ type, correct: [], marks_correct: String(mc), marks_wrong: String(mw) });
  }

  function toggleCorrect(id) {
    if (form.type === "single") return set({ correct: [id] });
    set({ correct: form.correct.includes(id) ? form.correct.filter((c) => c !== id) : [...form.correct, id] });
  }

  const setOption = (i, patch) => set({ options: form.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  function addOption() {
    if (form.options.length < 6)
      set({ options: [...form.options, { id: LETTERS[form.options.length], text: "", image: "" }] });
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
      tags: form.tags,
      type: form.type,
      text: form.text,
      image_url: form.image_url || null,
      difficulty: form.difficulty,
      marks_correct: Number(form.marks_correct),
      marks_wrong: Number(form.marks_wrong),
      solution: form.solution,
      ...(form.type === "numerical"
        ? { answer: { value: form.numValue, tolerance: form.numTol } }
        : {
            options: form.options.map((o) => ({ id: o.id, text: o.text, ...(o.image ? { image: o.image } : {}) })),
            answer: form.correct,
          }),
    };
    try {
      if (isEdit) await api.patch(`/questions/${question.id}`, payload);
      else await api.post("/questions", payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't save the question");
      if (err.response?.status === 409 && isEdit) setLocked(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveTagsOnly() {
    setError("");
    setBusy(true);
    try {
      await api.put(`/questions/${question.id}/tags`, { tags: form.tags });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't save the tags");
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
      {locked && (
        <p className="note locked-note">
          🔒 This question is in a published test, so its wording and answers are frozen. You can still change where it sits in the syllabus.
          <button type="button" className="small" onClick={saveTagsOnly} disabled={busy}>Save syllabus tags only</button>
        </p>
      )}

      <div className="editor-cols">
        <div className="card form-grid">
          <div className="field full">
            <span className="label">Syllabus: tag at chapter level or deeper, in one or both</span>
            {SYLLABUS_EXAMS.map((exam) => (
              <div className="tag-picker" key={exam}>
                <span className={`exam-chip exam-${exam}`}>{SYLLABUS_LABEL[exam]}</span>
                <NodePicker exam={exam} value={form.tags[exam]} onChange={(id) => setTag(exam, id)}
                  anyLabel="Not in this syllabus" requireTaggable />
              </div>
            ))}
          </div>

          <div className="field full">
            <span className="label">Question type</span>
            <div className="seg">
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <button type="button" key={v} className={form.type === v ? "seg-btn active" : "seg-btn"}
                  onClick={() => changeType(v)}>{l}</button>
              ))}
            </div>
          </div>

          <label className="field full">
            <span className="label">Question</span>
            <textarea rows={4} value={form.text} onChange={(e) => set({ text: e.target.value })}
              placeholder="Type the question… use $...$ for math, e.g. $v^2 = u^2 + 2as$" />
            <span className="hint">Math: <code>$x^2$</code> inline · <code>$$\frac{'{a}'}{'{b}'}$$</code> on its own line · <code>\$</code> for a dollar sign</span>
          </label>

          <div className="field full">
            <span className="label">Figure (optional)</span>
            <ImageUpload value={form.image_url} onChange={(url) => set({ image_url: url })} label="Add figure" />
          </div>

          {form.type === "numerical" ? (
            <>
              <label className="field">
                <span className="label">Correct answer</span>
                <input type="number" step="any" value={form.numValue} onChange={(e) => set({ numValue: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">Tolerance (±)</span>
                <input type="number" step="any" min="0" value={form.numTol} onChange={(e) => set({ numTol: e.target.value })} />
              </label>
            </>
          ) : (
            <div className="field full">
              <span className="label">
                Options: {form.type === "single" ? "select the one correct answer" : "select every correct answer"}
              </span>
              {form.options.map((o, i) => (
                <div className="option-block" key={o.id}>
                  <div className="option-row">
                    <input type={form.type === "single" ? "radio" : "checkbox"} name="correct"
                      checked={form.correct.includes(o.id)} onChange={() => toggleCorrect(o.id)} />
                    <b>{o.id}</b>
                    <input value={o.text} onChange={(e) => setOption(i, { text: e.target.value })}
                      placeholder={`Option ${o.id} (text, math, or leave empty if using an image)`} />
                  </div>
                  <div className="option-image">
                    <ImageUpload value={o.image} onChange={(url) => setOption(i, { image: url })} label="Image" />
                  </div>
                </div>
              ))}
              <div className="option-tools">
                <button type="button" className="ghost" onClick={addOption} disabled={form.options.length >= 6}>+ Option</button>
                <button type="button" className="ghost" onClick={removeOption} disabled={form.options.length <= 2}>− Option</button>
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
              <input type="number" step="any" value={form.marks_correct} onChange={(e) => set({ marks_correct: e.target.value })} />
              <input type="number" step="any" value={form.marks_wrong} onChange={(e) => set({ marks_wrong: e.target.value })} />
            </div>
          </div>

          <label className="field full">
            <span className="label">Solution (optional)</span>
            <textarea rows={3} value={form.solution} onChange={(e) => set({ solution: e.target.value })}
              placeholder="Explain how to solve it. Math works here too. Students see this after the test." />
          </label>
        </div>

        <div className="card preview-card">
          <span className="label">Preview: what students see</span>
          <MathText as="p" className="exam-text" text={form.text || "Your question appears here…"} />
          {form.image_url && <img className="q-image" src={form.image_url} alt="Question figure" />}
          {form.type === "numerical" ? (
            <p className="muted">Students type a number{form.numValue !== "" && <> · answer {form.numValue}{Number(form.numTol) ? ` ± ${form.numTol}` : ""}</>}.</p>
          ) : (
            <div className="exam-options">
              {form.options.map((o) => (
                <div key={o.id} className={`exam-option ${form.correct.includes(o.id) ? "picked" : ""}`}>
                  <span className={`opt-mark ${form.type === "single" ? "round" : ""}`}>{o.id}</span>
                  <span className="opt-content">
                    <MathText text={o.text} />
                    {o.image && <img className="opt-image" src={o.image} alt={`Option ${o.id}`} />}
                  </span>
                </div>
              ))}
            </div>
          )}
          {form.solution && (
            <details className="solution" open>
              <summary>Solution</summary>
              <MathText as="p" text={form.solution} />
            </details>
          )}
        </div>
      </div>
    </form>
  );
}
