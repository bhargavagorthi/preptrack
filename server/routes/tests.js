const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("creator", "admin"));

const EXAMS = ["jee_main", "jee_advanced", "practice"];

function validateMeta(b) {
  const title = (b.title || "").trim();
  if (!title) return { error: "Title is required" };
  const exam = b.exam || "practice";
  if (!EXAMS.includes(exam)) return { error: "Invalid exam type" };
  const duration = Number(b.duration_minutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 360)
    return { error: "Duration must be a whole number of minutes between 5 and 360" };
  return {
    value: { title, exam, duration_minutes: duration, instructions: (b.instructions || "").trim() || null },
  };
}

// Load a test the current user is allowed to change (their own; admins: any)
async function findOwnTest(req, res) {
  const { rows } = await pool.query("SELECT * FROM tests WHERE id = $1", [req.params.id]);
  const test = rows[0];
  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return null;
  }
  if (test.created_by !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "This test isn't yours to change" });
    return null;
  }
  return test;
}

const SUMMARY = `
  SELECT t.id, t.title, t.exam, t.duration_minutes, t.instructions, t.status,
         t.created_by, t.created_at, t.published_at, u.name AS author,
         COUNT(tq.question_id)::int AS question_count,
         COALESCE(SUM(tq.marks_correct), 0)::float8 AS total_marks
  FROM tests t
  LEFT JOIN test_questions tq ON tq.test_id = t.id
  LEFT JOIN users u ON u.id = t.created_by`;

// GET /api/tests — every test with question count and total marks
router.get("/", async (req, res) => {
  const { rows } = await pool.query(`${SUMMARY} GROUP BY t.id, u.name ORDER BY t.created_at DESC`);
  res.json({ tests: rows });
});

// POST /api/tests — create a draft
router.post("/", async (req, res) => {
  const { error, value: t } = validateMeta(req.body);
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    `INSERT INTO tests (title, exam, duration_minutes, instructions, organization_id, created_by)
     VALUES ($1, $2, $3, $4, (SELECT organization_id FROM users WHERE id = $5), $5)
     RETURNING id`,
    [t.title, t.exam, t.duration_minutes, t.instructions, req.user.id]
  );
  res.status(201).json({ id: rows[0].id });
});

// GET /api/tests/:id — the test and its questions in order
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(`${SUMMARY} WHERE t.id = $1 GROUP BY t.id, u.name`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Test not found" });
  const q = await pool.query(
    `SELECT q.id, q.type, q.text, q.difficulty, tq.position,
            tq.marks_correct::float8 AS marks_correct, tq.marks_wrong::float8 AS marks_wrong,
            tp.name AS topic, c.name AS chapter, s.name AS subject
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     JOIN topics tp ON tp.id = q.topic_id
     JOIN chapters c ON c.id = tp.chapter_id
     JOIN subjects s ON s.id = c.subject_id
     WHERE tq.test_id = $1
     ORDER BY tq.position`,
    [req.params.id]
  );
  res.json({ test: rows[0], questions: q.rows });
});

// PATCH /api/tests/:id — title, exam, duration, instructions (drafts only)
router.patch("/:id", async (req, res) => {
  const test = await findOwnTest(req, res);
  if (!test) return;
    const { rows: taken } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM attempts WHERE test_id = $1", [test.id]
  );
  if (taken[0].n)
    return res.status(409).json({
      error: "Students have already taken this test, so it can't be unpublished. Create a new test instead.",
    });
  if (test.status !== "draft") return res.status(409).json({ error: "Unpublish the test before editing it" });
  const { error, value: t } = validateMeta(req.body);
  if (error) return res.status(400).json({ error });
  await pool.query(
    `UPDATE tests SET title=$1, exam=$2, duration_minutes=$3, instructions=$4, updated_at=now() WHERE id=$5`,
    [t.title, t.exam, t.duration_minutes, t.instructions, test.id]
  );
  res.json({ saved: true });
});

// PUT /api/tests/:id/questions  { question_ids: [5, 2, 9] } — replaces the ordered list
router.put("/:id/questions", async (req, res) => {
  const test = await findOwnTest(req, res);
  if (!test) return;
  if (test.status !== "draft")
    return res.status(409).json({ error: "Unpublish the test before changing its questions" });

  const ids = Array.isArray(req.body.question_ids) ? req.body.question_ids.map(Number) : null;
  if (!ids || ids.some((n) => !Number.isInteger(n)))
    return res.status(400).json({ error: "question_ids must be a list of question ids" });
  if (new Set(ids).size !== ids.length)
    return res.status(400).json({ error: "A question can only appear once in a test" });
  if (ids.length > 300) return res.status(400).json({ error: "A test can have at most 300 questions" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM test_questions WHERE test_id = $1", [test.id]);
    if (ids.length) {
      // Copy each question's current marks into the test (a snapshot)
      const { rowCount } = await client.query(
        `INSERT INTO test_questions (test_id, question_id, position, marks_correct, marks_wrong)
         SELECT $1, q.id, x.pos, q.marks_correct, q.marks_wrong
         FROM unnest($2::int[]) WITH ORDINALITY AS x(id, pos)
         JOIN questions q ON q.id = x.id`,
        [test.id, ids]
      );
      if (rowCount !== ids.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Some of these questions no longer exist" });
      }
    }
    await client.query("UPDATE tests SET updated_at = now() WHERE id = $1", [test.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ saved: ids.length });
});

// POST /api/tests/:id/publish
router.post("/:id/publish", async (req, res) => {
  const test = await findOwnTest(req, res);
  if (!test) return;
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM test_questions WHERE test_id = $1", [test.id]);
  if (!rows[0].n) return res.status(400).json({ error: "Add at least one question before publishing" });
  await pool.query(
    "UPDATE tests SET status='published', published_at=now(), updated_at=now() WHERE id=$1",
    [test.id]
  );
  res.json({ status: "published" });
});

// POST /api/tests/:id/unpublish
router.post("/:id/unpublish", async (req, res) => {
  const test = await findOwnTest(req, res);
  if (!test) return;
  await pool.query("UPDATE tests SET status='draft', updated_at=now() WHERE id=$1", [test.id]);
  res.json({ status: "draft" });
});

// DELETE /api/tests/:id — drafts only
router.delete("/:id", async (req, res) => {
  const test = await findOwnTest(req, res);
  if (!test) return;
  if (test.status !== "draft") return res.status(409).json({ error: "Unpublish the test before deleting it" });
  await pool.query("DELETE FROM tests WHERE id = $1", [test.id]);
  res.json({ deleted: true });
});

module.exports = router;
