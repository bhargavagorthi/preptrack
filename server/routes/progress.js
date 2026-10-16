const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { TZ, RULES, levelFor, prevDay, streakFrom } = require("../lib/points");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

// GET /api/student/progress: points, level, streak, recent points
router.get("/", async (req, res) => {
  const me = req.user.id;
  const [total, days, now, recent] = await Promise.all([
    pool.query("SELECT COALESCE(SUM(points), 0)::int AS total FROM point_events WHERE student_id = $1", [me]),
    pool.query(
      `SELECT DISTINCT (submitted_at AT TIME ZONE $2)::date::text AS d FROM attempts
       WHERE student_id = $1 AND status = 'submitted' ORDER BY d DESC`,
      [me, TZ]
    ),
    pool.query("SELECT (now() AT TIME ZONE $1)::date::text AS today", [TZ]),
    pool.query(
      `SELECT pe.id, pe.label, pe.points, pe.created_at, t.title
       FROM point_events pe
       LEFT JOIN attempts a ON a.id = pe.attempt_id
       LEFT JOIN tests t ON t.id = a.test_id
       WHERE pe.student_id = $1
       ORDER BY pe.id DESC LIMIT 8`,
      [me]
    ),
  ]);

  const list = days.rows.map((r) => r.d);
  const today = now.rows[0].today;
  const alive = list[0] === today || list[0] === prevDay(today); // yesterday still counts until today ends

  res.json({
    ...levelFor(total.rows[0].total),
    streak: alive ? streakFrom(list) : 0,
    active_today: list[0] === today,
    recent: recent.rows,
    rules: RULES,
  });
});

// GET /api/student/progress/attempt/:id: points earned from one test
router.get("/attempt/:id", async (req, res) => {
  const me = req.user.id;
  const { rows: [a] } = await pool.query("SELECT student_id FROM attempts WHERE id = $1", [req.params.id]);
  if (!a || a.student_id !== me) return res.status(404).json({ error: "Attempt not found" });

  const { rows: events } = await pool.query(
    "SELECT id, reason, label, points FROM point_events WHERE attempt_id = $1 ORDER BY id",
    [req.params.id]
  );
  const earned = events.reduce((s, e) => s + e.points, 0);
  const { rows: [b] } = await pool.query(
    `SELECT COALESCE(SUM(points), 0)::int AS before FROM point_events
     WHERE student_id = $1 AND id < COALESCE((SELECT MIN(id) FROM point_events WHERE attempt_id = $2), 2147483647)`,
    [me, req.params.id]
  );
  const before = levelFor(b.before);
  const after = levelFor(b.before + earned);
  res.json({ events, earned, before, after, leveled_up: after.level > before.level });
});

module.exports = router;
