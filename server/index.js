const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "PrepTrack" });
});

const pool = require("./db");

app.get("/api/db-check", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) FROM users");
    res.json({ db: "connected", users: Number(rows[0].count) });
  } catch (err) {
    res.status(500).json({ db: "error", message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));