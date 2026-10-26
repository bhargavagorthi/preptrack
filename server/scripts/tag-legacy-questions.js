// One-off: tag questions created under the old Subject → Chapter → Topic syllabus into the new trees.
// Matching is by name. In each tree (JEE Main, JEE Advanced) a question is tagged to the topic with the
// same name inside a chapter with the same name. If only the chapter matches, it's tagged to the chapter.
// Questions that match nothing are listed so you can tag them in the Question Bank ("Untagged" filter).
//
//   node scripts/tag-legacy-questions.js            → preview only, changes nothing
//   node scripts/tag-legacy-questions.js --apply    → save the tags
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const pool = require("../db");
const { EXAMS, EXAM_LABEL, normName, loadTree } = require("../lib/syllabus");

const APPLY = process.argv.includes("--apply");

(async () => {
  const { rows: legacy } = await pool.query(
    `SELECT q.id, s.name AS subject, c.name AS chapter, t.name AS topic,
            ARRAY(SELECT exam FROM question_nodes qn WHERE qn.question_id = q.id) AS tagged_in
     FROM questions q
     JOIN topics t ON t.id = q.topic_id
     JOIN chapters c ON c.id = t.chapter_id
     JOIN subjects s ON s.id = c.subject_id
     ORDER BY q.id`
  );
  if (!legacy.length) {
    console.log("No questions from the old syllabus found. Nothing to do.");
    return pool.end();
  }

  const trees = {};
  for (const exam of EXAMS) {
    const nodes = await loadTree(exam);
    if (!nodes.length) console.log(`⚠  The ${EXAM_LABEL[exam]} syllabus is empty. Import it first for better matches.`);
    trees[exam] = nodes;
  }

  // Find a node by subject → chapter (anywhere under the subject) → topic (anywhere under the chapter)
  function find(exam, subject, chapter, topic) {
    const nodes = trees[exam];
    const s = nodes.find((n) => n.level === "subject" && normName(n.name) === normName(subject));
    if (!s) return null;
    const ch = nodes.find((n) => n.level === "chapter" && n.subject_id === s.id && normName(n.name) === normName(chapter));
    if (!ch) return null;
    const tp = nodes.find((n) => n.level === "topic" && n.chapter_id === ch.id && normName(n.name) === normName(topic));
    return tp ? { node: tp, how: "topic" } : { node: ch, how: "chapter" };
  }

  const plan = [];
  const unmatched = [];
  const summary = Object.fromEntries(EXAMS.map((e) => [e, { topic: 0, chapter: 0, already: 0 }]));
  for (const q of legacy) {
    let any = q.tagged_in.length > 0;
    for (const exam of EXAMS) {
      if (q.tagged_in.includes(exam)) {
        summary[exam].already++;
        continue;
      }
      const m = find(exam, q.subject, q.chapter, q.topic);
      if (!m) continue;
      plan.push({ question_id: q.id, exam, node_id: m.node.id });
      summary[exam][m.how]++;
      any = true;
    }
    if (!any) unmatched.push(q);
  }

  console.log(`\nQuestions from the old syllabus: ${legacy.length}`);
  for (const exam of EXAMS) {
    const s = summary[exam];
    console.log(`  ${EXAM_LABEL[exam].padEnd(13)} → ${s.topic} to a topic, ${s.chapter} to a chapter only, ${s.already} already tagged`);
  }
  if (unmatched.length) {
    console.log(`\n${unmatched.length} question(s) matched nothing in either syllabus:`);
    const groups = new Map();
    for (const q of unmatched) {
      const k = `${q.subject} › ${q.chapter} › ${q.topic}`;
      groups.set(k, (groups.get(k) || 0) + 1);
    }
    for (const [k, n] of groups) console.log(`  • ${k}  (${n})`);
    console.log("  Tag these in the Question Bank using the \"Untagged\" filter.");
  }

  if (!APPLY) {
    console.log("\nPreview only. Run again with --apply to save these tags.");
    return pool.end();
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of plan) {
      await client.query(
        `INSERT INTO question_nodes (question_id, exam, node_id) VALUES ($1, $2, $3)
         ON CONFLICT (question_id, exam) DO NOTHING`,
        [p.question_id, p.exam, p.node_id]
      );
    }
    await client.query("COMMIT");
    console.log(`\n✅ Saved ${plan.length} tag(s).`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
