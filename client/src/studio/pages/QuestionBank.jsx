import { useCallback, useEffect, useState } from "react";
import api from "../../api";
import SyllabusPicker from "../components/SyllabusPicker";
import QuestionEditor from "../components/QuestionEditor";
import { TYPE_LABEL } from "../constants";

const EMPTY_FILTERS = {
  subject_id: "", chapter_id: "", topic_id: "", type: "", difficulty: "", search: "",
};

export default function QuestionBank() {
  const [tree, setTree] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState(null); // null = list, {} = new, question = edit
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/syllabus")
      .then((r) => setTree(r.data.subjects))
      .catch(() => setError("Couldn't load the syllabus"));
  }, []);

  const load = useCallback(async () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""));
    const { data } = await api.get("/questions", { params });
    setQuestions(data.questions);
    setTotal(data.total);
  }, [filters]);

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.error || "Couldn't load questions"));
  }, [load]);

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));

  async function remove(q) {
    if (!confirm("Delete this question?")) return;
    try {
      await api.delete(`/questions/${q.id}`);
      load();
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't delete");
    }
  }

  if (editing) {
    return (
      <QuestionEditor
        tree={tree}
        question={editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Question Bank</h1>
          <p className="muted">{total} question{total === 1 ? "" : "s"}</p>
        </div>
        <button onClick={() => setEditing({})}>+ New question</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card filters">
        <SyllabusPicker tree={tree} value={filters} onChange={setFilter} allowAny />
        <select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.difficulty} onChange={(e) => setFilter({ difficulty: e.target.value })}>
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <input
          placeholder="Search question text…"
          value={filters.search}
          onChange={(e) => setFilter({ search: e.target.value })}
        />
        <button className="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>
      </div>

      {questions.length === 0 ? (
        <div className="card empty">
          <p>No questions match. Create one to get started.</p>
        </div>
      ) : (
        <div className="q-list">
          {questions.map((q) => (
            <div className="card q-card" key={q.id}>
              <div className="q-tags">
                <span className="tag">{q.subject} › {q.chapter} › {q.topic}</span>
                <span className="tag">{TYPE_LABEL[q.type]}</span>
                <span className={`tag diff-${q.difficulty}`}>{q.difficulty}</span>
                <span className="tag">+{q.marks_correct} / {q.marks_wrong}</span>
              </div>
              <p className="q-text">{q.text}</p>
              {q.options && (
                <ol className="q-options">
                  {q.options.map((o) => (
                    <li key={o.id} className={q.answer.includes(o.id) ? "correct" : ""}>
                      <b>{o.id}.</b> {o.text}
                    </li>
                  ))}
                </ol>
              )}
              {q.type === "numerical" && (
                <p className="muted">
                  Answer: <b>{q.answer.value}</b>
                  {q.answer.tolerance ? ` (± ${q.answer.tolerance})` : ""}
                </p>
              )}
              <div className="q-foot">
                <span className="muted">by {q.author || "unknown"}</span>
                <div className="q-actions">
                  <button className="ghost" onClick={() => setEditing(q)}>Edit</button>
                  <button className="ghost" onClick={() => remove(q)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
