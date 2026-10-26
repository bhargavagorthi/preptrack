import { useMemo, useState } from "react";
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

function NodeRow({ node, depth, tree, totals, expanded, toggle, onAction, adding, setAdding, busy }) {
  const kids = tree.children.get(node.id) || [];
  const open = expanded.has(node.id);
  const [name, setName] = useState("");
  const next = childLevel(node.level);
  const siblings = tree.children.get(node.parent_id ?? "root") || [];
  const index = siblings.indexOf(node);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await onAction("add", node, name.trim());
    if (ok) setName("");
  }

  return (
    <>
      <li className={`tree-row lvl-${node.level}`} style={{ paddingLeft: 8 + depth * 22 }}>
        <button className="chev" onClick={() => toggle(node.id)} disabled={!kids.length} aria-label={open ? "Collapse" : "Expand"}>
          {kids.length ? (open ? "▾" : "▸") : "•"}
        </button>
        <span className={`lvl-badge lvl-${node.level}`}>{LEVEL_LABEL[node.level]}</span>
        <span className="tree-name" onClick={() => kids.length && toggle(node.id)}>{node.name}</span>
        {kids.length > 0 && <span className="muted small">{kids.length}</span>}
        {totals.get(node.id) > 0 && <span className="q-count" title="Questions tagged here or below">{totals.get(node.id)} Q</span>}
        <span className="row-actions">
          {next && <button className="icon" title={`Add ${LEVEL_LABEL[next].toLowerCase()}`} onClick={() => setAdding(adding === node.id ? null : node.id)}>➕</button>}
          <button className="icon" title="Rename" disabled={busy} onClick={() => onAction("rename", node)}>✏️</button>
          <button className="icon" title="Move up" disabled={busy || index === 0} onClick={() => onAction("up", node)}>▲</button>
          <button className="icon" title="Move down" disabled={busy || index === siblings.length - 1} onClick={() => onAction("down", node)}>▼</button>
          <button className="icon" title="Delete" disabled={busy} onClick={() => onAction("delete", node)}>🗑️</button>
        </span>
      </li>
      {adding === node.id && (
        <li className="tree-add" style={{ paddingLeft: 8 + (depth + 1) * 22 }}>
          <form className="add-row inline" onSubmit={add}>
            <span className={`lvl-badge lvl-${next}`}>{LEVEL_LABEL[next]}</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${LEVEL_LABEL[next].toLowerCase()} in ${node.name}`} />
            <button className="small" disabled={busy}>Add</button>
            <button type="button" className="ghost small" onClick={() => setAdding(null)}>Cancel</button>
          </form>
        </li>
      )}
      {open && kids.map((k) => (
        <NodeRow key={k.id} node={k} depth={depth + 1} tree={tree} totals={totals} expanded={expanded} toggle={toggle}
          onAction={onAction} adding={adding} setAdding={setAdding} busy={busy} />
      ))}
    </>
  );
}

export default function Syllabus() {
  const [exam, setExam] = useState("jee_main");
  const { tree, loading, error: loadError } = useSyllabus(exam);
  const [expanded, setExpanded] = useState(() => new Set());
  const [adding, setAdding] = useState(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSubject, setNewSubject] = useState("");

  // Questions tagged at each node or anywhere beneath it
  const totals = useMemo(() => {
    const m = new Map();
    if (!tree) return m;
    for (const n of tree.nodes) {
      if (!n.questions) continue;
      for (const a of tree.chain(n.id)) m.set(a.id, (m.get(a.id) || 0) + n.questions);
    }
    return m;
  }, [tree]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(LEVELS.map((l) => [l, 0]));
    tree?.nodes.forEach((n) => c[n.level]++);
    return c;
  }, [tree]);

  // Search: list matching nodes with their full path
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!tree || q.length < 2) return null;
    return tree.nodes.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 100);
  }, [tree, search]);

  const toggle = (id) => setExpanded((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  function reveal(node) {
    setExpanded((s) => {
      const n = new Set(s);
      tree.chain(node.id).slice(0, -1).forEach((a) => n.add(a.id));
      return n;
    });
    setSearch("");
  }

  function expandTo(level) {
    const depth = LEVELS.indexOf(level);
    setExpanded(new Set(tree.nodes.filter((n) => LEVELS.indexOf(n.level) < depth).map((n) => n.id)));
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

  async function onAction(kind, node, value) {
    if (kind === "add") {
      const ok = await run(() => api.post("/syllabus/nodes", { exam, parent_id: node.id, name: value }));
      if (ok) setExpanded((s) => new Set(s).add(node.id));
      return ok;
    }
    if (kind === "rename") {
      const next = prompt(`Rename this ${LEVEL_LABEL[node.level].toLowerCase()}`, node.name);
      if (next && next.trim() && next.trim() !== node.name) await run(() => api.patch(`/syllabus/nodes/${node.id}`, { name: next.trim() }));
      return;
    }
    if (kind === "up" || kind === "down") return run(() => api.post(`/syllabus/nodes/${node.id}/move`, { direction: kind }));
    if (kind === "delete") {
      const kids = tree.children.get(node.id)?.length || 0;
      const msg = kids
        ? `Delete "${node.name}" and everything inside it?`
        : `Delete "${node.name}"?`;
      if (confirm(msg)) await run(() => api.delete(`/syllabus/nodes/${node.id}`));
    }
  }

  async function addSubject(e) {
    e.preventDefault();
    if (!newSubject.trim()) return;
    if (await run(() => api.post("/syllabus/nodes", { exam, name: newSubject.trim() }))) setNewSubject("");
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Syllabus</h1>
          <p className="muted">Two separate syllabi. Subject → cluster → chapter → topic → subtopic → section.</p>
        </div>
        <div className="head-actions">
          <button className="ghost" onClick={() => download("/syllabus/export", { exam }, `preptrack-syllabus-${exam}.xlsx`)}>⬇ Export</button>
          <button onClick={() => setImporting(true)}>⬆ Import from Excel</button>
        </div>
      </div>

      <div className="seg">
        {SYLLABUS_EXAMS.map((e) => (
          <button key={e} className={exam === e ? "seg-btn active" : "seg-btn"}
            onClick={() => { setExam(e); setExpanded(new Set()); setAdding(null); setImporting(false); }}>
            {SYLLABUS_LABEL[e]}
          </button>
        ))}
      </div>

      {importing && <SyllabusImport exam={exam} onClose={() => setImporting(false)} onDone={() => invalidateSyllabus(exam)} />}
      {(error || loadError) && <p className="error">{error || loadError}</p>}

      <div className="card">
        <div className="tree-toolbar">
          <input placeholder="Search the syllabus…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="muted small">
            {counts.chapter} chapters · {counts.topic} topics · {counts.subtopic} subtopics · {counts.section} sections
          </span>
          <div className="tree-expand">
            <button className="ghost small" onClick={() => expandTo("chapter")} disabled={!tree}>Show chapters</button>
            <button className="ghost small" onClick={() => expandTo("subtopic")} disabled={!tree}>Show topics</button>
            <button className="ghost small" onClick={() => setExpanded(new Set())}>Collapse</button>
          </div>
        </div>

        {loading && !tree ? <p className="muted">Loading…</p> : matches ? (
          <ul className="search-results">
            {matches.length === 0 && <li className="muted">No matches.</li>}
            {matches.map((n) => (
              <li key={n.id} onClick={() => reveal(n)}>
                <span className={`lvl-badge lvl-${n.level}`}>{LEVEL_LABEL[n.level]}</span>
                <span>{n.path}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="tree">
            {tree?.roots.map((n) => (
              <NodeRow key={n.id} node={n} depth={0} tree={tree} totals={totals} expanded={expanded} toggle={toggle}
                onAction={onAction} adding={adding} setAdding={setAdding} busy={busy} />
            ))}
            {tree && !tree.roots.length && (
              <li className="muted empty-tree">
                The {SYLLABUS_LABEL[exam]} syllabus is empty. Import it from Excel, or add a subject below.
              </li>
            )}
          </ul>
        )}

        <form className="add-row" onSubmit={addSubject}>
          <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder={`New subject in ${SYLLABUS_LABEL[exam]}`} />
          <button disabled={busy}>Add subject</button>
        </form>
      </div>
    </div>
  );
}
