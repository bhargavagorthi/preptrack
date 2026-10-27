import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api";
import MathText from "../components/MathText";
import { FxButton, CountUp } from "../components/Fx";
import { TYPE_LABEL } from "../constants";

const ago = (d) => {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : new Date(d).toLocaleDateString([], { day: "numeric", month: "short" });
};

function Answer({ q }) {
  const mine = q.last_response;
  if (q.type === "numerical") {
    return (
      <div className="num-review">
        {mine && <span>Your answer: <b>{mine.value ?? "—"}</b></span>}
        <span>Correct answer: <b>{q.answer.value}</b>{q.answer.tolerance ? ` (± ${q.answer.tolerance})` : ""}</span>
      </div>
    );
  }
  const picked = Array.isArray(mine) ? mine : [];
  return (
    <ol className="q-options">
      {q.options.map((opt) => {
        const isKey = q.answer.includes(opt.id);
        const isMine = picked.includes(opt.id);
        return (
          <li key={opt.id} className={`${isKey ? "correct" : ""} ${isMine && !isKey ? "picked-wrong" : ""}`}>
            <b>{opt.id}.</b> <MathText text={opt.text} />{opt.image && <img className="opt-image" src={opt.image} alt={"Option " + opt.id} />}
            {isMine && <span className="your-pick">Your answer</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Entry({ q, index, view, selected, onSelect, onChange, notify }) {
  const [note, setNote] = useState(q.note || "");
  const [savedNote, setSavedNote] = useState(q.note || "");
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function saveNote() {
    if (note.trim() === (savedNote || "").trim()) return;
    setSaving(true);
    try {
      await api.put(`/student/notebook/${q.id}`, { note });
      setSavedNote(note);
      onChange(q.id, { note });
      notify("✓ Note saved");
    } catch (e) {
      notify(e.response?.data?.error || "Couldn't save the note", true);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status) {
    // let the card slide out of the list it no longer belongs to
    if (view === "mistakes") setLeaving(true);
    try {
      await api.put(`/student/notebook/${q.id}`, { status });
      setTimeout(() => onChange(q.id, { status }, view === "mistakes"), view === "mistakes" ? 280 : 0);
      notify(status === "fixed" ? "✓ Marked as fixed" : "Moved back to open");
    } catch (e) {
      setLeaving(false);
      notify(e.response?.data?.error || "Couldn't update", true);
    }
  }

  async function toggleBookmark() {
    const next = !q.bookmarked;
    if (view === "bookmarks" && !next) setLeaving(true);
    try {
      if (next) await api.post(`/student/notebook/bookmarks/${q.id}`);
      else await api.delete(`/student/notebook/bookmarks/${q.id}`);
      setTimeout(() => onChange(q.id, { bookmarked: next }, view === "bookmarks" && !next), view === "bookmarks" && !next ? 280 : 0);
      notify(next ? "★ Bookmarked" : "Bookmark removed");
    } catch (e) {
      setLeaving(false);
      notify(e.response?.data?.error || "Couldn't update", true);
    }
  }

  return (
    <article className={`nb-card ${selected ? "selected" : ""} ${leaving ? "leaving" : ""} ${q.status === "fixed" ? "fixed" : ""}`} style={{ "--i": Math.min(index, 12) }}>
      <div className="nb-top">
        <label className="nb-check" title="Select for practice">
          <input type="checkbox" checked={selected} onChange={() => onSelect(q.id)} />
          <span />
        </label>
        <div className="nb-tags">
          <span className="ts-tag">{q.subject}{q.chapter ? ` › ${q.chapter}` : ""}{q.topic && q.topic !== q.chapter ? ` › ${q.topic}` : ""}</span>
          <span className="ts-tag">{TYPE_LABEL[q.type]}</span>
          {q.difficulty && <span className={`ts-tag diff-${q.difficulty}`}>{q.difficulty}</span>}
          {q.times_wrong > 0 && <span className="nb-wrong">✗ wrong {q.times_wrong}× · {ago(q.last_wrong_at)}</span>}
          {q.right_since && <span className="nb-right">✓ right since</span>}
        </div>
        <button type="button" className={`nb-star ${q.bookmarked ? "on" : ""}`} onClick={toggleBookmark}
          aria-label={q.bookmarked ? "Remove bookmark" : "Bookmark"} title={q.bookmarked ? "Remove bookmark" : "Bookmark"}>
          {q.bookmarked ? "★" : "☆"}
        </button>
      </div>

      <MathText as="p" className="q-text" text={q.text} />
      {q.image_url && <img className="q-image" src={q.image_url} alt="Question figure" />}
      <Answer q={q} />
      {q.solution && (
        <details className="solution">
          <summary>Solution</summary>
          <MathText as="p" text={q.solution} />
        </details>
      )}

      <div className="nb-note">
        <textarea rows={2} value={note} placeholder="Your note: what went wrong, the trick to remember…"
          maxLength={2000} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} aria-label="Your note" />
        <small>{saving ? "Saving…" : note !== savedNote ? "Saves when you click away" : savedNote ? "✓ Saved" : ""}</small>
      </div>

      {(view === "mistakes" || q.times_wrong > 0) && (
        <div className="nb-actions">
          {q.status === "fixed"
            ? <button type="button" className="ghost small" onClick={() => setStatus("open")}>↺ Reopen</button>
            : <button type="button" className="nb-fix" onClick={() => setStatus("fixed")}>✓ I've got this now</button>}
        </div>
      )}
    </article>
  );
}

export default function Notebook() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "bookmarks" ? "bookmarks" : "mistakes";
  const status = view === "mistakes" ? (params.get("status") === "fixed" ? "fixed" : "open") : null;
  const subject = params.get("subject") || "";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    const q = { view };
    if (status) q.status = status;
    if (subject) q.subject = subject;
    return api.get("/student/notebook", { params: q })
      .then((r) => setData(r.data))
      .catch(() => setError("Couldn't load your notebook"));
  }, [view, status, subject]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = (text, bad) => setToast({ text, bad, key: Date.now() });
  const go = (next) => {
    setSelected([]);
    const p = { ...Object.fromEntries(params), ...next };
    Object.keys(p).forEach((k) => (p[k] == null || p[k] === "") && delete p[k]);
    setParams(p);
  };
  function change(id, patch, remove) {
    setData((d) => {
      const counts = { ...d.counts };
      if (patch.status === "fixed") { counts.open--; counts.fixed++; }
      if (patch.status === "open") { counts.open++; counts.fixed--; }
      if (patch.bookmarked === true) counts.bookmarks++;
      if (patch.bookmarked === false) counts.bookmarks--;
      const items = remove ? d.items.filter((i) => i.id !== id) : d.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
      return { ...d, items, counts };
    });
    if (remove) setSelected((s) => s.filter((x) => x !== id));
  }
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 25 ? s : [...s, id]));

  async function practise(ids) {
    setBusy(true);
    try {
      const { data: res } = await api.post("/student/notebook/practice", ids ? { question_ids: ids } : {});
      if (res.resumed) notify("You already have a practice set open. Taking you there.");
      navigate(`/studio/tests/attempt/${res.attempt_id}`);
    } catch (e) {
      notify(e.response?.data?.error || "Couldn't start practice", true);
      setBusy(false);
    }
  }

  if (error) return <div className="page"><p className="error">{error}</p></div>;

  const counts = data?.counts || { open: 0, fixed: 0, bookmarks: 0 };
  const items = data?.items || [];

  return (
    <div className="page nb">
      <div className="nb-banner">
        <div>
          <span className="db-eyebrow">Your notebook</span>
          <h1>Learn from every mistake</h1>
          <p>Every question you got wrong lands here automatically. Add a note, practise them again, and tick them off once they click.</p>
        </div>
        <div className="sr-banner-stats">
          <div><strong><CountUp value={counts.open} /></strong><small>to revise</small></div>
          <div><strong><CountUp value={counts.fixed} /></strong><small>fixed</small></div>
          <div><strong><CountUp value={counts.bookmarks} /></strong><small>bookmarked</small></div>
        </div>
      </div>

      <div className="nb-bar">
        <div className="lb-tabs nb-tabs" role="tablist">
          <button role="tab" aria-selected={view === "mistakes" && status === "open"} className={view === "mistakes" && status === "open" ? "active" : ""}
            onClick={() => go({ view: null, status: null, subject: null })}>✗ To revise <span>{counts.open}</span></button>
          <button role="tab" aria-selected={status === "fixed"} className={status === "fixed" ? "active" : ""}
            onClick={() => go({ view: null, status: "fixed", subject: null })}>✓ Fixed <span>{counts.fixed}</span></button>
          <button role="tab" aria-selected={view === "bookmarks"} className={view === "bookmarks" ? "active" : ""}
            onClick={() => go({ view: "bookmarks", status: null, subject: null })}>★ Bookmarks <span>{counts.bookmarks}</span></button>
        </div>
        {view === "mistakes" && status === "open" && counts.open > 0 && (
          <FxButton variant="glow-dark" busy={busy && !selected.length} busyText="Building your set…" onClick={() => practise(null)}>
            ▶ Practise my top 10 mistakes
          </FxButton>
        )}
      </div>

      {data && data.subjects.length > 1 && (
        <div className="ts-filters">
          <button className={`ts-filter ${!subject ? "active" : ""}`} onClick={() => go({ subject: null })}>All subjects</button>
          {data.subjects.map((s) => (
            <button key={s} className={`ts-filter ${subject === s ? "active" : ""}`} onClick={() => go({ subject: s })}>{s}</button>
          ))}
        </div>
      )}

      {!data ? (
        <div className="jr-grid wide">{[0, 1].map((i) => <div key={i} className="jr-skeleton card" />)}</div>
      ) : items.length === 0 ? (
        <div className="card db-empty big">
          <span>{view === "bookmarks" ? "★" : status === "fixed" ? "🩹" : "🎉"}</span>
          <p>
            {view === "bookmarks"
              ? "No bookmarks yet. Tap ☆ on any question when you review a test result."
              : status === "fixed"
                ? "Nothing marked as fixed yet. When a mistake finally clicks, tick it off."
                : "No mistakes to revise. Take a test and any question you get wrong will show up here."}
          </p>
        </div>
      ) : (
        <div key={`${view}-${status}-${subject}`} className="nb-list">
          {items.map((q, i) => (
            <Entry key={q.id} q={q} index={i} view={view} selected={selected.includes(q.id)}
              onSelect={toggle} onChange={change} notify={notify} />
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="nb-float" role="region" aria-label="Selected questions">
          <b>{selected.length} selected</b>
          {selected.length >= 25 && <small>That's the most for one set</small>}
          <button type="button" className="ghost small" onClick={() => setSelected([])}>Clear</button>
          <FxButton busy={busy} busyText="Building…" onClick={() => practise(selected)}>▶ Practise these</FxButton>
        </div>
      )}
      {toast && <div key={toast.key} className={`st-toast ${toast.bad ? "bad" : ""}`}>{toast.text}</div>}
    </div>
  );
}
