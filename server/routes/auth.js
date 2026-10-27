const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth, forgetUser } = require("../middleware/auth");
const { cleanValue } = require("../lib/profile");

const router = express.Router();
const SIGNUP_ROLES = ["student", "creator", "teacher", "organiser"];
const EXAMS = ["jee_main", "jee_advanced"];
const ME_COLS = "id, name, email, role, status, organization_id, target_exam, student_code";

function makeToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  const { name, email, password, role = "student", target_exam, phone, whatsapp_consent } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Name, email and password are required" });
  if (!phone || !String(phone).trim())
    return res.status(400).json({ error: "Mobile number is required", fields: { phone: "Enter your mobile number" } });
  const cleanPhone = cleanValue("phone", phone);
  if (cleanPhone.error) return res.status(400).json({ error: cleanPhone.error, fields: { phone: cleanPhone.error } });
  const whatsapp = whatsapp_consent === true;
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (!SIGNUP_ROLES.includes(role))
    return res.status(400).json({ error: "Invalid role" });
  if (String(name).trim().length < 2)
    return res.status(400).json({ error: "Enter your full name" });
  if (target_exam && !EXAMS.includes(target_exam))
    return res.status(400).json({ error: "Choose JEE Main or JEE Advanced" });

  // Students are active immediately; other roles wait for admin approval
  const status = role === "student" ? "active" : "pending";

  const db = await pool.connect();
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query("BEGIN");
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, role, status, organization_id, target_exam, student_code)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM organizations ORDER BY id LIMIT 1),
               COALESCE($6, 'jee_main'),
               CASE WHEN $4 = 'student'
                    THEN 'PT' || to_char(now(), 'YY') || '-' || lpad(nextval('student_code_seq')::text, 6, '0') END)
       RETURNING ${ME_COLS}`,
      [String(name).trim(), email.trim().toLowerCase(), hash, role, status, role === "student" ? target_exam || null : null]
    );
    const user = rows[0];
    // The mobile number and WhatsApp choice go straight into the profile
    await db.query(
      `INSERT INTO user_profiles (user_id, phone, notify_whatsapp, whatsapp_consent_at)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END)`,
      [user.id, cleanPhone.value, whatsapp]
    );
    await db.query("COMMIT");
    if (status === "pending") {
      return res.status(201).json({
        user,
        message: "Account created. An admin must approve it before you can log in.",
      });
    }
    res.status(201).json({ user, token: makeToken(user) });
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    if (err.code === "23505")
      return res.status(409).json({ error: "Email already registered" });
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  } finally {
    db.release();
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

    const safeUser = Object.fromEntries(ME_COLS.split(", ").map((k) => [k, user[k]]));
    res.json({ user: safeUser, token: makeToken(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me — who am I? (requires a token)
router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${ME_COLS.split(", ").map((c) => "u." + c).join(", ")}, p.photo_url
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json({ user: rows[0] });
});

// PATCH /api/auth/me  { target_exam }: which syllabus a student follows (JEE Main or JEE Advanced)
router.patch("/me", requireAuth, async (req, res) => {
  const { target_exam } = req.body;
  if (!["jee_main", "jee_advanced"].includes(target_exam))
    return res.status(400).json({ error: "target_exam must be jee_main or jee_advanced" });
  const { rows } = await pool.query(
    `UPDATE users SET target_exam = $1 WHERE id = $2
     RETURNING ${ME_COLS}`,
    [target_exam, req.user.id]
  );
  res.json({ user: rows[0] });
});

// POST /api/auth/password  { current_password, new_password }
// Signs out every other device; this device gets a fresh token.
router.post("/password", requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password)
    return res.status(400).json({ error: "Enter your current and new password" });
  if (String(new_password).length < 8)
    return res.status(400).json({ error: "New password must be at least 8 characters", fields: { new_password: "At least 8 characters" } });
  if (String(new_password).length > 128)
    return res.status(400).json({ error: "New password is too long" });
  const { rows: [me] } = await pool.query("SELECT id, role, password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!(await bcrypt.compare(current_password, me.password_hash)))
    return res.status(400).json({ error: "Your current password is incorrect", fields: { current_password: "Incorrect password" } });
  if (await bcrypt.compare(new_password, me.password_hash))
    return res.status(400).json({ error: "Choose a password you haven't used just now", fields: { new_password: "Same as your current password" } });

  const hash = await bcrypt.hash(new_password, 10);
  const changedAt = Math.floor(Date.now() / 1000);
  await pool.query("UPDATE users SET password_hash = $1, password_changed_at = to_timestamp($2) WHERE id = $3", [hash, changedAt, me.id]);
  forgetUser(me.id);
  res.json({ token: makeToken(me), message: "Password changed. Other devices have been signed out." });
});

module.exports = router;
