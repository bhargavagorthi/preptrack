import { useSyllabus } from "./useSyllabus";
import { LEVEL_LABEL, TAGGABLE } from "../constants";

// Cascading dropdowns through one syllabus tree: Subject → Cluster → Chapter → Topic → Subtopic → Section.
// value is the deepest chosen node id (or null). With requireTaggable, only chapter-or-deeper counts as chosen.
export default function NodePicker({ exam, value, onChange, anyLabel = "Any", requireTaggable = false, compact = false }) {
  const { tree, loading, error } = useSyllabus(exam);
  if (error) return <span className="error small">{error}</span>;
  if (loading || !tree) return <span className="muted small">Loading syllabus…</span>;
  if (!tree.roots.length) return <span className="muted small">This syllabus is empty. Add it on the Syllabus page.</span>;

  const chain = value ? tree.chain(Number(value)) : [];
  const levels = [];
  let options = tree.roots;
  for (let depth = 0; options.length; depth++) {
    const selected = chain[depth];
    levels.push({ depth, options, selected });
    if (!selected) break;
    options = tree.children.get(selected.id) || [];
  }

  function pick(depth, id) {
    if (id) return onChange(Number(id));
    const parent = chain[depth - 1];
    onChange(parent ? parent.id : null);
  }

  const chosen = chain[chain.length - 1];
  const tooShallow = requireTaggable && chosen && !TAGGABLE.includes(chosen.level);

  return (
    <div className={`node-picker ${compact ? "compact" : ""}`}>
      {levels.map(({ depth, options: opts, selected }) => (
        <select key={depth} value={selected?.id || ""} onChange={(e) => pick(depth, e.target.value)}>
          <option value="">{depth === 0 ? anyLabel : `Any ${LEVEL_LABEL[opts[0].level].toLowerCase()}`}</option>
          {opts.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      ))}
      {tooShallow && <span className="hint warn">Go down to at least a chapter.</span>}
    </div>
  );
}
