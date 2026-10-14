CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
  id SERIAL PRIMARY KEY,
  subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (subject_id, name)
);

CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  chapter_id INT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (chapter_id, name)
);

INSERT INTO subjects (name, position) VALUES
  ('Physics', 1), ('Chemistry', 2), ('Mathematics', 3)
ON CONFLICT (name) DO NOTHING;
