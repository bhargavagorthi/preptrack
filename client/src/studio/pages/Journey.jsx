import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../auth/AuthContext";
import ExamSwitch from "../syllabus/ExamSwitch";
import { useSyllabus } from "../syllabus/useSyllabus";
import { SYLLABUS_LABEL } from "../constants";

const STATUS = {
  mastered: { label: "Mastered", icon: "🏆" },
  practising: { label: "Practising", icon: "📘" },
  needs_work: { label: "Needs work", icon: "⚠️" },
  not_started: { label: "Not started", icon: "○" },
};
const CHAPTER_STATUS = {
  mastered: { label: "Mastered", icon: "🏆" },
  in_progress: { label: "In progress", icon: "📘" },
  not_started: { label: "Not started", icon: "○" },
};
// Same subject colours as the Syllabus editor
const SUBJECT_COLORS = ["#2563eb", "#1f9d63", "#e07a1f", "#c2417a", "#1d7fb8", "#7c4dcc"];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function ago(date) {
  if (!date) return "";
  const days = Math.floor((Date.now() - new Date(date)) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

// Animated circular progress
function Ring({ pct = 0, size = 64, stroke = 7, color = "var(--accent)", track = "#e2e8f0", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="jr-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          className="jr-ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ "--c": c, "--o": offset }} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="jr-ring-label">{children ?? `${Math.round(pct)}%`}</div>
    </div>
  );
}

// A row of tiny status dots, one per topic or chapter
function Dots({ items, max = 18 }) {
  return (
    <div className="jr-dots">
      {items.slice(0, max).map((s, i) => <span key={i} className={`jr-dot st-${s}`} />)}
      {items.length > max && <span className="jr-dots-more">+{items.length - max}</span>}
    </div>
  );
}

// Button with a ripple and a spinner while practice is being prepared
function PractiseButton({ onClick, busy, disabled, children, variant = "" }) {
  const [ripple, setRipple] = useState(null);
  function click(e) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });
    onClick();
  }
  return (
    <button className={`jr-btn ${variant} ${busy ? "launching" : ""}`} disabled={disabled || busy} onClick={click}>
      {ripple && <span key={ripple.key} className="jr-ripple" style={{ left: ripple.x, top: ripple.y }} />}
      {busy ? <><span className="jr-spinner" /> Building your set…</> : children}
    </button>
  );
}

function TopicCard({ t, index, color, subtopics, onPractise, busy, anyBusy }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[t.status];
  const action = t.status === "not_started" ? "▶ Start" : t.status === "mastered" ? "↻ Practise again" : "▶ Practise";
  return (
    <div className={`jr-card jr-topic st-${t.status} ${open ? "open" : ""}`} style={{ "--i": index, "--subject": color }}
      onClick={() => subtopics.length && setOpen((o) => !o)}>
      <div className="jr-topic-top">
        <span className={`jr-status st-${t.status}`}>{s.icon} {s.label}</span>
        {t.attempted > 0 && (
          <Ring pct={t.recent_accuracy ?? 0} size={44} stroke={5} color={`var(--st-${t.status})`}>
            <small>{t.recent_accuracy ?? 0}%</small>
          </Ring>
        )}
      </div>
      <h4>{t.name}</h4>
      <div className="jr-topic-meta">
        {t.attempted
          ? <>{t.attempted} answered · last {ago(t.last_practised)}</>
          : t.available ? <>{plural(t.available, "question")} ready</> : <>No questions yet</>}
      </div>
      {subtopics.length > 0 && (
        <button className="jr-link" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
          {open ? "Hide" : "Show"} {plural(subtopics.length, "subtopic")} {open ? "▴" : "▾"}
        </button>
      )}
      <div className="jr-subtopics" aria-hidden={!open}>
        <ul>{subtopics.map((st) => <li key={st.id}>{st.name}</li>)}</ul>
      </div>
      <div className="jr-topic-foot">
        <PractiseButton variant={t.status === "mastered" ? "soft" : ""} busy={busy} disabled={!t.available || anyBusy}
          onClick={() => onPractise(t)}>
          {t.available ? action : "Coming soon"}
        </PractiseButton>
      </div>
    </div>
  );
}

export default function Journey() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const exam = params.get("exam") || user?.target_exam || "jee_main";
  const { tree } = useSyllabus(exam);
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api.get("/student/journey", { params: { exam } })
      .then((r) => alive && setData(r.data))
      .catch(() => alive && setError("Couldn't load your journey"));
    return () => { alive = false; };
  }, [exam]);

  // Where we are lives in the URL, so the back button walks back up
  const nav = (patch) => {
    const next = { exam, ...patch };
    Object.keys(next).forEach((k) => next[k] == null && delete next[k]);
    setParams(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
  };

  const subjects = useMemo(() => data?.subjects || [], [data]);
  const subject = subjects.find((s) => s.id === Number(params.get("subject")))
    || subjects.find((s) => s.total > 0) || subjects[0];
  const cluster = subject?.clusters.find((c) => c.id === Number(params.get("cluster"))) || null;
  const chapter = cluster?.chapters.find((c) => c.id === Number(params.get("chapter"))) || null;
  const colorOf = (s) => SUBJECT_COLORS[Math.max(0, subjects.indexOf(s)) % SUBJECT_COLORS.length];
  const color = subject ? colorOf(subject) : SUBJECT_COLORS[0];

  // Find where a topic lives (for "Next up" → open its chapter)
  const locate = useMemo(() => {
    const m = new Map();
    for (const s of subjects) for (const cl of s.clusters) for (const ch of cl.chapters) {
      for (const t of ch.topics) m.set(t.id, { s, cl, ch });
    }
    return m;
  }, [subjects]);

  async function practise(node) {
    setError("");
    setBusyId(node.id);
    try {
      const { data: res } = await api.post("/student/journey/practice", { node_id: node.id });
      navigate(`/studio/tests/attempt/${res.attempt_id}`);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't start practice");
      setBusyId(null);
    }
  }

  if (error && !data) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) {
    return (
      <div className="page">
        <div className="jr-skeleton hero" />
        <div className="jr-grid">{[0, 1, 2].map((i) => <div key={i} className="jr-skeleton card" />)}</div>
      </div>
    );
  }

  const { overall, next_up, active_practice, rules } = data;
  const nextLoc = next_up ? locate.get(next_up.id) : null;
  const viewKey = `${exam}-${subject?.id}-${cluster?.id || ""}-${chapter?.id || ""}`;

  return (
    <div className="page jr">
      {/* ---------- Header ---------- */}
      <div className="page-head">
        <div>
          <h1>Syllabus Journey</h1>
          <p className="muted">
            Following the <b>{SYLLABUS_LABEL[data.exam]}</b> syllabus. A topic is mastered at {rules.masteredAccuracy}%+
            on your last {rules.recentWindow} answers (minimum {rules.masteredMinAttempted}).
          </p>
        </div>
        <ExamSwitch value={exam} onChange={(e) => setParams({ exam: e })} />
      </div>

      {error && <p className="error">{error}</p>}

      {active_practice && (
        <div className="jr-resume">
          <span className="jr-resume-dot" />
          <span>Practice in progress: <b>{active_practice.title}</b></span>
          <button className="small" onClick={() => navigate(`/studio/tests/attempt/${active_practice.attempt_id}`)}>Resume →</button>
        </div>
      )}

      <div className="jr-hero">
        <div className="jr-overall">
          <Ring pct={overall.progress_pct} size={118} stroke={11}>
            <strong>{overall.progress_pct}%</strong><small>mastered</small>
          </Ring>
          <div className="jr-overall-text">
            <h3>{overall.mastered} of {overall.total} topics mastered</h3>
            <div className="jr-chips">
              {Object.entries(STATUS).map(([k, s]) => (
                <span key={k} className={`jr-chip st-${k}`}>{s.icon} {overall[k]} {s.label.toLowerCase()}</span>
              ))}
            </div>
          </div>
        </div>

        {next_up ? (
          <div className="jr-next" style={{ "--subject": nextLoc ? colorOf(nextLoc.s) : color }}>
            <span className="jr-eyebrow">✨ Next up for you</span>
            <h3>{next_up.name}</h3>
            <div className="jr-next-path">{next_up.subject} › {next_up.chapter}</div>
            <p>{next_up.reason}</p>
            <div className="jr-next-actions">
              <PractiseButton variant="glow" busy={busyId === next_up.id} disabled={busyId != null}
                onClick={() => practise(next_up)}>
                ▶ Practise now
              </PractiseButton>
              {nextLoc && (
                <button className="ghost small" onClick={() => nav({ subject: nextLoc.s.id, cluster: nextLoc.cl.id, chapter: nextLoc.ch.id })}>
                  View chapter
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="jr-next empty">
            <span className="jr-eyebrow">Next up</span>
            <h3>Nothing to practise yet</h3>
            <p>Questions appear here as your teachers add them to the syllabus.</p>
          </div>
        )}
      </div>

      {/* ---------- Subjects ---------- */}
      <div className="jr-subjects">
        {subjects.map((s, i) => (
          <button key={s.id} className={`jr-subject ${s.id === subject?.id ? "active" : ""}`}
            style={{ "--subject": colorOf(s), "--i": i }} onClick={() => nav({ subject: s.id })}>
            <Ring pct={s.progress_pct} size={54} stroke={6} color="#fff" track="rgba(255,255,255,0.28)" />
            <div className="jr-subject-text">
              <b>{s.name}</b>
              <span>{s.counts.mastered}/{s.total} topics mastered</span>
            </div>
          </button>
        ))}
      </div>

      {/* ---------- Breadcrumb ---------- */}
      {subject && cluster && (
        <nav className="syl-crumbs">
          <button className={!cluster ? "crumb active" : "crumb"} onClick={() => nav({ subject: subject.id })}>{subject.name}</button>
          {cluster && <><span className="crumb-sep">›</span>
            <button className={!chapter ? "crumb active" : "crumb"} onClick={() => nav({ subject: subject.id, cluster: cluster.id })}>{cluster.name}</button></>}
          {chapter && <><span className="crumb-sep">›</span><button className="crumb active">{chapter.name}</button></>}
        </nav>
      )}

      <div key={viewKey} className="jr-view">
        {!subject || subject.clusters.length === 0 ? (
          <div className="card empty"><p>No chapters have been added to this subject yet.</p></div>
        ) : chapter ? (
          /* ---------- Chapter: topics ---------- */
          <>
            <div className="jr-chapter-head" style={{ "--subject": color }}>
              <button className="ghost small" onClick={() => nav({ subject: subject.id, cluster: cluster.id })}>← Chapters</button>
              <Ring pct={chapter.progress_pct} size={72} stroke={8} color={color} />
              <div className="jr-chapter-info">
                <span className={`jr-status ch-${chapter.status}`}>{CHAPTER_STATUS[chapter.status].icon} {CHAPTER_STATUS[chapter.status].label}</span>
                <h2>{chapter.name}</h2>
                <span className="muted small">
                  {chapter.counts.mastered}/{chapter.total} topics mastered · {plural(chapter.available, "question")} to practise
                </span>
              </div>
              <PractiseButton variant="big" busy={busyId === chapter.id} disabled={!chapter.available || busyId != null}
                onClick={() => practise(chapter)}>
                {chapter.available ? "▶ Practise whole chapter" : "No questions yet"}
              </PractiseButton>
            </div>
            {chapter.topics.length === 0 ? (
              <div className="card empty"><p>No topics in this chapter yet.</p></div>
            ) : (
              <div className="jr-grid">
                {chapter.topics.map((t, i) => (
                  <TopicCard key={t.id} t={t} index={i} color={color} busy={busyId === t.id} anyBusy={busyId != null}
                    subtopics={tree?.children.get(t.id) || []} onPractise={practise} />
                ))}
              </div>
            )}
          </>
        ) : cluster ? (
          /* ---------- Cluster: chapters ---------- */
          <>
            <div className="jr-section-title">
              <h3>{cluster.name}</h3>
              <span className="muted">{plural(cluster.chapters.length, "chapter")} · {cluster.counts.mastered}/{cluster.total} topics mastered</span>
            </div>
            <div className="jr-grid">
              {cluster.chapters.map((ch, i) => {
                const st = CHAPTER_STATUS[ch.status];
                return (
                  <div key={ch.id} className={`jr-card jr-chapter ch-${ch.status}`} style={{ "--i": i, "--subject": color }}
                    role="button" tabIndex={0} onClick={() => nav({ subject: subject.id, cluster: cluster.id, chapter: ch.id })}
                    onKeyDown={(e) => e.key === "Enter" && nav({ subject: subject.id, cluster: cluster.id, chapter: ch.id })}>
                    <div className="jr-chapter-top">
                      <span className="jr-num">{i + 1}</span>
                      <Ring pct={ch.progress_pct} size={52} stroke={6} color={color} />
                    </div>
                    <h4>{ch.name}</h4>
                    <span className={`jr-status ch-${ch.status}`}>{st.icon} {st.label}</span>
                    <Dots items={ch.topics.map((t) => t.status)} />
                    <div className="jr-card-foot">
                      <span className="muted small">{ch.counts.mastered}/{ch.total} topics · {plural(ch.available, "question")}</span>
                      <span className="jr-open">Open →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* ---------- Subject: clusters ---------- */
          <>
            <div className="jr-section-title">
              <h3>{subject.name}</h3>
              <span className="muted">{plural(subject.clusters.length, "area")} · pick one to see its chapters</span>
            </div>
            <div className="jr-grid wide">
              {subject.clusters.map((cl, i) => (
                <div key={cl.id} className="jr-card jr-cluster" style={{ "--i": i, "--subject": color }}
                  role="button" tabIndex={0} onClick={() => nav({ subject: subject.id, cluster: cl.id })}
                  onKeyDown={(e) => e.key === "Enter" && nav({ subject: subject.id, cluster: cl.id })}>
                  <div className="jr-cluster-band" />
                  <div className="jr-cluster-body">
                    <div className="jr-cluster-head">
                      <div>
                        <h4>{cl.name}</h4>
                        <span className="muted small">{plural(cl.chapters.length, "chapter")} · {plural(cl.total, "topic")}</span>
                      </div>
                      <Ring pct={cl.progress_pct} size={58} stroke={6} color={color} />
                    </div>
                    <ul className="jr-cluster-chapters">
                      {cl.chapters.slice(0, 4).map((ch) => (
                        <li key={ch.id}><span className={`jr-dot ch-${ch.status}`} />{ch.name}</li>
                      ))}
                      {cl.chapters.length > 4 && <li className="more">+{cl.chapters.length - 4} more</li>}
                    </ul>
                    <div className="jr-card-foot">
                      <Dots items={cl.chapters.flatMap((ch) => ch.topics.map((t) => t.status))} max={24} />
                      <span className="jr-open">Explore →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
