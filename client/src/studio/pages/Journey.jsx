// Syllabus Journey as a game map: worlds (clusters) of levels (chapters) along a path.
// Levels unlock as earlier ones are mastered, but any level can be opened at any time.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../auth/AuthContext";
import ExamSwitch from "../syllabus/ExamSwitch";
import { useSyllabus } from "../syllabus/useSyllabus";
import { SYLLABUS_LABEL } from "../constants";
import { FxButton, CountUp } from "../components/Fx";
import { SUBJECT_COLORS } from "../components/fxUtils";

const ICONS = { physics: "⚛️", chemistry: "🧪", mathematics: "📐", maths: "📐" };
const NAMED = { physics: "#2563eb", chemistry: "#1f9d63", mathematics: "#e07a1f", maths: "#e07a1f" };
const WORLD_ICONS = ["🏝️", "🌋", "🏔️", "🌌", "🏜️", "🌊", "🌲", "🛰️", "🏰", "🔭"];
const colorOf = (s, i) => NAMED[s.name.toLowerCase()] || SUBJECT_COLORS[i % SUBJECT_COLORS.length];
const ROW = 132;                     // vertical space per level on the map
const XS = [50, 76, 50, 24];         // zig-zag positions (% of the map width)

function Stars({ n, size = 16, label = true }) {
  return (
    <span className="gm-stars" style={{ fontSize: size }} aria-label={label ? `${n} of 3 stars` : undefined}>
      {[0, 1, 2].map((i) => <span key={i} className={i < n ? "on" : ""} style={{ "--i": i }}>★</span>)}
    </span>
  );
}

// ------------------------------------------------------------------ one world on the map
function World({ w, index, color, currentId, onOpen, numberFrom }) {
  const chapters = w.chapters;
  const pts = chapters.map((_, i) => ({ x: XS[i % XS.length], y: 70 + i * ROW }));
  const height = 70 + Math.max(0, chapters.length - 1) * ROW + 90;
  // Smooth path through the level positions
  const d = pts.map((p, i) => {
    if (!i) return `M ${p.x} ${p.y}`;
    const q = pts[i - 1];
    const my = (q.y + p.y) / 2;
    return `C ${q.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`;
  }).join(" ");
  // Coloured trail runs up to the last level that isn't locked
  let reach = -1;
  chapters.forEach((c, i) => { if (c.lock.state !== "locked" && c.lock.state !== "coming_soon") reach = i; });
  const trail = pts.slice(0, reach + 1).map((p, i, arr) => {
    if (!i) return `M ${p.x} ${p.y}`;
    const q = arr[i - 1];
    const my = (q.y + p.y) / 2;
    return `C ${q.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`;
  }).join(" ");
  const locked = w.lock.state === "locked";
  const soon = w.lock.state === "coming_soon";

  return (
    <section className={`gm-world ${locked ? "locked" : ""} ${soon ? "soon" : ""}`} style={{ "--subject": color, "--i": index }}>
      <header className="gm-world-banner">
        <span className="gm-world-icon" aria-hidden="true">{WORLD_ICONS[index % WORLD_ICONS.length]}</span>
        <div className="gm-world-title">
          <small>World {index + 1}</small>
          <b>{w.name}</b>
        </div>
        <div className="gm-world-score">
          {soon ? <span className="gm-chip">Coming soon</span>
            : locked ? <span className="gm-chip lock">🔒 {w.lock.hint}</span>
              : <><span className="gm-world-stars">★ {w.stars}<small>/{w.max_stars}</small></span>
                <small>{w.cleared_chapters}/{w.playable_chapters} cleared</small></>}
        </div>
      </header>
      {soon ? (
        <div className="gm-soon-list">
          <span>🛠️ {w.chapters.length} level{w.chapters.length === 1 ? "" : "s"} being built:</span>
          {w.chapters.map((c) => <span key={c.id} className="gm-soon-chip">{c.name}</span>)}
        </div>
      ) : (
      <div className="gm-map" style={{ height }}>
        <svg className="gm-path" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={d} className="gm-path-base" vectorEffect="non-scaling-stroke" />
          {reach > 0 && <path d={trail} className="gm-path-trail" vectorEffect="non-scaling-stroke" />}
        </svg>
        {chapters.map((c, i) => {
          const state = c.lock.state;
          const here = c.id === currentId;
          const cls = [
            "gm-level",
            state === "coming_soon" ? "soon" : state,
            c.cleared ? "cleared" : "",
            c.stars === 3 ? "perfect" : "",
            here ? "here" : "",
          ].join(" ");
          return (
            <div key={c.id} className="gm-level-wrap" style={{ left: `${pts[i].x}%`, top: pts[i].y, "--i": i }}>
              {here && <span className="gm-you" aria-hidden="true">YOU</span>}
              <button type="button" className={cls} onClick={() => onOpen(c)}
                aria-label={`Level ${numberFrom + i}: ${c.name}. ${state === "locked" ? "Locked. " : ""}${c.stars} of 3 stars`}>
                <span className="gm-level-face">
                  {state === "locked" ? "🔒" : state === "coming_soon" ? "…" : c.stars === 3 ? "👑" : numberFrom + i}
                </span>
                {state === "early" && <span className="gm-key" title="Opened early">🔑</span>}
              </button>
              <div className="gm-level-label">
                <b>{c.name}</b>
                {state === "coming_soon" ? <small>Soon</small> : <Stars n={c.stars} size={13} />}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ the level card (chapter)
function LevelSheet({ chapter, world, number, color, subtopicsOf, busyId, onClose, onPractise, onUnlock }) {
  const [unlocking, setUnlocking] = useState(false);
  const [askTopic, setAskTopic] = useState(null);
  const [openTopic, setOpenTopic] = useState(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const locked = chapter.lock.state === "locked";
  const soon = chapter.lock.state === "coming_soon";
  const playable = chapter.topics.filter((t) => t.available > 0);
  const mastered = playable.filter((t) => t.status === "mastered").length;

  async function jumpIn() {
    setUnlocking(true);
    await new Promise((r) => setTimeout(r, 900)); // let the padlock animation play
    await onUnlock(chapter);
    setUnlocking(false);
  }
  async function playTopic(t) {
    if (t.lock.state === "locked") { setAskTopic(t.id); return; }
    onPractise(t);
  }

  return (
    <div className="fx-overlay gm-overlay" onClick={onClose}>
      <div className="gm-sheet" role="dialog" aria-modal="true" aria-label={chapter.name} style={{ "--subject": color }}
        onClick={(e) => e.stopPropagation()}>
        <header className="gm-sheet-head">
          <div className="gm-sheet-badge">{chapter.stars === 3 ? "👑" : number}</div>
          <div className="gm-sheet-title">
            <small>{world.name} · Level {number}</small>
            <h2>{chapter.name}</h2>
            <Stars n={chapter.stars} size={22} />
          </div>
          <button type="button" className="gm-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {soon ? (
          <div className="gm-lockscreen soon">
            <span className="gm-bigicon">🛠️</span>
            <p><b>Coming soon.</b> Questions for this chapter are being added. Check back shortly.</p>
          </div>
        ) : locked ? (
          <div className={`gm-lockscreen ${unlocking ? "opening" : ""}`}>
            <span className="gm-padlock" aria-hidden="true">{unlocking ? "🔓" : "🔒"}</span>
            <p><b>This level is locked.</b> {chapter.lock.hint}.</p>
            <p className="muted">You can still jump in now. Unlocking is a suggested path, not a rule.</p>
            <div className="gm-lock-actions">
              <button type="button" className="ghost" onClick={onClose}>Back to the map</button>
              <FxButton variant="big" busy={unlocking} busyText="Unlocking…" onClick={jumpIn}>🔓 Jump in anyway</FxButton>
            </div>
          </div>
        ) : (
          <>
            {chapter.lock.state === "early" && <p className="gm-early">🔑 Opened early. {chapter.lock.hint}.</p>}
            <div className="gm-sheet-progress">
              <div className="gm-xp"><span style={{ width: `${playable.length ? (mastered / playable.length) * 100 : 0}%` }} /></div>
              <small>{mastered} of {playable.length} topics mastered · ★★ clears the level</small>
            </div>

            <ol className="gm-topics">
              {chapter.topics.map((t, i) => {
                const st = t.lock.state;
                const subs = subtopicsOf(t.id);
                return (
                  <li key={t.id} className={`gm-topic ${st} st-${t.status}`} style={{ "--i": i }}>
                    <span className="gm-topic-node">{st === "locked" ? "🔒" : st === "coming_soon" ? "…" : t.stars === 3 ? "✓" : i + 1}</span>
                    <div className="gm-topic-body">
                      <b>{t.name}</b>
                      <div className="gm-topic-meta">
                        {st === "coming_soon" ? <small>Questions coming soon</small> : <Stars n={t.stars} size={12} />}
                        {t.attempted > 0 && <small>{t.recent_accuracy}% recent · {t.attempted} answered</small>}
                        {st === "locked" && askTopic !== t.id && <small className="gm-hint">{t.lock.hint}</small>}
                        {st === "early" && <small className="gm-hint">🔑 opened early</small>}
                      </div>
                      {subs.length > 0 && (
                        <button type="button" className="gm-inside" onClick={() => setOpenTopic(openTopic === t.id ? null : t.id)}
                          aria-expanded={openTopic === t.id}>
                          {openTopic === t.id ? "Hide" : "What's inside"} ({subs.length}) {openTopic === t.id ? "▴" : "▾"}
                        </button>
                      )}
                      {openTopic === t.id && <ul className="gm-subs">{subs.map((s) => <li key={s.id}>{s.name}</li>)}</ul>}
                      {askTopic === t.id && (
                        <div className="gm-ask">
                          <span>🔒 {t.lock.hint}. Play it anyway?</span>
                          <button type="button" className="ghost small" onClick={() => setAskTopic(null)}>Not now</button>
                          <FxButton busy={busyId === t.id} busyText="Loading…" onClick={async () => { await onUnlock(t, true); onPractise(t); }}>
                            🔓 Play anyway
                          </FxButton>
                        </div>
                      )}
                    </div>
                    {st !== "coming_soon" && askTopic !== t.id && (
                      <FxButton variant={st === "locked" ? "soft" : t.status === "mastered" ? "soft" : ""} busy={busyId === t.id}
                        busyText="Loading…" disabled={busyId != null && busyId !== t.id} onClick={() => playTopic(t)}>
                        {st === "locked" ? "🔒 Play" : t.status === "mastered" ? "↻ Replay" : t.attempted ? "▶ Continue" : "▶ Play"}
                      </FxButton>
                    )}
                  </li>
                );
              })}
            </ol>

            <div className="gm-boss">
              <div>
                <b>⚔️ Boss battle</b>
                <small>A mixed set from the whole chapter. Beat it to prove the level.</small>
              </div>
              <FxButton variant="big" busy={busyId === chapter.id} busyText="Summoning…"
                disabled={busyId != null && busyId !== chapter.id} onClick={() => onPractise(chapter)}>
                Fight →
              </FxButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Journey() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const exam = params.get("exam") || user?.target_exam || "jee_main";
  const { tree } = useSyllabus(exam);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => api.get("/student/journey", { params: { exam } })
    .then((r) => setData(r.data))
    .catch(() => setError("Couldn't load your journey")), [exam]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const subjects = useMemo(() => data?.subjects || [], [data]);
  const subject = subjects.find((s) => s.id === Number(params.get("subject"))) || subjects.find((s) => s.max_stars > 0) || subjects[0];
  const sIndex = Math.max(0, subjects.indexOf(subject));
  const color = subject ? colorOf(subject, sIndex) : SUBJECT_COLORS[0];
  const go = (patch) => {
    const next = { exam, subject: subject?.id, ...patch };
    Object.keys(next).forEach((k) => next[k] == null && delete next[k]);
    setParams(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])));
  };

  // Where each chapter sits, for the level card and "next quest"
  const index = useMemo(() => {
    const m = new Map();
    for (const s of subjects) {
      let n = 1;
      for (const w of s.clusters) for (const c of w.chapters) { m.set(c.id, { s, w, c, number: n++ }); for (const t of c.topics) m.set(t.id, { s, w, c, t }); }
    }
    return m;
  }, [subjects]);
  const open = index.get(Number(params.get("level")));

  const subtopicsOf = (topicId) => tree?.children.get(topicId) || [];

  async function practise(node) {
    setError("");
    setBusyId(node.id);
    try {
      const { data: res } = await api.post("/student/journey/practice", { node_id: node.id });
      navigate(`/studio/tests/attempt/${res.attempt_id}`);
    } catch (e) {
      setToast({ text: e.response?.data?.error || "Couldn't start practice", bad: true });
      setBusyId(null);
    }
  }
  async function unlock(node, quiet) {
    try {
      await api.post("/student/journey/unlock", { node_id: node.id });
      if (!quiet) setToast({ text: `🔓 ${node.name} unlocked` });
      await load();
    } catch (e) {
      setToast({ text: e.response?.data?.error || "Couldn't unlock", bad: true });
    }
  }

  if (error && !data) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><div className="jr-skeleton hero" /><div className="jr-skeleton" style={{ height: 420 }} /></div>;

  const { next_up, active_practice, overall } = data;
  const nextLoc = next_up ? index.get(next_up.id) : null;

  return (
    <div className="page gm">
      {/* ---------- HUD ---------- */}
      <div className="gm-hud">
        <div className="gm-hud-title">
          <span className="db-eyebrow">Syllabus Journey · {SYLLABUS_LABEL[data.exam]}</span>
          <h1>Your quest map</h1>
        </div>
        <div className="gm-hud-stats">
          <div><strong>★ <CountUp value={subjects.reduce((n, s) => n + s.stars, 0)} /></strong><small>stars</small></div>
          <div><strong>🏆 <CountUp value={overall.mastered} /></strong><small>topics mastered</small></div>
        </div>
        <ExamSwitch value={exam} onChange={(e) => setParams({ exam: e })} />
      </div>

      {active_practice && (
        <div className="jr-resume">
          <span className="jr-resume-dot" />
          <span>Run in progress: <b>{active_practice.title}</b></span>
          <button className="small" onClick={() => navigate(`/studio/tests/attempt/${active_practice.attempt_id}`)}>Resume →</button>
        </div>
      )}

      {/* ---------- Realm (subject) picker ---------- */}
      <div className="gm-realms" role="tablist" aria-label="Subjects">
        {subjects.map((s, i) => {
          const c = colorOf(s, i);
          const on = s.id === subject?.id;
          return (
            <button key={s.id} role="tab" aria-selected={on} className={`gm-realm ${on ? "active" : ""}`} style={{ "--subject": c, "--i": i }}
              onClick={() => go({ subject: s.id, level: null })}>
              <span className="gm-realm-icon">{ICONS[s.name.toLowerCase()] || "📘"}</span>
              <span className="gm-realm-text">
                <b>{s.name}</b>
                <span className="gm-realm-bar"><span style={{ width: `${s.max_stars ? (s.stars / s.max_stars) * 100 : 0}%` }} /></span>
                <small>★ {s.stars}/{s.max_stars}</small>
              </span>
            </button>
          );
        })}
      </div>

      {/* ---------- Next quest ---------- */}
      {next_up && nextLoc && (
        <div className="gm-quest" style={{ "--subject": colorOf(nextLoc.s, subjects.indexOf(nextLoc.s)) }}>
          <span className="gm-quest-icon">🎯</span>
          <div className="gm-quest-text">
            <small>Next quest</small>
            <b>{next_up.name}</b>
            <span>{nextLoc.s.name} › {nextLoc.c.name} · {next_up.reason}</span>
          </div>
          <div className="gm-quest-actions">
            <button type="button" className="ghost small" onClick={() => go({ subject: nextLoc.s.id, level: nextLoc.c.id })}>Open level</button>
            <FxButton variant="glow" busy={busyId === next_up.id} busyText="Loading…" disabled={busyId != null} onClick={() => practise(next_up)}>▶ Play</FxButton>
          </div>
        </div>
      )}

      {/* ---------- The map ---------- */}
      {subject && (
        <div key={`${exam}-${subject.id}`} className="gm-worlds" style={{ "--subject": color }}>
          {subject.clusters.map((w, i) => (
            <World key={w.id} w={w} index={i} color={color} currentId={subject.current_chapter_id}
              numberFrom={index.get(w.chapters[0]?.id)?.number || 1} onOpen={(c) => go({ level: c.id })} />
          ))}
          <div className="gm-finish">🏁 <b>{subject.name} complete</b><small>Every level at ★★★</small></div>
        </div>
      )}

      {open?.c && (
        <LevelSheet chapter={open.c} world={open.w} number={open.number} color={colorOf(open.s, subjects.indexOf(open.s))}
          subtopicsOf={subtopicsOf} busyId={busyId} onClose={() => go({ level: null })} onPractise={practise} onUnlock={unlock} />
      )}
      {toast && <div key={toast.text} className={`st-toast ${toast.bad ? "bad" : ""}`}>{toast.text}</div>}
    </div>
  );
}
