// Goals and achievement badges.
//   GET  /api/student/goals          goals, today's and this week's progress, badges
//   PUT  /api/student/goals          { daily_questions, weekly_tests, target_percentile }
//   POST /api/student/goals/badges/seen   mark new badges as seen
const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { TZ } = require("../lib/points");
const { evaluate } = require("../lib/badges");
const { marksFor, rankFor } = require("../lib/jeeMain");

// Target choices, with the marks and rank each roughly needs
const TARGETS = [85, 90, 93, 95, 97, 98, 99, 99.5, 99.9].map((p) => ({ percentile: p, marks: Math.round(marksFor(p)), rank: rankFor(p) }));

const router = express.Router();
router.use(requireAuth, requireRole("student"));

const DEFAULTS = { daily_questions: 30, weekly_tests: 3, target_percentile: 95 };

async function goalsOf(userId) {
  const { rows: [g] } = await pool.query(
    "SELECT daily_questions, weekly_tests, target_percentile::float8 AS target_percentile, updated_at FROM user_goals WHERE user_id = $1",
    [userId]
  );
  return g ? { ...g, set: true } : { ...DEFAULTS, set: false };
}

// Questions attempted per day for the last `days` days (today last), in the study timezone
async function dailyCounts(userId, days) {
  const { rows } = await pool.query(
    `WITH span AS (
       SELECT generate_series((now() AT TIME ZONE $2)::date - ($3::int - 1), (now() AT TIME ZONE $2)::date, interval '1 day')::date AS d
     )
     SELECT span.d::text AS day, COUNT(aa.question_id)::int AS questions
     FROM span
     LEFT JOIN attempts a ON a.student_id = $1
     LEFT JOIN attempt_answers aa ON aa.attempt_id = a.id AND aa.is_correct IS NOT NULL
       AND (aa.updated_at AT TIME ZONE $2)::date = span.d
     GROUP BY span.d ORDER BY span.d`,
    [userId, TZ, days]
  );
  return rows;
}

async function progress(userId, goals) {
  const [days, week] = await Promise.all([
    dailyCounts(userId, 60),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM attempts
       WHERE student_id = $1 AND status = 'submitted'
         AND (submitted_at AT TIME ZONE $2) >= date_trunc('week', now() AT TIME ZONE $2)`,
      [userId, TZ]
    ),
  ]);
  const today = days[days.length - 1];
  // Consecutive days the daily goal was met (today counts if already met; otherwise start from yesterday)
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].questions >= goals.daily_questions) streak++;
    else if (i === days.length - 1) continue;
    else break;
  }
  return {
    today: { questions: today.questions, goal: goals.daily_questions, met: today.questions >= goals.daily_questions },
    week: { tests: week.rows[0].n, goal: goals.weekly_tests, met: week.rows[0].n >= goals.weekly_tests },
    last7: days.slice(-7).map((d) => ({ ...d, met: d.questions >= goals.daily_questions })),
    goal_streak: streak,
  };
}

router.get("/", async (req, res) => {
  const goals = await goalsOf(req.user.id);
  const [prog, badges] = await Promise.all([progress(req.user.id, goals), evaluate(req.user.id, goals.daily_questions)]);
  res.json({ goals, progress: prog, badges, targets: TARGETS });
});

router.put("/", async (req, res) => {
  const daily = Number(req.body?.daily_questions);
  const weekly = Number(req.body?.weekly_tests);
  const target = Number(req.body?.target_percentile);
  if (!Number.isInteger(daily) || daily < 5 || daily > 500)
    return res.status(400).json({ error: "Daily questions should be between 5 and 500" });
  if (!Number.isInteger(weekly) || weekly < 0 || weekly > 21)
    return res.status(400).json({ error: "Tests per week should be between 0 and 21" });
  if (!Number.isFinite(target) || target < 50 || target > 100)
    return res.status(400).json({ error: "Target percentile should be between 50 and 100" });
  await pool.query(
    `INSERT INTO user_goals (user_id, daily_questions, weekly_tests, target_percentile)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET daily_questions = $2, weekly_tests = $3, target_percentile = $4, updated_at = now()`,
    [req.user.id, daily, weekly, Math.round(target * 1000) / 1000]
  );
  const goals = await goalsOf(req.user.id);
  const [prog, badges] = await Promise.all([progress(req.user.id, goals), evaluate(req.user.id, goals.daily_questions)]);
  res.json({ goals, progress: prog, badges, targets: TARGETS });
});

router.post("/badges/seen", async (req, res) => {
  await pool.query("UPDATE user_badges SET seen = true WHERE user_id = $1 AND NOT seen", [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
