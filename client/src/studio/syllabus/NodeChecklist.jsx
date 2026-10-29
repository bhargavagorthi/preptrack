import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import { useSyllabus } from "./useSyllabus";
import { LEVEL_LABEL } from "../constants";

// Questions tagged directly to each node of one tree
function useCounts(exam) {
  const [state, setState] = useState({ exam: null, counts: null });
  useEffect(() => {
    let stale = false;
    api.get("/questions/coverage", { params: { exam } })
      .then((r) => !stale && setState({ exam, counts: r.data.counts }))
      .catch(() => {});
    return () => { stale = true; };
  }, [exam]);
  return state.exam === exam ? state.counts : null;
}

// Tick any mix of subjects, chapters, topics, subtopics and sections. Ticking a node covers
// everything beneath it, so its children show as included.
export default function NodeChecklist({ exam, value, onChange, onClose }) {
  const { tree } = useSyllabus(exam);
  const counts = useCounts(exam);
  const [open, setOpen] = useState(() => new Set());
  const [find, setFind] = useState("");
  const chosen = useMemo(() => new Set(value), [value]);

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

  const visible = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!tree || !q) return null;
    const keep = new Set();
    for (const n of tree.nodes) if (n.name.toLowerCase().includes(q)) tree.chain(n.id).forEach((a) => keep.add(a.id));
    return keep;
  }, [tree, find]);

  if (!tree) return <div className="card nc-panel"><p className="muted">Loading syllabus…</p></div>;

  const coveredBy = (id) => tree.chain(id).slice(0, -1).find((a) => chosen.has(a.id));
  function toggle(node) {
    if (chosen.has(node.id)) return onChange(value.filter((id) => id !== node.id));
    // Ticking a parent replaces any of its descendants already ticked
    const inside = (id) => tree.chain(id).some((a) => a.id === node.id);
    onChange([...value.filter((id) => !inside(id)), node.id]);
  }
  const expand = (id) => setOpen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  function row(node, depth) {
    if (visible && !visible.has(node.id)) return null;
    const kids = tree.children.get(node.id) || [];
    const total = totals.get(node.id) || 0;
    const parent = coveredBy(node.id);
    const isOpen = visible ? true : open.has(node.id);
    return (
      <li key={node.id}>
        <div className={`nc-row lvl-${node.level} ${total ? "" : "empty"}`} style={{ paddingLeft: 4 + depth * 16 }}>
          {kids.length
            ? <button type="button" className="qb-caret" onClick={() => expand(node.id)} disabled={!!visible}>{isOpen ? "▾" : "▸"}</button>
            : <span className="qb-caret" />}
          <label title={parent ? `Included through ${parent.name}` : `${LEVEL_LABEL[node.level]}: ${node.name}`}>
            <input type="checkbox" checked={chosen.has(node.id) || !!parent} disabled={!!parent || (!total && !chosen.has(node.id))}
              onChange={() => toggle(node)} />
            <span className="nc-name">{node.name}</span>
          </label>
          <span className={`qb-count ${total ? "" : "zero"}`}>{total}</span>
        </div>
        {isOpen && kids.length > 0 && <ul>{kids.map((k) => row(k, depth + 1))}</ul>}
      </li>
    );
  }

  return (
    <div className="card nc-panel" role="dialog" aria-label="Choose syllabus areas">
      <div className="nc-head">
        <b>Choose where questions come from</b>
        <button type="button" className="small" onClick={onClose}>Done</button>
      </div>
      <input className="qb-find" placeholder="Find a chapter, topic or section…" value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
      <p className="hint">Ticking a chapter includes all its topics, subtopics and sections. Numbers are questions available.</p>
      <ul className="nc-list">{tree.roots.map((r) => row(r, 0))}</ul>
    </div>
  );
}

// Short chips for the chosen nodes: "Units and Measurements", "Kinematics › Projectile Motion"
export function NodeChips({ exam, value, onRemove }) {
  const { tree } = useSyllabus(exam);
  if (!tree) return null;
  return value.map((id) => {
    const chain = tree.chain(id);
    const n = chain[chain.length - 1];
    if (!n) return null;
    const label = chain.length > 3 ? chain.slice(-2).map((x) => x.name).join(" › ") : n.name;
    return (
      <span key={id} className="tag nc-chip" title={chain.map((x) => x.name).join(" › ")}>
        {label}
        {onRemove && <button type="button" aria-label={`Remove ${n.name}`} onClick={() => onRemove(id)}>×</button>}
      </span>
    );
  });
}
