# Team 04 — three-person Release 3 work division and timeline

**Date:** Wednesday Nov 4, 2026, Toronto time. **Submission cutoff:** 11:59 p.m. The Moodle screenshot shows the R3 product release freezes on Submit, with peer QA Nov 5–8 and response/repair evidence due Nov 11. This is one team submission.

## Fair division (roughly one-third each)

| Member | Primary ownership | Required deliverables and demonstration |
|---|---|---|
| **Member A — Backend & DB** | R3 schema, session integration, project CRUD, GitHub import, duplicate warning, optimistic version check | Safely migrate DB, enforce R2 verified identity, demonstrate 403 unauthorized/409 stale save/409 duplicate, verify backup and persistence. |
| **Member B — Contributor & permissions** | Invite/accept/decline, standardized roles, personal statement, featured toggle, soft removal and restore, transfer maintainer | Have B and C accept invitations from separate real accounts; demonstrate owner-only statement and same project UUID across profiles. |
| **Member C — UI, demo, regression & release** | R3 editor and public page, hosted fixture/demo/fallback, 390px mobile, R1/R2 regression, adapters/submit | Show demo counter, fallback on missing URL, public CTA, accessible mobile page; coordinate final Render SHA, tag, adapter, Moodle Submit. |

**Shared review:** A reviews C's UI integration; B reviews A's authorization/transaction logic; C reviews B's contributor flow. All three participate in deployed end-to-end verification. The members' actual names should be entered by the team rather than guessed.

## Work order — no parallel work on the same files without coordinating

1. **All three** select correct deployed R2 branch, back up database, and confirm existing R1/R2 continues to work. Create `r3/shared-projects` integration branch.
2. **A** integrates `backend/r3_schema.sql` and `r3_routes.cjs` using real R2 auth/session+student lookup, runs API tests. **B** reviews authorization and contributor invitations.
3. **B** tests three-account contributor workflow, transfers maintenance, confirms soft removal/restore and role fixture. **A** resolves backend defects.
4. **C** integrates new static pages and links from existing R2 profiles; hosts `working_demo.html`/`fallback.svg`, tests incognito + 390px mobile. **B** helps regression testing.
5. **All three** run `docs/R3_QA_CHECKLIST.md`; open issues for defects; commit reviewed fixes, deploy, retest in Render.
6. **C** records final commit SHA and tag, fills both R3 submission files. **A** validates that backend+frontend are the tagged code; **B** verifies reviewer issue access and final Moodle submit status.

## Prioritize if time runs short

1. **Must be real, not documentation-only:** published canonical shared project with 2+ accepted contributors, invite accept, GitHub import, working hosted demo/fallback, public links, persistent database, authenticated editing.
2. Then highest-risk safeguards: unauthorized edits blocked by server, contribution statement ownership, stale-version conflict, duplicate warning, stable URL and soft-removal recovery.
3. Then polish and full regression: mobile, preview/editability, error messages, theme/visibility regression and detailed evidence.
4. Do **not** misrepresent missing features as tested or move a frozen tag after peer QA. A truthful partial release is safer than invented results.

## Countdown to submit (work-flow stages, not promises of time)

- **Development stage:** merge into correct branch, run migration and source checks.
- **Deployed QA stage:** all 3 accounts tested, demo/fallback verified, 390px checked, old R1/R2 flows checked.
- **Freeze stage:** both Render services Live at assessed R3 code, create immutable `R3-submission` tag, compare full SHA.
- **Moodle stage:** upload R3 `.md` and `.json`, paste URL/tag/known issues into text box, select **Submit**, verify new status.
- **After submission:** peer issues Nov 5–8; respond/repair/redeploy/retest and link issue evidence by Nov 11, *without changing the assessed tag*.
