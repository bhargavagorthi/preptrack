const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const storage = require("../lib/storage");
const { cleanTags, verifyTags, saveTags, subtreeIds, EXAMS } = require("../lib/syllabus");

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
  const tagCheck = cleanTags(b.tags);
  if (tagCheck.error) return { error: tagCheck.error };
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
      tags: tagCheck.value, type: b.type, text, image_url, difficulty, options, answer,
      solution: (b.solution || "").trim() || null, marks_correct, marks_wrong,
    },
  };
}


// Columns describing a question's syllabus tags (needs "LEFT JOIN question_tags qt ON qt.question_id = q.id")
const TAG_COLUMNS = `
  qt.main_node_id, qt.main_level, qt.main_path, qt.main_subject, qt.main_chapter, qt.main_topic,
  qt.adv_node_id, qt.adv_level, qt.adv_path, qt.adv_subject, qt.adv_chapter, qt.adv_topic`;

// Turn the flat tag columns into { tags: {jee_main, jee_advanced}, subject, chapter, topic, path }
function shapeTags(row) {
  const {
    main_node_id, main_level, main_path, main_subject, main_chapter, main_topic,
    adv_node_id, adv_level, adv_path, adv_subject, adv_chapter, adv_topic, ...rest
  } = row;
  const main = main_node_id ? { node_id: main_node_id, level: main_level, path: main_path } : null;
  const adv = adv_node_id ? { node_id: adv_node_id, level: adv_level, path: adv_path } : null;
  const primary = main_node_id
    ? { subject: main_subject, chapter: main_chapter, topic: main_topic, path: main_path }
    : { subject: adv_subject, chapter: adv_chapter, topic: adv_topic, path: adv_path };
  return { ...rest, tags: { jee_main: main, jee_advanced: adv }, ...primary };
}

// Filters shared by the list and the per-node counts. Returns { where: [...], params: [...] }.
// mine=1 → only my questions · since=today|7d|30d → added recently · type, difficulty, search
const SINCE = { today: "date_trunc('day', now())", "7d": "now() - interval '7 days'", "30d": "now() - interval '30 days'" };
function baseFilters(query, user) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  const { type, difficulty, search, mine, since } = query;
  if (mine === "1") add("q.created_by = ?", user.id);
  if (SINCE[since]) where.push(`q.created_at >= ${SINCE[since]}`);
  if (TYPES.includes(type)) add("q.type = ?", type);
  if (DIFFICULTIES.includes(difficulty)) add("q.difficulty = ?", difficulty);
  if (search) {
    // "#12" or "12" finds a question by its number too
    const id = /^#?\d+$/.test(search.trim()) ? Number(search.trim().replace("#", "")) : null;
    if (id) {
      params.push(id, `%${search}%`);
      where.push(`(q.id = $${params.length - 1} OR q.text ILIKE $${params.length})`);
    } else {
      add("(q.text ILIKE ? OR q.solution ILIKE ?)", `%${search}%`);
    }
  }
  return { where, params, add };
}

const SORTS = {
  newest: "q.created_at DESC, q.id DESC",
  oldest: "q.created_at ASC, q.id ASC",
  updated: "q.updated_at DESC NULLS LAST, q.id DESC",
};

// A question in a published standard test can only be re-tagged, not edited
const LOCKED_SQL = `EXISTS (SELECT 1 FROM test_questions tq JOIN tests t ON t.id = tq.test_id
                            WHERE tq.question_id = q.id AND t.status = 'published' AND t.kind = 'standard')`;

// GET /api/questions?exam=&node_id=&untagged=1&type=&difficulty=&search=&mine=1&since=&sort=&page=
router.get("/", async (req, res) => {
  const { where, params, add } = baseFilters(req.query, req.user);
  const { exam, node_id, untagged } = req.query;
  if (untagged === "1") {
    where.push("NOT EXISTS (SELECT 1 FROM question_nodes qn WHERE qn.question_id = q.id)");
  } else if (node_id) {
    const ids = await subtreeIds(Number(node_id) || 0);
    add("EXISTS (SELECT 1 FROM question_nodes qn WHERE qn.question_id = q.id AND qn.node_id = ANY(?))", ids);
  } else if (EXAMS.includes(exam)) {
    add("EXISTS (SELECT 1 FROM question_nodes qn WHERE qn.question_id = q.id AND qn.exam = ?)", exam);
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const order = SORTS[req.query.sort] || SORTS.newest;
  params.push(req.user.id, req.user.role === "admin");
  const me = `$${params.length - 1}`;
  const admin = `$${params.length}::boolean`;

  const { rows } = await pool.query(
    `SELECT q.id, q.type, q.text, q.image_url, q.options, q.answer, q.solution, q.difficulty,
            q.marks_correct::float8 AS marks_correct, q.marks_wrong::float8 AS marks_wrong,
            q.created_by, q.created_at, q.updated_at, u.name AS author, ${TAG_COLUMNS},
            (q.created_by = ${me} OR ${admin}) AS can_edit,
            ${LOCKED_SQL} AS locked,
            (SELECT COUNT(*)::int FROM test_questions tq WHERE tq.question_id = q.id) AS used_in_tests,
            COUNT(*) OVER() AS total
     FROM questions q
     LEFT JOIN question_tags qt ON qt.question_id = q.id
     LEFT JOIN users u ON u.id = q.created_by
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY ${order}
     LIMIT 50 OFFSET ${(page - 1) * 50}`,
    params
  );
  const { rows: [counts] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM question_nodes qn WHERE qn.question_id = q.id))::int AS untagged
     FROM questions q`
  );
  res.json({
    questions: rows.map(({ total, ...q }) => shapeTags(q)),
    total: Number(rows[0]?.total || 0),
    untagged_total: counts.untagged,
    page,
  });
});

// GET /api/questions/coverage?exam=jee_main&(same filters): questions tagged directly to each node,
// so the syllabus browser can show counts that follow the creator's filters
router.get("/coverage", async (req, res) => {
  if (!EXAMS.includes(req.query.exam)) return res.status(400).json({ error: "exam must be jee_main or jee_advanced" });
  const { where, params, add } = baseFilters(req.query, req.user);
  add("qn.exam = ?", req.query.exam);
  const { rows } = await pool.query(
    `SELECT qn.node_id, COUNT(*)::int AS n
     FROM question_nodes qn JOIN questions q ON q.id = qn.question_id
     WHERE ${where.join(" AND ")}
     GROUP BY qn.node_id`,
    params
  );
  res.json({ counts: Object.fromEntries(rows.map((r) => [r.node_id, r.n])) });
});

// POST /api/questions
router.post("/", async (req, res) => {
  const { error, value: q } = validate(req.body);
  if (error) return res.status(400).json({ error });
  const tagError = await verifyTags(q.tags);
  if (tagError) return res.status(400).json({ error: tagError });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO questions
         (type, text, image_url, options, answer, solution, difficulty, marks_correct, marks_wrong, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [q.type, q.text, q.image_url, q.options && JSON.stringify(q.options), JSON.stringify(q.answer),
       q.solution, q.difficulty, q.marks_correct, q.marks_wrong, req.user.id]
    );
    await saveTags(client, rows[0].id, q.tags);
    await client.query("COMMIT");
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

const ownsOrAdmin = "(created_by = $2 OR $3::boolean)";

// PATCH /api/questions/:id: creators can edit their own; admins can edit any
router.patch("/:id", async (req, res) => {
  const used = await pool.query(
    `SELECT 1 FROM test_questions tq JOIN tests t ON t.id = tq.test_id
     WHERE tq.question_id = $1 AND t.status = 'published' AND t.kind = 'standard' LIMIT 1`,
    [req.params.id]
  );
  if (used.rowCount)
    return res.status(409).json({
      error: "This question is in a published test, so only its syllabus tags can be changed. Unpublish that test first, or create a new question.",
    });

  const { error, value: q } = validate(req.body);
  if (error) return res.status(400).json({ error });
  const tagError = await verifyTags(q.tags);
  if (tagError) return res.status(400).json({ error: tagError });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE questions SET type=$4, text=$5, image_url=$6, options=$7, answer=$8, solution=$9,
              difficulty=$10, marks_correct=$11, marks_wrong=$12, updated_at=now()
       WHERE id=$1 AND ${ownsOrAdmin}
       RETURNING id`,
      [req.params.id, req.user.id, req.user.role === "admin",
       q.type, q.text, q.image_url, q.options && JSON.stringify(q.options), JSON.stringify(q.answer),
       q.solution, q.difficulty, q.marks_correct, q.marks_wrong]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Question not found, or it isn't yours to edit" });
    }
    await saveTags(client, rows[0].id, q.tags);
    await client.query("COMMIT");
    res.json({ id: rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/questions/:id/tags  { tags }: re-tag only. Allowed even when the question is in a
// published test, because tags don't change how anything is scored.
router.put("/:id/tags", async (req, res) => {
  const { error, value: tags } = cleanTags(req.body.tags);
  if (error) return res.status(400).json({ error });
  const tagError = await verifyTags(tags);
  if (tagError) return res.status(400).json({ error: tagError });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `SELECT 1 FROM questions WHERE id = $1 AND ${ownsOrAdmin}`,
      [req.params.id, req.user.id, req.user.role === "admin"]
    );
    if (!rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Question not found, or it isn't yours to edit" });
    }
    await saveTags(client, Number(req.params.id), tags);
    await client.query("COMMIT");
    res.json({ saved: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/questions/bulk-tag  { question_ids: [...], exam, node_id }: set one tree's tag on many questions
router.post("/bulk-tag", async (req, res) => {
  const ids = Array.isArray(req.body.question_ids) ? req.body.question_ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return res.status(400).json({ error: "Select some questions first" });
  if (ids.length > 500) return res.status(400).json({ error: "Tag at most 500 questions at a time" });
  const exam = req.body.exam;
  if (!EXAMS.includes(exam)) return res.status(400).json({ error: "Choose JEE Main or JEE Advanced" });
  const tags = { [exam]: Number(req.body.node_id) };
  const tagError = await verifyTags(tags);
  if (tagError) return res.status(400).json({ error: tagError });

  const { rows: allowed } = await pool.query(
    `SELECT id FROM questions WHERE id = ANY($1) AND (created_by = $2 OR $3::boolean)`,
    [ids, req.user.id, req.user.role === "admin"]
  );
  const okIds = allowed.map((r) => r.id);
  if (okIds.length) {
    await pool.query(
      `INSERT INTO question_nodes (question_id, exam, node_id)
       SELECT unnest($1::int[]), $2, $3
       ON CONFLICT (question_id, exam) DO UPDATE SET node_id = EXCLUDED.node_id`,
      [okIds, exam, tags[exam]]
    );
  }
  res.json({ tagged: okIds.length, skipped: ids.length - okIds.length });
});

// DELETE /api/questions/:id: same ownership rule; blocked if a test uses it
router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM questions WHERE id=$1 AND ${ownsOrAdmin}`,
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
module.exports.TAG_COLUMNS = TAG_COLUMNS;
module.exports.shapeTags = shapeTags;
