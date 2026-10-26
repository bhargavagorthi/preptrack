-- =====================================================================
-- Syllabus v2: two separate trees (JEE Main, JEE Advanced), six levels:
--   subject → cluster → chapter → topic → subtopic → section
-- Questions are tagged to a node (chapter or deeper) in one or both trees.
-- The old subjects/chapters/topics tables are left in place (legacy) so
-- existing questions can be re-tagged; nothing is deleted here.
-- =====================================================================

CREATE TABLE IF NOT EXISTS syllabus_nodes (
  id SERIAL PRIMARY KEY,
  exam TEXT NOT NULL CHECK (exam IN ('jee_main', 'jee_advanced')),
  parent_id INT REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('subject', 'cluster', 'chapter', 'topic', 'subtopic', 'section')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  position INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK ((level = 'subject') = (parent_id IS NULL)),
  UNIQUE (id, exam)
);

-- No two siblings with the same name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS syllabus_nodes_sibling_name
  ON syllabus_nodes (exam, COALESCE(parent_id, 0), lower(trim(name)));
CREATE INDEX IF NOT EXISTS syllabus_nodes_parent_idx ON syllabus_nodes (parent_id);

-- A child must be exactly one level below its parent, in the same tree
CREATE OR REPLACE FUNCTION syllabus_nodes_check() RETURNS trigger AS $$
DECLARE
  p RECORD;
  expected TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT exam, level INTO p FROM syllabus_nodes WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent node % not found', NEW.parent_id USING ERRCODE = '23503';
  END IF;
  IF p.exam <> NEW.exam THEN
    RAISE EXCEPTION 'A node must be in the same exam tree as its parent' USING ERRCODE = '23514';
  END IF;
  expected := CASE p.level
    WHEN 'subject' THEN 'cluster'
    WHEN 'cluster' THEN 'chapter'
    WHEN 'chapter' THEN 'topic'
    WHEN 'topic' THEN 'subtopic'
    WHEN 'subtopic' THEN 'section'
  END;
  IF expected IS NULL OR NEW.level <> expected THEN
    RAISE EXCEPTION 'A % cannot be placed under a %', NEW.level, p.level USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS syllabus_nodes_check ON syllabus_nodes;
CREATE TRIGGER syllabus_nodes_check
  BEFORE INSERT OR UPDATE OF parent_id, level, exam ON syllabus_nodes
  FOR EACH ROW EXECUTE FUNCTION syllabus_nodes_check();

-- Which node a question belongs to, at most one per tree
CREATE TABLE IF NOT EXISTS question_nodes (
  question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  exam TEXT NOT NULL CHECK (exam IN ('jee_main', 'jee_advanced')),
  node_id INT NOT NULL,
  PRIMARY KEY (question_id, exam),
  FOREIGN KEY (node_id, exam) REFERENCES syllabus_nodes (id, exam) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS question_nodes_node_idx ON question_nodes (node_id);

-- Every node with its full ancestry, for paths, roll-ups and ordering
CREATE OR REPLACE VIEW node_paths AS
WITH RECURSIVE t AS (
  SELECT n.id, n.exam, n.level, n.name, n.parent_id, n.position, 1 AS depth,
         ARRAY[n.id] AS ids,
         n.name AS path,
         ARRAY[n.position, n.id] AS sort_key,
         n.id AS subject_id, n.name AS subject,
         NULL::int AS cluster_id, NULL::text AS cluster,
         NULL::int AS chapter_id, NULL::text AS chapter,
         NULL::int AS topic_id, NULL::text AS topic,
         NULL::int AS subtopic_id, NULL::text AS subtopic,
         NULL::int AS section_id, NULL::text AS section
  FROM syllabus_nodes n
  WHERE n.parent_id IS NULL
  UNION ALL
  SELECT c.id, c.exam, c.level, c.name, c.parent_id, c.position, t.depth + 1,
         t.ids || c.id,
         t.path || ' › ' || c.name,
         t.sort_key || ARRAY[c.position, c.id],
         t.subject_id, t.subject,
         CASE WHEN c.level = 'cluster' THEN c.id ELSE t.cluster_id END,
         CASE WHEN c.level = 'cluster' THEN c.name ELSE t.cluster END,
         CASE WHEN c.level = 'chapter' THEN c.id ELSE t.chapter_id END,
         CASE WHEN c.level = 'chapter' THEN c.name ELSE t.chapter END,
         CASE WHEN c.level = 'topic' THEN c.id ELSE t.topic_id END,
         CASE WHEN c.level = 'topic' THEN c.name ELSE t.topic END,
         CASE WHEN c.level = 'subtopic' THEN c.id ELSE t.subtopic_id END,
         CASE WHEN c.level = 'subtopic' THEN c.name ELSE t.subtopic END,
         CASE WHEN c.level = 'section' THEN c.id ELSE t.section_id END,
         CASE WHEN c.level = 'section' THEN c.name ELSE t.section END
  FROM syllabus_nodes c
  JOIN t ON c.parent_id = t.id
)
SELECT * FROM t;

-- One row per question with its JEE Main and JEE Advanced tags (either may be empty)
CREATE OR REPLACE VIEW question_tags AS
SELECT q.id AS question_id,
       pm.id AS main_node_id, pm.level AS main_level, pm.path AS main_path,
       pm.subject AS main_subject, pm.chapter AS main_chapter, pm.topic AS main_topic,
       pa.id AS adv_node_id, pa.level AS adv_level, pa.path AS adv_path,
       pa.subject AS adv_subject, pa.chapter AS adv_chapter, pa.topic AS adv_topic
FROM questions q
LEFT JOIN question_nodes qm ON qm.question_id = q.id AND qm.exam = 'jee_main'
LEFT JOIN node_paths pm ON pm.id = qm.node_id
LEFT JOIN question_nodes qa ON qa.question_id = q.id AND qa.exam = 'jee_advanced'
LEFT JOIN node_paths pa ON pa.id = qa.node_id;

-- New questions are tagged through question_nodes; topic_id stays only for re-tagging old ones
ALTER TABLE questions ALTER COLUMN topic_id DROP NOT NULL;

-- Which tree a student follows in Analytics and the Syllabus Journey
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS target_exam TEXT NOT NULL DEFAULT 'jee_main'
  CHECK (target_exam IN ('jee_main', 'jee_advanced'));
