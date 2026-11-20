BEGIN;

CREATE TABLE IF NOT EXISTS public.r3_project_invitations (
    project_id uuid NOT NULL
        REFERENCES public.r3_projects(id) ON DELETE CASCADE,
    invitee_account_id uuid NOT NULL
        REFERENCES public.student_accounts(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,

    PRIMARY KEY (project_id, invitee_account_id),
    CHECK ((status = 'pending') = (responded_at IS NULL))
);

CREATE INDEX IF NOT EXISTS r3_project_invitations_invitee_idx
    ON public.r3_project_invitations (invitee_account_id);

ALTER TABLE public.r3_project_invitations ENABLE ROW LEVEL SECURITY;

COMMIT;