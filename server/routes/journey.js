const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { EXAMS, TAGGABLE, loadTree, subtreeIds } = require("../lib/syllabus");

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

// Questions in an upcoming or live contest can't be practised
const NOT_IN_LIVE_CONTEST = `NOT EXISTS (
  SELECT 1 FROM test_questions ctq JOIN tests ct ON ct.id = ctq.test_id
  WHERE ctq.question_id = q.id AND ct.is_contest AND ct.status = 'published' AND ct.ends_at > now())`;

// GET /api/student/journey?exam=: the chosen syllabus tree with this student's status on every topic
router.get("/", async (req, res) => {
  const me = req.user.id;
  const { rows: [u] } = await pool.query("SELECT target_exam FROM users WHERE id = $1", [me]);
  const exam = EXAMS.includes(req.query.exam) ? req.query.exam : u.target_exam;

  const [nodes, statsQ, availQ] = await Promise.all([
    loadTree(exam),
    // A topic's status uses answers to questions tagged to it or anything beneath it
    pool.query(
      `WITH answered AS (
         SELECT np.topic_id, aa.is_correct, a.submitted_at,
                ROW_NUMBER() OVER (PARTITION BY np.topic_id ORDER BY a.submitted_at DESC, aa.question_id) AS rn
         FROM attempt_answers aa
         JOIN attempts a ON a.id = aa.attempt_id AND a.status = 'submitted' AND a.student_id = $1
         JOIN question_nodes qn ON qn.question_id = aa.question_id AND qn.exam = $2
         JOIN node_paths np ON np.id = qn.node_id
         WHERE aa.is_correct IS NOT NULL AND np.topic_id IS NOT NULL
       )
       SELECT topic_id,
              COUNT(*)::int AS attempted,
              COUNT(*) FILTER (WHERE is_correct)::int AS correct,
              COUNT(*) FILTER (WHERE rn <= $3)::int AS recent_attempted,
              COUNT(*) FILTER (WHERE rn <= $3 AND is_correct)::int AS recent_correct,
              MAX(submitted_at) AS last_practised
       FROM answered GROUP BY topic_id`,
      [me, exam, RULES.recentWindow]
    ),
    pool.query(
      `SELECT np.chapter_id, np.topic_id, COUNT(*)::int AS n
       FROM questions q
       JOIN question_nodes qn ON qn.question_id = q.id AND qn.exam = $1
       JOIN node_paths np ON np.id = qn.node_id
       WHERE ${NOT_IN_LIVE_CONTEST}
       GROUP BY np.chapter_id, np.topic_id`,
      [exam]
    ),
  ]);

  const stats = new Map(statsQ.rows.map((r) => [r.topic_id, r]));
  const topicAvail = new Map();
  const chapterAvail = new Map();
  for (const r of availQ.rows) {
    if (r.topic_id) topicAvail.set(r.topic_id, (topicAvail.get(r.topic_id) || 0) + r.n);
    if (r.chapter_id) chapterAvail.set(r.chapter_id, (chapterAvail.get(r.chapter_id) || 0) + r.n);
  }

  // Build subject → cluster → chapter → topic (subtopics and sections roll up into their topic)
  const subjects = [];
  const byId = new Map();
  const allTopics = [];
  for (const n of nodes) {
    if (n.level === "subject") {
      const s = { id: n.id, name: n.name, clusters: [] };
      byId.set(n.id, s);
      subjects.push(s);
    } else if (n.level === "cluster") {
      const c = { id: n.id, name: n.name, chapters: [] };
      byId.set(n.id, c);
      byId.get(n.parent_id)?.clusters.push(c);
    } else if (n.level === "chapter") {
      const c = { id: n.id, name: n.name, cluster: n.cluster, subject: n.subject, available: chapterAvail.get(n.id) || 0, topics: [] };
      byId.set(n.id, c);
      byId.get(n.parent_id)?.chapters.push(c);
    } else if (n.level === "topic") {
      const r = stats.get(n.id) || {};
      const t = {
        id: n.id,
        name: n.name,
        chapter: n.chapter,
        subject: n.subject,
        available: topicAvail.get(n.id) || 0,
        attempted: r.attempted || 0,
        correct: r.correct || 0,
        accuracy: pct(r.correct || 0, r.attempted || 0),
        recent_accuracy: pct(r.recent_correct || 0, r.recent_attempted || 0),
        last_practised: r.last_practised || null,
      };
      t.status = statusOf(t);
      byId.get(n.parent_id)?.topics.push(t);
      allTopics.push(t);
    }
  }

  // Progress for each chapter, cluster and subject
  for (const s of subjects) {
    for (const cl of s.clusters) {
      for (const c of cl.chapters) {
        c.counts = countStatuses(c.topics);
        c.total = c.topics.length;
        c.progress_pct = pct(c.counts.mastered, c.total) ?? 0;
        c.status = c.total && c.counts.mastered === c.total ? "mastered"
          : c.topics.some((t) => t.attempted) ? "in_progress" : "not_started";
      }
      const topics = cl.chapters.flatMap((c) => c.topics);
      cl.counts = countStatuses(topics);
      cl.total = topics.length;
      cl.progress_pct = pct(cl.counts.mastered, cl.total) ?? 0;
    }
    const topics = s.clusters.flatMap((cl) => cl.chapters.flatMap((c) => c.topics));
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

  const overallCounts = countStatuses(allTopics);
  res.json({
    exam,
    overall: { total: allTopics.length, ...overallCounts, progress_pct: pct(overallCounts.mastered, allTopics.length) ?? 0 },
    subjects,
    next_up,
    active_practice: await activePractice(me),
    rules: RULES,
  });
});

// POST /api/student/journey/practice  { topic_id }: build a private practice set and start it
router.post("/practice", async (req, res) => {
  const me = req.user.id;
  const nodeId = Number(req.body.node_id ?? req.body.topic_id);
  if (!Number.isInteger(nodeId)) return res.status(400).json({ error: "Pick a chapter or topic" });

  // Only one practice session at a time: resume the open one
  const open = await activePractice(me);
  if (open) return res.json({ attempt_id: open.attempt_id, resumed: true });

  const { rows: [topic] } = await pool.query("SELECT id, name, level FROM syllabus_nodes WHERE id = $1", [nodeId]);
  if (!topic || !TAGGABLE.includes(topic.level)) return res.status(404).json({ error: "Chapter or topic not found" });
  const ids = await subtreeIds(topic.id);

  // Unseen questions first, then ones never answered correctly, then the rest
  const { rows: picked } = await pool.query(
    `SELECT q.id FROM questions q
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS seen, COALESCE(bool_or(aa.is_correct), false) AS ever_correct
       FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
       WHERE a.student_id = $2 AND a.status = 'submitted' AND aa.question_id = q.id
     ) h ON true
     WHERE EXISTS (SELECT 1 FROM question_nodes qn WHERE qn.question_id = q.id AND qn.node_id = ANY($1))
       AND ${NOT_IN_LIVE_CONTEST}
     ORDER BY (h.seen > 0), h.ever_correct, random()
     LIMIT $3`,
    [ids, me, RULES.practiceSize]
  );
  if (!picked.length) return res.status(400).json({ error: `${topic.name} has no questions yet` });

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
