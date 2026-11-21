Chosen challenge: R4.19 - Server-Side Collaboration Privacy

# Release 4 deployment for team review

- Team 04
- Project Option 1 - ImmXrsive Talent and Industry Platform
- Public deployment https://cosc3506-team04-frontend.onrender.com
- Account and staff application https://cosc3506-team-04-ey5d.onrender.com
- Repository https://github.com/BaileyCore/COSC3506-team-04
- Working branch r4/production-sign-in
- Deployed application commit 9c4ac4760f4c832e31c7ba919481edf53729c61a
- Required assessed tag R4-submission is pending team review and freeze.
- Moodle submission and the final assessed full SHA are pending the team's submission decision.

## Release notes

R4 adds staff queues, institutional project verification, partner association requests,
reviewed company website imports, public Industry Partners pages, contextual inquiries,
and current/past collaborations with public, anonymized and private visibility.
The selected Challenge is R4.19. Challenges R4.10, R4.13 and R4.14 are not chosen.

This deployment builds on the team's r4/staff-industry commit
6360a6e5dcfb7b51553866691f10fd858db1d8eb and includes its invitation name picker.
A production session failure was reproduced and corrected. Signed-in profile, shared
project and staff pages now run on the backend hostname, where the session cookie
works directly. Opening their existing static-frontend links redirects to these
account pages. Exact frontend and backend origins are accepted for authenticated writes.

## Live access and roles

- Public visitors can open the directory, partner pages, profiles, projects and inquiry without an account.
- Students use their own GitHub account and verified Algoma email through https://cosc3506-team-04-ey5d.onrender.com/profile.html.
- Staff use an approved GitHub account listed by its stable numeric ID in the backend's R4_STAFF_GITHUB_IDS setting, then open https://cosc3506-team-04-ey5d.onrender.com/r4-staff.html.
- The deployment owner account was explicitly approved and used for staff verification. A designated reviewer/instructor account must still be arranged privately before assessment. Staff passwords and verification codes are not shared in these files.
- Independent ordinary-student authorization and multi-student invitation acceptance still need a live retest with separate consenting accounts.

## Fixture source URLs

All four hosted HTML files were byte-compared with the checked-in fixtures and matched.

- company_normal.html — https://cosc3506-team04-frontend.onrender.com/r4-fixtures/company_normal.html
- company_sparse.html — https://cosc3506-team04-frontend.onrender.com/r4-fixtures/company_sparse.html
- company_prompt_injection.html — https://cosc3506-team04-frontend.onrender.com/r4-fixtures/company_prompt_injection.html
- company_same_name_other_domain.html — https://cosc3506-team04-frontend.onrender.com/r4-fixtures/company_same_name_other_domain.html

## Published evidence

- Reviewed fixture company https://cosc3506-team04-frontend.onrender.com/r4-partners.html?id=c53a2828-5ce6-40f1-a700-547e2d55d4d0
- Published demonstration project https://cosc3506-team04-frontend.onrender.com/r3-project.html?id=bc26639f-3835-47c0-9218-cf2c25e1b17e
- The company has public current (2026) and past (2025) collaborations, related public projects/students, an anonymized highlight and a private QA record.
- Algoma Field Systems remains an unpublished, manually completed sparse fixture draft for staff review.
- The demonstration project has approved verification and a staff-approved North Shore Simulations association. A separate synthetic company suggestion was rejected.
- Inquiry uses the existing local simulation. Its successful submission retained the partner identity and source context.

## Observed production verification

Verified on November 20, 2026, Toronto time, against the deployed application commit above.

- Both Render services show Live at the same full commit; /api/health returns 200 with a reachable database.
- GitHub sign-in succeeds after signing out of the application, and the approved staff account reaches the work queue.
- Normal company import, editing, draft saving and explicit publication passed using the hosted fixture URL.
- Sparse import and manual completion passed. An unavailable import left unsaved draft text intact.
- Two public collaborations in different years show under Current and Past with project/student links.
- Public API responses contain only the anonymized summary for the limited record and omit the private record and its marker text. Unpublished company drafts are absent.
- Student requests were pending with no official public relationship before review. Staff approval produced public verification and the partner relationship; rejection was recorded for the suggested company.
- Anonymous staff queue reads and staff writes return 401.
- R1 case-insensitive search, combined skill/availability/status filters, stable profile navigation and browser Back preserved the expected single result.
- R2's existing verified profile opens. R3 project creation/publication, public demo evidence and student-name lookup passed.

## Remaining checks and known limitations

- A live 390-CSS-pixel viewport retest is pending. The branch author's earlier local mobile test is documented in docs/r4/README.md; it is not counted as a new live mobile pass here.
- Live authorization with a separate ordinary student and a designated staff reviewer is pending. Automated integration tests exercise these authorization boundaries.
- Email delivery was not re-requested during this check because the test owner already had a verified Algoma account.
- R4.10, R4.13 and R4.14 are not chosen. Scenarios D, E and F should be marked Not chosen.
- Import accepts bounded ordinary HTTPS HTML and requires the final URL for redirects. Sparse sites can require manual completion.
- Supplied synthetic company website links use reserved example.test hosts.
- Free Render instances can require a cold start after inactivity.
- Full requirements compliance and assessment readiness remain subject to the outstanding live checks and team review.

## Automated checks

62 automated tests passed locally, both syntax checks passed, and the frontend build passed.
GitHub CI passed at 9c4ac4760f4c832e31c7ba919481edf53729c61a.
https://github.com/BaileyCore/COSC3506-team-04/actions/runs/44842124782

## Deployment and recovery

The application uses Node/Express, Render's static frontend and web backend, and
persistent Supabase PostgreSQL. A private export captured all 18 existing public-schema
application tables (236 rows) with column, constraint, index, policy and sequence metadata
before the R4 migration. The export is retained privately; it is not stored in Git.
The three additive R4 tables were created and their row-level security verified.

Previous backend commit e2b3b2a014bc365f85d6efd4bac37408251512d8.
Previous frontend commit 692e2dcafdc7d132a0a1abc2118e045cf557068a.
Both services previously tracked r3/shared-projects and now track r4/production-sign-in.
The existing OAuth app, mail configuration and database were retained.
