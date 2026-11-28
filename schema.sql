-- Legacy Phase 0 items endpoint is still used by regression checks.
-- Some R2 databases created this table separately; keep fresh R3 staging self-contained.
CREATE TABLE IF NOT EXISTS items (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
-- Additive Release 4 migration. No changes to previously published R1/R2/R3 data.
CREATE TABLE IF NOT EXISTS r4_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  sector text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  source_url text,
  imported_at timestamptz
);
CREATE TABLE IF NOT EXISTS r4_collaborations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES r4_partners(id),
  title text NOT NULL,
  period text NOT NULL,
  description text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('current','past')),
  visibility text NOT NULL CHECK (visibility IN ('public','limited','private')),
  public_summary text NOT NULL DEFAULT '',
  project_ids text[] NOT NULL DEFAULT '{}',
  student_ids text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS r4_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES r3_projects(id),
  requested_by uuid NOT NULL REFERENCES r2_accounts(user_id),
  kind text NOT NULL CHECK (kind IN ('verification','partner')),
  partner_id uuid REFERENCES r4_partners(id),
  suggested_company text NOT NULL DEFAULT '',
  note text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES r2_accounts(user_id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE r4_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE r4_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE r4_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON r4_partners, r4_collaborations, r4_requests FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON r4_partners, r4_collaborations, r4_requests FROM %I', role_name);
  END LOOP;
END $$;

-- Team 04 Final Release additive migration (also available standalone in backend/final_schema.sql).
ALTER TABLE students ADD COLUMN IF NOT EXISTS legacy_id TEXT UNIQUE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS legacy_email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS claimed_by_user_id UUID REFERENCES r2_accounts(user_id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS availability_state TEXT NOT NULL DEFAULT 'active';
ALTER TABLE students ADD COLUMN IF NOT EXISTS availability_confirmed_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS merged_into_id TEXT REFERENCES students(id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS legacy_id TEXT UNIQUE;

ALTER TABLE r3_projects ADD COLUMN IF NOT EXISTS legacy_id TEXT UNIQUE;
ALTER TABLE r3_projects ADD COLUMN IF NOT EXISTS demo_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE r3_projects ADD COLUMN IF NOT EXISTS demo_note TEXT NOT NULL DEFAULT '';

ALTER TABLE r4_partners ADD COLUMN IF NOT EXISTS legacy_id TEXT UNIQUE;
ALTER TABLE r4_partners ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES r4_partners(id);

ALTER TABLE r4_collaborations ADD COLUMN IF NOT EXISTS legacy_id TEXT UNIQUE;

ALTER TABLE r4_requests ADD COLUMN IF NOT EXISTS decision_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS final_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL REFERENCES students(id),
  claimant_user_id UUID NOT NULL REFERENCES r2_accounts(user_id),
  note TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected')),
  auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by UUID REFERENCES r2_accounts(user_id),
  reviewed_at TIMESTAMPTZ,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS final_claim_requests_state_idx ON final_claim_requests(state, created_at);

CREATE TABLE IF NOT EXISTS final_merge_redirects (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('student', 'partner')),
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  merged_by UUID REFERENCES r2_accounts(user_id),
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, source_id)
);

CREATE TABLE IF NOT EXISTS final_migration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_name TEXT NOT NULL DEFAULT 'legacy_export',
  actor_id UUID REFERENCES r2_accounts(user_id),
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE final_claim_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_merge_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_migration_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON final_claim_requests, final_merge_redirects, final_migration_runs FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON final_claim_requests, final_merge_redirects, final_migration_runs FROM %I', role_name);
  END LOOP;
END $$;

-- Private editable drafts for claimed legacy portfolios. Ownership is checked
-- on every request; drafts belong to both a portfolio and its current author.
CREATE TABLE IF NOT EXISTS final_profile_drafts (
  student_id TEXT NOT NULL REFERENCES students(id),
  user_id UUID NOT NULL REFERENCES r2_accounts(user_id),
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, user_id)
);
ALTER TABLE final_profile_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON final_profile_drafts FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON final_profile_drafts FROM %I', role_name);
  END LOOP;
END $$;
