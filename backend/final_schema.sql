-- Team 04 Final Release additive migration (standalone, idempotent, Supabase-safe).
-- Does not drop or modify any existing R1/R2/R3/R4 data.

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
