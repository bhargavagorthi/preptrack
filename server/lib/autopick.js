// Auto-pick: build a test from syllabus areas and a difficulty mix instead of choosing
// questions one by one.
//
// A request is a list of rows, e.g.
//   { node_ids: [Kinematics, Laws of Motion], type: "single", easy: 5, medium: 12, hard: 3 }
// Each node includes everything beneath it (chapter → topics → subtopics → sections).
// Rows are filled in order and never repeat a question, so "20 single + 5 numerical from
// Physics" is simply two rows over the same chapters.
const pool = require("../db");

const DIFFS = ["easy", "medium", "hard"];
const TYPES = ["single", "multiple", "numerical"];
// When a difficulty runs out, borrow from the nearest one first
const NEAREST = { easy: ["medium", "hard"], medium: ["easy", "hard"], hard: ["medium", "easy"] };
const LIMITS = { rows: 30, nodesPerRow: 60, perRow: 150, total: 300 };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Check and tidy the request. Returns { error } or { value }.
function validate(body) {
  const exam = body.exam;
  if (!["jee_main", "jee_advanced"].includes(exam)) return { error: "Choose JEE Main or JEE Advanced syllabus" };
  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  if (!rawRows.length) return { error: "Add at least one row" };
  if (rawRows.length > LIMITS.rows) return { error: `At most ${LIMITS.rows} rows` };
  let total = 0;
  const rows = [];
  for (const [i, r] of rawRows.entries()) {
    const node_ids = [...new Set((Array.isArray(r.node_ids) ? r.node_ids : []).map(Number))].filter(Number.isInteger);
    if (!node_ids.length) return { error: `Row ${i + 1}: choose at least one subject, chapter or topic` };
    if (node_ids.length > LIMITS.nodesPerRow) return { error: `Row ${i + 1}: too many syllabus areas` };
    const type = r.type || "";
    if (type && !TYPES.includes(type)) return { error: `Row ${i + 1}: unknown question type` };
    const mix = {};
    for (const d of DIFFS) {
      const n = Number(r[d] || 0);
      if (!Number.isInteger(n) || n < 0) return { error: `Row ${i + 1}: counts must be whole numbers` };
      mix[d] = n;
    }
    const count = mix.easy + mix.medium + mix.hard;
    if (!count) return { error: `Row ${i + 1}: ask for at least one question` };
    if (count > LIMITS.perRow) return { error: `Row ${i + 1}: at most ${LIMITS.perRow} questions per row` };
    total += count;
    rows.push({ node_ids, type, mix, count });
  }
  if (total > LIMITS.total) return { error: `A test can have at most ${LIMITS.total} questions` };
  const exclude = (Array.isArray(body.exclude_ids) ? body.exclude_ids : []).map(Number).filter(Number.isInteger);
  return {
    value: {
      exam, rows, exclude,
      test_id: Number(body.test_id) || null,
      spread: body.spread !== false,
      prefer_fresh: body.prefer_fresh !== false,
      fill_short: body.fill_short !== false,
      order: body.order === "easy_first" ? "easy_first" : "shuffle",
    },
  };
}

// Every question tagged anywhere under the given nodes, with which chosen node it falls under.
// "used" = already in another real (non-practice) test.
async function candidates(exam, nodeIds, testId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (q.id) q.id, q.type, q.difficulty, root.id AS root_id,
            EXISTS (SELECT 1 FROM test_questions tq JOIN tests t ON t.id = tq.test_id
                    WHERE tq.question_id = q.id AND t.kind = 'standard' AND t.id IS DISTINCT FROM $3) AS used
     FROM unnest($2::int[]) WITH ORDINALITY AS root(id, ord)
     JOIN node_paths np ON root.id = ANY(np.ids) AND np.exam = $1
     JOIN question_nodes qn ON qn.node_id = np.id AND qn.exam = $1
     JOIN questions q ON q.id = qn.question_id
     ORDER BY q.id, root.ord`,
    [exam, nodeIds, testId]
  );
  return rows;
}

// How many questions each row could draw on, by difficulty (for the live "available" hint)
async function availability(req) {
  const out = [];
  for (const r of req.rows) {
    const list = (await candidates(req.exam, r.node_ids, req.test_id))
      .filter((q) => (!r.type || q.type === r.type) && !req.exclude.includes(q.id));
    const row = { easy: 0, medium: 0, hard: 0, fresh: 0, total: list.length };
    for (const q of list) {
      row[q.difficulty]++;
      if (!q.used) row.fresh++;
    }
    out.push(row);
  }
  return out;
}

// Fill every row. Returns per-row ids plus a report of what fell short.
async function pick(req) {
  const taken = new Set(req.exclude);
  const results = [];

  for (const r of req.rows) {
    const list = (await candidates(req.exam, r.node_ids, req.test_id))
      .filter((q) => (!r.type || q.type === r.type));

    // Per difficulty, one queue per chosen node (or one merged queue), fresh questions first
    const queues = {};
    for (const d of DIFFS) {
      const groups = new Map();
      for (const q of list) {
        if (q.difficulty !== d) continue;
        const key = req.spread ? q.root_id : 0;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(q);
      }
      queues[d] = [...groups.values()].map((g) => {
        shuffle(g);
        return req.prefer_fresh ? [...g.filter((q) => !q.used), ...g.filter((q) => q.used)] : g;
      });
      shuffle(queues[d]); // so leftovers don't always go to the first chapter
    }

    // Round-robin across the queues so every chosen chapter/topic gets its share
    const draw = (d) => {
      const qs = queues[d];
      for (let tries = 0; tries < qs.length; tries++) {
        const queue = qs.shift();
        qs.push(queue);
        while (queue.length) {
          const q = queue.shift();
          if (!taken.has(q.id)) return q;
        }
      }
      return null;
    };

    const picked = [];
    const got = { easy: 0, medium: 0, hard: 0 };
    const short = { easy: 0, medium: 0, hard: 0 };
    for (const d of DIFFS) {
      for (let i = 0; i < r.mix[d]; i++) {
        const q = draw(d);
        if (!q) { short[d] = r.mix[d] - i; break; }
        taken.add(q.id);
        picked.push({ ...q, slot: d });
        got[d]++;
      }
    }

    // Borrow from the nearest difficulty if allowed
    const borrowed = [];
    if (req.fill_short) {
      for (const d of DIFFS) {
        for (let i = 0; i < short[d]; i++) {
          let q = null;
          for (const alt of NEAREST[d]) if ((q = draw(alt))) break;
          if (!q) break;
          taken.add(q.id);
          picked.push({ ...q, slot: d });
          got[q.difficulty]++;
          borrowed.push({ wanted: d, used: q.difficulty });
        }
      }
    }

    const order = { easy: 0, medium: 1, hard: 2 };
    if (req.order === "easy_first") picked.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
    else shuffle(picked);

    results.push({
      ids: picked.map((q) => q.id),
      requested: r.mix,
      got,
      missing: r.count - picked.length,
      borrowed: borrowed.length,
      borrowed_detail: borrowed,
      reused: picked.filter((q) => q.used).length,
      pool: list.length,
    });
  }
  return results;
}

module.exports = { validate, availability, pick, LIMITS };
