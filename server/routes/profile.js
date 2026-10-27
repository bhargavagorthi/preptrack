// Account settings: profile details, photo, name/email.
const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const storage = require("../lib/storage");
const { SECTIONS, FIELD, cleanValue, completeness } = require("../lib/profile");

const router = express.Router();
router.use(requireAuth);

const USER_COLS = "id, name, email, role, status, organization_id, target_exam, student_code, created_at, password_changed_at";
const PROFILE_COLS = ["photo_url", ...Object.keys(FIELD), "whatsapp_consent_at", "updated_at"];

async function load(userId, db = pool) {
  const [u, p] = await Promise.all([
    db.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [userId]),
    db.query(`SELECT ${PROFILE_COLS.join(", ")} FROM user_profiles WHERE user_id = $1`, [userId]),
  ]);
  const profile = p.rows[0] || null;
  if (profile) {
    for (const k of ["class10_percent", "class12_percent"]) if (profile[k] != null) profile[k] = Number(profile[k]);
    if (profile.date_of_birth instanceof Date) profile.date_of_birth = toDate(profile.date_of_birth);
  }
  return { user: u.rows[0], profile, completeness: completeness(profile) };
}

const toDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Save some fields (insert the profile row the first time)
async function saveFields(userId, values) {
  const keys = Object.keys(values);
  if (!keys.length) return;
  const cols = keys.join(", ");
  const params = keys.map((_, i) => `$${i + 2}`).join(", ");
  const sets = keys.map((k) => `${k} = EXCLUDED.${k}`).join(", ");
  await pool.query(
    `INSERT INTO user_profiles (user_id, ${cols}) VALUES ($1, ${params})
     ON CONFLICT (user_id) DO UPDATE SET ${sets}, updated_at = now()`,
    [userId, ...keys.map((k) => values[k])]
  );
}

// GET /api/profile
router.get("/", async (req, res) => {
  res.json(await load(req.user.id));
});

// PATCH /api/profile  { section, values: { field: value|"" } }  ("" or null clears a field)
router.patch("/", async (req, res) => {
  const { section, values } = req.body || {};
  if (!SECTIONS[section]) return res.status(400).json({ error: "Unknown section" });
  if (!values || typeof values !== "object") return res.status(400).json({ error: "Nothing to save" });
  const allowed = new Set(SECTIONS[section].map(([k]) => k));
  const clean = {};
  const errors = {};
  for (const [k, v] of Object.entries(values)) {
    if (!allowed.has(k)) return res.status(400).json({ error: `${k} isn't part of this section` });
    const r = cleanValue(k, v);
    if (r.error) errors[k] = r.error;
    else clean[k] = r.value;
  }
  // The mobile number can be changed but not removed
  if ("phone" in clean && clean.phone === null) errors.phone = "Mobile number is required. You can change it, but not remove it.";
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
  // WhatsApp needs a number to message, and we record when consent was given or withdrawn
  if ("notify_whatsapp" in clean) {
    if (clean.notify_whatsapp) {
      const { rows } = await pool.query("SELECT phone FROM user_profiles WHERE user_id = $1", [req.user.id]);
      if (!rows[0]?.phone) return res.status(400).json({ error: "Add your mobile number in Personal details first" });
    }
    clean.whatsapp_consent_at = clean.notify_whatsapp ? new Date() : null;
  }
  try {
    await saveFields(req.user.id, clean);
  } catch (e) {
    if (e.code === "23514") return res.status(400).json({ error: "One of the values isn't allowed" });
    throw e;
  }
  res.json(await load(req.user.id));
});

// DELETE /api/profile/section/:section: clear every field in a section
router.delete("/section/:section", async (req, res) => {
  const list = SECTIONS[req.params.section];
  if (!list || req.params.section === "notifications") return res.status(400).json({ error: "This section can't be cleared" });
  // Clearing personal details keeps the (required) mobile number
  await saveFields(req.user.id, Object.fromEntries(list.filter(([k]) => k !== "phone").map(([k]) => [k, null])));
  res.json(await load(req.user.id));
});

// PATCH /api/profile/account  { name, email, current_password }  (email changes need the password)
router.patch("/account", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Enter your full name" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email" });
  const { rows: [me] } = await pool.query("SELECT email, password_hash FROM users WHERE id = $1", [req.user.id]);
  if (email !== me.email) {
    if (!req.body.current_password || !(await bcrypt.compare(req.body.current_password, me.password_hash)))
      return res.status(400).json({ error: "Enter your current password to change your email", fields: { current_password: "Incorrect password" } });
  }
  try {
    await pool.query("UPDATE users SET name = $1, email = $2 WHERE id = $3", [name, email, req.user.id]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "That email is already used by another account" });
    throw e;
  }
  res.json(await load(req.user.id));
});

// Profile photo
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", type: "image/png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return { ext: "webp", type: "image/webp" };
  return null;
}

// POST /api/profile/photo  (form field "file")
router.post("/photo", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Photo must be under 3 MB" : "Upload failed" });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a photo" });
  const kind = sniff(req.file.buffer);
  if (!kind) return res.status(400).json({ error: "Upload a PNG, JPG or WebP photo" });
  const url = await storage.save(req.file.buffer, kind.ext, kind.type);
  await saveFields(req.user.id, { photo_url: url });
  res.json(await load(req.user.id));
});

// DELETE /api/profile/photo
router.delete("/photo", async (req, res) => {
  await saveFields(req.user.id, { photo_url: null });
  res.json(await load(req.user.id));
});

module.exports = router;
