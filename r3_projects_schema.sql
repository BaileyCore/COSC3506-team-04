BEGIN;

CREATE TABLE public.r3_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    maintainer_account_id UUID NOT NULL
        REFERENCES public.student_accounts(id),
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    short_description TEXT NOT NULL DEFAULT '',
    domain TEXT,
    technologies TEXT[] NOT NULL DEFAULT '{}',
    project_date DATE,
    project_status TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.r3_projects ENABLE ROW LEVEL SECURITY;

COMMIT;