const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("./questions");

const router = express.Router();
router.use(requireAuth, requireRole("creator", "admin"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const MAX_ROWS = 1000;
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const COLUMNS = [
  "subject", "chapter", "topic", "type", "question",
  ...LETTERS.map((l) => `option_${l.toLowerCase()}`),
  "correct", "tolerance", "difficulty", "marks_correct", "marks_wrong", "solution",
];
const TYPE_ALIASES = {
  single: "single", "single correct": "single", mcq: "single",
  multiple: "multiple", "multiple correct": "multiple",
  numerical: "numerical", numeric: "numerical", integer: "numerical",
};
const DEFAULT_MARKS = { single: [4, -1], multiple: [4, -2], numerical: [4, 0] };
const norm = (s) => String(s ?? "").trim().toLowerCase();
const blank = (v) => v === "" || v == null;

// Load the existing syllabus. The import only MATCHES against it and never creates anything.
async function loadSyllabus() {
  const { rows } = await pool.query(
    `SELECT s.name AS subject, c.name AS chapter, t.name AS topic, t.id AS topic_id
     FROM subjects s
     LEFT JOIN chapters c ON c.subject_id = s.id
     LEFT JOIN topics t ON t.chapter_id = c.id
     ORDER BY s.position, s.id, c.position, c.id, t.position, t.id`
  );
  const subjects = new Set();
  const chapters = new Set();
  const topics = new Map();
  for (const r of rows) {
    subjects.add(norm(r.subject));
    if (r.chapter) chapters.add(`${norm(r.subject)}|${norm(r.chapter)}`);
    if (r.topic) topics.set(`${norm(r.subject)}|${norm(r.chapter)}|${norm(r.topic)}`, r.topic_id);
  }
  return { rows, subjects, chapters, topics };
}

// Turn one spreadsheet row into a question, collecting every problem found
function buildQuestion(raw, syl) {
  const errors = [];
  const s = norm(raw.subject), c = norm(raw.chapter), t = norm(raw.topic);
  let topic_id = null;

  if (!s || !c || !t) errors.push("Subject, chapter and topic are all required");
  else if (!syl.subjects.has(s)) errors.push(`Subject "${raw.subject}" doesn't exist`);
  else if (!syl.chapters.has(`${s}|${c}`)) errors.push(`Chapter "${raw.chapter}" doesn't exist in ${raw.subject}`);
  else if (!syl.topics.has(`${s}|${c}|${t}`)) errors.push(`Topic "${raw.topic}" doesn't exist in ${raw.chapter}`);
  else topic_id = syl.topics.get(`${s}|${c}|${t}`);

  const type = TYPE_ALIASES[norm(raw.type)];
  if (!type) {
    errors.push(`Type "${raw.type || ""}" must be single, multiple or numerical`);
    return { errors };
  }

  const body = {
    topic_id: topic_id ?? -1,
    type,
    text: raw.question,
    difficulty: norm(raw.difficulty) || "medium",
    solution: raw.solution,
    marks_correct: blank(raw.marks_correct) ? DEFAULT_MARKS[type][0] : raw.marks_correct,
    marks_wrong: blank(raw.marks_wrong) ? DEFAULT_MARKS[type][1] : raw.marks_wrong,
  };

  if (type === "numerical") {
    body.answer = { value: String(raw.correct ?? "").trim(), tolerance: blank(raw.tolerance) ? 0 : raw.tolerance };
  } else {
    const filled = LETTERS.filter((l) => String(raw.options?.[l] ?? "").trim());
    const lastIndex = filled.length ? LETTERS.indexOf(filled[filled.length - 1]) : -1;
    if (filled.length !== lastIndex + 1) errors.push("Fill options in order (A, B, C…) with no gaps");
    body.options = filled.map((l) => ({ id: l, text: raw.options[l] }));
    body.answer = String(raw.correct ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean);
    const bad = body.answer.filter((a) => !filled.includes(a));
    if (bad.length) errors.push(`Correct answer ${bad.join(", ")} isn't one of the filled options`);
  }

  const { error, value } = validate(body);
  if (error) errors.push(error);
  return errors.length ? { errors } : { errors, question: value };
}

// Validate every row, then flag duplicates in the file and in the existing bank
async function processRows(rawRows) {
  const syl = await loadSyllabus();
  const results = rawRows.map((raw) => ({ row: raw.row, raw, ...buildQuestion(raw, syl) }));

  const seen = new Map();
  for (const r of results) {
    if (!r.question) continue;
    const key = `${r.question.topic_id}|${norm(r.question.text)}`;
    if (seen.has(key)) {
      r.errors.push(`Duplicate of row ${seen.get(key)}`);
      delete r.question;
    } else seen.set(key, r.row);
  }

  const topicIds = [...new Set(results.filter((r) => r.question).map((r) => r.question.topic_id))];
  if (topicIds.length) {
    const { rows } = await pool.query(
      "SELECT topic_id, lower(trim(text)) AS text FROM questions WHERE topic_id = ANY($1)",
      [topicIds]
    );
    const existing = new Set(rows.map((x) => `${x.topic_id}|${x.text}`));
    for (const r of results) {
      if (r.question && existing.has(`${r.question.topic_id}|${norm(r.question.text)}`)) {
        r.errors.push("Already in the question bank");
        delete r.question;
      }
    }
  }
  return results;
}

// Read the uploaded workbook into plain row objects (columns matched by header name)
async function readRows(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Questions") || wb.worksheets[0];
  if (!ws) throw new Error("The file has no sheets");

  const headers = {};
  ws.getRow(1).eachCell((cell, col) => {
    headers[norm(cell.text).replace(/\s+/g, "_")] = col;
  });
  const missing = ["subject", "chapter", "topic", "type", "question", "correct"].filter((h) => !headers[h]);
  if (missing.length) throw new Error(`missing column(s): ${missing.join(", ")}. Please use the template.`);

  const get = (row, key) => (headers[key] ? row.getCell(headers[key]).text.trim() : "");
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const raw = {
      row: n,
      subject: get(row, "subject"),
      chapter: get(row, "chapter"),
      topic: get(row, "topic"),
      type: get(row, "type"),
      question: get(row, "question"),
      options: Object.fromEntries(LETTERS.map((l) => [l, get(row, `option_${l.toLowerCase()}`)])),
      correct: get(row, "correct"),
      tolerance: get(row, "tolerance"),
      difficulty: get(row, "difficulty"),
      marks_correct: get(row, "marks_correct"),
      marks_wrong: get(row, "marks_wrong"),
      solution: get(row, "solution"),
    };
    const isEmpty = !raw.question && !raw.subject && !raw.topic;
    const isExample = raw.question.toUpperCase().startsWith("EXAMPLE:");
    if (!isEmpty && !isExample) rows.push(raw);
  });
  return rows;
}

// GET /api/questions/import/template
router.get("/template", async (req, res) => {
  const syl = await loadSyllabus();
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("Questions");
  ws.columns = COLUMNS.map((key) => ({
    header: key,
    key,
    width: ["question", "solution"].includes(key) ? 50 : key.startsWith("option") ? 22 : 14,
  }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ex = syl.rows.find((r) => r.topic) || { subject: "Physics", chapter: "Kinematics", topic: "Projectile motion" };
  const base = { subject: ex.subject, chapter: ex.chapter, topic: ex.topic };
  ws.addRow({ ...base, type: "single", question: "EXAMPLE: Which of these is a vector quantity?",
    option_a: "Speed", option_b: "Velocity", option_c: "Distance", option_d: "Mass",
    correct: "B", difficulty: "easy", solution: "Velocity has both magnitude and direction." });
  ws.addRow({ ...base, type: "multiple", question: "EXAMPLE: Which of these are SI base units?",
    option_a: "kilogram", option_b: "newton", option_c: "ampere", option_d: "joule",
    correct: "A,C", difficulty: "medium" });
  ws.addRow({ ...base, type: "numerical",
    question: "EXAMPLE: A body starts from rest with acceleration 2 m/s². Its speed in m/s after 5 s is?",
    correct: 10, tolerance: 0, difficulty: "easy", solution: "v = u + at = 0 + 2 × 5 = 10" });
  ws.getRows(2, 3).forEach((r) => (r.font = { italic: true, color: { argb: "FF888888" } }));

  ws.dataValidations.add("D2:D1001", { type: "list", allowBlank: true, formulae: ['"single,multiple,numerical"'] });
  ws.dataValidations.add("N2:N1001", { type: "list", allowBlank: true, formulae: ['"easy,medium,hard"'] });

  const topicsSheet = wb.addWorksheet("Valid topics");
  topicsSheet.columns = [
    { header: "subject", key: "subject", width: 18 },
    { header: "chapter", key: "chapter", width: 32 },
    { header: "topic", key: "topic", width: 36 },
  ];
  topicsSheet.getRow(1).font = { bold: true };
  syl.rows.filter((r) => r.topic).forEach((r) => topicsSheet.addRow(r));

  const help = wb.addWorksheet("Instructions");
  help.getColumn(1).width = 110;
  [
    "PrepTrack question import",
    "",
    "• One question per row on the 'Questions' sheet. Rows starting with 'EXAMPLE:' are ignored.",
    "• subject / chapter / topic must match an existing entry exactly. See the 'Valid topics' sheet.",
    "• The import never creates chapters or topics. Ask a creator to add them in Syllabus first.",
    "• type: single, multiple or numerical.",
    "• single / multiple: fill option_a, option_b… in order with no gaps (2 to 6 options).",
    "• correct: one letter for single (B), comma-separated letters for multiple (A,C), a number for numerical (9.8).",
    "• tolerance: numerical only. The accepted ± range (leave blank for an exact answer).",
    "• difficulty: easy, medium or hard (blank = medium).",
    "• marks_correct / marks_wrong: leave blank for defaults (single +4/-1, multiple +4/-2, numerical +4/0).",
    "• Maximum 1000 rows and 5 MB per file.",
  ].forEach((line) => help.addRow([line]));
  help.getRow(1).font = { bold: true, size: 14 };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="preptrack-questions-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// POST /api/questions/import/preview: upload a file, get a row-by-row report. Nothing is saved.
router.post("/preview", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an .xlsx file to upload" });
  let rawRows;
  try {
    rawRows = await readRows(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `Couldn't read the file: ${err.message}` });
  }
  if (!rawRows.length) return res.status(400).json({ error: "No question rows found in the file" });
  if (rawRows.length > MAX_ROWS) return res.status(400).json({ error: `Too many rows (max ${MAX_ROWS})` });

  const results = await processRows(rawRows);
  res.json({
    rows: results.map((r) => ({
      row: r.row,
      ok: Boolean(r.question),
      errors: r.errors,
      raw: r.raw,
      path: `${r.raw.subject} › ${r.raw.chapter} › ${r.raw.topic}`,
      type: r.question?.type || r.raw.type,
      text: r.raw.question,
    })),
  });
});

// POST /api/questions/import/commit: re-checks everything, then saves valid rows in one transaction
router.post("/commit", async (req, res) => {
  const rawRows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rawRows.length) return res.status(400).json({ error: "Nothing to import" });
  if (rawRows.length > MAX_ROWS) return res.status(400).json({ error: `Too many rows (max ${MAX_ROWS})` });

  const results = await processRows(rawRows);
  const good = results.filter((r) => r.question);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { question: q } of good) {
      await client.query(
        `INSERT INTO questions
           (topic_id, type, text, options, answer, solution, difficulty, marks_correct, marks_wrong, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [q.topic_id, q.type, q.text, q.options && JSON.stringify(q.options), JSON.stringify(q.answer),
         q.solution, q.difficulty, q.marks_correct, q.marks_wrong, req.user.id]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ imported: good.length, skipped: results.length - good.length });
});

module.exports = router;
