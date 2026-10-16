const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

// ---------- Journey rules ----------
const RULES = {
  recentWindow: 10,          // status uses the last N answers in a topic
  masteredMinAttempted: 5,
  masteredAccuracy: 80,
  needsWorkMinAttempted: 3,
  needsWorkAccuracy: 50,
  practiceSize: 10,          // questions per practice set
  minutesPerQuestion: 2,
};

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

function statusOf(t) {
  if (!t.attempted) return "not_started";
  if (t.attempted >= RULES.masteredMinAttempted && t.recent_accuracy >= RULES.masteredAccuracy) return "mastered";
  if (t.attempted >= RULES.needsWorkMinAttempted && t.recent_accuracy < RULES.needsWorkAccuracy) return "needs_work";
  return "practising";
}

const countStatuses = (topics) =>
  topics.reduce((acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }),
    { mastered: 0, practising: 0, needs_work: 0, not_started: 0 });

async function activePractice(studentId) {
  const { rows: [p] } = await pool.query(
    `SELECT a.id AS attempt_id, t.title FROM attempts a JOIN tests t ON t.id = a.test_id
     WHERE a.student_id = $1 AND a.status = 'in_progress' AND t.kind = 'practice' AND a.deadline > now()
     ORDER BY a.started_at DESC LIMIT 1`,
    [studentId]
  );
  return p || null;
}

// GET /api/student/journey: the full syllabus with this student's status on every topic
router.get("/", async (req, res) => {
  const me = req.user.id;
  const { rows } = await pool.query(
    `WITH answered AS (
       SELECT q.topic_id, aa.is_correct, a.submitted_at,
              ROW_NUMBER() OVER (PARTITION BY q.topic_id ORDER BY a.submitted_at DESC, aa.question_id) AS rn
       FROM attempt_answers aa
       JOIN attempts a ON a.id = aa.attempt_id AND a.status = 'submitted' AND a.student_id = $1
       JOIN questions q ON q.id = aa.question_id
       WHERE aa.is_correct IS NOT NULL
     ), stats AS (
       SELECT topic_id,
              COUNT(*)::int AS attempted,
              COUNT(*) FILTER (WHERE is_correct)::int AS correct,
              COUNT(*) FILTER (WHERE rn <= $2)::int AS recent_attempted,
              COUNT(*) FILTER (WHERE rn <= $2 AND is_correct)::int AS recent_correct,
              MAX(submitted_at) AS last_practised
       FROM answered GROUP BY topic_id
     ), available AS (
       SELECT q.topic_id, COUNT(*)::int AS n FROM questions q WHERE NOT EXISTS (SELECT 1 FROM test_questions ctq JOIN tests ct ON ct.id = ctq.test_id WHERE ctq.question_id = q.id AND ct.is_contest AND ct.status = 'published' AND ct.ends_at > now()) GROUP BY q.topic_id
     )
     SELECT s.id AS subject_id, s.name AS subject,
            c.id AS chapter_id, c.name AS chapter,
            tp.id AS topic_id, tp.name AS topic,
            COALESCE(av.n, 0) AS available,
            COALESCE(st.attempted, 0) AS attempted, COALESCE(st.correct, 0) AS correct,
            COALESCE(st.recent_attempted, 0) AS recent_attempted, COALESCE(st.recent_correct, 0) AS recent_correct,
            st.last_practised
     FROM subjects s
     LEFT JOIN chapters c ON c.subject_id = s.id
     LEFT JOIN topics tp ON tp.chapter_id = c.id
     LEFT JOIN stats st ON st.topic_id = tp.id
     LEFT JOIN available av ON av.topic_id = tp.id
     ORDER BY s.position, s.id, c.position, c.id, tp.position, tp.id`,
    [me, RULES.recentWindow]
  );

  // Build subject → chapter → topic
  const subjects = [];
  const sMap = new Map();
  const cMap = new Map();
  const allTopics = [];
  for (const r of rows) {
    let s = sMap.get(r.subject_id);
    if (!s) {
      s = { id: r.subject_id, name: r.subject, chapters: [] };
      sMap.set(r.subject_id, s);
      subjects.push(s);
    }
    if (!r.chapter_id) continue;
    let c = cMap.get(r.chapter_id);
    if (!c) {
      c = { id: r.chapter_id, name: r.chapter, topics: [] };
      cMap.set(r.chapter_id, c);
      s.chapters.push(c);
    }
    if (!r.topic_id) continue;
    const t = {
      id: r.topic_id,
      name: r.topic,
      chapter: r.chapter,
      subject: r.subject,
      available: r.available,
      attempted: r.attempted,
      correct: r.correct,
      accuracy: pct(r.correct, r.attempted),
      recent_accuracy: pct(r.recent_correct, r.recent_attempted),
      last_practised: r.last_practised,
    };
    t.status = statusOf(t);
    c.topics.push(t);
    allTopics.push(t);
  }

  // Progress for each chapter and subject
  for (const s of subjects) {
    for (const c of s.chapters) {
      c.counts = countStatuses(c.topics);
      c.total = c.topics.length;
      c.progress_pct = pct(c.counts.mastered, c.total) ?? 0;
      c.status = c.total && c.counts.mastered === c.total ? "mastered"
        : c.topics.some((t) => t.attempted) ? "in_progress" : "not_started";
    }
    const topics = s.chapters.flatMap((c) => c.topics);
    s.counts = countStatuses(topics);
    s.total = topics.length;
    s.progress_pct = pct(s.counts.mastered, s.total) ?? 0;
  }

  // What should the student practise next?
  const practicable = allTopics.filter((t) => t.available > 0);
  const byRecent = (a, b) => a.recent_accuracy - b.recent_accuracy;
  let next_up = null;
  const weak = practicable.filter((t) => t.status === "needs_work").sort(byRecent)[0];
  const going = practicable.filter((t) => t.status === "practising").sort(byRecent)[0];
  const fresh = practicable.find((t) => t.status === "not_started");
  if (weak) next_up = { ...weak, reason: `Only ${weak.recent_accuracy}% on your recent answers. Practise to turn it around.` };
  else if (going) next_up = { ...going, reason: `${going.recent_accuracy}% recently. Keep going to master it.` };
  else if (fresh) next_up = { ...fresh, reason: "You haven't started this topic yet." };

  res.json({
    overall: { total: allTopics.length, ...countStatuses(allTopics), progress_pct: pct(countStatuses(allTopics).mastered, allTopics.length) ?? 0 },
    subjects,
    next_up,
    active_practice: await activePractice(me),
    rules: RULES,
  });
});

// POST /api/student/journey/practice  { topic_id }: build a private practice set and start it
router.post("/practice", async (req, res) => {
  const me = req.user.id;
  const topicId = Number(req.body.topic_id);
  if (!Number.isInteger(topicId)) return res.status(400).json({ error: "Pick a topic" });

  // Only one practice session at a time: resume the open one
  const open = await activePractice(me);
  if (open) return res.json({ attempt_id: open.attempt_id, resumed: true });

  const { rows: [topic] } = await pool.query("SELECT id, name FROM topics WHERE id = $1", [topicId]);
  if (!topic) return res.status(404).json({ error: "Topic not found" });

  // Unseen questions first, then ones never answered correctly, then the rest
  const { rows: picked } = await pool.query(
    `SELECT q.id FROM questions q
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS seen, COALESCE(bool_or(aa.is_correct), false) AS ever_correct
       FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
       WHERE a.student_id = $2 AND a.status = 'submitted' AND aa.question_id = q.id
     ) h ON true
     WHERE q.topic_id = $1 AND NOT EXISTS (SELECT 1 FROM test_questions ctq JOIN tests ct ON ct.id = ctq.test_id WHERE ctq.question_id = q.id AND ct.is_contest AND ct.status = 'published' AND ct.ends_at > now())
     ORDER BY (h.seen > 0), h.ever_correct, random()
     LIMIT $3`,
    [topicId, me, RULES.practiceSize]
  );
  if (!picked.length) return res.status(400).json({ error: "This topic has no questions yet" });

  const duration = Math.min(360, Math.max(5, picked.length * RULES.minutesPerQuestion));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [test] } = await client.query(
      `INSERT INTO tests (title, exam, duration_minutes, status, kind, owner_id, organization_id, created_by, published_at)
       VALUES ($1, 'practice', $2, 'published', 'practice', $3, (SELECT organization_id FROM users WHERE id = $3), $3, now())
       RETURNING id`,
      [`Practice: ${topic.name}`, duration, me]
    );
    await client.query(
      `INSERT INTO test_questions (test_id, question_id, position, marks_correct, marks_wrong)
       SELECT $1, q.id, x.pos, q.marks_correct, q.marks_wrong
       FROM unnest($2::int[]) WITH ORDINALITY AS x(id, pos)
       JOIN questions q ON q.id = x.id`,
      [test.id, picked.map((p) => p.id)]
    );
    const { rows: [attempt] } = await client.query(
      `INSERT INTO attempts (test_id, student_id, deadline)
       VALUES ($1, $2, now() + make_interval(mins => $3)) RETURNING id`,
      [test.id, me, duration]
    );
    await client.query("COMMIT");
    res.status(201).json({ attempt_id: attempt.id, resumed: false });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
