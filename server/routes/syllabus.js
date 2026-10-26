const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { EXAMS, EXAM_LABEL, LEVELS, childLevel, normName, loadTree } = require("../lib/syllabus");

const router = express.Router();
router.use(requireAuth); // anyone logged in can read the syllabus
const canEdit = requireRole("creator", "admin"); // only these can change it

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const MAX_IMPORT_ROWS = 5000;
const MAX_NAME = 200;

const examOf = (v) => (EXAMS.includes(v) ? v : null);

function dbError(err, res) {
  if (err.code === "23505") return res.status(409).json({ error: "Something with that name already exists here" });
  if (err.code === "23503") return res.status(409).json({ error: "Can't delete: questions are tagged to it or something inside it. Re-tag or delete those questions first." });
  if (err.code === "23514") return res.status(400).json({ error: err.message });
  throw err;
}

// GET /api/syllabus?exam=jee_main: every node of one tree, with how many questions are tagged directly to it
router.get("/", async (req, res) => {
  const exam = examOf(req.query.exam);
  if (!exam) return res.status(400).json({ error: "exam must be jee_main or jee_advanced" });
  const [nodes, counts] = await Promise.all([
    loadTree(exam),
    pool.query(
      "SELECT node_id, COUNT(*)::int AS n FROM question_nodes WHERE exam = $1 GROUP BY node_id",
      [exam]
    ),
  ]);
  const direct = new Map(counts.rows.map((r) => [r.node_id, r.n]));
  res.json({
    exam,
    levels: LEVELS,
    nodes: nodes.map((n) => ({
      id: n.id, parent_id: n.parent_id, level: n.level, name: n.name, position: n.position,
      path: n.path, questions: direct.get(n.id) || 0,
    })),
  });
});

// POST /api/syllabus/nodes  { exam, parent_id?, name }: the level is decided by the parent
router.post("/nodes", canEdit, async (req, res) => {
  const exam = examOf(req.body.exam);
  if (!exam) return res.status(400).json({ error: "exam must be jee_main or jee_advanced" });
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  if (name.length > MAX_NAME) return res.status(400).json({ error: `Keep names under ${MAX_NAME} characters` });

  let level = "subject";
  const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
  if (parentId) {
    const { rows: [p] } = await pool.query("SELECT level, exam FROM syllabus_nodes WHERE id = $1", [parentId]);
    if (!p || p.exam !== exam) return res.status(404).json({ error: "Parent not found in this syllabus" });
    level = childLevel(p.level);
    if (!level) return res.status(400).json({ error: "Sections are the deepest level" });
  }
  try {
    const { rows: [node] } = await pool.query(
      `INSERT INTO syllabus_nodes (exam, parent_id, level, name, position, created_by)
       VALUES ($1, $2, $3, $4,
               (SELECT COALESCE(MAX(position), 0) + 1 FROM syllabus_nodes
                WHERE exam = $1 AND parent_id IS NOT DISTINCT FROM $2),
               $5)
       RETURNING id, parent_id, level, name, position`,
      [exam, parentId, level, name, req.user.id]
    );
    res.status(201).json({ node });
  } catch (err) {
    dbError(err, res);
  }
});

// PATCH /api/syllabus/nodes/:id  { name }: rename
router.patch("/nodes/:id", canEdit, async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  if (name.length > MAX_NAME) return res.status(400).json({ error: `Keep names under ${MAX_NAME} characters` });
  try {
    const { rows: [node] } = await pool.query(
      "UPDATE syllabus_nodes SET name = $1 WHERE id = $2 RETURNING id, name", [name, req.params.id]
    );
    if (!node) return res.status(404).json({ error: "Not found" });
    res.json({ node });
  } catch (err) {
    dbError(err, res);
  }
});

// POST /api/syllabus/nodes/:id/move  { direction: "up" | "down" }: swap with the neighbouring sibling
router.post("/nodes/:id/move", canEdit, async (req, res) => {
  const up = req.body.direction === "up";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [n] } = await client.query(
      "SELECT id, exam, parent_id, position FROM syllabus_nodes WHERE id = $1 FOR UPDATE", [req.params.id]
    );
    if (!n) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    // Normalise sibling positions first so swaps are always clean
    await client.query(
      `UPDATE syllabus_nodes s SET position = r.rn
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS rn FROM syllabus_nodes
             WHERE exam = $1 AND parent_id IS NOT DISTINCT FROM $2) r
       WHERE s.id = r.id`,
      [n.exam, n.parent_id]
    );
    const { rows: siblings } = await client.query(
      `SELECT id, position FROM syllabus_nodes WHERE exam = $1 AND parent_id IS NOT DISTINCT FROM $2
       ORDER BY position`,
      [n.exam, n.parent_id]
    );
    const i = siblings.findIndex((s) => s.id === n.id);
    const j = up ? i - 1 : i + 1;
    if (j >= 0 && j < siblings.length) {
      await client.query("UPDATE syllabus_nodes SET position = $1 WHERE id = $2", [siblings[j].position, siblings[i].id]);
      await client.query("UPDATE syllabus_nodes SET position = $1 WHERE id = $2", [siblings[i].position, siblings[j].id]);
    }
    await client.query("COMMIT");
    res.json({ moved: j >= 0 && j < siblings.length });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// DELETE /api/syllabus/nodes/:id: removes everything inside it; blocked if questions are tagged there
router.delete("/nodes/:id", canEdit, async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM syllabus_nodes WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (err) {
    dbError(err, res);
  }
});

// =====================================================================
// Excel import / export. One row per path: subject, cluster, chapter, topic, subtopic, section.
// Import only ADDS what's missing. It never renames, moves or deletes anything.
// =====================================================================

async function readSyllabusRows(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Syllabus") || wb.worksheets[0];
  if (!ws) throw new Error("The file has no sheets");
  const headers = {};
  ws.getRow(1).eachCell((cell, col) => {
    headers[String(cell.text).trim().toLowerCase()] = col;
  });
  const missing = LEVELS.filter((l) => !headers[l]);
  if (missing.length) throw new Error(`missing column(s): ${missing.join(", ")}. Please use the template.`);

  const rows = [];
  let previous = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const cells = LEVELS.map((l) => String(row.getCell(headers[l]).text || "").trim());
    if (cells.every((c) => !c)) return;
    // Blank cells before the last filled cell mean "same as the row above"
    const last = cells.reduce((acc, c, i) => (c ? i : acc), -1);
    const filled = cells.slice(0, last + 1).map((c, i) => c || previous[i] || "");
    rows.push({ row: n, cells: filled });
    previous = filled;
  });
  return rows;
}

// Work out what an import would add, without saving anything
async function planImport(exam, rows, db = pool) {
  const existing = await loadTree(exam, db);
  const key = (parentKey, name) => `${parentKey}|${normName(name)}`;
  const known = new Map(); // key → { id | null (new), level, name }
  const idKey = new Map();
  for (const n of existing) {
    const parentKey = n.parent_id ? idKey.get(n.parent_id) : "root";
    const k = key(parentKey, n.name);
    idKey.set(n.id, k);
    known.set(k, { id: n.id, level: n.level, name: n.name });
  }

  const errors = [];
  const toCreate = []; // in order, parents before children
  const counts = Object.fromEntries(LEVELS.map((l) => [l, { existing: 0, new: 0 }]));
  const seenThisFile = new Set();

  for (const r of rows) {
    const gap = r.cells.findIndex((c) => !c);
    if (gap !== -1) {
      errors.push({ row: r.row, error: `The ${LEVELS[gap]} is empty but a deeper level is filled` });
      continue;
    }
    const tooLong = r.cells.find((c) => c.length > MAX_NAME);
    if (tooLong) {
      errors.push({ row: r.row, error: `"${tooLong.slice(0, 40)}…" is longer than ${MAX_NAME} characters` });
      continue;
    }
    let parentKey = "root";
    r.cells.forEach((name, depth) => {
      const k = key(parentKey, name);
      if (!known.has(k)) {
        known.set(k, { id: null, level: LEVELS[depth], name });
        toCreate.push({ key: k, parentKey, level: LEVELS[depth], name });
        counts[LEVELS[depth]].new++;
        seenThisFile.add(k);
      } else if (!seenThisFile.has(k)) {
        seenThisFile.add(k);
        if (known.get(k).id) counts[LEVELS[depth]].existing++;
      }
      parentKey = k;
    });
  }
  return { toCreate, counts, errors, existingIds: new Map([...known].filter(([, v]) => v.id).map(([k, v]) => [k, v.id])) };
}

// GET /api/syllabus/import/template
router.get("/import/template", canEdit, async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Syllabus");
  ws.columns = LEVELS.map((l) => ({ header: l, key: l, width: l === "subject" ? 14 : 30 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.addRow(["Physics", "Mechanics", "Kinematics", "Projectile Motion", "Projectile on an Inclined Plane", "Up the incline"]);
  ws.addRow(["", "", "", "", "", "Down the incline"]);
  ws.addRow(["", "", "", "Relative Motion", "River–Boat Problems"]);
  const help = wb.addWorksheet("Instructions");
  help.getColumn(1).width = 110;
  [
    "PrepTrack syllabus import",
    "",
    "• Import into one syllabus at a time. You choose JEE Main or JEE Advanced when uploading.",
    "• One row per path: subject → cluster → chapter → topic → subtopic → section. Stop at any level.",
    "• A blank cell means 'same as the row above' (only when a deeper cell in that row is filled).",
    "• The import only ADDS what's missing. Existing items are matched by name and left as they are.",
    "• It never renames, moves or deletes anything. Do that on the Syllabus page.",
  ].forEach((line) => help.addRow([line]));
  help.getRow(1).font = { bold: true, size: 14 };
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="preptrack-syllabus-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/syllabus/export?exam=jee_main: the current tree in the import format
router.get("/export", canEdit, async (req, res) => {
  const exam = examOf(req.query.exam);
  if (!exam) return res.status(400).json({ error: "exam must be jee_main or jee_advanced" });
  const nodes = await loadTree(exam);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasChild = new Set(nodes.map((n) => n.parent_id).filter(Boolean));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Syllabus");
  ws.columns = LEVELS.map((l) => ({ header: l, key: l, width: l === "subject" ? 14 : 30 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const n of nodes) {
    if (hasChild.has(n.id)) continue; // one row per leaf
    ws.addRow(n.ids.map((id) => byId.get(id).name));
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="preptrack-syllabus-${exam}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// POST /api/syllabus/import/preview  (form: file, exam)
router.post("/import/preview", canEdit, upload.single("file"), async (req, res) => {
  const exam = examOf(req.body.exam);
  if (!exam) return res.status(400).json({ error: "Choose JEE Main or JEE Advanced" });
  if (!req.file) return res.status(400).json({ error: "Choose an .xlsx file to upload" });
  let rows;
  try {
    rows = await readSyllabusRows(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `Couldn't read the file: ${err.message}` });
  }
  if (!rows.length) return res.status(400).json({ error: "No rows found in the file" });
  if (rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Too many rows (max ${MAX_IMPORT_ROWS})` });
  const plan = await planImport(exam, rows);
  res.json({
    exam,
    rows: rows.map((r) => r.cells),
    row_numbers: rows.map((r) => r.row),
    counts: plan.counts,
    errors: plan.errors,
    sample: plan.toCreate.slice(0, 50).map((c) => ({ level: c.level, name: c.name })),
    total_new: plan.toCreate.length,
  });
});

// POST /api/syllabus/import/commit  { exam, rows: [[subject, cluster, ...], ...] }
router.post("/import/commit", canEdit, async (req, res) => {
  const exam = examOf(req.body.exam);
  if (!exam) return res.status(400).json({ error: "Choose JEE Main or JEE Advanced" });
  const raw = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!raw.length) return res.status(400).json({ error: "Nothing to import" });
  if (raw.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Too many rows (max ${MAX_IMPORT_ROWS})` });
  const rows = raw.map((cells, i) => ({
    row: i + 2,
    cells: (Array.isArray(cells) ? cells : []).slice(0, LEVELS.length).map((c) => String(c ?? "").trim()),
  }));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE syllabus_nodes IN SHARE ROW EXCLUSIVE MODE");
    const plan = await planImport(exam, rows, client);
    if (plan.errors.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Fix ${plan.errors.length} row(s) first`, errors: plan.errors });
    }
    const ids = plan.existingIds;
    const nextPos = new Map();
    for (const c of plan.toCreate) {
      const parentId = c.parentKey === "root" ? null : ids.get(c.parentKey);
      if (!nextPos.has(c.parentKey)) {
        const { rows: [m] } = await client.query(
          `SELECT COALESCE(MAX(position), 0) AS p FROM syllabus_nodes
           WHERE exam = $1 AND parent_id IS NOT DISTINCT FROM $2`,
          [exam, parentId]
        );
        nextPos.set(c.parentKey, m.p);
      }
      const position = nextPos.get(c.parentKey) + 1;
      nextPos.set(c.parentKey, position);
      const { rows: [n] } = await client.query(
        `INSERT INTO syllabus_nodes (exam, parent_id, level, name, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [exam, parentId, c.level, c.name, position, req.user.id]
      );
      ids.set(c.key, n.id);
    }
    await client.query("COMMIT");
    res.json({ created: plan.toCreate.length, counts: plan.counts, exam_label: EXAM_LABEL[exam] });
  } catch (err) {
    await client.query("ROLLBACK");
    dbError(err, res);
  } finally {
    client.release();
  }
});

module.exports = router;
