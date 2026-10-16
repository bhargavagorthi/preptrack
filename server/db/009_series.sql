CREATE TABLE IF NOT EXISTS test_series (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  exam TEXT NOT NULL DEFAULT 'both' CHECK (exam IN ('jee_main','jee_advanced','both')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS series_tests (
  series_id INT NOT NULL REFERENCES test_series(id) ON DELETE CASCADE,
  test_id INT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  position INT NOT NULL,
  PRIMARY KEY (series_id, test_id)
);

CREATE TABLE IF NOT EXISTS series_enrollments (
  series_id INT NOT NULL REFERENCES test_series(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES users(id),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (series_id, student_id)
);
