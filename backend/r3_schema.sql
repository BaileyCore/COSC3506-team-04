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
