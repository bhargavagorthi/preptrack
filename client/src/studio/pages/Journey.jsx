import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../auth/AuthContext";
import ExamSwitch from "../syllabus/ExamSwitch";
import { SYLLABUS_LABEL } from "../constants";

const STATUS = {
  mastered: { label: "Mastered", icon: "🏆" },
  practising: { label: "Practising", icon: "📘" },
  needs_work: { label: "Needs work", icon: "⚠️" },
  not_started: { label: "Not started", icon: "○" },
};

function ago(date) {
  if (!date) return "";
  const days = Math.floor((Date.now() - new Date(date)) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function TopicCard({ t, onPractise, busy }) {
  const s = STATUS[t.status];
  const action = t.status === "not_started" ? "Start" : t.status === "mastered" ? "Practise again" : "Practise";
  return (
    <div className={`topic-card st-${t.status}`}>
      <div className="topic-status">{s.icon} {s.label}</div>
      <div className="topic-name">{t.name}</div>
      <div className="topic-meta muted">
        {t.attempted
          ? <>{t.recent_accuracy}% recent · {t.attempted} answered · {ago(t.last_practised)}</>
          : t.available ? <>{t.available} question{t.available === 1 ? "" : "s"} available</> : <>No questions yet</>}
      </div>
      <button className={t.status === "mastered" ? "ghost small" : "small"} disabled={!t.available || busy}
        onClick={() => onPractise(t)}>
        {busy ? "Starting…" : action}
      </button>
    </div>
  );
}

export default function Journey() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [exam, setExam] = useState(user?.target_exam || "jee_main");
  const [data, setData] = useState(null);
  const [subjectId, setSubjectId] = useState(null);
  const [open, setOpen] = useState(() => new Set()); // expanded chapters
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api.get("/student/journey", { params: { exam } })
      .then((r) => {
        setData(r.data);
        const first = r.data.subjects.find((s) => s.total > 0) || r.data.subjects[0];
        setSubjectId(first?.id ?? null);
        // Open the chapters the student has already started
        const started = r.data.subjects.flatMap((s) => s.clusters.flatMap((cl) => cl.chapters))
          .filter((c) => c.status === "in_progress").map((c) => c.id);
        setOpen(new Set(started));
      })
      .catch(() => setError("Couldn't load your journey"));
  }, [exam]);

  const toggleChapter = (id) => setOpen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  async function practise(t) {
    setError("");
    setBusyId(t.id);
    try {
      const { data: res } = await api.post("/student/journey/practice", { node_id: t.id });
      navigate(`/studio/tests/attempt/${res.attempt_id}`);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't start practice");
      setBusyId(null);
    }
  }

  if (error && !data) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>;

  const { overall, subjects, next_up, active_practice, rules } = data;
  const subject = subjects.find((s) => s.id === subjectId);

  return (
    <div className="page">
      <div>
        <div className="page-head">
          <h1>Syllabus Journey</h1>
          <ExamSwitch value={exam} onChange={setExam} />
        </div>
        <p className="muted">
          Following the <b>{SYLLABUS_LABEL[data.exam]}</b> syllabus.
          Master every topic. A topic is mastered at {rules.masteredAccuracy}%+ accuracy on your last {rules.recentWindow} answers
          (minimum {rules.masteredMinAttempted}).
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      {active_practice && (
        <div className="note resume-bar">
          <span>You have a practice session in progress: <b>{active_practice.title}</b></span>
          <button className="small" onClick={() => navigate(`/studio/tests/attempt/${active_practice.attempt_id}`)}>Resume</button>
        </div>
      )}

      <div className="journey-top">
        <div className="card journey-overall">
          <span className="muted">Topics mastered</span>
          <strong>{overall.mastered} <small>/ {overall.total}</small></strong>
          <div className="xp-track"><div className="xp-fill" style={{ width: `${overall.progress_pct}%` }} /></div>
          <div className="status-chips">
            {Object.entries(STATUS).map(([k, s]) => (
              <span key={k} className={`chip st-${k}`}>{s.icon} {overall[k]} {s.label.toLowerCase()}</span>
            ))}
          </div>
        </div>

        {next_up && (
          <div className="card next-up">
            <span className="muted small-caps">Next up</span>
            <h3>{next_up.name}</h3>
            <div className="muted small">{next_up.subject} › {next_up.chapter}</div>
            <p>{next_up.reason}</p>
            <button onClick={() => practise(next_up)} disabled={busyId != null}>
              {busyId === next_up.id ? "Starting…" : `Practise ${next_up.name}`}
            </button>
          </div>
        )}
      </div>

      <div className="seg subject-tabs">
        {subjects.map((s) => (
          <button key={s.id} className={s.id === subjectId ? "seg-btn active" : "seg-btn"} onClick={() => setSubjectId(s.id)}>
            {s.name} <span className="tab-pct">{s.progress_pct}%</span>
          </button>
        ))}
      </div>

      {!subject || subject.clusters.every((cl) => cl.chapters.length === 0) ? (
        <div className="card empty"><p>No chapters have been added to this subject yet.</p></div>
      ) : (
        subject.clusters.filter((cl) => cl.chapters.length).map((cl) => (
          <section key={cl.id} className="cluster-block">
            <div className="cluster-head">
              <h2>{cl.name}</h2>
              <span className="muted">{cl.counts.mastered} / {cl.total} topics mastered</span>
              <div className="xp-track thin"><div className="xp-fill" style={{ width: `${cl.progress_pct}%` }} /></div>
            </div>
            <div className="journey-path">
              {cl.chapters.map((c) => {
                const number = subject.clusters.flatMap((x) => x.chapters).indexOf(c) + 1;
                const isOpen = open.has(c.id);
                return (
                  <div key={c.id} className={`chapter-node ch-${c.status}`}>
                    <div className="node-dot">{c.status === "mastered" ? "✓" : number}</div>
                    <div className="card chapter-body">
                      <div className="chapter-head">
                        <h3 className="clickable" onClick={() => toggleChapter(c.id)}>
                          {isOpen ? "▾" : "▸"} {c.name}
                        </h3>
                        <span className="muted">{c.counts.mastered} / {c.total} mastered</span>
                      </div>
                      <div className="xp-track thin"><div className="xp-fill" style={{ width: `${c.progress_pct}%` }} /></div>
                      <div className="chapter-actions">
                        <button className="ghost small" onClick={() => toggleChapter(c.id)}>
                          {isOpen ? "Hide topics" : `Show ${c.total} topic${c.total === 1 ? "" : "s"}`}
                        </button>
                        <button className="small" disabled={!c.available || busyId != null} onClick={() => practise(c)}
                          title={c.available ? `${c.available} questions available` : "No questions yet"}>
                          {busyId === c.id ? "Starting…" : c.available ? "Practise whole chapter" : "No questions yet"}
                        </button>
                      </div>
                      {isOpen && (c.topics.length === 0 ? (
                        <p className="muted">No topics in this chapter yet.</p>
                      ) : (
                        <div className="topic-grid">
                          {c.topics.map((t) => (
                            <TopicCard key={t.id} t={t} onPractise={practise} busy={busyId === t.id} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
