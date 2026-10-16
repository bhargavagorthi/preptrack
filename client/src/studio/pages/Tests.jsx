import { useEffect, useState } from "react";
import api from "../../api";
import TestBuilder from "../components/TestBuilder";
import { EXAM_LABEL, EXAM_DURATION } from "../constants";

function NewTestForm({ onCancel, onCreated }) {
  const [form, setForm] = useState({ title: "", exam: "practice", duration_minutes: "60" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/tests", { ...form, duration_minutes: Number(form.duration_minutes) });
      onCreated(data.id);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't create the test");
      setBusy(false);
    }
  }

  return (
    <form className="page" onSubmit={submit}>
      <div className="page-head">
        <h1>New test</h1>
        <div className="head-actions">
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
          <button disabled={busy}>{busy ? "Creating…" : "Create and add questions"}</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card form-grid">
        <label className="field full">
          <span className="label">Title</span>
          <input value={form.title} placeholder="e.g. Kinematics practice set 1"
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">Exam</span>
          <select value={form.exam}
            onChange={(e) => setForm({ ...form, exam: e.target.value, duration_minutes: String(EXAM_DURATION[e.target.value]) })}>
            {Object.entries(EXAM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Duration (minutes)</span>
          <input type="number" min="5" max="360" value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
        </label>
      </div>
    </form>
  );
}

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const { data } = await api.get("/tests");
    setTests(data.tests);
  }

  useEffect(() => {
    load().catch(() => setError("Couldn't load tests"));
  }, []);

  if (openId) {
    return <TestBuilder testId={openId} onBack={() => { setOpenId(null); load(); }} />;
  }
  if (creating) {
    return <NewTestForm onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tests</h1>
          <p className="muted">Build tests from the question bank, then publish them for students.</p>
        </div>
        <button onClick={() => setCreating(true)}>+ New test</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {tests.length === 0 ? (
          <p className="muted">No tests yet. Create your first one.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th><th>Exam</th><th>Questions</th><th>Marks</th>
                  <th>Duration</th><th>Status</th><th>By</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.title}</b></td>
                    <td>{EXAM_LABEL[t.exam]}{t.is_contest && <span className="tag contest-tag">🏆 Contest</span>}</td>
                    <td>{t.question_count}</td>
                    <td>{t.total_marks}</td>
                    <td>{t.duration_minutes} min</td>
                    <td><span className={`status status-${t.status}`}>{t.status}</span></td>
                    <td className="muted">{t.author}</td>
                    <td className="actions"><button className="ghost" onClick={() => setOpenId(t.id)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
