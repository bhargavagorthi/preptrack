const jwt = require("jsonwebtoken");
const pool = require("../db");

// Short cache of each user's status and last password change, so a password
// change (or a blocked account) takes effect on every device within seconds.
const cache = new Map();
const TTL = 15000;

async function accountState(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const { rows } = await pool.query(
    "SELECT status, EXTRACT(EPOCH FROM password_changed_at)::bigint AS changed FROM users WHERE id = $1",
    [id]
  );
  const state = { at: Date.now(), exists: !!rows[0], status: rows[0]?.status, changed: rows[0]?.changed ? Number(rows[0].changed) : null };
  cache.set(id, state);
  return state;
}

// Call after a password or status change
function forgetUser(id) {
  cache.delete(id);
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  try {
    const state = await accountState(payload.id);
    if (!state.exists || state.status !== "active") return res.status(401).json({ error: "Your session has ended. Log in again." });
    if (state.changed && payload.iat < state.changed)
      return res.status(401).json({ error: "Your password was changed. Log in again." });
  } catch (e) {
    return next(e);
  }
  req.user = payload;
  next();
}

function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ error: "You don't have access to this" });
}

module.exports = { requireAuth, requireRole, forgetUser };
