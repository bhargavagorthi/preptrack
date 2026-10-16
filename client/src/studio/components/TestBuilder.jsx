import { useCallback, useEffect, useState } from "react";
import api from "../../api";
import SyllabusPicker from "./SyllabusPicker";
import { TYPE_LABEL, EXAM_LABEL } from "../constants";

const EMPTY_FILTERS = { subject_id: "", chapter_id: "", topic_id: "", type: "", difficulty: "", search: "" };

// <input type="datetime-local"> works in local time; the server stores UTC
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
const toPayload = (m) => ({
  ...m,
  duration_minutes: Number(m.duration_minutes),
  starts_at: m.is_contest && m.starts_at ? new Date(m.starts_at).toISOString() : null,
  ends_at: m.is_contest && m.ends_at ? new Date(m.ends_at).toISOString() : null,
});

export default function TestBuilder({ testId, onBack }) {
  const [test, setTest] = useState(null);
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [tree, setTree] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTest = useCallback(async () => {
    const { data } = await api.get(`/tests/${testId}`);
    setTest(data.test);
    setMeta({
      title: data.test.title,
      exam: data.test.exam,
      duration_minutes: String(data.test.duration_minutes),
      instructions: data.test.instructions || "",
      is_contest: Boolean(data.test.is_contest),
      starts_at: toLocalInput(data.test.starts_at),
      ends_at: toLocalInput(data.test.ends_at),
    });
    setSelected(data.questions);
    setDirty(false);
  }, [testId]);

  useEffect(() => {
    loadTest().catch(() => setError("Couldn't load the test"));
  }, [loadTest]);

  useEffect(() => {
    api.get("/syllabus").then((r) => setTree(r.data.subjects)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""));
    api.get("/questions", { params })
      .then((r) => setResults(r.data.questions))
      .catch(() => setError("Couldn't load questions"));
  }, [filters]);

  if (!test || !meta) {
    return <div className="page"><p className="muted">{error || "Loading…"}</p></div>;
  }

  const locked = test.status === "published";
  const selectedIds = new Set(selected.map((q) => q.id));
  const totalMarks = selected.reduce((sum, q) => sum + Number(q.marks_correct), 0);
  const bySubject = selected.reduce((acc, q) => ({ ...acc, [q.subject]: (acc[q.subject] || 0) + 1 }), {});

  const changeList = (list) => { setSelected(list); setDirty(true); setNotice(""); };
  const changeMeta = (patch) => { setMeta((m) => ({ ...m, ...patch })); setDirty(true); setNotice(""); };

  const add = (q) => changeList([...selected, q]);
  const remove = (id) => changeList(selected.filter((q) => q.id !== id));
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const list = [...selected];
    [list[i], list[j]] = [list[j], list[i]];
    changeList(list);
  }
  function sortBySubject() {
    const order = Object.fromEntries(tree.map((s, i) => [s.name, i]));
    changeList([...selected].sort((a, b) => (order[a.subject] ?? 99) - (order[b.subject] ?? 99)));
  }

  async function act(fn, successText) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      await loadTest();
      if (successText) setNotice(successText);
    } catch (e) {
      setError(e.response?.data?.error || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    await api.patch(`/tests/${test.id}`, toPayload(meta));
    await api.put(`/tests/${test.id}/questions`, { question_ids: selected.map((q) => q.id) });
  }

  const save = () => act(saveAll, "Saved");
  const publish = () => act(async () => {
    if (dirty) await saveAll();
    await api.post(`/tests/${test.id}/publish`);
  }, "Published. Students will be able to take this test once Session 9 is built.");
  const unpublish = () => act(() => api.post(`/tests/${test.id}/unpublish`), "Moved back to draft");

  async function removeTest() {
    if (!confirm(`Delete "${test.title}"? This can't be undone.`)) return;
    try {
      await api.delete(`/tests/${test.id}`);
      onBack();
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't delete");
    }
  }

  return (
    <div className="page builder">
      <div className="page-head">
        <div>
          <button className="link-btn" onClick={() => {
            if (!dirty || confirm("You have unsaved changes. Leave anyway?")) onBack();
          }}>← All tests</button>
          <h1>
            {test.title} <span className={`status status-${test.status}`}>{test.status}</span>
          </h1>
        </div>
        <div className="head-actions">
          {locked ? (
            <button className="ghost" onClick={unpublish} disabled={busy}>Unpublish</button>
          ) : (
            <>
              <button className="ghost" onClick={removeTest} disabled={busy}>Delete</button>
              <button className="ghost" onClick={save} disabled={busy || !dirty}>
                {dirty ? "Save changes" : "Saved"}
              </button>
              <button onClick={publish} disabled={busy || selected.length === 0}>Publish</button>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}
      {locked && <p className="note">This test is published and locked. Unpublish it to make changes.</p>}

      <div className="card form-grid">
        <label className="field">
          <span className="label">Title</span>
          <input value={meta.title} disabled={locked} onChange={(e) => changeMeta({ title: e.target.value })} />
        </label>
        <div className="field">
          <span className="label">Exam and duration (minutes)</span>
          <div className="marks-row">
            <select value={meta.exam} disabled={locked} onChange={(e) => changeMeta({ exam: e.target.value })}>
              {Object.entries(EXAM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input type="number" min="5" max="360" value={meta.duration_minutes} disabled={locked}
              onChange={(e) => changeMeta({ duration_minutes: e.target.value })} />
          </div>
        </div>
        <label className="field full">
          <span className="label">Instructions for students (optional)</span>
          <textarea rows={2} value={meta.instructions} disabled={locked}
            onChange={(e) => changeMeta({ instructions: e.target.value })} />
        </label>
        <div className="field full contest-field">
          <label className="toggle">
            <input type="checkbox" checked={meta.is_contest} disabled={locked}
              onChange={(e) => changeMeta({ is_contest: e.target.checked })} />
            <b>🏆 Run this as a contest</b>
            <span className="muted">Students can only take it inside the window. Results and rankings open when it closes.</span>
          </label>
          {meta.is_contest && (
            <div className="marks-row">
              <label className="field"><span className="label">Opens</span>
                <input type="datetime-local" value={meta.starts_at} disabled={locked}
                  onChange={(e) => changeMeta({ starts_at: e.target.value })} /></label>
              <label className="field"><span className="label">Closes</span>
                <input type="datetime-local" value={meta.ends_at} disabled={locked}
                  onChange={(e) => changeMeta({ ends_at: e.target.value })} /></label>
            </div>
          )}
        </div>
      </div>

      <div className="builder-cols">
        <div className="card">
          <div className="col-head">
            <h3>In this test</h3>
            {!locked && selected.length > 1 && (
              <button className="ghost small" onClick={sortBySubject}>Sort by subject</button>
            )}
          </div>
          <div className="summary-row">
            <span className="pill">{selected.length} questions</span>
            <span className="pill">{totalMarks} marks</span>
            {Object.entries(bySubject).map(([s, n]) => <span key={s} className="pill soft">{s}: {n}</span>)}
          </div>
          {selected.length === 0 ? (
            <p className="muted">Add questions from the bank on the right.</p>
          ) : (
            <ol className="sel-list">
              {selected.map((q, i) => (
                <li key={q.id}>
                  <span className="sel-num">{i + 1}</span>
                  <div className="sel-body">
                    <div className="sel-text">{q.text}</div>
                    <div className="q-tags">
                      <span className="tag">{q.subject} › {q.chapter}</span>
                      <span className="tag">{TYPE_LABEL[q.type]}</span>
                      <span className="tag">+{q.marks_correct} / {q.marks_wrong}</span>
                    </div>
                  </div>
                  {!locked && (
                    <div className="sel-actions">
                      <button className="icon" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                      <button className="icon" title="Move down" onClick={() => move(i, 1)} disabled={i === selected.length - 1}>▼</button>
                      <button className="icon" title="Remove" onClick={() => remove(q.id)}>✕</button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {!locked && (
          <div className="card">
            <div className="col-head"><h3>Add from the question bank</h3></div>
            <div className="filters compact">
              <SyllabusPicker tree={tree} value={filters} allowAny
                onChange={(p) => setFilters((f) => ({ ...f, ...p }))} />
              <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
                <option value="">All types</option>
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={filters.difficulty} onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value }))}>
                <option value="">All difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <input placeholder="Search…" value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            </div>
            <ul className="pick-list">
              {results.length === 0 && <li className="muted">No questions match.</li>}
              {results.map((q) => (
                <li key={q.id}>
                  <div className="sel-body">
                    <div className="sel-text">{q.text}</div>
                    <div className="q-tags">
                      <span className="tag">{q.subject} › {q.topic}</span>
                      <span className="tag">{TYPE_LABEL[q.type]}</span>
                      <span className={`tag diff-${q.difficulty}`}>{q.difficulty}</span>
                    </div>
                  </div>
                  <button className="small" onClick={() => add(q)} disabled={selectedIds.has(q.id)}>
                    {selectedIds.has(q.id) ? "Added" : "+ Add"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
