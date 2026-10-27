-- =====================================================================
-- Goals, achievement badges, mistakes notebook and bookmarks
-- =====================================================================

-- A student's own targets (no row = suggested defaults)
CREATE TABLE IF NOT EXISTS user_goals (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_questions INT NOT NULL DEFAULT 30 CHECK (daily_questions BETWEEN 5 AND 500),
  weekly_tests INT NOT NULL DEFAULT 3 CHECK (weekly_tests BETWEEN 0 AND 21),
  target_percentile NUMERIC(6, 3) NOT NULL DEFAULT 95 CHECK (target_percentile BETWEEN 50 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Badges are defined in code (server/lib/badges.js); this records when each was earned
CREATE TABLE IF NOT EXISTS user_badges (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, badge_id)
);

-- Questions a student saved for later
CREATE TABLE IF NOT EXISTS question_bookmarks (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

-- A student's own note and status on a question they got wrong (or bookmarked)
CREATE TABLE IF NOT EXISTS question_notes (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  note TEXT CHECK (length(note) <= 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS attempt_answers_question_idx ON attempt_answers (question_id);
