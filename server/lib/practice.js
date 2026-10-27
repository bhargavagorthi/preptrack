// Practice sets: shared by the Syllabus Journey and the mistakes notebook.
const pool = require("../db");

const PRACTICE = {
  size: 10,              // questions per practice set
  maxCustom: 25,         // most questions a student can hand-pick
  minutesPerQuestion: 2,
};

// Only one practice session at a time
async function activePractice(studentId, db = pool) {
  const { rows: [p] } = await db.query(
    `SELECT a.id AS attempt_id, t.title FROM attempts a JOIN tests t ON t.id = a.test_id
     WHERE a.student_id = $1 AND a.status = 'in_progress' AND t.kind = 'practice' AND a.deadline > now()
     ORDER BY a.started_at DESC LIMIT 1`,
    [studentId]
  );
  return p || null;
}

// Questions in an upcoming or live contest can't be practised (expects the question aliased as q)
const NOT_IN_LIVE_CONTEST = `NOT EXISTS (
  SELECT 1 FROM test_questions ctq JOIN tests ct ON ct.id = ctq.test_id
  WHERE ctq.question_id = q.id AND ct.is_contest AND ct.status = 'published' AND ct.ends_at > now())`;

// Make a private practice test from these questions and start it. Returns the attempt id.
async function createPractice(studentId, title, questionIds) {
  const duration = Math.min(360, Math.max(5, questionIds.length * PRACTICE.minutesPerQuestion));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [test] } = await client.query(
      `INSERT INTO tests (title, exam, duration_minutes, status, kind, owner_id, organization_id, created_by, published_at)
       VALUES ($1, 'practice', $2, 'published', 'practice', $3, (SELECT organization_id FROM users WHERE id = $3), $3, now())
       RETURNING id`,
      [title, duration, studentId]
    );
    await client.query(
      `INSERT INTO test_questions (test_id, question_id, position, marks_correct, marks_wrong)
       SELECT $1, q.id, x.pos, q.marks_correct, q.marks_wrong
       FROM unnest($2::int[]) WITH ORDINALITY AS x(id, pos)
       JOIN questions q ON q.id = x.id`,
      [test.id, questionIds]
    );
    const { rows: [attempt] } = await client.query(
      `INSERT INTO attempts (test_id, student_id, deadline)
       VALUES ($1, $2, now() + make_interval(mins => $3)) RETURNING id`,
      [test.id, studentId, duration]
    );
    await client.query("COMMIT");
    return attempt.id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { PRACTICE, activePractice, NOT_IN_LIVE_CONTEST, createPractice };
