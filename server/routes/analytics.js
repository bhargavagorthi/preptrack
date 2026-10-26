const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { finalize } = require("./student");
const { EXAMS } = require("../lib/syllabus");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

const MIN_ATTEMPTED = 3; // a topic needs this many attempted questions to count as a strength/weakness
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const r2 = (n) => Math.round(n * 100) / 100;

const SUMS = ["seen", "attempted", "correct", "wrong", "marks", "negative", "total_time"];
const blank = () => Object.fromEntries(SUMS.map((k) => [k, 0]));
const add = (acc, r) => {
  SUMS.forEach((k) => (acc[k] += Number(r[k]) || 0));
  return acc;
};
const finish = (o) => ({
  ...o,
  marks: r2(o.marks),
  negative: r2(o.negative),
  accuracy: pct(o.correct, o.attempted),
  avg_time: o.attempted ? Math.round(o.total_time / o.attempted) : null,
});

// Every answered-or-skipped question from this student's submitted attempts
const BASE = `
  FROM attempt_answers aa
  JOIN attempts a ON a.id = aa.attempt_id AND a.status = 'submitted' AND a.student_id = $1
  JOIN questions q ON q.id = aa.question_id`;

// Same, but only questions tagged in the chosen syllabus tree ($2), with their place in it
const TREE_BASE = `${BASE}
  JOIN question_nodes qn ON qn.question_id = q.id AND qn.exam = $2
  JOIN node_paths np ON np.id = qn.node_id`;

const METRICS = `
  COUNT(*)::int AS seen,
  COUNT(aa.is_correct)::int AS attempted,
  COUNT(*) FILTER (WHERE aa.is_correct)::int AS correct,
  COUNT(*) FILTER (WHERE aa.is_correct = false)::int AS wrong,
  COALESCE(SUM(aa.marks_awarded), 0)::float8 AS marks,
  COALESCE(SUM(aa.marks_awarded) FILTER (WHERE aa.is_correct = false), 0)::float8 AS negative,
  COALESCE(SUM(aa.time_spent_seconds) FILTER (WHERE aa.is_correct IS NOT NULL), 0)::int AS total_time`;

async function breakdown(studentId, column, order) {
  const { rows } = await pool.query(
    `SELECT q.${column} AS key, ${METRICS} ${BASE} GROUP BY q.${column}`,
    [studentId]
  );
  return rows
    .map((r) => ({ key: r.key, ...finish(add(blank(), r)) }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

// GET /api/student/analytics
router.get("/", async (req, res) => {
  const me = req.user.id;
  const { rows: [u] } = await pool.query("SELECT target_exam FROM users WHERE id = $1", [me]);
  const exam = EXAMS.includes(req.query.exam) ? req.query.exam : u.target_exam;

  // Score attempts whose time ran out while the student was away
  const { rows: expired } = await pool.query(
    "SELECT id FROM attempts WHERE student_id = $1 AND status = 'in_progress' AND deadline < now()",
    [me]
  );
  for (const e of expired) await finalize(e.id, true);

  const [testsQ, topicsQ, overallQ, byDifficulty, byType] = await Promise.all([
    pool.query(
      `SELECT a.id AS attempt_id, t.title, t.exam, a.submitted_at,
              a.score::float8 AS score, a.max_score::float8 AS max_score,
              a.correct_count, a.wrong_count, a.unattempted_count
       FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE a.student_id = $1 AND a.status = 'submitted'
       ORDER BY a.submitted_at`,
      [me]
    ),
    pool.query(
      `SELECT np.subject_id, np.subject, np.cluster, np.chapter_id, np.chapter,
              COALESCE(np.topic_id, np.chapter_id) AS topic_id,
              COALESCE(np.topic, 'Chapter-level questions') AS topic, ${METRICS}
       ${TREE_BASE}
       GROUP BY np.subject_id, np.subject, np.cluster, np.chapter_id, np.chapter, np.topic_id, np.topic
       ORDER BY MIN(np.sort_key)`,
      [me, exam]
    ),
    pool.query(`SELECT ${METRICS} ${BASE}`, [me]),
    breakdown(me, "difficulty", ["easy", "medium", "hard"]),
    breakdown(me, "type", ["single", "multiple", "numerical"]),
  ]);

  // Build subject → chapter → topic, totalling as we go
  const subjects = [];
  const subjectMap = new Map();
  const topics = [];
  for (const r of topicsQ.rows) {
    let s = subjectMap.get(r.subject_id);
    if (!s) {
      s = { id: r.subject_id, name: r.subject, ...blank(), chapters: [], chapterMap: new Map() };
      subjectMap.set(r.subject_id, s);
      subjects.push(s);
    }
    let c = s.chapterMap.get(r.chapter_id);
    if (!c) {
      c = { id: r.chapter_id, name: r.chapter, cluster: r.cluster, ...blank(), topics: [] };
      s.chapterMap.set(r.chapter_id, c);
      s.chapters.push(c);
    }
    const t = finish({ id: r.topic_id, name: r.topic, chapter: r.chapter, subject: r.subject, ...add(blank(), r) });
    c.topics.push(t);
    topics.push(t);
    add(c, r);
    add(s, r);
  }
  const subjectsOut = subjects.map(({ chapterMap, ...s }) => ({ ...finish(s), chapters: s.chapters.map(finish) }));
  const overall = finish(add(blank(), overallQ.rows[0]));
  const inTree = topicsQ.rows.reduce((n, r) => n + r.seen, 0);

  const trend = testsQ.rows.map((t, i) => ({
    label: `T${i + 1}`,
    title: t.title,
    date: t.submitted_at,
    score: t.score,
    max_score: t.max_score,
    score_pct: pct(t.score, t.max_score),
    accuracy: pct(t.correct_count, t.correct_count + t.wrong_count),
  }));
  const scored = trend.filter((t) => t.score_pct != null).map((t) => t.score_pct);

  const eligible = topics.filter((t) => t.attempted >= MIN_ATTEMPTED);
  const insights = {
    min_attempted: MIN_ATTEMPTED,
    strong: eligible.filter((t) => t.accuracy >= 75)
      .sort((a, b) => b.accuracy - a.accuracy || b.attempted - a.attempted).slice(0, 5),
    weak: eligible.filter((t) => t.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy).slice(0, 5),
    slow: overall.avg_time
      ? eligible.filter((t) => t.avg_time > overall.avg_time * 1.25)
          .sort((a, b) => b.avg_time - a.avg_time).slice(0, 3)
      : [],
  };

  res.json({
    exam,
    outside_tree: overall.seen - inTree, // answered questions not tagged in this syllabus
    overview: {
      tests_taken: trend.length,
      avg_score_pct: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null,
      best_score_pct: scored.length ? Math.max(...scored) : null,
      accuracy: overall.accuracy,
      avg_time: overall.avg_time,
      attempted: overall.attempted,
      seen: overall.seen,
      negative: overall.negative,
    },
    trend,
    subjects: subjectsOut,
    by_difficulty: byDifficulty,
    by_type: byType,
    insights,
  });
});

module.exports = router;
