// Achievement badges. Definitions live here; user_badges records when each was earned.
const pool = require("../db");
const { TZ } = require("./points");
const { completeness } = require("./profile");

// metric → how far along the student is; target → when the badge is earned
const BADGES = [
  { id: "first_test", icon: "🚀", name: "Lift-off", text: "Complete your first test", metric: "tests", target: 1, tier: "bronze" },
  { id: "tests_10", icon: "📝", name: "Regular", text: "Complete 10 tests", metric: "tests", target: 10, tier: "silver" },
  { id: "tests_50", icon: "🏃", name: "Marathoner", text: "Complete 50 tests", metric: "tests", target: 50, tier: "gold" },
  { id: "practice_10", icon: "🎯", name: "Drill master", text: "Finish 10 practice sets", metric: "practice", target: 10, tier: "silver" },
  { id: "questions_100", icon: "💯", name: "Century", text: "Attempt 100 questions", metric: "questions", target: 100, tier: "bronze" },
  { id: "questions_1000", icon: "🧠", name: "Thousand club", text: "Attempt 1,000 questions", metric: "questions", target: 1000, tier: "gold" },
  { id: "streak_3", icon: "🔥", name: "On fire", text: "Take a test 3 days in a row", metric: "best_streak", target: 3, tier: "bronze" },
  { id: "streak_7", icon: "⚡", name: "Week warrior", text: "Take a test 7 days in a row", metric: "best_streak", target: 7, tier: "silver" },
  { id: "streak_30", icon: "🌟", name: "Unstoppable", text: "Take a test 30 days in a row", metric: "best_streak", target: 30, tier: "gold" },
  { id: "sharpshooter", icon: "🏹", name: "Sharpshooter", text: "Score 90%+ accuracy in a test (10+ attempted)", metric: "best_accuracy", target: 90, tier: "silver", unit: "%" },
  { id: "high_scorer", icon: "📈", name: "High scorer", text: "Score 60% or more in a full test", metric: "best_score", target: 60, tier: "silver", unit: "%" },
  { id: "contest_debut", icon: "🏆", name: "Contender", text: "Take part in a contest", metric: "contests", target: 1, tier: "bronze" },
  { id: "podium", icon: "🥇", name: "Podium finish", text: "Finish top 3 in a contest", metric: "podiums", target: 1, tier: "gold" },
  { id: "goal_getter", icon: "✅", name: "Goal getter", text: "Hit your daily question goal on 5 days", metric: "goal_days", target: 5, tier: "silver" },
  { id: "mistake_mender", icon: "🩹", name: "Mistake mender", text: "Mark 10 mistakes as fixed in your notebook", metric: "fixed", target: 10, tier: "silver" },
  { id: "profile_complete", icon: "🪪", name: "All set", text: "Complete your profile", metric: "profile", target: 100, tier: "bronze", unit: "%" },
];

// Longest run of consecutive days in a sorted list of 'YYYY-MM-DD' strings
function longestRun(days) {
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    const t = Date.parse(d + "T00:00:00Z");
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

async function stats(userId, dailyGoal) {
  const [counts, days, podiums, daily, fixed, profile] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE t.kind = 'standard')::int AS tests,
         COUNT(*) FILTER (WHERE t.kind = 'practice')::int AS practice,
         COUNT(*) FILTER (WHERE t.is_contest)::int AS contests,
         COALESCE(MAX(CASE WHEN t.kind = 'standard' AND a.max_score > 0 AND NOT (t.is_contest AND t.ends_at > now())
                           THEN a.score / a.max_score * 100 END), 0)::float8 AS best_score,
         COALESCE(MAX(CASE WHEN a.correct_count + a.wrong_count >= 10 AND NOT (t.is_contest AND t.ends_at > now())
                           THEN a.correct_count::float8 / (a.correct_count + a.wrong_count) * 100 END), 0)::float8 AS best_accuracy,
         COALESCE(SUM(a.correct_count + a.wrong_count), 0)::int AS questions
       FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE a.student_id = $1 AND a.status = 'submitted'`,
      [userId]
    ),
    pool.query(
      `SELECT DISTINCT (submitted_at AT TIME ZONE $2)::date::text AS d FROM attempts
       WHERE student_id = $1 AND status = 'submitted' ORDER BY d`,
      [userId, TZ]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT a.student_id,
                RANK() OVER (PARTITION BY a.test_id ORDER BY a.score DESC, a.submitted_at - a.started_at) AS r,
                COUNT(*) OVER (PARTITION BY a.test_id) AS players
         FROM attempts a JOIN tests t ON t.id = a.test_id
         WHERE t.is_contest AND t.ends_at <= now() AND a.status = 'submitted'
       ) x WHERE x.student_id = $1 AND x.r <= 3 AND x.players >= 3`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT (aa.updated_at AT TIME ZONE $2)::date AS d, COUNT(*) AS q
         FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
         WHERE a.student_id = $1 AND aa.is_correct IS NOT NULL
         GROUP BY 1
       ) x WHERE x.q >= $3`,
      [userId, TZ, dailyGoal]
    ),
    pool.query("SELECT COUNT(*)::int AS n FROM question_notes WHERE user_id = $1 AND status = 'fixed'", [userId]),
    pool.query("SELECT * FROM user_profiles WHERE user_id = $1", [userId]),
  ]);
  return {
    ...counts.rows[0],
    best_streak: longestRun(days.rows.map((r) => r.d)),
    podiums: podiums.rows[0].n,
    goal_days: daily.rows[0].n,
    fixed: fixed.rows[0].n,
    profile: completeness(profile.rows[0]).pct,
  };
}

// Work out progress on every badge, record any newly earned ones, and return the list
async function evaluate(userId, dailyGoal) {
  const s = await stats(userId, dailyGoal);
  const earnedNow = BADGES.filter((b) => s[b.metric] >= b.target).map((b) => b.id);
  if (earnedNow.length) {
    await pool.query(
      `INSERT INTO user_badges (user_id, badge_id) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [userId, earnedNow]
    );
  }
  const { rows } = await pool.query("SELECT badge_id, earned_at, seen FROM user_badges WHERE user_id = $1", [userId]);
  const have = new Map(rows.map((r) => [r.badge_id, r]));
  return BADGES.map(({ metric, ...b }) => {
    const e = have.get(b.id);
    const value = Math.round(s[metric] * 10) / 10;
    return {
      ...b,
      value: Math.min(value, b.target),
      earned: !!e,
      earned_at: e?.earned_at || null,
      seen: e ? e.seen : true,
    };
  });
}

module.exports = { BADGES, evaluate };
