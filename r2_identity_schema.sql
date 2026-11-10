CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS student_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    github_id BIGINT NOT NULL UNIQUE,

    github_username VARCHAR(255) NOT NULL,

    algoma_email VARCHAR(255) UNIQUE,

    email_verified_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id UUID NOT NULL
        REFERENCES student_accounts(id)
        ON DELETE CASCADE,

    email VARCHAR(255) NOT NULL,

    code_hash VARCHAR(255) NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ,

    failed_attempts INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_account
ON email_verification_challenges(account_id);

CREATE TABLE IF NOT EXISTS verification_request_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    account_id UUID NOT NULL
        REFERENCES student_accounts(id)
        ON DELETE CASCADE,

    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_request_account_time
ON verification_request_history(account_id, requested_at);

CREATE TABLE IF NOT EXISTS student_profile_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id UUID NOT NULL UNIQUE
        REFERENCES student_accounts(id)
        ON DELETE CASCADE,

    display_name VARCHAR(150) NOT NULL DEFAULT '',

    headline VARCHAR(200) NOT NULL DEFAULT '',

    biography TEXT NOT NULL DEFAULT '',

    program VARCHAR(200) NOT NULL DEFAULT '',

    location_text VARCHAR(200) NOT NULL DEFAULT '',

    availability TEXT[] NOT NULL DEFAULT '{}',

    skills TEXT[] NOT NULL DEFAULT '{}',

    professional_links JSONB NOT NULL DEFAULT '{}'::jsonb,

    profile_status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (profile_status IN ('draft', 'published')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Complete the schema used by the R2 profile and résumé review routes.
-- Additive and repeatable; existing profile data is preserved.
ALTER TABLE student_profile_drafts
ADD COLUMN IF NOT EXISTS education_details TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS experience_details TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS field_visibility JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS resume_review_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES student_accounts(id) ON DELETE CASCADE,
    candidates JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
    used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_resume_review_account
ON resume_review_batches(account_id);

-- Release 2: Student Status (Current Student / Alumni)
-- Run after creating student_profile_drafts.

ALTER TABLE student_profile_drafts
ADD COLUMN IF NOT EXISTS student_status TEXT
NOT NULL DEFAULT 'current';

-- Allow only supported student statuses.
-- Safe to run again without duplicating the constraint.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'student_profile_drafts_student_status_check'
        AND conrelid = 'student_profile_drafts'::regclass
    ) THEN
        ALTER TABLE student_profile_drafts
        ADD CONSTRAINT student_profile_drafts_student_status_check
        CHECK (student_status IN ('current', 'alumni'));
    END IF;
END
$$;
