import { useMemo, useState } from "react";
import { useSyllabus } from "./useSyllabus";
import { LEVEL_LABEL } from "../constants";

// Collapsible syllabus outline with question counts: Subject → Cluster → Chapter → Topic → Subtopic.
// counts = { [node_id]: questions tagged directly to it }; each row shows its whole subtree's total.
export default function SyllabusTree({ exam, counts, value, onChange }) {
  const { tree, loading, error } = useSyllabus(exam);
  const [open, setOpen] = useState(() => new Set());
  const [find, setFind] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);

  // Subtree totals, computed bottom-up
  const totals = useMemo(() => {
    const out = new Map();
    if (!tree) return out;
    const walk = (n) => {
      let t = counts?.[n.id] || 0;
      for (const c of tree.children.get(n.id) || []) t += walk(c);
      out.set(n.id, t);
      return t;
    };
    tree.roots.forEach(walk);
    return out;
  }, [tree, counts]);

  // The selected node's ancestors are always expanded
  const chainIds = useMemo(
    () => new Set(tree && value ? tree.chain(Number(value)).map((n) => n.id) : []),
    [tree, value]
  );

  // Name search: show matches and the path down to them
  const visible = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!tree || !q) return null;
    const keep = new Set();
    for (const n of tree.nodes) {
      if (n.name.toLowerCase().includes(q)) tree.chain(n.id).forEach((a) => keep.add(a.id));
    }
    return keep;
  }, [tree, find]);

  if (error) return <p className="error small">{error}</p>;
  if (loading || !tree) return <p className="muted small">Loading syllabus…</p>;
  if (!tree.roots.length) return <p className="muted small">This syllabus is empty. Add it on the Syllabus page.</p>;

  const toggle = (id) => setOpen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  function row(node, depth) {
    const kids = tree.children.get(node.id) || [];
    const total = totals.get(node.id) || 0;
    if (visible && !visible.has(node.id)) return null;
    if (hideEmpty && !total && !chainIds.has(node.id)) return null;
    const expanded = visible ? true : open.has(node.id) || chainIds.has(node.id);
    const selected = Number(value) === node.id;
    return (
      <li key={node.id}>
        <div className={`qb-row lvl-${node.level} ${selected ? "on" : ""} ${total ? "" : "empty"}`}
          style={{ paddingLeft: 6 + depth * 14 }}>
          {kids.length ? (
            <button type="button" className="qb-caret" aria-label={expanded ? "Collapse" : "Expand"}
              onClick={() => toggle(node.id)} disabled={!!visible}>{expanded ? "▾" : "▸"}</button>
          ) : <span className="qb-caret" />}
          <button type="button" className="qb-name" title={`${LEVEL_LABEL[node.level]}: ${node.name}`}
            onClick={() => { onChange(selected ? null : node.id); if (kids.length && !expanded) toggle(node.id); }}>
            {node.name}
          </button>
          <span className={`qb-count ${total ? "" : "zero"}`}>{total}</span>
        </div>
        {expanded && kids.length > 0 && (
          <ul>{kids.map((k) => row(k, depth + 1))}</ul>
        )}
      </li>
    );
  }

  const grand = tree.roots.reduce((n, r) => n + (totals.get(r.id) || 0), 0);
  return (
    <div className="qb-tree">
      <input className="qb-find" placeholder="Find a chapter or topic…" value={find} onChange={(e) => setFind(e.target.value)} />
      <div className="qb-tree-tools">
        <label className="toggle"><input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Hide empty</label>
        <button type="button" className="link-btn" onClick={() => setOpen(new Set())}>Collapse all</button>
      </div>
      <div className={`qb-row qb-all ${value ? "" : "on"}`}>
        <span className="qb-caret" />
        <button type="button" className="qb-name" onClick={() => onChange(null)}>Whole syllabus</button>
        <span className="qb-count">{grand}</span>
      </div>
      <ul className="qb-list">
        {tree.roots.map((r) => row(r, 0))}
      </ul>
      {visible && visible.size === 0 && <p className="muted small">Nothing called “{find}”.</p>}
    </div>
  );
}

// "Physics › General Physics › Units and Measurements", each part clickable
export function NodeCrumbs({ exam, value, onChange, examLabel }) {
  const { tree } = useSyllabus(exam);
  const chain = tree && value ? tree.chain(Number(value)) : [];
  return (
    <nav className="qb-crumbs" aria-label="Current syllabus filter">
      <button type="button" className="link-btn" onClick={() => onChange(null)}>{examLabel}</button>
      {chain.map((n, i) => (
        <span key={n.id}>
          <span className="sep">›</span>
          {i === chain.length - 1
            ? <b>{n.name} <span className="muted small">({LEVEL_LABEL[n.level].toLowerCase()})</span></b>
            : <button type="button" className="link-btn" onClick={() => onChange(n.id)}>{n.name}</button>}
        </span>
      ))}
    </nav>
  );
}
