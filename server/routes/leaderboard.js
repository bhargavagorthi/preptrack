const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { finalize } = require("./student");
const { TZ, levelFor } = require("../lib/points");

const router = express.Router();
router.use(requireAuth); // any logged-in user can view leaderboards

// ---------- Contest prize rules ----------
const CONTEST = {
  bonus: [[1, 100], [2, 75], [3, 50], [10, 25]], // [up to rank, points]
  minParticipantsForBonus: 3,
};
const bonusFor = (rank) => (CONTEST.bonus.find(([max]) => rank <= max) || [0, 0])[1];

// "Priya Sharma" → "Priya S."
function shortName(name) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

const STATE_SQL = `CASE WHEN now() < t.starts_at THEN 'upcoming' WHEN now() < t.ends_at THEN 'live' ELSE 'ended' END`;

// GET /api/leaderboard/contests: every published contest, live first
router.get("/contests", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.exam, t.duration_minutes, t.starts_at, t.ends_at, ${STATE_SQL} AS state,
            COUNT(a.id)::int AS participants,
            MAX(CASE WHEN a.student_id = $1 THEN a.status END) AS my_status
     FROM tests t
     LEFT JOIN attempts a ON a.test_id = t.id
     WHERE t.is_contest AND t.status = 'published' AND t.kind = 'standard'
     GROUP BY t.id
     ORDER BY CASE WHEN now() < t.starts_at THEN 1 WHEN now() < t.ends_at THEN 0 ELSE 2 END, t.starts_at DESC`,
    [req.user.id]
  );
  res.json({ contests: rows });
});

// GET /api/leaderboard/contests/:id: rankings (only after the contest closes)
router.get("/contests/:id", async (req, res) => {
  const { rows: [contest] } = await pool.query(
    `SELECT t.id, t.title, t.exam, t.duration_minutes, t.starts_at, t.ends_at, ${STATE_SQL} AS state
     FROM tests t WHERE t.id = $1 AND t.is_contest AND t.status = 'published'`,
    [req.params.id]
  );
  if (!contest) return res.status(404).json({ error: "Contest not found" });

  if (contest.state !== "ended") {
    const { rows: [c] } = await pool.query(
      `SELECT COUNT(*)::int AS participants, COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted
       FROM attempts WHERE test_id = $1`,
      [contest.id]
    );
    return res.json({ contest, ...c, rows: [], me: null });
  }

  // Score anyone whose attempt was still open at closing time
  const { rows: open } = await pool.query(
    "SELECT id FROM attempts WHERE test_id = $1 AND status = 'in_progress'", [contest.id]
  );
  for (const o of open) await finalize(o.id, true);

  const { rows } = await pool.query(
    `SELECT a.id AS attempt_id, a.student_id, u.name,
            a.score::float8 AS score, a.max_score::float8 AS max_score,
            a.correct_count AS correct, a.wrong_count AS wrong,
            EXTRACT(EPOCH FROM (a.submitted_at - a.started_at))::int AS seconds,
            RANK() OVER (ORDER BY a.score DESC, (a.submitted_at - a.started_at))::int AS rank,
            COUNT(*) OVER ()::int AS total,
            COUNT(*) OVER (ORDER BY a.score RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::int AS at_or_below
     FROM attempts a JOIN users u ON u.id = a.student_id
     WHERE a.test_id = $1 AND a.status = 'submitted'
     ORDER BY rank, a.submitted_at`,
    [contest.id]
  );

  const total = rows[0]?.total || 0;
  const bonusActive = total >= CONTEST.minParticipantsForBonus;

  // Award rank bonuses once (the UNIQUE constraint makes repeats do nothing)
  if (bonusActive) {
    for (const r of rows) {
      const pts = bonusFor(r.rank);
      if (!pts) continue;
      await pool.query(
        `INSERT INTO point_events (student_id, attempt_id, reason, points, label)
         VALUES ($1, $2, 'contest_rank', $3, $4)
         ON CONFLICT (attempt_id, reason) DO NOTHING`,
        [r.student_id, r.attempt_id, pts, `🏆 Rank #${r.rank} in ${contest.title}`]
      );
    }
  }

  const shaped = rows.map((r) => ({
    attempt_id: r.attempt_id,
    rank: r.rank,
    name: r.student_id === req.user.id ? "You" : shortName(r.name),
    is_me: r.student_id === req.user.id,
    score: r.score,
    max_score: r.max_score,
    correct: r.correct,
    wrong: r.wrong,
    seconds: r.seconds,
    percentile: Math.round((r.at_or_below / total) * 10000) / 100,
    bonus: bonusActive ? bonusFor(r.rank) : 0,
  }));

  res.json({
    contest,
    participants: total,
    submitted: total,
    rows: shaped.slice(0, 100),
    me: shaped.find((r) => r.is_me) || null,
    bonus_active: bonusActive,
    min_participants: CONTEST.minParticipantsForBonus,
  });
});

// GET /api/leaderboard/points?period=week|all
router.get("/points", async (req, res) => {
  const week = req.query.period === "week";
  let since = null;
  if (week) {
    const { rows: [w] } = await pool.query(
      "SELECT (date_trunc('week', now() AT TIME ZONE $1)) AT TIME ZONE $1 AS since", [TZ]
    );
    since = w.since;
  }
  const { rows } = await pool.query(
    `WITH totals AS (
       SELECT u.id, u.name, SUM(pe.points)::int AS points
       FROM users u
       JOIN point_events pe ON pe.student_id = u.id AND ($1::timestamptz IS NULL OR pe.created_at >= $1)
       WHERE u.role = 'student' AND u.status = 'active'
       GROUP BY u.id
     )
     SELECT *, RANK() OVER (ORDER BY points DESC)::int AS rank
     FROM totals WHERE points > 0
     ORDER BY rank, name`,
    [since]
  );

  let allTime = {};
  if (!week) allTime = Object.fromEntries(rows.map((r) => [r.id, r.points]));
  const shaped = rows.map((r) => ({
    id: r.id,
    rank: r.rank,
    name: r.id === req.user.id ? "You" : shortName(r.name),
    is_me: r.id === req.user.id,
    points: r.points,
    level: week ? null : levelFor(allTime[r.id]).level,
  }));

  res.json({
    period: week ? "week" : "all",
    since,
    total: shaped.length,
    rows: shaped.slice(0, 50),
    me: shaped.find((r) => r.is_me) || null,
  });
});

module.exports = router;
