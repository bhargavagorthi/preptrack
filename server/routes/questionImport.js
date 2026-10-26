const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("./questions");
const { EXAMS, EXAM_LABEL, loadTree, pathResolver, saveTags } = require("../lib/syllabus");

const router = express.Router();
router.use(requireAuth, requireRole("creator", "admin"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const MAX_ROWS = 1000;
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const PATH_COLUMNS = { jee_main: "main_path", jee_advanced: "advanced_path" };
const COLUMNS = [
  "main_path", "advanced_path", "type", "question",
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

// Load both syllabus trees. The import only MATCHES against them and never creates anything.
async function loadSyllabus() {
  const trees = {};
  for (const exam of EXAMS) {
    const nodes = await loadTree(exam);
    trees[exam] = { nodes, resolve: pathResolver(nodes) };
  }
  return trees;
}

// Turn one spreadsheet row into a question, collecting every problem found
function buildQuestion(raw, syl) {
  const errors = [];
  const tags = {};
  for (const exam of EXAMS) {
    const text = raw[PATH_COLUMNS[exam]];
    if (!text) continue;
    const found = syl[exam].resolve(text);
    if (found.error) errors.push(`${EXAM_LABEL[exam]}: ${found.error}`);
    else if (found.node) tags[exam] = found.node.id;
  }
  if (!raw.main_path && !raw.advanced_path) errors.push("Fill main_path, advanced_path, or both");

  const type = TYPE_ALIASES[norm(raw.type)];
  if (!type) {
    errors.push(`Type "${raw.type || ""}" must be single, multiple or numerical`);
    return { errors };
  }

  const body = {
    tags: Object.keys(tags).length ? tags : { jee_main: -1 },
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
  if (error && !(errors.length && /tag/i.test(error))) errors.push(error);
  return errors.length ? { errors } : { errors, question: value };
}

// Validate every row, then flag duplicates in the file and in the existing bank
async function processRows(rawRows) {
  const syl = await loadSyllabus();
  const results = rawRows.map((raw) => ({ row: raw.row, raw, ...buildQuestion(raw, syl) }));

  const seen = new Map();
  for (const r of results) {
    if (!r.question) continue;
    const key = norm(r.question.text);
    if (seen.has(key)) {
      r.errors.push(`Duplicate of row ${seen.get(key)}`);
      delete r.question;
    } else seen.set(key, r.row);
  }

  const texts = [...seen.keys()];
  if (texts.length) {
    const { rows } = await pool.query(
      "SELECT lower(trim(text)) AS text FROM questions WHERE lower(trim(text)) = ANY($1)",
      [texts]
    );
    const existing = new Set(rows.map((x) => x.text));
    for (const r of results) {
      if (r.question && existing.has(norm(r.question.text))) {
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
  const missing = ["type", "question", "correct"].filter((h) => !headers[h]);
  if (!headers.main_path && !headers.advanced_path) missing.unshift("main_path / advanced_path");
  if (missing.length) throw new Error(`missing column(s): ${missing.join(", ")}. Please use the template.`);

  const get = (row, key) => (headers[key] ? row.getCell(headers[key]).text.trim() : "");
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const raw = {
      row: n,
      main_path: get(row, "main_path"),
      advanced_path: get(row, "advanced_path"),
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
    const isEmpty = !raw.question && !raw.main_path && !raw.advanced_path;
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

  const pick = (exam) => {
    const n = syl[exam].nodes.find((x) => x.level === "topic") || syl[exam].nodes.find((x) => x.level === "chapter");
    return n ? n.ids.map((id) => syl[exam].nodes.find((x) => x.id === id).name).join(" > ") : "";
  };
  const base = { main_path: pick("jee_main"), advanced_path: pick("jee_advanced") };
  ws.addRow({ ...base, type: "single", question: "EXAMPLE: Which of these is a vector quantity?",
    option_a: "Speed", option_b: "Velocity", option_c: "Distance", option_d: "Mass",
    correct: "B", difficulty: "easy", solution: "Velocity has both magnitude and direction." });
  ws.addRow({ ...base, advanced_path: "", type: "multiple", question: "EXAMPLE: Which of these are SI base units?",
    option_a: "kilogram", option_b: "newton", option_c: "ampere", option_d: "joule",
    correct: "A,C", difficulty: "medium" });
  ws.addRow({ ...base, type: "numerical",
    question: "EXAMPLE: A body starts from rest with acceleration $2\\,\\text{m/s}^2$. Its speed in m/s after 5 s is?",
    correct: 10, tolerance: 0, difficulty: "easy", solution: "$v = u + at = 0 + 2 \\times 5 = 10$" });
  ws.getRows(2, 3).forEach((r) => (r.font = { italic: true, color: { argb: "FF888888" } }));

  ws.dataValidations.add("C2:C1001", { type: "list", allowBlank: true, formulae: ['"single,multiple,numerical"'] });
  ws.dataValidations.add("M2:M1001", { type: "list", allowBlank: true, formulae: ['"easy,medium,hard"'] });

  for (const exam of EXAMS) {
    const sheet = wb.addWorksheet(exam === "jee_main" ? "Valid paths - Main" : "Valid paths - Advanced");
    sheet.columns = [{ header: "level", key: "level", width: 10 }, { header: "path", key: "path", width: 110 }];
    sheet.getRow(1).font = { bold: true };
    const byId = new Map(syl[exam].nodes.map((n) => [n.id, n]));
    for (const n of syl[exam].nodes) {
      if (["subject", "cluster"].includes(n.level)) continue;
      sheet.addRow({ level: n.level, path: n.ids.map((id) => byId.get(id).name).join(" > ") });
    }
  }

  const help = wb.addWorksheet("Instructions");
  help.getColumn(1).width = 110;
  [
    "PrepTrack question import",
    "",
    "• One question per row on the 'Questions' sheet. Rows starting with 'EXAMPLE:' are ignored.",
    "• main_path / advanced_path: where the question sits in each syllabus. Fill one or both.",
    "  Write it as  Subject > Cluster > Chapter > Topic > Subtopic > Section  and stop at any level from chapter down.",
    "  You can leave out levels (e.g. Physics > Kinematics > Projectile Motion) if the result is still unique.",
    "  Copy exact paths from the 'Valid paths' sheets.",
    "• The import never creates syllabus entries. Ask a creator to add them on the Syllabus page first.",
    "• Math: write $...$ for inline formulas and $$...$$ for display formulas.",
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
      path: [r.raw.main_path && `Main: ${r.raw.main_path}`, r.raw.advanced_path && `Adv: ${r.raw.advanced_path}`]
        .filter(Boolean).join("  ·  "),
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
      const { rows: [row] } = await client.query(
        `INSERT INTO questions
           (type, text, options, answer, solution, difficulty, marks_correct, marks_wrong, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [q.type, q.text, q.options && JSON.stringify(q.options), JSON.stringify(q.answer),
         q.solution, q.difficulty, q.marks_correct, q.marks_wrong, req.user.id]
      );
      await saveTags(client, row.id, q.tags);
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
