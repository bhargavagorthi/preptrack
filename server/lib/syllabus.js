// Shared helpers for the two syllabus trees (JEE Main, JEE Advanced).
const pool = require("../db");

const EXAMS = ["jee_main", "jee_advanced"];
const EXAM_LABEL = { jee_main: "JEE Main", jee_advanced: "JEE Advanced" };
const LEVELS = ["subject", "cluster", "chapter", "topic", "subtopic", "section"];
// Questions can be tagged at chapter level or anything below it
const TAGGABLE = ["chapter", "topic", "subtopic", "section"];

const childLevel = (level) => LEVELS[LEVELS.indexOf(level) + 1] || null;

// Loose comparison for names typed by people: case, spacing, "&" vs "and", punctuation
const normName = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[‘’'`]/g, "")
    .replace(/[^a-z0-9α-ωψ+\-]+/g, " ")
    .trim();

// Every node of one tree with its ancestry, in syllabus order
async function loadTree(exam, db = pool) {
  const { rows } = await db.query(
    `SELECT id, exam, level, name, parent_id, position, depth, ids, path,
            subject_id, subject, cluster_id, cluster, chapter_id, chapter, topic_id, topic
     FROM node_paths WHERE exam = $1 ORDER BY sort_key`,
    [exam]
  );
  return rows;
}

// The node and every node beneath it
async function subtreeIds(nodeId, db = pool) {
  const { rows } = await db.query("SELECT id FROM node_paths WHERE $1 = ANY(ids)", [nodeId]);
  return rows.map((r) => r.id);
}

// Build a resolver that turns "Physics > Kinematics > Projectile Motion" into a node.
// Levels may be skipped (e.g. leave out the cluster) as long as the result is unambiguous.
function pathResolver(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byLast = new Map();
  const shallow = new Set(); // subject and cluster names, to explain why they can't be used
  for (const n of nodes) {
    if (!TAGGABLE.includes(n.level)) {
      shallow.add(normName(n.name));
      continue;
    }
    const names = n.ids.map((id) => normName(byId.get(id).name));
    const entry = { node: n, names };
    const key = names[names.length - 1];
    if (!byLast.has(key)) byLast.set(key, []);
    byLast.get(key).push(entry);
  }

  const isSubsequence = (segs, names) => {
    let i = 0;
    for (const name of names) if (i < segs.length && name === segs[i]) i++;
    return i === segs.length;
  };

  return function resolve(pathText) {
    const segs = String(pathText || "")
      .split(/\s*(?:>|›|»|→)\s*/)
      .map(normName)
      .filter(Boolean);
    if (!segs.length) return { node: null };
    if (segs.length < 2) return { error: "Write at least the subject and the chapter, e.g. Physics > Kinematics" };
    const candidates = (byLast.get(segs[segs.length - 1]) || []).filter(
      (c) => c.names[0] === segs[0] && isSubsequence(segs, c.names)
    );
    if (candidates.length === 1) return { node: candidates[0].node };
    if (!candidates.length && shallow.has(segs[segs.length - 1]))
      return { error: `"${pathText}" stops at a subject or cluster. Go down to at least a chapter` };
    if (!candidates.length) return { error: `"${pathText}" doesn't match anything in the syllabus` };
    return { error: `"${pathText}" matches ${candidates.length} places. Add more levels to make it unique` };
  };
}

// Check a question's tags: { jee_main: nodeId|null, jee_advanced: nodeId|null }
function cleanTags(tags) {
  const out = {};
  for (const exam of EXAMS) {
    const v = tags?.[exam];
    if (v === null || v === undefined || v === "") continue;
    const id = Number(v);
    if (!Number.isInteger(id) || id <= 0) return { error: `Invalid ${EXAM_LABEL[exam]} tag` };
    out[exam] = id;
  }
  if (!Object.keys(out).length) return { error: "Tag the question to the JEE Main or JEE Advanced syllabus (or both)" };
  return { value: out };
}

// Confirm each tag points at a real node in the right tree, at chapter level or deeper
async function verifyTags(tags, db = pool) {
  const ids = Object.values(tags);
  const { rows } = await db.query("SELECT id, exam, level FROM syllabus_nodes WHERE id = ANY($1)", [ids]);
  for (const [exam, id] of Object.entries(tags)) {
    const n = rows.find((r) => r.id === id);
    if (!n || n.exam !== exam) return `The ${EXAM_LABEL[exam]} tag doesn't point to that syllabus`;
    if (!TAGGABLE.includes(n.level)) return `Tag the ${EXAM_LABEL[exam]} syllabus at chapter level or deeper`;
  }
  return null;
}

// Replace a question's tags inside a transaction
async function saveTags(db, questionId, tags) {
  await db.query("DELETE FROM question_nodes WHERE question_id = $1", [questionId]);
  for (const [exam, nodeId] of Object.entries(tags)) {
    await db.query("INSERT INTO question_nodes (question_id, exam, node_id) VALUES ($1, $2, $3)", [
      questionId, exam, nodeId,
    ]);
  }
}

module.exports = {
  EXAMS, EXAM_LABEL, LEVELS, TAGGABLE, childLevel, normName,
  loadTree, subtreeIds, pathResolver, cleanTags, verifyTags, saveTags,
};
