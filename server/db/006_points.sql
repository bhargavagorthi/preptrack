CREATE TABLE IF NOT EXISTS point_events (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id),
  attempt_id INT REFERENCES attempts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  label TEXT,
  points INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (attempt_id, reason)
);
CREATE INDEX IF NOT EXISTS point_events_student_idx ON point_events(student_id);
