CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO organizations (name)
SELECT 'PrepTrack National'
WHERE NOT EXISTS (SELECT 1 FROM organizations);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student'
    CHECK (role IN ('student','creator','teacher','organiser','admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','pending','suspended')),
  organization_id INT REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
