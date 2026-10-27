// Mistakes notebook and bookmarks.
//   GET    /api/student/notebook?view=mistakes|bookmarks&status=open|fixed|all&subject=
//   PUT    /api/student/notebook/:questionId          { note?, status? }
//   POST   /api/student/notebook/bookmarks/:questionId
//   DELETE /api/student/notebook/bookmarks/:questionId
//   POST   /api/student/notebook/practice             { question_ids?: [...] }  (default: open mistakes)
const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { PRACTICE, activePractice, NOT_IN_LIVE_CONTEST, createPractice } = require("../lib/practice");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

// The student has seen this question (q) in a test whose results they can view.
// Questions from contests that are still running stay hidden until the contest closes.
const SEEN = `EXISTS (
  SELECT 1 FROM attempts sa
  JOIN tests st ON st.id = sa.test_id
  JOIN test_questions stq ON stq.test_id = sa.test_id AND stq.question_id = q.id
  WHERE sa.student_id = $1 AND sa.status = 'submitted' AND NOT (st.is_contest AND st.ends_at > now()))`;

// Subject / chapter / topic, preferring the student's own syllabus
const TAGS = `
  COALESCE(CASE WHEN u.target_exam = 'jee_advanced' THEN qt.adv_subject ELSE qt.main_subject END, qt.main_subject, qt.adv_subject, 'Untagged') AS subject,
  COALESCE(CASE WHEN u.target_exam = 'jee_advanced' THEN qt.adv_chapter ELSE qt.main_chapter END, qt.main_chapter, qt.adv_chapter) AS chapter,
  COALESCE(CASE WHEN u.target_exam = 'jee_advanced' THEN qt.adv_topic ELSE qt.main_topic END, qt.main_topic, qt.adv_topic) AS topic`;

// Each question the student has answered wrongly (in visible results), with their history on it
const MISTAKES = `
  WITH hist AS (
    SELECT aa.question_id,
           COUNT(*) FILTER (WHERE aa.is_correct = false)::int AS times_wrong,
           COUNT(*) FILTER (WHERE aa.is_correct)::int AS times_right,
           MAX(aa.updated_at) FILTER (WHERE aa.is_correct = false) AS last_wrong_at,
           MAX(aa.updated_at) FILTER (WHERE aa.is_correct) AS last_right_at,
           (ARRAY_AGG(aa.response ORDER BY aa.updated_at DESC) FILTER (WHERE aa.is_correct = false))[1] AS last_response
    FROM attempt_answers aa
    JOIN attempts a ON a.id = aa.attempt_id AND a.student_id = $1 AND a.status = 'submitted'
    JOIN tests t ON t.id = a.test_id AND NOT (t.is_contest AND t.ends_at > now())
    GROUP BY aa.question_id
    HAVING COUNT(*) FILTER (WHERE aa.is_correct = false) > 0
  )`;

const QUESTION_COLS = `q.id, q.type, q.text, q.image_url, q.options, q.answer, q.solution, q.difficulty`;

function shape(r) {
  return {
    ...r,
    status: r.status || "open",
    right_since: r.last_right_at && r.last_wrong_at ? new Date(r.last_right_at) > new Date(r.last_wrong_at) : false,
  };
}

router.get("/", async (req, res) => {
  const me = req.user.id;
  const view = req.query.view === "bookmarks" ? "bookmarks" : "mistakes";

  let rows;
  if (view === "mistakes") {
    ({ rows } = await pool.query(
      `${MISTAKES}
       SELECT ${QUESTION_COLS}, ${TAGS}, h.times_wrong, h.times_right, h.last_wrong_at, h.last_right_at, h.last_response,
              n.note, n.status, (b.user_id IS NOT NULL) AS bookmarked
       FROM hist h
       JOIN questions q ON q.id = h.question_id
       JOIN users u ON u.id = $1
       LEFT JOIN question_tags qt ON qt.question_id = q.id
       LEFT JOIN question_notes n ON n.user_id = $1 AND n.question_id = q.id
       LEFT JOIN question_bookmarks b ON b.user_id = $1 AND b.question_id = q.id
       ORDER BY h.last_wrong_at DESC
       LIMIT 300`,
      [me]
    ));
  } else {
    ({ rows } = await pool.query(
      `${MISTAKES}
       SELECT ${QUESTION_COLS}, ${TAGS}, h.times_wrong, h.times_right, h.last_wrong_at, h.last_right_at, h.last_response,
              n.note, n.status, true AS bookmarked, b.created_at AS bookmarked_at
       FROM question_bookmarks b
       JOIN questions q ON q.id = b.question_id
       JOIN users u ON u.id = $1
       LEFT JOIN hist h ON h.question_id = q.id
       LEFT JOIN question_tags qt ON qt.question_id = q.id
       LEFT JOIN question_notes n ON n.user_id = $1 AND n.question_id = q.id
       WHERE b.user_id = $1 AND ${SEEN}
       ORDER BY b.created_at DESC
       LIMIT 300`,
      [me]
    ));
  }
  let items = rows.map(shape);

  // Counts before filtering, for the tabs and chips
  const { rows: [counts] } = await pool.query(
    `${MISTAKES}
     SELECT (SELECT COUNT(*) FROM hist h LEFT JOIN question_notes n ON n.user_id = $1 AND n.question_id = h.question_id
             WHERE COALESCE(n.status, 'open') = 'open')::int AS open,
            (SELECT COUNT(*) FROM hist h JOIN question_notes n ON n.user_id = $1 AND n.question_id = h.question_id
             WHERE n.status = 'fixed')::int AS fixed,
            (SELECT COUNT(*) FROM question_bookmarks b JOIN questions q ON q.id = b.question_id
             WHERE b.user_id = $1 AND ${SEEN})::int AS bookmarks`,
    [me]
  );
  const subjects = [...new Set(items.map((i) => i.subject))];

  if (view === "mistakes") {
    const status = ["open", "fixed"].includes(req.query.status) ? req.query.status : req.query.status === "all" ? null : "open";
    if (status) items = items.filter((i) => i.status === status);
  }
  if (req.query.subject) items = items.filter((i) => i.subject === req.query.subject);

  res.json({ view, items, counts, subjects });
});

const qid = (req) => {
  const n = Number(req.params.questionId);
  return Number.isInteger(n) && n > 0 ? n : null;
};
async function canSee(me, id) {
  const { rows } = await pool.query(`SELECT 1 FROM questions q WHERE q.id = $2 AND ${SEEN}`, [me, id]);
  return rows.length > 0;
}

router.put("/:questionId", async (req, res) => {
  const id = qid(req);
  if (!id || !(await canSee(req.user.id, id))) return res.status(404).json({ error: "You can only add notes to questions from your results" });
  const sets = {};
  if (req.body?.note !== undefined) {
    const note = String(req.body.note ?? "").trim();
    if (note.length > 2000) return res.status(400).json({ error: "Notes can be up to 2,000 characters" });
    sets.note = note || null;
  }
  if (req.body?.status !== undefined) {
    if (!["open", "fixed"].includes(req.body.status)) return res.status(400).json({ error: "Status must be open or fixed" });
    sets.status = req.body.status;
  }
  if (!Object.keys(sets).length) return res.status(400).json({ error: "Nothing to save" });
  const keys = Object.keys(sets);
  await pool.query(
    `INSERT INTO question_notes (user_id, question_id, ${keys.join(", ")}) VALUES ($1, $2, ${keys.map((_, i) => `$${i + 3}`).join(", ")})
     ON CONFLICT (user_id, question_id) DO UPDATE SET ${keys.map((k) => `${k} = EXCLUDED.${k}`).join(", ")}, updated_at = now()`,
    [req.user.id, id, ...keys.map((k) => sets[k])]
  );
  const { rows: [n] } = await pool.query("SELECT note, status, updated_at FROM question_notes WHERE user_id = $1 AND question_id = $2", [req.user.id, id]);
  res.json(n);
});

router.post("/bookmarks/:questionId", async (req, res) => {
  const id = qid(req);
  if (!id || !(await canSee(req.user.id, id))) return res.status(404).json({ error: "You can bookmark questions from your results" });
  await pool.query("INSERT INTO question_bookmarks (user_id, question_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.user.id, id]);
  res.json({ bookmarked: true });
});

router.delete("/bookmarks/:questionId", async (req, res) => {
  await pool.query("DELETE FROM question_bookmarks WHERE user_id = $1 AND question_id = $2", [req.user.id, qid(req)]);
  res.json({ bookmarked: false });
});

// Practise chosen questions, or the student's most recent open mistakes
router.post("/practice", async (req, res) => {
  const me = req.user.id;
  const open = await activePractice(me);
  if (open) return res.json({ attempt_id: open.attempt_id, resumed: true });

  let ids = Array.isArray(req.body?.question_ids) ? [...new Set(req.body.question_ids.map(Number))].filter(Number.isInteger) : null;
  if (ids && !ids.length) return res.status(400).json({ error: "Pick some questions to practise" });
  if (ids && ids.length > PRACTICE.maxCustom) return res.status(400).json({ error: `Pick up to ${PRACTICE.maxCustom} questions at a time` });

  let picked;
  if (ids) {
    ({ rows: picked } = await pool.query(
      `SELECT q.id FROM questions q WHERE q.id = ANY($2) AND ${SEEN} AND ${NOT_IN_LIVE_CONTEST}`,
      [me, ids]
    ));
    // keep the student's order
    const ok = new Set(picked.map((p) => p.id));
    picked = ids.filter((i) => ok.has(i)).map((id) => ({ id }));
  } else {
    ({ rows: picked } = await pool.query(
      `${MISTAKES}
       SELECT q.id FROM hist h JOIN questions q ON q.id = h.question_id
       LEFT JOIN question_notes n ON n.user_id = $1 AND n.question_id = q.id
       WHERE COALESCE(n.status, 'open') = 'open' AND ${NOT_IN_LIVE_CONTEST}
       ORDER BY h.times_wrong DESC, h.last_wrong_at DESC
       LIMIT $2`,
      [me, PRACTICE.size]
    ));
  }
  if (!picked.length) return res.status(400).json({ error: "No questions to practise right now" });
  const title = ids ? `Practice: ${picked.length} notebook question${picked.length === 1 ? "" : "s"}` : "Practice: my mistakes";
  const attemptId = await createPractice(me, title, picked.map((p) => p.id));
  res.status(201).json({ attempt_id: attemptId, resumed: false });
});

module.exports = router;
