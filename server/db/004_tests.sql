CREATE TABLE IF NOT EXISTS tests (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  exam TEXT NOT NULL DEFAULT 'practice' CHECK (exam IN ('jee_main','jee_advanced','practice')),
  duration_minutes INT NOT NULL CHECK (duration_minutes BETWEEN 5 AND 360),
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  organization_id INT REFERENCES organizations(id),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS test_questions (
  test_id INT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position INT NOT NULL,
  marks_correct NUMERIC(5,2) NOT NULL,
  marks_wrong NUMERIC(5,2) NOT NULL,
  PRIMARY KEY (test_id, question_id)
);
