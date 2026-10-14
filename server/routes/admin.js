const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin")); // every route below is admin-only

// GET /api/admin/pending — accounts waiting for approval
router.get("/pending", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, email, role, created_at FROM users WHERE status = 'pending' ORDER BY created_at"
  );
  res.json({ users: rows });
});

// PATCH /api/admin/users/:id — approve (active) or reject (suspended)
router.patch("/users/:id", async (req, res) => {
  const { status } = req.body;
  if (!["active", "suspended"].includes(status))
    return res.status(400).json({ error: "Status must be active or suspended" });
  const { rows } = await pool.query(
    "UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, email, role, status",
    [status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json({ user: rows[0] });
});

module.exports = router;
