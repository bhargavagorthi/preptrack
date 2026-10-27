// GET /api/student/prediction: estimated JEE Main marks, percentile and rank from recent tests,
// plus where the student stands among everyone on PrepTrack right now.
const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { predict, marksFor, rankFor, SOURCE, CANDIDATES, WINDOW } = require("../lib/jeeMain");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

// Full tests and contests whose results are visible (practice sets are topic drills, so they don't count)
const SCORED = `
  FROM attempts a JOIN tests t ON t.id = a.test_id
  WHERE a.status = 'submitted' AND t.kind = 'standard' AND a.max_score > 0
    AND NOT (t.is_contest AND t.ends_at > now())`;

const DEFAULT_TARGET = 95;

router.get("/", async (req, res) => {
  const me = req.user.id;
  const [mine, everyone, goal] = await Promise.all([
    pool.query(
      `SELECT t.title, a.submitted_at, (a.score / a.max_score * 100)::float8 AS pct ${SCORED} AND a.student_id = $1
       ORDER BY a.submitted_at`,
      [me]
    ),
    pool.query(`SELECT a.student_id, AVG(GREATEST(a.score, 0) / a.max_score * 100)::float8 AS avg ${SCORED} GROUP BY a.student_id`),
    pool.query("SELECT target_percentile::float8 AS t FROM user_goals WHERE user_id = $1", [me]),
  ]);

  const pcts = mine.rows.map((r) => r.pct);
  const estimate = predict(pcts);

  // How the estimate moved after each test
  const history = pcts.map((_, i) => {
    const p = predict(pcts.slice(0, i + 1));
    return { label: `T${i + 1}`, title: mine.rows[i].title, percentile: p.percentile, marks: p.marks };
  });

  // Standing among PrepTrack students (average score across their tests)
  let standing = null;
  const me_avg = everyone.rows.find((r) => r.student_id === me)?.avg;
  if (me_avg != null) {
    const others = everyone.rows.length;
    const below = everyone.rows.filter((r) => r.avg < me_avg).length;
    const ties = everyone.rows.filter((r) => r.avg === me_avg).length;
    standing = {
      students: others,
      rank: everyone.rows.filter((r) => r.avg > me_avg).length + 1,
      percentile: Math.round(((below + (ties - 1) / 2) / Math.max(1, others - 1)) * 1000) / 10,
      avg_score_pct: Math.round(me_avg * 10) / 10,
    };
    if (others === 1) standing.percentile = null;
  }

  const target = goal.rows[0]?.t ?? DEFAULT_TARGET;
  const targetMarks = Math.round(marksFor(target));
  res.json({
    estimate,
    history,
    standing,
    target: {
      percentile: target,
      marks: targetMarks,
      rank: rankFor(target),
      gap: estimate ? targetMarks - estimate.marks : null,
      from_goals: !!goal.rows[0],
    },
    method: {
      window: WINDOW,
      candidates: CANDIDATES,
      sources: SOURCE,
      note: "An estimate from your PrepTrack tests mapped onto previous-year JEE Main results. Real percentiles depend on your shift's difficulty and normalisation.",
    },
  });
});

module.exports = router;
