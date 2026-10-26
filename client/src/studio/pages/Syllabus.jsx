import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api";
import { useSyllabus, invalidateSyllabus } from "../syllabus/useSyllabus";
import { SYLLABUS_EXAMS, SYLLABUS_LABEL, LEVELS, LEVEL_LABEL } from "../constants";

const childLevel = (level) => LEVELS[LEVELS.indexOf(level) + 1] || null;

async function download(url, params, filename) {
  const { data } = await api.get(url, { params, responseType: "blob" });
  const href = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function SyllabusImport({ exam, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function check() {
    setError("");
    setPreview(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("exam", exam);
      form.append("file", file);
      const { data } = await api.post("/syllabus/import/preview", form);
      setPreview(data);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't read the file");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/syllabus/import/commit", { exam, rows: preview.rows });
      setResult(data);
      onDone();
    } catch (e) {
      setError(e.response?.data?.error || "Import failed. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card import-panel">
      <div className="col-head">
        <h3>Import into {SYLLABUS_LABEL[exam]}</h3>
        <button className="ghost small" onClick={onClose}>Close</button>
      </div>
      {result ? (
        <p className="success">✅ Added {result.created} new item{result.created === 1 ? "" : "s"} to the {result.exam_label} syllabus.</p>
      ) : (
        <>
          <p className="muted">
            One row per path: subject, cluster, chapter, topic, subtopic, section. The import only <b>adds</b> what's
            missing. It never renames, moves or deletes anything.
          </p>
          <div className="upload-row">
            <button className="ghost small" onClick={() => download("/syllabus/import/template", {}, "preptrack-syllabus-template.xlsx")}>
              ⬇ Template
            </button>
            <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files[0] || null); setPreview(null); }} />
            <button className="small" onClick={check} disabled={!file || busy}>{busy && !preview ? "Checking…" : "Check file"}</button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {preview && !result && (
        <>
          <table className="table compact-table">
            <thead><tr><th>Level</th><th>Already there</th><th>New</th></tr></thead>
            <tbody>
              {LEVELS.map((l) => (
                <tr key={l}><td>{LEVEL_LABEL[l]}</td><td>{preview.counts[l].existing}</td><td><b>{preview.counts[l].new}</b></td></tr>
              ))}
            </tbody>
          </table>
          {preview.errors.length > 0 && (
            <div className="problems">
              <b>{preview.errors.length} row(s) need fixing first:</b>
              <ul>{preview.errors.slice(0, 20).map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}</ul>
            </div>
          )}
          <div className="import-summary">
            <span className="pill ok">{preview.total_new} new item{preview.total_new === 1 ? "" : "s"}</span>
            <button className="push-right" onClick={commit} disabled={busy || preview.errors.length > 0 || !preview.total_new}>
              {busy ? "Importing…" : `Add ${preview.total_new} item${preview.total_new === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// A colour per subject; every card inside a subject carries it
const SUBJECT_COLORS = ["#5b5bf6", "#1f9d63", "#e07a1f", "#c2417a", "#1d7fb8", "#7c4dcc"];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function SyllabusCard({ node, tree, below, totals, color, first, last, busy, highlight, onOpen, onAction }) {
  const kids = tree.children.get(node.id) || [];
  const next = childLevel(node.level);
  const depth = LEVELS.indexOf(node.level);
  // e.g. "4 chapters · 23 topics · 41 subtopics"
  const stats = LEVELS.slice(depth + 1)
    .map((l) => [l, below.get(node.id)?.[l] || 0])
    .filter(([, n]) => n > 0)
    .slice(0, 3)
    .map(([l, n]) => plural(n, LEVEL_LABEL[l].toLowerCase()));
  const q = totals.get(node.id) || 0;
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      id={`syl-card-${node.id}`}
      className={`syl-card lvl-${node.level} ${next ? "drill" : ""} ${highlight ? "flash" : ""}`}
      style={{ "--subject": color }}
      onClick={() => next && onOpen(node)}
      role={next ? "button" : undefined}
      tabIndex={next ? 0 : undefined}
      onKeyDown={(e) => next && e.key === "Enter" && onOpen(node)}
    >
      <div className="syl-card-top">
        <span className={`lvl-badge lvl-${node.level}`}>{LEVEL_LABEL[node.level]}</span>
        {q > 0 && <span className="q-count" title="Questions tagged here or inside">{q} Q</span>}
      </div>
      <h3 className="syl-card-name">{node.name}</h3>
      {stats.length > 0 && <div className="syl-card-stats">{stats.join(" · ")}</div>}

      {kids.length > 0 ? (
        <ul className="syl-card-preview">
          {kids.slice(0, 4).map((k) => <li key={k.id}>{k.name}</li>)}
          {kids.length > 4 && <li className="more">+{kids.length - 4} more</li>}
        </ul>
      ) : (
        next && <p className="syl-card-empty">No {LEVEL_LABEL[next].toLowerCase()}s yet</p>
      )}

      <div className="syl-card-foot">
        <div className="syl-card-actions">
          <button className="icon" title="Rename" disabled={busy} onClick={stop(() => onAction("rename", node))}>✏️</button>
          <button className="icon" title="Move earlier" disabled={busy || first} onClick={stop(() => onAction("up", node))}>◀</button>
          <button className="icon" title="Move later" disabled={busy || last} onClick={stop(() => onAction("down", node))}>▶</button>
          <button className="icon" title="Delete" disabled={busy} onClick={stop(() => onAction("delete", node))}>🗑️</button>
        </div>
        {next && <span className="syl-open">Open →</span>}
      </div>
    </div>
  );
}

function AddCard({ level, parentName, busy, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await onAdd(name.trim())) {
      setName("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button className="syl-card syl-add" onClick={() => setOpen(true)}>
        <span className="syl-add-plus">＋</span>
        <span>Add {LEVEL_LABEL[level].toLowerCase()}</span>
      </button>
    );
  }
  return (
    <form className="syl-card syl-add open" onSubmit={submit}>
      <span className={`lvl-badge lvl-${level}`}>New {LEVEL_LABEL[level]}</span>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        placeholder={parentName ? `In ${parentName}` : "e.g. Physics"} />
      <div className="syl-add-buttons">
        <button className="small" disabled={busy || !name.trim()}>Add</button>
        <button type="button" className="ghost small" onClick={() => { setOpen(false); setName(""); }}>Cancel</button>
      </div>
    </form>
  );
}

export default function Syllabus() {
  const [params, setParams] = useSearchParams();
  const exam = params.get("exam") === "jee_advanced" ? "jee_advanced" : "jee_main";
  const { tree, loading, error: loadError } = useSyllabus(exam);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const topRef = useRef(null);

  // Where we are in the tree lives in the URL, so refresh and the back button work
  const nodeParam = Number(params.get("node")) || null;
  const current = tree && nodeParam ? tree.byId.get(nodeParam) || null : null;
  const chain = current ? tree.chain(current.id) : [];
  const items = tree ? tree.children.get(current ? current.id : "root") || [] : [];
  const level = current ? childLevel(current.level) : "subject";

  const go = (nodeId, opts = {}) => {
    const next = { exam };
    if (nodeId) next.node = String(nodeId);
    setParams(next, opts);
    setSearch("");
  };

  // Questions tagged at each node or anywhere inside it
  const totals = useMemo(() => {
    const m = new Map();
    if (!tree) return m;
    for (const n of tree.nodes) {
      if (!n.questions) continue;
      for (const a of tree.chain(n.id)) m.set(a.id, (m.get(a.id) || 0) + n.questions);
    }
    return m;
  }, [tree]);

  // How many of each level sit inside each node
  const below = useMemo(() => {
    const m = new Map();
    if (!tree) return m;
    for (const n of tree.nodes) {
      for (const a of tree.chain(n.id).slice(0, -1)) {
        if (!m.has(a.id)) m.set(a.id, {});
        const c = m.get(a.id);
        c[n.level] = (c[n.level] || 0) + 1;
      }
    }
    return m;
  }, [tree]);

  const subjectColor = (node) => {
    if (!tree) return SUBJECT_COLORS[0];
    const subject = tree.chain(node.id)[0];
    return SUBJECT_COLORS[Math.max(0, tree.roots.indexOf(subject)) % SUBJECT_COLORS.length];
  };

  const counts = useMemo(() => {
    const c = Object.fromEntries(LEVELS.map((l) => [l, 0]));
    tree?.nodes.forEach((n) => c[n.level]++);
    return c;
  }, [tree]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!tree || q.length < 2) return null;
    return tree.nodes.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 60);
  }, [tree, search]);

  // After jumping to a search result, scroll to its card and flash it
  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`syl-card-${highlight}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlight(null), 2200);
    return () => clearTimeout(t);
  }, [highlight, nodeParam]);

  function openResult(n) {
    go(n.parent_id || null);
    setHighlight(n.id);
  }

  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
      invalidateSyllabus(exam);
      return true;
    } catch (e) {
      setError(e.response?.data?.error || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAction(kind, node) {
    if (kind === "rename") {
      const next = prompt(`Rename this ${LEVEL_LABEL[node.level].toLowerCase()}`, node.name);
      if (next && next.trim() && next.trim() !== node.name) await run(() => api.patch(`/syllabus/nodes/${node.id}`, { name: next.trim() }));
      return;
    }
    if (kind === "up" || kind === "down") return run(() => api.post(`/syllabus/nodes/${node.id}/move`, { direction: kind }));
    if (kind === "delete") {
      const inside = Object.values(below.get(node.id) || {}).reduce((a, b) => a + b, 0);
      const msg = inside
        ? `Delete "${node.name}" and the ${plural(inside, "item")} inside it?`
        : `Delete "${node.name}"?`;
      if (!confirm(msg)) return;
      const ok = await run(() => api.delete(`/syllabus/nodes/${node.id}`));
      if (ok && current && node.id === current.id) go(node.parent_id || null, { replace: true });
    }
  }

  const add = (name) => run(() => api.post("/syllabus/nodes", { exam, parent_id: current?.id || null, name }));

  const switchExam = (e) => {
    setParams({ exam: e });
    setSearch("");
    setImporting(false);
  };

  const currentStats = current
    ? LEVELS.slice(LEVELS.indexOf(current.level) + 1)
        .map((l) => [l, below.get(current.id)?.[l] || 0])
        .filter(([, n]) => n > 0)
        .map(([l, n]) => plural(n, LEVEL_LABEL[l].toLowerCase()))
    : [];

  return (
    <div className="page" ref={topRef}>
      <div className="page-head">
        <div>
          <h1>Syllabus</h1>
          <p className="muted">Two separate syllabi. Click a card to open it.</p>
        </div>
        <div className="head-actions">
          <button className="ghost" onClick={() => download("/syllabus/export", { exam }, `preptrack-syllabus-${exam}.xlsx`)}>⬇ Export</button>
          <button onClick={() => setImporting(true)}>⬆ Import from Excel</button>
        </div>
      </div>

      <div className="syl-toolbar">
        <div className="seg">
          {SYLLABUS_EXAMS.map((e) => (
            <button key={e} className={exam === e ? "seg-btn active" : "seg-btn"} onClick={() => switchExam(e)}>
              {SYLLABUS_LABEL[e]}
            </button>
          ))}
        </div>
        <input className="syl-search" placeholder="Search chapters, topics, subtopics…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">
          {counts.chapter} chapters · {counts.topic} topics · {counts.subtopic} subtopics · {counts.section} sections
        </span>
      </div>

      {importing && <SyllabusImport exam={exam} onClose={() => setImporting(false)} onDone={() => invalidateSyllabus(exam)} />}
      {(error || loadError) && <p className="error">{error || loadError}</p>}

      {matches ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Search results</h3>
          <ul className="search-results">
            {matches.length === 0 && <li className="muted">No matches.</li>}
            {matches.map((n) => (
              <li key={n.id} onClick={() => openResult(n)}>
                <span className={`lvl-badge lvl-${n.level}`}>{LEVEL_LABEL[n.level]}</span>
                <span>{n.path}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <nav className="syl-crumbs" aria-label="Breadcrumb">
            <button className={!current ? "crumb active" : "crumb"} onClick={() => go(null)}>{SYLLABUS_LABEL[exam]}</button>
            {chain.map((n, i) => (
              <span key={n.id} className="crumb-wrap">
                <span className="crumb-sep">›</span>
                <button className={i === chain.length - 1 ? "crumb active" : "crumb"} onClick={() => go(n.id)}>{n.name}</button>
              </span>
            ))}
          </nav>

          {current && (
            <div className="syl-focus" style={{ "--subject": subjectColor(current) }}>
              <button className="ghost small" onClick={() => go(current.parent_id || null)}>← Back</button>
              <div className="syl-focus-main">
                <span className={`lvl-badge lvl-${current.level}`}>{LEVEL_LABEL[current.level]}</span>
                <h2>{current.name}</h2>
                <span className="muted small">
                  {currentStats.length ? currentStats.join(" · ") : "Nothing inside yet"}
                  {totals.get(current.id) ? ` · ${plural(totals.get(current.id), "question")} tagged` : ""}
                </span>
              </div>
              <div className="syl-card-actions">
                <button className="icon" title="Rename" disabled={busy} onClick={() => onAction("rename", current)}>✏️</button>
                <button className="icon" title="Delete" disabled={busy} onClick={() => onAction("delete", current)}>🗑️</button>
              </div>
            </div>
          )}

          {loading && !tree ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              {level && (
                <div className="syl-section-head">
                  <h3>{items.length ? plural(items.length, LEVEL_LABEL[level].toLowerCase()) : `No ${LEVEL_LABEL[level].toLowerCase()}s yet`}</h3>
                  {!current && !items.length && (
                    <span className="muted">Import the {SYLLABUS_LABEL[exam]} syllabus from Excel, or add a subject.</span>
                  )}
                </div>
              )}
              <div className={`syl-grid ${level === "subject" ? "subjects" : ""}`}>
                {items.map((n, i) => (
                  <SyllabusCard key={n.id} node={n} tree={tree} below={below} totals={totals} color={subjectColor(n)}
                    first={i === 0} last={i === items.length - 1} busy={busy} highlight={highlight === n.id}
                    onOpen={(node) => go(node.id)} onAction={onAction} />
                ))}
                {level && <AddCard key={`${exam}-${current?.id || "root"}`} level={level} parentName={current?.name} busy={busy} onAdd={add} />}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
