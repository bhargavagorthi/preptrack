const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const SIGNUP_ROLES = ["student", "creator", "teacher", "organiser"];

function makeToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  const { name, email, password, role = "student" } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Name, email and password are required" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (!SIGNUP_ROLES.includes(role))
    return res.status(400).json({ error: "Invalid role" });

  // Students are active immediately; other roles wait for admin approval
  const status = role === "student" ? "active" : "pending";

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, organization_id)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM organizations ORDER BY id LIMIT 1))
       RETURNING id, name, email, role, status`,
      [name, email.toLowerCase(), hash, role, status]
    );
    const user = rows[0];
    if (status === "pending") {
      return res.status(201).json({
        user,
        message: "Account created. An admin must approve it before you can log in.",
      });
    }
    res.status(201).json({ user, token: makeToken(user) });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "Email already registered" });
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase(),
    ]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: "Invalid email or password" });
    if (user.status !== "active")
      return res.status(403).json({ error: `Your account is ${user.status}` });

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token: makeToken(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me — who am I? (requires a token)
router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, email, role, status, organization_id FROM users WHERE id = $1",
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json({ user: rows[0] });
});

module.exports = router;
