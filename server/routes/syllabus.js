const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth); // any logged-in user can read the syllabus
const canEdit = requireRole("creator", "admin"); // only these can change it

// Whitelist: table names never come straight from user input
const LEVELS = {
  subjects: { table: "subjects" },
  chapters: { table: "chapters", parentCol: "subject_id" },
  topics: { table: "topics", parentCol: "chapter_id" },
};

// GET /api/syllabus — the full tree: subjects → chapters → topics
router.get("/", async (req, res) => {
  const [s, c, t] = await Promise.all([
    pool.query("SELECT id, name FROM subjects ORDER BY position, id"),
    pool.query("SELECT id, subject_id, name FROM chapters ORDER BY position, id"),
    pool.query("SELECT id, chapter_id, name FROM topics ORDER BY position, id"),
  ]);
  const subjects = s.rows.map((sub) => ({
    ...sub,
    chapters: c.rows
      .filter((ch) => ch.subject_id === sub.id)
      .map((ch) => ({ ...ch, topics: t.rows.filter((tp) => tp.chapter_id === ch.id) })),
  }));
  res.json({ subjects });
});

// POST /api/syllabus/subjects  { name }
// POST /api/syllabus/chapters  { name, subject_id }
// POST /api/syllabus/topics    { name, chapter_id }
router.post("/:level", canEdit, async (req, res) => {
  const level = LEVELS[req.params.level];
  if (!level) return res.status(404).json({ error: "Unknown level" });
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });

  const cols = ["name", "created_by"];
  const vals = [name, req.user.id];
  if (level.parentCol) {
    const parentId = req.body[level.parentCol];
    if (!parentId) return res.status(400).json({ error: `${level.parentCol} is required` });
    cols.push(level.parentCol);
    vals.push(parentId);
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");

  try {
    const { rows } = await pool.query(
      `INSERT INTO ${level.table} (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    res.status(201).json({ item: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "That name already exists here" });
    if (err.code === "23503") return res.status(400).json({ error: "Parent not found" });
    throw err;
  }
});

// PATCH /api/syllabus/:level/:id  { name } — rename
router.patch("/:level/:id", canEdit, async (req, res) => {
  const level = LEVELS[req.params.level];
  if (!level) return res.status(404).json({ error: "Unknown level" });
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  try {
    const { rows } = await pool.query(
      `UPDATE ${level.table} SET name = $1 WHERE id = $2 RETURNING *`,
      [name, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json({ item: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "That name already exists here" });
    throw err;
  }
});

// DELETE /api/syllabus/:level/:id — also removes everything inside it
router.delete("/:level/:id", canEdit, async (req, res) => {
  const level = LEVELS[req.params.level];
  if (!level) return res.status(404).json({ error: "Unknown level" });
  try {
    const { rowCount } = await pool.query(`DELETE FROM ${level.table} WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (err) {
    if (err.code === "23503")
      return res.status(409).json({ error: "Can't delete: it still contains questions. Delete or move them first." });
    throw err;
  }
});

module.exports = router;
