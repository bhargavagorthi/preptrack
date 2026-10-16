import { useCallback, useEffect, useState } from "react";
import api from "../../api";
import { SERIES_EXAM_LABEL, EXAM_LABEL } from "../constants";

const when = (iso) =>
  iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const fmtPct = (v) => (v == null ? "—" : `${v}%`);

function MetaFields({ meta, onChange }) {
  return (
    <div className="card form-grid">
      <label className="field">
        <span className="label">Title</span>
        <input value={meta.title} placeholder="e.g. JEE Main 2027 Full Mock Series"
          onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="field">
        <span className="label">Target exam</span>
        <select value={meta.exam} onChange={(e) => onChange({ exam: e.target.value })}>
          {Object.entries(SERIES_EXAM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="field full">
        <span className="label">Description</span>
        <textarea rows={3} value={meta.description} placeholder="What students get from this series, how often tests are added…"
          onChange={(e) => onChange({ description: e.target.value })} />
      </label>
    </div>
  );
}

function Report({ id }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/series/manage/${id}/report`).then((r) => setData(r.data)).catch(() => setData({ error: true }));
  }, [id]);

  if (!data) return <p className="muted">Loading…</p>;
  if (data.error) return <p className="error">Couldn't load the report</p>;

  return (
    <>
      <div className="card">
        <h3>Tests</h3>
        {data.tests.length === 0 ? <p className="muted">No tests in this series.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Test</th><th>Taken by</th><th>Avg. score</th><th>Best</th></tr></thead>
              <tbody>
                {data.tests.map((t, i) => (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td><b>{t.title}</b>{t.is_contest && <span className="tag contest-tag">🏆 Contest</span>}
                      {t.status !== "published" && <span className="tag">Unpublished</span>}</td>
                    <td>{t.taken} / {data.enrolled}</td>
                    <td>{fmtPct(t.avg_pct)}</td>
                    <td>{fmtPct(t.best_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <h3>Enrolled students <span className="count">{data.enrolled}</span></h3>
        {data.students.length === 0 ? <p className="muted">Nobody has enrolled yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Student</th><th>Enrolled</th><th>Completed</th><th>Avg. score</th><th>Last activity</th></tr></thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.name}</b></td>
                    <td className="muted">{when(s.enrolled_at)}</td>
                    <td>{s.completed} / {data.tests.length}{s.in_progress ? <span className="muted"> (+{s.in_progress} in progress)</span> : ""}</td>
                    <td>{fmtPct(s.avg_pct)}</td>
                    <td className="muted">{when(s.last_activity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function SeriesEditor({ id, onBack }) {
  const [series, setSeries] = useState(null);
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState([]);
  const [available, setAvailable] = useState([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("tests");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, av] = await Promise.all([
      api.get(`/series/manage/${id}`),
      api.get("/series/manage/available-tests"),
    ]);
    setSeries(data.series);
    setMeta({ title: data.series.title, description: data.series.description || "", exam: data.series.exam });
    setSelected(data.tests);
    setAvailable(av.data.tests);
    setDirty(false);
  }, [id]);

  useEffect(() => { load().catch(() => setError("Couldn't load the series")); }, [load]);

  if (!series || !meta) return <div className="page"><p className="muted">{error || "Loading…"}</p></div>;

  const selectedIds = new Set(selected.map((t) => t.id));
  const shown = available.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));
  const change = (list) => { setSelected(list); setDirty(true); setNotice(""); };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= selected.length) return;
    const list = [...selected];
    [list[i], list[j]] = [list[j], list[i]];
    change(list);
  };

  async function act(fn, ok) {
    setError(""); setNotice(""); setBusy(true);
    try { await fn(); await load(); if (ok) setNotice(ok); }
    catch (e) { setError(e.response?.data?.error || "Something went wrong"); }
    finally { setBusy(false); }
  }
  const saveAll = async () => {
    await api.patch(`/series/manage/${id}`, meta);
    await api.put(`/series/manage/${id}/tests`, { test_ids: selected.map((t) => t.id) });
  };
  const save = () => act(saveAll, "Saved");
  const publish = () => act(async () => { if (dirty) await saveAll(); await api.post(`/series/manage/${id}/publish`); },
    "Published. Students can now find and enrol in this series.");
  const unpublish = () => act(() => api.post(`/series/manage/${id}/unpublish`), "Moved back to draft. Enrolled students keep their results.");
  async function remove() {
    if (!confirm(`Delete "${series.title}"?`)) return;
    try { await api.delete(`/series/manage/${id}`); onBack(); }
    catch (e) { setError(e.response?.data?.error || "Couldn't delete"); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="link-btn" onClick={() => { if (!dirty || confirm("Discard unsaved changes?")) onBack(); }}>← All series</button>
          <h1>{series.title} <span className={`status status-${series.status}`}>{series.status}</span></h1>
          <p className="muted">{series.enrolled} student{series.enrolled === 1 ? "" : "s"} enrolled</p>
        </div>
        <div className="head-actions">
          {series.status === "published"
            ? <button className="ghost" onClick={unpublish} disabled={busy}>Unpublish</button>
            : <button className="ghost" onClick={remove} disabled={busy}>Delete</button>}
          <button className="ghost" onClick={save} disabled={busy || !dirty}>{dirty ? "Save changes" : "Saved"}</button>
          {series.status !== "published" && <button onClick={publish} disabled={busy || !selected.length}>Publish</button>}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      <div className="seg">
        <button className={tab === "tests" ? "seg-btn active" : "seg-btn"} onClick={() => setTab("tests")}>Details & tests</button>
        <button className={tab === "report" ? "seg-btn active" : "seg-btn"} onClick={() => setTab("report")}>Students & results</button>
      </div>

      {tab === "report" ? <Report id={id} /> : (
        <>
          <MetaFields meta={meta} onChange={(p) => { setMeta((m) => ({ ...m, ...p })); setDirty(true); setNotice(""); }} />
          <div className="builder-cols">
            <div className="card">
              <div className="col-head"><h3>In this series</h3><span className="pill">{selected.length} tests</span></div>
              {selected.length === 0 ? <p className="muted">Add published tests from the right.</p> : (
                <ol className="sel-list">
                  {selected.map((t, i) => (
                    <li key={t.id}>
                      <span className="sel-num">{i + 1}</span>
                      <div className="sel-body">
                        <div className="sel-text"><b>{t.title}</b></div>
                        <div className="q-tags">
                          {t.is_contest && <span className="tag contest-tag">🏆 {when(t.starts_at)}</span>}
                          <span className="tag">{EXAM_LABEL[t.exam]}</span>
                          <span className="tag">{t.question_count} Q · {t.duration_minutes} min</span>
                          {t.status && t.status !== "published" && <span className="tag diff-hard">Unpublished</span>}
                        </div>
                      </div>
                      <div className="sel-actions">
                        <button className="icon" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                        <button className="icon" onClick={() => move(i, 1)} disabled={i === selected.length - 1}>▼</button>
                        <button className="icon" onClick={() => change(selected.filter((x) => x.id !== t.id))}>✕</button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="card">
              <div className="col-head"><h3>Published tests</h3></div>
              <input className="full-input" placeholder="Search tests…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <ul className="pick-list">
                {shown.length === 0 && <li className="muted">No published tests match. Creators publish tests from their Tests page.</li>}
                {shown.map((t) => (
                  <li key={t.id}>
                    <div className="sel-body">
                      <div className="sel-text"><b>{t.title}</b></div>
                      <div className="q-tags">
                        {t.is_contest && <span className="tag contest-tag">🏆 {when(t.starts_at)}</span>}
                        <span className="tag">{EXAM_LABEL[t.exam]}</span>
                        <span className="tag">{t.question_count} Q · {t.total_marks} marks</span>
                      </div>
                    </div>
                    <button className="small" disabled={selectedIds.has(t.id)} onClick={() => change([...selected, t])}>
                      {selectedIds.has(t.id) ? "Added" : "+ Add"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function SeriesManager() {
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", exam: "both" });
  const [error, setError] = useState("");

  const load = () => api.get("/series/manage").then((r) => setList(r.data.series)).catch(() => setError("Couldn't load series"));
  useEffect(() => { load(); }, []);

  if (openId) return <SeriesEditor id={openId} onBack={() => { setOpenId(null); load(); }} />;

  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/series/manage", draft);
      setCreating(false);
      setDraft({ title: "", description: "", exam: "both" });
      setOpenId(data.id);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't create the series");
    }
  }

  if (creating) {
    return (
      <form className="page" onSubmit={create}>
        <div className="page-head">
          <h1>New test series</h1>
          <div className="head-actions">
            <button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button>Create and add tests</button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <MetaFields meta={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      </form>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Test Series</h1>
          <p className="muted">Bundle published tests and contests into a series students can enrol in for free.</p>
        </div>
        <button onClick={() => setCreating(true)}>+ New series</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {!list ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No series yet. Create your first one.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Exam</th><th>Tests</th><th>Enrolled</th><th>Status</th><th>By</th><th></th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.title}</b></td>
                    <td>{SERIES_EXAM_LABEL[s.exam]}</td>
                    <td>{s.test_count}</td>
                    <td>{s.enrolled}</td>
                    <td><span className={`status status-${s.status}`}>{s.status}</span></td>
                    <td className="muted">{s.author}</td>
                    <td className="actions"><button className="ghost" onClick={() => setOpenId(s.id)}>Open</button></td>
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
