import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api";
import QuestionEditor from "../components/QuestionEditor";
import { TYPE_LABEL, SYLLABUS_EXAMS, SYLLABUS_LABEL } from "../constants";
import MathText from "../components/MathText";
import ImportQuestions from "../components/ImportQuestions";
import NodePicker from "../syllabus/NodePicker";
import TagChips from "../syllabus/TagChips";
import SyllabusTree, { NodeCrumbs } from "../syllabus/SyllabusTree";
import { invalidateSyllabus } from "../syllabus/useSyllabus";

const PAGE_SIZE = 50;
// Every filter lives in the URL, so a creator can bookmark "my Kinematics questions this week"
// and comes back to the same view after editing or refreshing
const DEFAULTS = { scope: "jee_main", node: "", mine: "", since: "", type: "", difficulty: "", search: "", sort: "newest", page: "1" };
const FILTER_KEYS = ["mine", "since", "type", "difficulty", "search"];

const SINCE_LABEL = { "": "Any time", today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" };
const SORT_LABEL = { newest: "Newest first", oldest: "Oldest first", updated: "Recently edited" };

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const f = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (params.has(k)) f[k] = params.get(k);
    // Ignore hand-edited junk in the URL
    if (!/^\d+$/.test(f.node)) f.node = "";
    if (!/^\d+$/.test(f.page) || f.page === "0") f.page = "1";
    return f;
  }, [params]);
  // Any change other than the page sends you back to page 1
  const setFilter = useCallback((patch) => {
    // Build on the live URL, not the last render's copy, so quick successive changes all stick
    setParams(() => {
      const next = new URLSearchParams(window.location.search);
      const merged = { ...Object.fromEntries(next), ...patch };
      if (!("page" in patch)) merged.page = "1";
      for (const [k, v] of Object.entries(merged)) {
        if (v === "" || v == null || v === DEFAULTS[k]) next.delete(k);
        else next.set(k, String(v));
      }
      return next;
    }, { replace: !("page" in patch) && !("node" in patch) && !("scope" in patch) });
  }, [setParams]);
  return [filters, setFilter];
}

const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

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

function QuestionCard({ q, n, compact, showSolution, selected, flash, onSelect, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const solutionOpen = showSolution || open;

  if (compact) {
    return (
      <div className={`card qb-compact ${selected ? "q-selected" : ""} ${flash ? "qb-flash" : ""}`}>
        <input type="checkbox" className="q-check" checked={selected} onChange={onSelect} />
        <span className="qb-num">{n}</span>
        <MathText className="qb-ctext" text={q.text} />
        <span className={`tag diff-${q.difficulty}`}>{q.difficulty}</span>
        <span className="tag">{TYPE_LABEL[q.type].split(" ")[0]}</span>
        {q.can_edit
          ? <button className="ghost small" onClick={onEdit}>{q.locked ? "Re-tag" : "Edit"}</button>
          : <span className="muted small">view only</span>}
      </div>
    );
  }

  return (
    <div className={`card q-card ${selected ? "q-selected" : ""} ${flash ? "qb-flash" : ""}`}>
      <div className="q-tags">
        <input type="checkbox" className="q-check" checked={selected} onChange={onSelect} />
        <span className="qb-num" title="Question number. Type it in search to find this question again.">{n}</span>
        <TagChips tags={q.tags} />
        <span className="tag">{TYPE_LABEL[q.type]}</span>
        <span className={`tag diff-${q.difficulty}`}>{q.difficulty}</span>
        <span className="tag">+{q.marks_correct} / {q.marks_wrong}</span>
        {q.locked && <span className="tag qb-lock" title="It's in a published test, so only its syllabus tags can change">🔒 In a live test</span>}
        {!q.locked && q.used_in_tests > 0 && <span className="tag" title="Used in draft or practice tests">In {q.used_in_tests} test{q.used_in_tests === 1 ? "" : "s"}</span>}
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
      {q.solution ? (
        solutionOpen
          ? <div className="qb-solution"><b>Solution</b><MathText as="div" text={q.solution} /></div>
          : null
      ) : <p className="hint warn">No solution written yet.</p>}
      <div className="q-foot">
        <span className="muted small">
          by {q.author || "unknown"} · added {ago(q.created_at)}
          {q.updated_at && new Date(q.updated_at) - new Date(q.created_at) > 60000 ? ` · edited ${ago(q.updated_at)}` : ""}
        </span>
        <div className="q-actions">
          {q.solution && !showSolution && (
            <button className="ghost small" onClick={() => setOpen((o) => !o)}>{open ? "Hide solution" : "Show solution"}</button>
          )}
          {q.can_edit ? (
            <>
              <button className="ghost small" onClick={onEdit}>{q.locked ? "Re-tag" : "Edit"}</button>
              {!q.locked && <button className="ghost small" onClick={onDelete}>Delete</button>}
            </>
          ) : <span className="muted small">Added by another creator: view only</span>}
        </div>
      </div>
    </div>
  );
}

export default function QuestionBank() {
  const [filters, setFilter] = useFilters();
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [untaggedTotal, setUntaggedTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // null = list, {} = new, question = edit
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [flashId, setFlashId] = useState(null);
  const [searchText, setSearchText] = useState(filters.search);
  const [view, setView] = useState(() => {
    try { return localStorage.getItem("qb.view") || "full"; } catch { return "full"; }
  });
  const [showSolutions, setShowSolutions] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false); // phones: the browser folds above the list

  const examScope = SYLLABUS_EXAMS.includes(filters.scope) ? filters.scope : null;
  const shared = useMemo(() => {
    const p = {};
    for (const k of FILTER_KEYS) if (filters[k]) p[k] = filters[k];
    return p;
  }, [filters]);

  const [reloadKey, setReloadKey] = useState(0);
  const listParams = useMemo(() => {
    const params = { ...shared, page: filters.page, sort: filters.sort };
    if (filters.scope === "untagged") params.untagged = 1;
    else if (examScope && filters.node) params.node_id = filters.node;
    else if (examScope) params.exam = examScope;
    return params;
  }, [shared, filters.page, filters.sort, filters.scope, filters.node, examScope]);

  useEffect(() => {
    let stale = false;
    api.get("/questions", { params: listParams })
      .then(({ data }) => {
        if (stale) return;
        setQuestions(data.questions);
        setTotal(data.total);
        setUntaggedTotal(data.untagged_total);
      })
      .catch((e) => !stale && setError(e.response?.data?.error || "Couldn't load questions"));
    return () => { stale = true; };
  }, [listParams, reloadKey]);

  // Counts beside each chapter and topic follow the same filters
  useEffect(() => {
    if (!examScope) return;
    let stale = false;
    api.get("/questions/coverage", { params: { ...shared, exam: examScope } })
      .then(({ data }) => !stale && setCounts(data.counts))
      .catch(() => {});
    return () => { stale = true; };
  }, [shared, examScope, reloadKey]);

  // Search waits until typing pauses
  useEffect(() => {
    if (searchText === filters.search) return;
    const t = setTimeout(() => setFilter({ search: searchText.trim() }), 350);
    return () => clearTimeout(t);
  }, [searchText, filters.search, setFilter]);

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 2500);
    return () => clearTimeout(t);
  }, [flashId]);

  const refresh = () => setReloadKey((k) => k + 1);

  function chooseView(v) {
    setView(v);
    try { localStorage.setItem("qb.view", v); } catch { /* private mode */ }
  }

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
      refresh();
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't tag");
    }
  }

  async function remove(q) {
    if (!confirm(`Delete question #${q.id}? This can't be undone.`)) return;
    setError("");
    try {
      await api.delete(`/questions/${q.id}`);
      setNotice(`Deleted question #${q.id}`);
      refresh();
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't delete");
    }
  }

  function clearAll() {
    setSearchText("");
    setFilter({ node: "", mine: "", since: "", type: "", difficulty: "", search: "", sort: "newest" });
  }

  if (importing) {
    return <ImportQuestions onCancel={() => setImporting(false)} onDone={() => { setImporting(false); setFilter({ since: "today", mine: "1", sort: "newest" }); setNotice("Imported. Showing what you added today, so you can check it."); }} />;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPage = questions.length > 0 && questions.every((q) => selected.has(q.id));
  const active = FILTER_KEYS.filter((k) => filters[k]).length + (filters.node ? 1 : 0);
  const first = (Number(filters.page) - 1) * PAGE_SIZE;

  const list = (
    <div className="page" style={editing ? { display: "none" } : undefined}>
      <div className="page-head">
        <div>
          <h1>Question Bank</h1>
          <p className="muted">
            {total} question{total === 1 ? "" : "s"}{active ? " match your filters" : ""}
          </p>
        </div>
        <div className="head-actions">
          <button className="ghost" onClick={() => setImporting(true)}>⬆ Import from Excel</button>
          <button onClick={() => setEditing({})}>+ New question</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <div className="seg">
        {[...SYLLABUS_EXAMS.map((e) => [e, SYLLABUS_LABEL[e]]), ["all", "All questions"], ["untagged", `⚠ Untagged (${untaggedTotal})`]].map(([v, l]) => (
          <button key={v} className={filters.scope === v ? "seg-btn active" : "seg-btn"}
            onClick={() => setFilter({ scope: v, node: "" })}>{l}</button>
        ))}
      </div>

      <div className={`qb-layout ${examScope ? "" : "no-tree"}`}>
        {examScope && (
          <aside className={`card qb-side ${treeOpen ? "open" : ""}`}>
            <button className="qb-side-toggle ghost small" onClick={() => setTreeOpen((o) => !o)}>
              {treeOpen ? "Hide syllabus ▴" : "Browse by chapter ▾"}
            </button>
            <div className="qb-side-body">
              <SyllabusTree exam={examScope} counts={counts} value={filters.node || null}
                onChange={(id) => { setFilter({ node: id || "" }); setTreeOpen(false); }} />
            </div>
          </aside>
        )}

        <section className="qb-main">
          <div className="card filters qb-filters">
            <div className="seg seg-sm">
              {[["", "Everyone's"], ["1", "Mine"]].map(([v, l]) => (
                <button key={l} className={filters.mine === v ? "seg-btn active" : "seg-btn"} onClick={() => setFilter({ mine: v })}>{l}</button>
              ))}
            </div>
            <select value={filters.since} onChange={(e) => setFilter({ since: e.target.value })} aria-label="Added">
              {Object.entries(SINCE_LABEL).map(([v, l]) => <option key={v} value={v}>{v ? `Added: ${l.toLowerCase()}` : "Added: any time"}</option>)}
            </select>
            <select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })} aria-label="Type">
              <option value="">All types</option>
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={filters.difficulty} onChange={(e) => setFilter({ difficulty: e.target.value })} aria-label="Difficulty">
              <option value="">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <select value={filters.sort} onChange={(e) => setFilter({ sort: e.target.value })} aria-label="Sort">
              {Object.entries(SORT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input placeholder="Search text, solution or #number…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            {active > 0 && <button className="ghost small" onClick={clearAll}>Clear filters ({active})</button>}
          </div>

          {examScope && (
            <NodeCrumbs exam={examScope} value={filters.node || null} examLabel={SYLLABUS_LABEL[examScope]}
              onChange={(id) => setFilter({ node: id || "" })} />
          )}

          {selected.size > 0 && <BulkTagBar count={selected.size} onTag={bulkTag} onClear={() => setSelected(new Set())} />}

          {questions.length === 0 ? (
            <div className="card empty">
              {filters.scope === "untagged" ? <p>Every question is tagged. 🎉</p> : active ? (
                <>
                  <p>No questions match these filters.</p>
                  <button className="ghost small" onClick={clearAll}>Clear filters</button>
                </>
              ) : <p>No questions here yet. Import an Excel file or create one.</p>}
            </div>
          ) : (
            <>
              <div className="qb-listbar">
                <label className="toggle">
                  <input type="checkbox" checked={allOnPage} onChange={() => setSelected((s) => {
                    const n = new Set(s);
                    questions.forEach((q) => (allOnPage ? n.delete(q.id) : n.add(q.id)));
                    return n;
                  })} />
                  Select all on this page
                </label>
                <span className="muted small">Showing {first + 1}–{first + questions.length} of {total}</span>
                <div className="qb-view">
                  {view === "full" && (
                    <label className="toggle"><input type="checkbox" checked={showSolutions} onChange={(e) => setShowSolutions(e.target.checked)} /> Show all solutions</label>
                  )}
                  <div className="seg seg-sm">
                    {[["full", "Full"], ["compact", "Compact"]].map(([v, l]) => (
                      <button key={v} className={view === v ? "seg-btn active" : "seg-btn"} onClick={() => chooseView(v)}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={view === "compact" ? "qb-clist" : "q-list"}>
                {questions.map((q) => (
                  <QuestionCard key={q.id} q={q} n={`#${q.id}`} compact={view === "compact"} showSolution={showSolutions}
                    selected={selected.has(q.id)} flash={flashId === q.id}
                    onSelect={() => toggleSelect(q.id)} onEdit={() => setEditing(q)} onDelete={() => remove(q)} />
                ))}
              </div>
              {pages > 1 && (
                <div className="pager">
                  <button className="ghost small" disabled={filters.page <= 1} onClick={() => { setFilter({ page: String(Number(filters.page) - 1) }); window.scrollTo(0, 0); }}>← Previous</button>
                  <span className="muted">Page {filters.page} of {pages}</span>
                  <button className="ghost small" disabled={Number(filters.page) >= pages} onClick={() => { setFilter({ page: String(Number(filters.page) + 1) }); window.scrollTo(0, 0); }}>Next →</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );

  return (
    <>
      {list}
      {editing && (
        <QuestionEditor
          question={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            const id = editing.id;
            setEditing(null);
            setNotice(id ? `Saved question #${id}` : "Question added");
            if (id) setFlashId(id);
            SYLLABUS_EXAMS.forEach(invalidateSyllabus);
            refresh();
          }}
        />
      )}
    </>
  );
}
