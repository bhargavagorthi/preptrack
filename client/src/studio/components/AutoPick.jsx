import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../api";
import { TYPE_LABEL, SYLLABUS_EXAMS, SYLLABUS_LABEL } from "../constants";
import NodeChecklist, { NodeChips } from "../syllabus/NodeChecklist";
import { useSyllabus } from "../syllabus/useSyllabus";

const DIFFS = ["easy", "medium", "hard"];
// Ways to split a row's total across difficulties
const MIXES = {
  balanced: { label: "Balanced 30 / 50 / 20", split: [0.3, 0.5, 0.2] },
  gentle: { label: "Gentle 50 / 40 / 10", split: [0.5, 0.4, 0.1] },
  tough: { label: "Tough 20 / 40 / 40", split: [0.2, 0.4, 0.4] },
};
let nextKey = 1;
const newRow = (patch = {}) => ({ key: nextKey++, node_ids: [], type: "", easy: 0, medium: 0, hard: 0, ...patch });
const rowTotal = (r) => DIFFS.reduce((n, d) => n + (Number(r[d]) || 0), 0);

// Split n by ratios, keeping whole numbers that add up to n (largest remainder)
function splitBy(n, ratios) {
  const raw = ratios.map((x) => x * n);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
  return Object.fromEntries(DIFFS.map((d, i) => [d, out[i]]));
}

function Availability({ avail, row, fillShort }) {
  if (!row.node_ids.length) return <p className="hint">Choose where these questions come from.</p>;
  if (!avail) return <p className="hint">Checking how many questions there are…</p>;
  const shortBy = DIFFS.map((d) => [d, Math.max(0, (Number(row[d]) || 0) - avail[d])]).filter(([, n]) => n);
  const totalShort = rowTotal(row) - avail.total;
  return (
    <p className={`hint ap-avail ${shortBy.length ? "warn" : ""}`}>
      Available: {DIFFS.map((d) => <span key={d} className={(Number(row[d]) || 0) > avail[d] ? "ap-short" : ""}>{avail[d]} {d}</span>)
        .reduce((acc, el, i) => (i ? [...acc, " · ", el] : [el]), [])}
      {shortBy.length > 0 && (
        totalShort > 0
          ? <> — not enough questions here; the row will be {totalShort} short.</>
          : fillShort
            ? <> — {shortBy.map(([d, n]) => `${n} ${d}`).join(", ")} will be filled from the nearest difficulty.</>
            : <> — {shortBy.map(([d, n]) => `${n} ${d}`).join(", ")} short.</>
      )}
    </p>
  );
}

// "Build this test from the syllabus": rows of { where from, type, easy/medium/hard counts }
export default function AutoPick({ defaultExam, testId, excludeIds, onPicked }) {
  const [exam, setExam] = useState(defaultExam);
  const [rows, setRows] = useState(() => [newRow({ easy: 3, medium: 5, hard: 2 })]);
  const [opts, setOpts] = useState({ spread: true, prefer_fresh: true, fill_short: true, order: "shuffle" });
  const [mode, setMode] = useState("add");
  const [pickerFor, setPickerFor] = useState(null);
  const [avail, setAvail] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { tree } = useSyllabus(exam);

  const total = rows.reduce((n, r) => n + rowTotal(r), 0);
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Live "available" counts whenever where-from or type changes
  const availKey = JSON.stringify([exam, rows.map((r) => [r.key, r.node_ids, r.type]), mode === "add" ? excludeIds : []]);
  const lastKey = useRef("");
  useEffect(() => {
    if (availKey === lastKey.current) return;
    const ready = rows.filter((r) => r.node_ids.length);
    if (!ready.length) return;
    const t = setTimeout(() => {
      lastKey.current = availKey;
      api.post("/tests/autopick/availability", {
        exam, test_id: testId, exclude_ids: mode === "add" ? excludeIds : [],
        rows: ready.map((r) => ({ node_ids: r.node_ids, type: r.type })),
      }).then(({ data }) => {
        setAvail((a) => ({ ...a, ...Object.fromEntries(ready.map((r, i) => [r.key, data.rows[i]])) }));
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [availKey, rows, exam, testId, excludeIds, mode]);

  // Ready-made layouts
  const subjects = useMemo(() => (tree ? tree.roots : []), [tree]);
  function presetJeeMain() {
    setRows(subjects.flatMap((s) => [
      newRow({ node_ids: [s.id], type: "single", easy: 6, medium: 10, hard: 4 }),
      newRow({ node_ids: [s.id], type: "numerical", easy: 1, medium: 3, hard: 1 }),
    ]));
  }
  function presetChapter() {
    setRows([newRow({ easy: 5, medium: 8, hard: 2 })]);
  }
  function applyMix(row, key) {
    const n = rowTotal(row) || 10;
    setRow(row.key, splitBy(n, MIXES[key].split));
  }

  async function run() {
    setError("");
    const bad = rows.findIndex((r) => !r.node_ids.length || !rowTotal(r));
    if (bad >= 0) return setError(`Row ${bad + 1}: choose where questions come from and how many`);
    setBusy(true);
    try {
      const { data } = await api.post("/tests/autopick", {
        exam, test_id: testId, ...opts,
        exclude_ids: mode === "add" ? excludeIds : [],
        rows: rows.map((r) => ({ node_ids: r.node_ids, type: r.type, easy: Number(r.easy) || 0, medium: Number(r.medium) || 0, hard: Number(r.hard) || 0 })),
      });
      const picked = data.rows.flatMap((r) => r.questions);
      // A short report the builder shows after filling the test
      const label = (i) => {
        const r = rows[i];
        const names = r.node_ids.map((id) => tree?.byId.get(id)?.name).filter(Boolean);
        return `${names.slice(0, 2).join(", ")}${names.length > 2 ? "…" : ""}${r.type ? ` (${TYPE_LABEL[r.type].toLowerCase()})` : ""}`;
      };
      const notes = [];
      data.rows.forEach((r, i) => {
        if (r.missing) notes.push(`${label(i)}: ${r.missing} short, not enough questions`);
        if (r.borrowed) notes.push(`${label(i)}: ${r.borrowed} taken from a nearby difficulty`);
        if (r.reused) notes.push(`${label(i)}: ${r.reused} already used in other tests`);
      });
      onPicked(picked, mode, { asked: total, got: picked.length, notes });
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't pick questions");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap">
      <div className="ap-top">
        <label className="field">
          <span className="label">Syllabus</span>
          <select value={exam} onChange={(e) => { setExam(e.target.value); setRows([newRow({ easy: 3, medium: 5, hard: 2 })]); setAvail({}); }}>
            {SYLLABUS_EXAMS.map((e) => <option key={e} value={e}>{SYLLABUS_LABEL[e]}</option>)}
          </select>
        </label>
        <div className="ap-presets">
          <span className="label">Start from</span>
          <button type="button" className="ghost small" onClick={presetJeeMain} disabled={!subjects.length}
            title="Each subject: 20 single-correct + 5 numerical">📄 JEE Main paper (75)</button>
          <button type="button" className="ghost small" onClick={presetChapter}>📘 Chapter test (15)</button>
        </div>
      </div>

      <div className="ap-rows">
        {rows.map((r, i) => (
          <div className="ap-row" key={r.key}>
            <div className="ap-row-head">
              <b>Row {i + 1}</b>
              <span className="ap-row-total">{rowTotal(r)} question{rowTotal(r) === 1 ? "" : "s"}</span>
              {rows.length > 1 && (
                <button type="button" className="icon" title="Remove row" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>✕</button>
              )}
            </div>
            <div className="ap-where">
              <NodeChips exam={exam} value={r.node_ids} onRemove={(id) => setRow(r.key, { node_ids: r.node_ids.filter((x) => x !== id) })} />
              <button type="button" className="ghost small" onClick={() => setPickerFor(r.key)}>
                {r.node_ids.length ? "+ Add more" : "Choose subjects, chapters or topics…"}
              </button>
            </div>
            {pickerFor === r.key && (
              <NodeChecklist exam={exam} value={r.node_ids} onChange={(ids) => setRow(r.key, { node_ids: ids })} onClose={() => setPickerFor(null)} />
            )}
            <div className="ap-counts">
              <label className="ap-type">
                <span className="label">Type</span>
                <select value={r.type} onChange={(e) => setRow(r.key, { type: e.target.value })}>
                  <option value="">Any type</option>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              {DIFFS.map((d) => (
                <label key={d} className={`ap-num ap-${d}`}>
                  <span className="label">{d}</span>
                  <input type="number" min="0" max="150" value={r[d]}
                    onChange={(e) => setRow(r.key, { [d]: e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))) })} />
                </label>
              ))}
              <label className="ap-mix">
                <span className="label">Quick mix</span>
                <select value="" onChange={(e) => e.target.value && applyMix(r, e.target.value)}>
                  <option value="">Split total…</option>
                  {Object.entries(MIXES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </label>
            </div>
            <Availability avail={avail[r.key]} row={r} fillShort={opts.fill_short} />
          </div>
        ))}
        <button type="button" className="ghost small ap-add" onClick={() => setRows((rs) => [...rs, newRow({ node_ids: rs[rs.length - 1]?.node_ids || [] })])}>
          + Add a row
        </button>
        <p className="hint">Tip: for “20 single-correct + 5 numerical from Physics”, use two rows over the same chapters. Rows never repeat a question.</p>
      </div>

      <details className="ap-opts">
        <summary>Options</summary>
        <label className="toggle"><input type="checkbox" checked={opts.spread} onChange={(e) => setOpts({ ...opts, spread: e.target.checked })} />
          Spread questions evenly across the chosen chapters and topics</label>
        <label className="toggle"><input type="checkbox" checked={opts.prefer_fresh} onChange={(e) => setOpts({ ...opts, prefer_fresh: e.target.checked })} />
          Prefer questions not used in other tests</label>
        <label className="toggle"><input type="checkbox" checked={opts.fill_short} onChange={(e) => setOpts({ ...opts, fill_short: e.target.checked })} />
          If a difficulty runs short, fill from the nearest difficulty</label>
        <label className="toggle">Order within each row
          <select value={opts.order} onChange={(e) => setOpts({ ...opts, order: e.target.value })}>
            <option value="shuffle">Shuffled</option>
            <option value="easy_first">Easy → hard</option>
          </select>
        </label>
      </details>

      {error && <p className="error">{error}</p>}
      <div className="ap-go">
        <div className="seg seg-sm">
          {[["add", "Add to the test"], ["replace", "Replace current questions"]].map(([v, l]) => (
            <button type="button" key={v} className={mode === v ? "seg-btn active" : "seg-btn"} onClick={() => setMode(v)}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={run} disabled={busy || !total}>
          {busy ? "Picking…" : `⚡ Pick ${total} question${total === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
