// ---------- All points and level rules live here ----------
const TZ = "Asia/Kolkata"; // decides what counts as "a day" for streaks

const RULES = {
  perCorrect: { easy: 5, medium: 10, hard: 20 },
  completion: 10,
  accuracyMinAttempted: 5,
  accuracyBonus: [ // checked top to bottom; first match wins
    { min: 90, points: 50 },
    { min: 75, points: 25 },
  ],
  streakPerDay: 5,
  streakCap: 50,
};

// Points needed to reach a level: L1 0, L2 100, L3 300, L4 600, L5 1000 …
const levelFloor = (level) => 50 * level * (level - 1);

const LEVEL_NAMES = [[12, "Topper"], [8, "Ranker"], [5, "Achiever"], [3, "Explorer"], [1, "Aspirant"]];

function levelFor(points) {
  let level = 1;
  while (levelFloor(level + 1) <= points) level++;
  const floor = levelFloor(level);
  const next = levelFloor(level + 1);
  return {
    points,
    level,
    name: LEVEL_NAMES.find(([min]) => level >= min)[1],
    floor,
    next,
    progress_pct: Math.round(((points - floor) / (next - floor)) * 100),
  };
}

// "2026-10-15" → "2026-10-14"
const prevDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

// Count consecutive days, starting from the first (most recent) date in a newest-first list
function streakFrom(days) {
  let n = 0;
  let expect = days[0];
  for (const d of days) {
    if (d !== expect) break;
    n++;
    expect = prevDay(d);
  }
  return n;
}

// Award points for one submitted attempt. Uses the caller's transaction.
// Returns how many point events were added (0 if already awarded).
async function awardPoints(client, attemptId) {
  const { rows: [a] } = await client.query(
    "SELECT id, student_id, submitted_at, correct_count, wrong_count FROM attempts WHERE id = $1 AND status = 'submitted'",
    [attemptId]
  );
  if (!a) return 0;
  const already = await client.query("SELECT 1 FROM point_events WHERE attempt_id = $1 LIMIT 1", [attemptId]);
  if (already.rowCount) return 0;

  const events = [];

  // Correct answers, weighted by difficulty
  const { rows: byDiff } = await client.query(
    `SELECT q.difficulty, COUNT(*)::int AS n
     FROM attempt_answers aa JOIN questions q ON q.id = aa.question_id
     WHERE aa.attempt_id = $1 AND aa.is_correct
     GROUP BY q.difficulty`,
    [attemptId]
  );
  const base = byDiff.reduce((sum, r) => sum + r.n * (RULES.perCorrect[r.difficulty] || 0), 0);
  if (base > 0) events.push(["correct_answers", base, `${a.correct_count} correct answer${a.correct_count === 1 ? "" : "s"}`]);

  events.push(["test_completed", RULES.completion, "Completed a test"]);

  // Accuracy bonus
  const attempted = a.correct_count + a.wrong_count;
  if (attempted >= RULES.accuracyMinAttempted) {
    const acc = (a.correct_count / attempted) * 100;
    const rule = RULES.accuracyBonus.find((r) => acc >= r.min);
    if (rule) events.push(["accuracy_bonus", rule.points, `${Math.round(acc)}% accuracy bonus`]);
  }

  // Streak bonus: only for the first test submitted that day
  const { rows: [sameDay] } = await client.query(
    `SELECT COUNT(*)::int AS n FROM attempts
     WHERE student_id = $1 AND status = 'submitted' AND id <> $2 AND submitted_at <= $3
       AND (submitted_at AT TIME ZONE $4)::date = ($3::timestamptz AT TIME ZONE $4)::date`,
    [a.student_id, a.id, a.submitted_at, TZ]
  );
  if (sameDay.n === 0) {
    const { rows } = await client.query(
      `SELECT DISTINCT (submitted_at AT TIME ZONE $2)::date::text AS d FROM attempts
       WHERE student_id = $1 AND status = 'submitted' AND submitted_at <= $3
       ORDER BY d DESC`,
      [a.student_id, TZ, a.submitted_at]
    );
    const streak = streakFrom(rows.map((r) => r.d));
    if (streak >= 2) {
      events.push(["streak_bonus", Math.min(streak * RULES.streakPerDay, RULES.streakCap), `${streak}-day streak`]);
    }
  }

  for (const [reason, points, label] of events) {
    await client.query(
      "INSERT INTO point_events (student_id, attempt_id, reason, points, label) VALUES ($1, $2, $3, $4, $5)",
      [a.student_id, a.id, reason, points, label]
    );
  }
  return events.length;
}

module.exports = { TZ, RULES, levelFor, prevDay, streakFrom, awardPoints };
