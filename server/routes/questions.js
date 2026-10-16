const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const storage = require("../lib/storage");

const router = express.Router();
// These routes return answers, so students must never reach them
router.use(requireAuth, requireRole("creator", "admin"));

const TYPES = ["single", "multiple", "numerical"];
const DIFFICULTIES = ["easy", "medium", "hard"];

// Check the incoming question and return a clean version, or an error message
function validate(b) {
  if (!TYPES.includes(b.type)) return { error: "Type must be single, multiple or numerical" };
  const text = (b.text || "").trim();
  if (!text) return { error: "Question text is required" };
  if (!b.topic_id) return { error: "Pick a topic" };
  const difficulty = b.difficulty || "medium";
  if (!DIFFICULTIES.includes(difficulty)) return { error: "Invalid difficulty" };

  const image_url = b.image_url ? String(b.image_url) : null;
  if (image_url && !storage.isOurUrl(image_url)) return { error: "Invalid question image" };

  let options = null;
  let answer;
  if (b.type === "numerical") {
    if (b.answer?.value === "" || b.answer?.value == null) return { error: "Enter the numerical answer" };
    const value = Number(b.answer.value);
    const tolerance = Number(b.answer.tolerance || 0);
    if (!Number.isFinite(value)) return { error: "Answer must be a number" };
    if (!Number.isFinite(tolerance) || tolerance < 0) return { error: "Tolerance must be 0 or more" };
    answer = { value, tolerance };
  } else {
    options = (b.options || []).map((o) => {
      const opt = { id: String(o.id), text: String(o.text || "").trim() };
      if (o.image) opt.image = String(o.image);
      return opt;
    });
    if (options.length < 2) return { error: "Add at least 2 options" };
    if (options.some((o) => o.image && !storage.isOurUrl(o.image))) return { error: "Invalid option image" };
    if (options.some((o) => !o.text && !o.image)) return { error: "Each option needs text or an image" };
    const ids = options.map((o) => o.id);
    answer = (Array.isArray(b.answer) ? b.answer : []).filter((id) => ids.includes(id));
    if (b.type === "single" && answer.length !== 1)
      return { error: "Single-correct questions need exactly 1 correct option" };
    if (b.type === "multiple" && answer.length < 1) return { error: "Mark at least 1 correct option" };
  }

  const marks_correct = Number(b.marks_correct ?? 4);
  const marks_wrong = Number(b.marks_wrong ?? -1);
  if (!Number.isFinite(marks_correct) || marks_correct <= 0)
    return { error: "Marks for a correct answer must be more than 0" };
  if (!Number.isFinite(marks_wrong) || marks_wrong > 0)
    return { error: "Marks for a wrong answer must be 0 or negative" };

  return {
    value: {
      topic_id: b.topic_id, type: b.type, text, image_url, difficulty, options, answer,
      solution: (b.solution || "").trim() || null, marks_correct, marks_wrong,
    },
  };
}

// GET /api/questions?subject_id=&chapter_id=&topic_id=&type=&difficulty=&search=&page=
router.get("/", async (req, res) => {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  const { subject_id, chapter_id, topic_id, type, difficulty, search } = req.query;
  if (topic_id) add("q.topic_id = ?", topic_id);
  else if (chapter_id) add("t.chapter_id = ?", chapter_id);
  else if (subject_id) add("c.subject_id = ?", subject_id);
  if (type) add("q.type = ?", type);
  if (difficulty) add("q.difficulty = ?", difficulty);
  if (search) add("q.text ILIKE ?", `%${search}%`);
  const page = Math.max(1, Number(req.query.page) || 1);

  const { rows } = await pool.query(
    `SELECT q.id, q.type, q.text, q.image_url, q.options, q.answer, q.solution, q.difficulty,
            q.marks_correct::float8 AS marks_correct, q.marks_wrong::float8 AS marks_wrong,
            q.created_by, q.created_at,
            t.id AS topic_id, t.name AS topic,
            c.id AS chapter_id, c.name AS chapter,
            s.id AS subject_id, s.name AS subject,
            u.name AS author,
            COUNT(*) OVER() AS total
     FROM questions q
     JOIN topics t ON t.id = q.topic_id
     JOIN chapters c ON c.id = t.chapter_id
     JOIN subjects s ON s.id = c.subject_id
     LEFT JOIN users u ON u.id = q.created_by
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY q.created_at DESC
     LIMIT 50 OFFSET ${(page - 1) * 50}`,
    params
  );
  res.json({
    questions: rows.map(({ total, ...q }) => q),
    total: Number(rows[0]?.total || 0),
    page,
  });
});

// POST /api/questions
router.post("/", async (req, res) => {
  const { error, value: q } = validate(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const { rows } = await pool.query(
      `INSERT INTO questions
         (topic_id, type, text, image_url, options, answer, solution, difficulty, marks_correct, marks_wrong, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [q.topic_id, q.type, q.text, q.image_url, q.options && JSON.stringify(q.options), JSON.stringify(q.answer),
       q.solution, q.difficulty, q.marks_correct, q.marks_wrong, req.user.id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === "23503") return res.status(400).json({ error: "Topic not found" });
    throw err;
  }
});

// PATCH /api/questions/:id: creators can edit their own; admins can edit any
router.patch("/:id", async (req, res) => {
  const used = await pool.query(
    `SELECT 1 FROM test_questions tq JOIN tests t ON t.id = tq.test_id
     WHERE tq.question_id = $1 AND t.status = 'published' AND t.kind = 'standard' LIMIT 1`,
    [req.params.id]
  );
  if (used.rowCount)
    return res.status(409).json({
      error: "This question is in a published test. Unpublish that test first, or create a new question.",
    });

  const { error, value: q } = validate(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const { rows } = await pool.query(
      `UPDATE questions SET topic_id=$1, type=$2, text=$3, image_url=$4, options=$5, answer=$6, solution=$7,
              difficulty=$8, marks_correct=$9, marks_wrong=$10, updated_at=now()
       WHERE id=$11 AND (created_by=$12 OR $13::boolean)
       RETURNING id`,
      [q.topic_id, q.type, q.text, q.image_url, q.options && JSON.stringify(q.options), JSON.stringify(q.answer),
       q.solution, q.difficulty, q.marks_correct, q.marks_wrong,
       req.params.id, req.user.id, req.user.role === "admin"]
    );
    if (!rows[0]) return res.status(404).json({ error: "Question not found, or it isn't yours to edit" });
    res.json({ id: rows[0].id });
  } catch (err) {
    if (err.code === "23503") return res.status(400).json({ error: "Topic not found" });
    throw err;
  }
});

// DELETE /api/questions/:id: same ownership rule; blocked if a test uses it
router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM questions WHERE id=$1 AND (created_by=$2 OR $3::boolean)",
      [req.params.id, req.user.id, req.user.role === "admin"]
    );
    if (!rowCount) return res.status(404).json({ error: "Question not found, or it isn't yours to delete" });
    res.json({ deleted: true });
  } catch (err) {
    if (err.code === "23503")
      return res.status(409).json({ error: "This question is used in a test. Remove it from the test first." });
    throw err;
  }
});

module.exports = router;
module.exports.validate = validate; // reused by the Excel import
