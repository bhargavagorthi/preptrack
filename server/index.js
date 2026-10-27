const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/syllabus", require("./routes/syllabus"));
app.use("/api/questions/import", require("./routes/questionImport"));
app.use("/api/questions", require("./routes/questions"));
app.use("/api/tests", require("./routes/tests"));
app.use("/api/student/analytics", require("./routes/analytics"));
app.use("/api/student/progress", require("./routes/progress"));
app.use("/api/uploads", require("./routes/uploads"));
app.use("/api/files", express.static(require("path").join(__dirname, "uploads"), {
  maxAge: "30d", immutable: true, index: false,
  setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
}));
app.use("/api/series", require("./routes/series"));
app.use("/api/leaderboard", require("./routes/leaderboard"));
app.use("/api/student/journey", require("./routes/journey"));
app.use("/api/student", require("./routes/student"));
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
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ error: "File is too large (max 5 MB)" });
  res.status(err.status || 500).json({ error: "Something went wrong on the server" });
});
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));