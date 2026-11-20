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
