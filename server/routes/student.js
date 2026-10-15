const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

const GRACE_MS = 30 * 1000; // allow answers that were in flight when time ran out
const round2 = (n) => Math.round(n * 100) / 100;

// Is this response correct? Returns marks too.
function grade(q, response) {
  if (response == null) return { attempted: false, correct: null, marks: 0 };
  let ok;
  if (q.type === "numerical") {
    const v = Number(response.value);
    ok = Number.isFinite(v) &&
      Math.abs(v - Number(q.answer.value)) <= Number(q.answer.tolerance || 0) + 1e-9;
  } else {
    ok = [...response].sort().join(",") === [...q.answer].sort().join(",");
  }
  return { attempted: true, correct: ok, marks: ok ? q.marks_correct : q.marks_wrong };
}

// Check a student's answer has the right shape for its question type
function cleanResponse(q, r) {
  if (r == null) return { value: null };
  if (q.type === "numerical") {
    if (r.value === "" || r.value == null) return { value: null };
    const v = Number(r.value);
    if (!Number.isFinite(v)) return { error: "Answer must be a number" };
    return { value: { value: v } };
  }
  if (!Array.isArray(r)) return { error: "Invalid answer" };
  const ids = (q.options || []).map((o) => o.id);
  const picked = [...new Set(r.map(String))];
  if (picked.some((p) => !ids.includes(p))) return { error: "Invalid option" };
  if (q.type === "single" && picked.length > 1) return { error: "Pick only one option" };
  return { value: picked.length ? picked : null };
}

// Score an attempt and lock it. Safe to call twice.
async function finalize(attemptId, auto) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [attempt] } = await client.query(
      "SELECT * FROM attempts WHERE id = $1 FOR UPDATE", [attemptId]
    );
    if (!attempt || attempt.status === "submitted") {
      await client.query("COMMIT");
      return;
    }
    const { rows } = await client.query(
      `SELECT q.id, q.type, q.answer,
              tq.marks_correct::float8 AS marks_correct, tq.marks_wrong::float8 AS marks_wrong,
              aa.response
       FROM test_questions tq
       JOIN questions q ON q.id = tq.question_id
       LEFT JOIN attempt_answers aa ON aa.attempt_id = $1 AND aa.question_id = q.id
       WHERE tq.test_id = $2`,
      [attemptId, attempt.test_id]
    );
    let score = 0, max = 0, correct = 0, wrong = 0, unattempted = 0;
    for (const q of rows) {
      const g = grade(q, q.response);
      max += q.marks_correct;
      score += g.marks;
      if (!g.attempted) unattempted++;
      else if (g.correct) correct++;
      else wrong++;
      await client.query(
        `INSERT INTO attempt_answers (attempt_id, question_id, response, is_correct, marks_awarded)
         VALUES ($1, $2, NULL, $3, $4)
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET is_correct = EXCLUDED.is_correct, marks_awarded = EXCLUDED.marks_awarded`,
        [attemptId, q.id, g.attempted ? g.correct : null, g.marks]
      );
    }
    await client.query(
      `UPDATE attempts SET status='submitted', submitted_at=LEAST(now(), deadline), auto_submitted=$2,
              score=$3, max_score=$4, correct_count=$5, wrong_count=$6, unattempted_count=$7
       WHERE id=$1`,
      [attemptId, auto, round2(score), round2(max), correct, wrong, unattempted]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Load an attempt that belongs to the logged-in student
async function ownAttempt(req, res) {
  const { rows: [a] } = await pool.query(
    `SELECT a.*, a.score::float8 AS score, a.max_score::float8 AS max_score,
            t.title, t.exam, t.instructions, t.duration_minutes
     FROM attempts a JOIN tests t ON t.id = a.test_id
     WHERE a.id = $1`,
    [req.params.id]
  );
  if (!a || a.student_id !== req.user.id) {
    res.status(404).json({ error: "Attempt not found" });
    return null;
  }
  return a;
}

// GET /api/student/tests: published tests and my attempt on each
router.get("/tests", async (req, res) => {
  // Score any of my attempts whose time ran out while I was away
  const { rows: expired } = await pool.query(
    "SELECT id FROM attempts WHERE student_id=$1 AND status='in_progress' AND deadline < now()",
    [req.user.id]
  );
  for (const e of expired) await finalize(e.id, true);

  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.exam, t.duration_minutes, t.instructions,
            COUNT(tq.question_id)::int AS question_count,
            COALESCE(SUM(tq.marks_correct), 0)::float8 AS total_marks,
            a.id AS attempt_id, a.status AS attempt_status, a.deadline,
            a.score::float8 AS score, a.max_score::float8 AS max_score
     FROM tests t
     LEFT JOIN test_questions tq ON tq.test_id = t.id
     LEFT JOIN attempts a ON a.test_id = t.id AND a.student_id = $1
     WHERE t.status = 'published'
     GROUP BY t.id, a.id
     ORDER BY t.published_at DESC`,
    [req.user.id]
  );
  res.json({ tests: rows });
});

// POST /api/student/tests/:id/start: begin (or resume) an attempt
router.post("/tests/:id/start", async (req, res) => {
  const { rows: [test] } = await pool.query(
    "SELECT id, duration_minutes FROM tests WHERE id = $1 AND status = 'published'",
    [req.params.id]
  );
  if (!test) return res.status(404).json({ error: "This test isn't available" });
  await pool.query(
    `INSERT INTO attempts (test_id, student_id, deadline)
     VALUES ($1, $2, now() + make_interval(mins => $3))
     ON CONFLICT (test_id, student_id) DO NOTHING`,
    [test.id, req.user.id, test.duration_minutes]
  );
  const { rows: [a] } = await pool.query(
    "SELECT id FROM attempts WHERE test_id = $1 AND student_id = $2",
    [test.id, req.user.id]
  );
  res.json({ attempt_id: a.id });
});

// GET /api/student/attempts/:id: exam data (no answers) or the full result
router.get("/attempts/:id", async (req, res) => {
  let a = await ownAttempt(req, res);
  if (!a) return;
  if (a.status === "in_progress" && new Date(a.deadline) <= new Date()) {
    await finalize(a.id, true);
    a = await ownAttempt(req, res);
    if (!a) return;
  }

  const meta = {
    id: a.id, test_id: a.test_id, title: a.title, exam: a.exam, instructions: a.instructions,
    status: a.status, started_at: a.started_at, deadline: a.deadline, submitted_at: a.submitted_at,
    auto_submitted: a.auto_submitted, score: a.score, max_score: a.max_score,
    correct_count: a.correct_count, wrong_count: a.wrong_count, unattempted_count: a.unattempted_count,
  };

  if (a.status === "in_progress") {
    // Exam mode: questions and options only. Never answers or solutions.
    const { rows: questions } = await pool.query(
      `SELECT q.id, q.type, q.text, q.options, tq.position,
              tq.marks_correct::float8 AS marks_correct, tq.marks_wrong::float8 AS marks_wrong,
              s.name AS subject
       FROM test_questions tq
       JOIN questions q ON q.id = tq.question_id
       JOIN topics tp ON tp.id = q.topic_id
       JOIN chapters c ON c.id = tp.chapter_id
       JOIN subjects s ON s.id = c.subject_id
       WHERE tq.test_id = $1
       ORDER BY tq.position`,
      [a.test_id]
    );
    const { rows: answers } = await pool.query(
      "SELECT question_id, response, marked_for_review FROM attempt_answers WHERE attempt_id = $1",
      [a.id]
    );
    return res.json({ attempt: meta, server_now: new Date().toISOString(), questions, answers });
  }

  // Result mode: everything, including correct answers and solutions
  const { rows: questions } = await pool.query(
    `SELECT q.id, q.type, q.text, q.options, q.answer, q.solution, tq.position,
            tq.marks_correct::float8 AS marks_correct, tq.marks_wrong::float8 AS marks_wrong,
            s.name AS subject, c.name AS chapter, tp.name AS topic,
            aa.response, aa.is_correct, aa.marks_awarded::float8 AS marks_awarded,
            COALESCE(aa.time_spent_seconds, 0) AS time_spent_seconds
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     JOIN topics tp ON tp.id = q.topic_id
     JOIN chapters c ON c.id = tp.chapter_id
     JOIN subjects s ON s.id = c.subject_id
     LEFT JOIN attempt_answers aa ON aa.attempt_id = $1 AND aa.question_id = q.id
     WHERE tq.test_id = $2
     ORDER BY tq.position`,
    [a.id, a.test_id]
  );
  res.json({ attempt: meta, questions });
});

// PUT /api/student/attempts/:id/answers/:questionId: autosave one answer
router.put("/attempts/:id/answers/:questionId", async (req, res) => {
  const a = await ownAttempt(req, res);
  if (!a) return;
  if (a.status !== "in_progress") return res.status(409).json({ error: "This test has already been submitted" });
  if (Date.now() > new Date(a.deadline).getTime() + GRACE_MS)
    return res.status(409).json({ error: "Time is up" });

  const { rows: [q] } = await pool.query(
    `SELECT q.id, q.type, q.options FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     WHERE tq.test_id = $1 AND q.id = $2`,
    [a.test_id, req.params.questionId]
  );
  if (!q) return res.status(404).json({ error: "Question not in this test" });

  const { error, value: response } = cleanResponse(q, req.body.response);
  if (error) return res.status(400).json({ error });
  const delta = Math.min(Math.max(Math.round(Number(req.body.time_spent_delta) || 0), 0), 600);

  await pool.query(
    `INSERT INTO attempt_answers (attempt_id, question_id, response, marked_for_review, time_spent_seconds, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (attempt_id, question_id) DO UPDATE SET
       response = EXCLUDED.response,
       marked_for_review = EXCLUDED.marked_for_review,
       time_spent_seconds = attempt_answers.time_spent_seconds + EXCLUDED.time_spent_seconds,
       updated_at = now()`,
    [a.id, q.id, response == null ? null : JSON.stringify(response), Boolean(req.body.marked_for_review), delta]
  );
  res.json({ saved: true });
});

// POST /api/student/attempts/:id/submit
router.post("/attempts/:id/submit", async (req, res) => {
  const a = await ownAttempt(req, res);
  if (!a) return;
  await finalize(a.id, Date.now() > new Date(a.deadline).getTime());
  res.json({ submitted: true });
});

module.exports = router;
