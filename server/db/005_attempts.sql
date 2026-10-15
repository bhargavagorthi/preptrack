CREATE TABLE IF NOT EXISTS attempts (
  id SERIAL PRIMARY KEY,
  test_id INT NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,
  student_id INT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  auto_submitted BOOLEAN NOT NULL DEFAULT false,
  score NUMERIC(7,2),
  max_score NUMERIC(7,2),
  correct_count INT,
  wrong_count INT,
  unattempted_count INT,
  UNIQUE (test_id, student_id)
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  attempt_id INT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES questions(id),
  response JSONB,                 -- ["B"] | ["A","C"] | {"value": 9.8} | null
  marked_for_review BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INT NOT NULL DEFAULT 0,
  is_correct BOOLEAN,             -- filled in when the attempt is submitted
  marks_awarded NUMERIC(5,2),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);
