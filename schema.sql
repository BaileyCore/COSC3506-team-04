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
