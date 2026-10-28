-- =====================================================================
-- Journey progression: levels a student chose to open early.
-- Unlocking is otherwise worked out from mastery (server/lib/progression.js);
-- nothing is ever blocked, this only remembers "jump in anyway".
-- =====================================================================

CREATE TABLE IF NOT EXISTS journey_unlocks (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id INT NOT NULL REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, node_id)
);
