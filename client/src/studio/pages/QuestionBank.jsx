import { useCallback, useEffect, useState } from "react";
import api from "../../api";
import QuestionEditor from "../components/QuestionEditor";
import { TYPE_LABEL, SYLLABUS_EXAMS, SYLLABUS_LABEL } from "../constants";
import MathText from "../components/MathText";
import ImportQuestions from "../components/ImportQuestions";
import NodePicker from "../syllabus/NodePicker";
import TagChips from "../syllabus/TagChips";
import { invalidateSyllabus } from "../syllabus/useSyllabus";

const EMPTY_FILTERS = { scope: "all", node_id: null, type: "", difficulty: "", search: "", page: 1 };
const PAGE_SIZE = 50;

function BulkTagBar({ count, onTag, onClear }) {
  const [exam, setExam] = useState("jee_main");
  const [nodeId, setNodeId] = useState(null);
  return (
    <div className="card bulk-bar">
      <b>{count} selected</b>
      <span className="muted">Tag them in</span>
      <select value={exam} onChange={(e) => { setExam(e.target.value); setNodeId(null); }}>
        {SYLLABUS_EXAMS.map((e) => <option key={e} value={e}>{SYLLABUS_LABEL[e]}</option>)}
      </select>
      <NodePicker exam={exam} value={nodeId} onChange={setNodeId} anyLabel="Choose subject" requireTaggable compact />
      <button className="small" disabled={!nodeId} onClick={() => onTag(exam, nodeId)}>Apply tag</button>
      <button className="ghost small" onClick={onClear}>Clear selection</button>
    </div>
  );
}

export default function QuestionBank() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [untaggedTotal, setUntaggedTotal] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // null = list, {} = new, question = edit
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const params = { page: filters.page };
    if (filters.scope === "untagged") params.untagged = 1;
    else if (filters.node_id) params.node_id = filters.node_id;
    else if (filters.scope !== "all") params.exam = filters.scope;
    for (const k of ["type", "difficulty", "search"]) if (filters[k]) params[k] = filters[k];
    const { data } = await api.get("/questions", { params });
    setQuestions(data.questions);
    setTotal(data.total);
    setUntaggedTotal(data.untagged_total);
  }, [filters]);

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.error || "Couldn't load questions"));
  }, [load]);

  const setFilter = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));

  function toggleSelect(id) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function bulkTag(exam, nodeId) {
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/questions/bulk-tag", { question_ids: [...selected], exam, node_id: nodeId });
      setNotice(`Tagged ${data.tagged} question${data.tagged === 1 ? "" : "s"}` +
        (data.skipped ? ` · ${data.skipped} skipped (not yours to edit)` : ""));
      setSelected(new Set());
      invalidateSyllabus(exam);
      load();
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't tag");
    }
  }

  async function remove(q) {
    if (!confirm("Delete this question?")) return;
    try {
      await api.delete(`/questions/${q.id}`);
      load();
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't delete");
    }
  }

  if (importing) {
    return <ImportQuestions onCancel={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />;
  }
  if (editing) {
    return (
      <QuestionEditor
        question={editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); SYLLABUS_EXAMS.forEach(invalidateSyllabus); load(); }}
      />
    );
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPage = questions.length > 0 && questions.every((q) => selected.has(q.id));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Question Bank</h1>
          <p className="muted">{total} question{total === 1 ? "" : "s"}</p>
        </div>
        <div className="head-actions">
          <button className="ghost" onClick={() => setImporting(true)}>⬆ Import from Excel</button>
          <button onClick={() => setEditing({})}>+ New question</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <div className="seg">
        {[["all", "All"], ...SYLLABUS_EXAMS.map((e) => [e, SYLLABUS_LABEL[e]]), ["untagged", `⚠ Untagged (${untaggedTotal})`]].map(([v, l]) => (
          <button key={v} className={filters.scope === v ? "seg-btn active" : "seg-btn"}
            onClick={() => setFilter({ scope: v, node_id: null })}>{l}</button>
        ))}
      </div>

      <div className="card filters">
        {SYLLABUS_EXAMS.includes(filters.scope) && (
          <NodePicker exam={filters.scope} value={filters.node_id} onChange={(id) => setFilter({ node_id: id })}
            anyLabel="All subjects" compact />
        )}
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
        <input placeholder="Search question text…" value={filters.search} onChange={(e) => setFilter({ search: e.target.value })} />
        <button className="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>
      </div>

      {selected.size > 0 && <BulkTagBar count={selected.size} onTag={bulkTag} onClear={() => setSelected(new Set())} />}

      {questions.length === 0 ? (
        <div className="card empty">
          <p>{filters.scope === "untagged" ? "Every question is tagged. 🎉" : "No questions match. Create one to get started."}</p>
        </div>
      ) : (
        <>
          <label className="toggle select-all">
            <input type="checkbox" checked={allOnPage} onChange={() => setSelected((s) => {
              const n = new Set(s);
              questions.forEach((q) => (allOnPage ? n.delete(q.id) : n.add(q.id)));
              return n;
            })} />
            Select all on this page
          </label>
          <div className="q-list">
            {questions.map((q) => (
              <div className={`card q-card ${selected.has(q.id) ? "q-selected" : ""}`} key={q.id}>
                <div className="q-tags">
                  <input type="checkbox" className="q-check" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)} />
                  <TagChips tags={q.tags} />
                  <span className="tag">{TYPE_LABEL[q.type]}</span>
                  <span className={`tag diff-${q.difficulty}`}>{q.difficulty}</span>
                  <span className="tag">+{q.marks_correct} / {q.marks_wrong}</span>
                </div>
                <MathText as="p" className="q-text" text={q.text} />
                {q.image_url && <img className="q-image" src={q.image_url} alt="Question figure" />}
                {q.options && (
                  <ol className="q-options">
                    {q.options.map((o) => (
                      <li key={o.id} className={q.answer.includes(o.id) ? "correct" : ""}>
                        <b>{o.id}.</b> <MathText text={o.text} />{o.image && <img className="opt-image" src={o.image} alt={"Option " + o.id} />}
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
          {pages > 1 && (
            <div className="pager">
              <button className="ghost small" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Previous</button>
              <span className="muted">Page {filters.page} of {pages}</span>
              <button className="ghost small" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
