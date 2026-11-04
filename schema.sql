CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    headline TEXT NOT NULL,
    program TEXT NOT NULL,
    status TEXT NOT NULL,
    profile_status TEXT NOT NULL,
    availability JSONB NOT NULL DEFAULT '[]',
    links JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS biography TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE students ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE students ADD COLUMN IF NOT EXISTS section_order TEXT NOT NULL DEFAULT 'about-projects';

CREATE TABLE IF NOT EXISTS skills (
    name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS student_skills (
    student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
    skill_name TEXT REFERENCES skills(name) ON DELETE CASCADE,
    PRIMARY KEY (student_id, skill_name)
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    domain TEXT,
    technologies JSONB NOT NULL DEFAULT '[]',
    links JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS project_contributors (
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    PRIMARY KEY (project_id, student_id)
);

CREATE TABLE IF NOT EXISTS r2_accounts (
    user_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    github_id TEXT PRIMARY KEY,
    github_login TEXT NOT NULL,
    email TEXT UNIQUE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS r2_verification_challenges (
    user_id UUID PRIMARY KEY REFERENCES r2_accounts(user_id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS r2_verification_limits (
    user_id UUID PRIMARY KEY REFERENCES r2_accounts(user_id) ON DELETE CASCADE,
    window_started_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    last_requested_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS r2_profiles (
    user_id UUID PRIMARY KEY REFERENCES r2_accounts(user_id) ON DELETE CASCADE,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Release 3 additive migration (also available separately as backend/r3_schema.sql)
-- Team 04 Release 3: additive migration. Run ONCE on your existing Supabase DB.
-- Does not drop or modify any R1/R2 tables. Identity: R2 internal UUID, not GitHub username.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS r3_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintainer_id uuid NOT NULL,
  title varchar(180) NOT NULL CHECK(length(trim(title)) > 0),
  description text NOT NULL DEFAULT '',
  domain varchar(120) NOT NULL DEFAULT 'Other',
  technologies text[] NOT NULL DEFAULT '{}',
  started_on date,
  status varchar(32) NOT NULL DEFAULT 'In progress',
  playable_url text,
  video_url text,
  fallback_url text,
  published boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS r3_projects_maintainer_idx ON r3_projects(maintainer_id);
CREATE INDEX IF NOT EXISTS r3_projects_published_idx ON r3_projects(published);

CREATE TABLE IF NOT EXISTS r3_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES r3_projects(id) ON DELETE CASCADE,
  repo_url text NOT NULL,
  repo_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS r3_repositories_project_idx ON r3_repositories(project_id);

CREATE TABLE IF NOT EXISTS r3_contributors (
  project_id uuid NOT NULL REFERENCES r3_projects(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  role varchar(80) NOT NULL,
  contribution_statement text NOT NULL DEFAULT '',
  featured boolean NOT NULL DEFAULT true,
  state varchar(16) NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending','accepted','declined','removed')),
  invited_by uuid,
  joined_at timestamptz,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, student_id)
);
CREATE INDEX IF NOT EXISTS r3_contributors_student_idx ON r3_contributors(student_id, state);

CREATE TABLE IF NOT EXISTS r3_join_requests (
  project_id uuid NOT NULL REFERENCES r3_projects(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  message text NOT NULL DEFAULT '',
  state varchar(16) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, student_id)
);

-- This audit history is append-only from application routes; no single removal destroys an accepted history.
CREATE TABLE IF NOT EXISTS r3_audit (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES r3_projects(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  subject_id uuid,
  action varchar(80) NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS r3_audit_project_idx ON r3_audit(project_id, created_at DESC);
