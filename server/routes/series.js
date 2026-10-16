const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const EXAMS = ["jee_main", "jee_advanced", "both"];
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

function validate(b) {
  const title = (b.title || "").trim();
  if (!title) return { error: "Title is required" };
  if (title.length > 120) return { error: "Keep the title under 120 characters" };
  const description = (b.description || "").trim();
  if (description.length > 2000) return { error: "Keep the description under 2000 characters" };
  const exam = b.exam || "both";
  if (!EXAMS.includes(exam)) return { error: "Invalid exam" };
  return { value: { title, description: description || null, exam } };
}

const TESTS_IN_SERIES = `
  SELECT t.id, t.title, t.exam, t.status, t.kind, t.is_contest, t.starts_at, t.ends_at, t.duration_minutes, st.position,
         (SELECT COUNT(*)::int FROM test_questions tq WHERE tq.test_id = t.id) AS question_count,
         (SELECT COALESCE(SUM(tq.marks_correct), 0)::float8 FROM test_questions tq WHERE tq.test_id = t.id) AS total_marks
  FROM series_tests st JOIN tests t ON t.id = st.test_id
  WHERE st.series_id = $1
  ORDER BY st.position`;

// =====================================================================
// Organiser / admin: build and manage series
// =====================================================================
const manage = express.Router();
manage.use(requireRole("organiser", "admin"));

async function ownSeries(req, res) {
  const { rows: [s] } = await pool.query("SELECT * FROM test_series WHERE id = $1", [req.params.id]);
  if (!s) {
    res.status(404).json({ error: "Series not found" });
    return null;
  }
  if (s.created_by !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "This series isn't yours" });
    return null;
  }
  return s;
}

// GET /api/series/manage: my series (admins see all)
manage.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.description, s.exam, s.status, s.created_at, s.published_at, u.name AS author,
            (SELECT COUNT(*)::int FROM series_tests st WHERE st.series_id = s.id) AS test_count,
            (SELECT COUNT(*)::int FROM series_enrollments e WHERE e.series_id = s.id) AS enrolled
     FROM test_series s LEFT JOIN users u ON u.id = s.created_by
     WHERE $1::boolean OR s.created_by = $2
     ORDER BY s.created_at DESC`,
    [req.user.role === "admin", req.user.id]
  );
  res.json({ series: rows });
});

// GET /api/series/manage/available-tests: published tests that can go into a series
manage.get("/available-tests", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.exam, t.is_contest, t.starts_at, t.ends_at, t.duration_minutes,
            COUNT(tq.question_id)::int AS question_count,
            COALESCE(SUM(tq.marks_correct), 0)::float8 AS total_marks
     FROM tests t LEFT JOIN test_questions tq ON tq.test_id = t.id
     WHERE t.status = 'published' AND t.kind = 'standard'
     GROUP BY t.id
     ORDER BY t.published_at DESC`
  );
  res.json({ tests: rows });
});

// POST /api/series/manage: create a draft
manage.post("/", async (req, res) => {
  const { error, value: s } = validate(req.body);
  if (error) return res.status(400).json({ error });
  const { rows: [row] } = await pool.query(
    "INSERT INTO test_series (title, description, exam, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
    [s.title, s.description, s.exam, req.user.id]
  );
  res.status(201).json({ id: row.id });
});

// GET /api/series/manage/:id
manage.get("/:id", async (req, res) => {
  const s = await ownSeries(req, res);
  if (!s) return;
  const { rows: tests } = await pool.query(TESTS_IN_SERIES, [s.id]);
  const { rows: [e] } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM series_enrollments WHERE series_id = $1", [s.id]
  );
  res.json({ series: { ...s, enrolled: e.n }, tests });
});

// PATCH /api/series/manage/:id: title, description, exam
manage.patch("/:id", async (req, res) => {
  const s = await ownSeries(req, res);
  if (!s) return;
  const { error, value } = validate(req.body);
  if (error) return res.status(400).json({ error });
  await pool.query(
    "UPDATE test_series SET title=$1, description=$2, exam=$3, updated_at=now() WHERE id=$4",
    [value.title, value.description, value.exam, s.id]
  );
  res.json({ saved: true });
});

// PUT /api/series/manage/:id/tests  { test_ids: [4, 7, 2] }: replaces the ordered list
manage.put("/:id/tests", async (req, res) => {
  const s = await ownSeries(req, res);
  if (!s) return;
  const ids = Array.isArray(req.body.test_ids) ? req.body.test_ids.map(Number) : null;
  if (!ids || ids.some((n) => !Number.isInteger(n))) return res.status(400).json({ error: "test_ids must be a list" });
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: "A test can only appear once" });
  if (ids.length > 200) return res.status(400).json({ error: "A series can have at most 200 tests" });

  if (ids.length) {
    const { rows: [ok] } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM tests WHERE id = ANY($1) AND status = 'published' AND kind = 'standard'",
      [ids]
    );
    if (ok.n !== ids.length) return res.status(400).json({ error: "Only published tests can be added to a series" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM series_tests WHERE series_id = $1", [s.id]);
    if (ids.length) {
      await client.query(
        `INSERT INTO series_tests (series_id, test_id, position)
         SELECT $1, x.id, x.pos FROM unnest($2::int[]) WITH ORDINALITY AS x(id, pos)`,
        [s.id, ids]
      );
    }
    await client.query("UPDATE test_series SET updated_at = now() WHERE id = $1", [s.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ saved: ids.length });
});

// POST /api/series/manage/:id/publish
manage.post("/:id/publish", async (req, res) => {
  const s = await ownSeries(req, res);
  if (!s) return;
  const { rows: [c] } = await pool.query("SELECT COUNT(*)::int AS n FROM series_tests WHERE series_id = $1", [s.id]);
  if (!c.n) return res.status(400).json({ error: "Add at least one test before publishing" });
  await pool.query(
    "UPDATE test_series SET status='published', published_at=COALESCE(published_at, now()), updated_at=now() WHERE id=$1",
    [s.id]
  );
  res.json({ status: "published" });
});

// POST /api/series/manage/:id/unpublish: enrolments are kept
manage.post("/:id/unpublish", async (req, res) => {
  const s = await ownSeries(req, res);
  if (!s) return;
  await pool.query("UPDATE test_series SET status='draft', updated_at=now() WHERE id=$1", [s.id]);
  res.json({ status: "draft" });
});

// DELETE /api/series/manage/:id: only if nobody has enrolled
manage.delete("/:id", async (req, res) => {
  const s = await ownSeries(req, res);
  if (!s) return;
  const { rows: [e] } = await pool.query("SELECT COUNT(*)::int AS n FROM series_enrollments WHERE series_id = $1", [s.id]);
  if (e.n) return res.status(409).json({ error: "Students have enrolled in this series. Unpublish it instead." });
  await pool.query("DELETE FROM test_series WHERE id = $1", [s.id]);
  res.json({ deleted: true });
});

// GET /api/series/manage/:id/report: enrolled students and per-test results
manage.get("/:id/report", async (req, res) => {
  const s = await ownSeries(req, res);
  if (!s) return;
  const [{ rows: tests }, { rows: students }, { rows: attempts }] = await Promise.all([
    pool.query(TESTS_IN_SERIES, [s.id]),
    pool.query(
      `SELECT u.id, u.name, e.enrolled_at
       FROM series_enrollments e JOIN users u ON u.id = e.student_id
       WHERE e.series_id = $1 ORDER BY e.enrolled_at`,
      [s.id]
    ),
    pool.query(
      `SELECT a.student_id, a.test_id, a.status, a.score::float8 AS score, a.max_score::float8 AS max_score,
              COALESCE(a.submitted_at, a.started_at) AS at
       FROM attempts a
       JOIN series_tests st ON st.test_id = a.test_id AND st.series_id = $1
       JOIN series_enrollments e ON e.series_id = $1 AND e.student_id = a.student_id`,
      [s.id]
    ),
  ]);

  const done = attempts.filter((a) => a.status === "submitted");

  const studentRows = students.map((st) => {
    const mine = attempts.filter((a) => a.student_id === st.id);
    const finished = mine.filter((a) => a.status === "submitted");
    const last = mine.reduce((m, a) => (!m || new Date(a.at) > new Date(m) ? a.at : m), null);
    return {
      id: st.id,
      name: st.name,
      enrolled_at: st.enrolled_at,
      completed: finished.length,
      in_progress: mine.length - finished.length,
      avg_pct: avg(finished.map((a) => pct(a.score, a.max_score)).filter((x) => x != null)),
      last_activity: last,
    };
  });

  const testRows = tests.map((t) => {
    const scores = done.filter((a) => a.test_id === t.id).map((a) => pct(a.score, a.max_score)).filter((x) => x != null);
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      is_contest: t.is_contest,
      taken: scores.length,
      avg_pct: avg(scores),
      best_pct: scores.length ? Math.max(...scores) : null,
    };
  });

  res.json({ enrolled: students.length, students: studentRows, tests: testRows });
});

router.use("/manage", manage);

// =====================================================================
// Students: browse, enrol, follow a series
// =====================================================================
const student = express.Router();
student.use(requireRole("student"));

// GET /api/series: every published series with my progress
student.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.description, s.exam, s.published_at, u.name AS author,
            COUNT(DISTINCT t.id)::int AS test_count,
            COUNT(DISTINCT a.test_id) FILTER (WHERE a.status = 'submitted')::int AS completed,
            (SELECT COUNT(*)::int FROM series_enrollments e WHERE e.series_id = s.id) AS enrolled,
            EXISTS (SELECT 1 FROM series_enrollments e WHERE e.series_id = s.id AND e.student_id = $1) AS is_enrolled
     FROM test_series s
     LEFT JOIN users u ON u.id = s.created_by
     LEFT JOIN series_tests st ON st.series_id = s.id
     LEFT JOIN tests t ON t.id = st.test_id AND t.status = 'published' AND t.kind = 'standard'
     LEFT JOIN attempts a ON a.test_id = t.id AND a.student_id = $1
     WHERE s.status = 'published'
     GROUP BY s.id, u.name
     ORDER BY is_enrolled DESC, s.published_at DESC`,
    [req.user.id]
  );
  res.json({ series: rows });
});

// GET /api/series/:id: one series with my status on every test
student.get("/:id", async (req, res) => {
  const { rows: [s] } = await pool.query(
    `SELECT s.id, s.title, s.description, s.exam, s.published_at, u.name AS author,
            (SELECT COUNT(*)::int FROM series_enrollments e WHERE e.series_id = s.id) AS enrolled,
            EXISTS (SELECT 1 FROM series_enrollments e WHERE e.series_id = s.id AND e.student_id = $2) AS is_enrolled
     FROM test_series s LEFT JOIN users u ON u.id = s.created_by
     WHERE s.id = $1 AND s.status = 'published'`,
    [req.params.id, req.user.id]
  );
  if (!s) return res.status(404).json({ error: "Series not found" });

  const { rows: tests } = await pool.query(
    `SELECT t.id, t.title, t.exam, t.duration_minutes, t.is_contest, t.starts_at, t.ends_at, st.position,
            (SELECT COUNT(*)::int FROM test_questions tq WHERE tq.test_id = t.id) AS question_count,
            (SELECT COALESCE(SUM(tq.marks_correct), 0)::float8 FROM test_questions tq WHERE tq.test_id = t.id) AS total_marks,
            a.id AS attempt_id, a.status AS attempt_status, a.deadline,
            CASE WHEN t.is_contest AND t.ends_at > now() THEN NULL ELSE a.score::float8 END AS score,
            a.max_score::float8 AS max_score
     FROM series_tests st
     JOIN tests t ON t.id = st.test_id AND t.status = 'published' AND t.kind = 'standard'
     LEFT JOIN attempts a ON a.test_id = t.id AND a.student_id = $2
     WHERE st.series_id = $1
     ORDER BY st.position`,
    [s.id, req.user.id]
  );

  const finished = tests.filter((t) => t.attempt_status === "submitted");
  res.json({
    series: s,
    tests,
    progress: {
      completed: finished.length,
      total: tests.length,
      pct: pct(finished.length, tests.length) ?? 0,
      avg_pct: avg(finished.filter((t) => t.score != null).map((t) => pct(t.score, t.max_score))),
    },
  });
});

// POST /api/series/:id/enroll
student.post("/:id/enroll", async (req, res) => {
  const { rows: [s] } = await pool.query(
    "SELECT id FROM test_series WHERE id = $1 AND status = 'published'", [req.params.id]
  );
  if (!s) return res.status(404).json({ error: "Series not found" });
  await pool.query(
    "INSERT INTO series_enrollments (series_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [s.id, req.user.id]
  );
  res.json({ enrolled: true });
});

// DELETE /api/series/:id/enroll: leave (test results are kept)
student.delete("/:id/enroll", async (req, res) => {
  await pool.query(
    "DELETE FROM series_enrollments WHERE series_id = $1 AND student_id = $2", [req.params.id, req.user.id]
  );
  res.json({ enrolled: false });
});

router.use("/", student);

module.exports = router;
