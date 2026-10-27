-- =====================================================================
-- Account settings and student profiles
--  * users.student_code: a readable ID for students, e.g. PT26-000042
--  * users.password_changed_at: tokens issued before this are rejected,
--    so changing the password signs out every other device
--  * user_profiles: details collected after signup (all optional, any
--    field can be cleared again)
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS student_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE SEQUENCE IF NOT EXISTS student_code_seq;

-- Give existing students a code
UPDATE users
SET student_code = 'PT' || to_char(COALESCE(created_at, now()), 'YY') || '-' || lpad(nextval('student_code_seq')::text, 6, '0')
WHERE role = 'student' AND student_code IS NULL;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Personal
  photo_url TEXT,
  phone TEXT,
  alt_phone TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('female', 'male', 'other', 'prefer_not')),
  nationality TEXT,
  category TEXT CHECK (category IN ('general', 'ews', 'obc_ncl', 'sc', 'st')),
  pwd BOOLEAN,
  mother_tongue TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  district TEXT,
  state TEXT,
  pincode TEXT CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  country TEXT,

  -- Academic
  current_class TEXT CHECK (current_class IN ('class_11', 'class_12', 'dropper', 'other')),
  board TEXT CHECK (board IN ('cbse', 'icse', 'state', 'other')),
  school_name TEXT,
  school_city TEXT,
  class10_percent NUMERIC(5, 2) CHECK (class10_percent BETWEEN 0 AND 100),
  class10_year INT CHECK (class10_year BETWEEN 1990 AND 2100),
  class12_percent NUMERIC(5, 2) CHECK (class12_percent BETWEEN 0 AND 100),
  class12_year INT CHECK (class12_year BETWEEN 1990 AND 2100),
  target_year INT CHECK (target_year BETWEEN 2000 AND 2100),
  coaching_institute TEXT,
  preferred_language TEXT CHECK (preferred_language IN ('english', 'hindi', 'other')),

  -- Parent / guardian
  guardian_name TEXT,
  guardian_relation TEXT CHECK (guardian_relation IN ('father', 'mother', 'guardian', 'other')),
  guardian_phone TEXT,
  guardian_email TEXT,
  guardian_occupation TEXT,

  -- Notifications
  notify_email BOOLEAN NOT NULL DEFAULT true,
  notify_whatsapp BOOLEAN NOT NULL DEFAULT false,
  notify_contests BOOLEAN NOT NULL DEFAULT true,
  notify_results BOOLEAN NOT NULL DEFAULT true,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
