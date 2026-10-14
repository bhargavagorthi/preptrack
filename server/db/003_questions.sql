CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  topic_id INT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('single','multiple','numerical')),
  text TEXT NOT NULL,
  options JSONB,            -- [{ "id": "A", "text": "..." }, ...]  (null for numerical)
  answer JSONB NOT NULL,    -- ["B"] | ["A","C"] | { "value": 9.8, "tolerance": 0.1 }
  solution TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  marks_correct NUMERIC(5,2) NOT NULL DEFAULT 4,
  marks_wrong NUMERIC(5,2) NOT NULL DEFAULT -1,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questions_topic_idx ON questions(topic_id);
