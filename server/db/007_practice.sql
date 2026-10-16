ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard','practice')),
  ADD COLUMN IF NOT EXISTS owner_id INT REFERENCES users(id);
