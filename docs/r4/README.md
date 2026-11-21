# Team 04 R4 deployment and reviewer handoff

The official Project 1 chapter is https://moodle.dilab.ca/mod/book/view.php?id=3886&chapterid=28.
This branch carries the reviewed R3 invite-by-name work in PR #8. Keep the frozen R3 tag unchanged.
Chosen challenge: R4.19 - Server-Side Collaboration Privacy. The other three are not selected.

## Current production review

The public site and backend were deployed from r4/production-sign-in, application
commit 9c4ac4760f4c832e31c7ba919481edf53729c61a, on November 20, 2026 (Toronto).
The account pages are hosted on the API hostname to keep authentication first-party.
Use https://cosc3506-team-04-ey5d.onrender.com/profile.html and https://cosc3506-team-04-ey5d.onrender.com/r4-staff.html.
See [the current release record](../../release_submission.md) for the live evidence,
backup and rollback record, completed checks and remaining reviewer/mobile checks.
The R4 assessed tag and Moodle freeze are pending team review.

## Deploy and provision

1. The production Render workspace owner must review the branch and configure the
   existing production services. Record both previous deploys and auto-deploy settings.
   Keep the existing database, OAuth settings, mail relay, and frontend origin.
2. Back up the existing database. R4 creates three new tables with row-level security
   enabled and revokes access from public client roles. Normal startup applies the
   additive root schema with the database table-owner account. If the service runs
   with `SKIP_SCHEMA_INIT=1`, have the database owner apply `backend/r4_schema.sql`
   first. A restricted application role needs explicit private database grants and
   RLS policies for its tables; do not grant them to Supabase anon/authenticated roles.
3. Set `R4_STAFF_GITHUB_IDS` on the backend to the stable numeric GitHub account
   IDs of approved staff and the designated instructor/reviewer test account.
   Do not grant staff by email domain alone. Arrange reviewer access privately.
4. Deploy the backend and check `/api/health`. Then deploy the frontend from the same
   tested revision. The frontend build publishes the four unchanged course HTML fixtures.
5. Open a signed-out browser and confirm all four fixture URLs load. Perform real
   student and staff sign-ins. Run the workflow below before claiming a pass or freezing.
6. Once deployed and verified, create `R4-submission` at the actual assessed commit.
   Complete the official Moodle templates with the SHA, evidence URLs and staff access
   instructions. The drafts here are starting points, not completed production evidence.

## Live workflow

- Authorized staff: open /profile.html, sign in with GitHub, then open /r4-staff.html.
  Staff do not need to publish a student profile. On ordinary student and signed-out
  sessions verify the staff queue is refused. Staff grant is configuration only.
- Staff: use one of the fixture URLs from the staff page to import, review, edit and
  publish North Shore Simulations. Confirm it does not appear publicly before publishing.
  Try sparse, supplied adversarial text and similar-name fixtures, plus a nonfetchable
  URL while an existing draft is open. No import alone may publish or grant anything.
- Staff: use collaboration_seed.json as a guide. Add current and past public
  collaborations to the same published company. Select a published shared project and
  a second related legacy/shared project where appropriate. Add a separately limited
  collaboration with an anonymized summary and a private one with a recognizable
  non-sensitive test title. Confirm the public API omits the latter and returns only
  the anonymized summary for the limited record.
- Verified student: open My Shared Projects and a project you maintain. Submit a
  verification note and a partner association request with an explanation. Test both
  choosing a published company and suggesting one. Verify no public badge or official
  relationship appears until a staff decision.
- Staff: inspect the queue, contributors and notes. Approve one request and reject another.
  Select a published company before approving a suggested company association.
  Confirm the approved relationship and verification marker from the public project.
- Signed out: open /r4-partners.html, the published partner, and the collaboration
  inquiry at desktop and 390 CSS px. Verify current/past labels, public links and
  contextual inquiry. Also retest R1 directory, R2 profiles and R3 shared project/demo,
  including invite-by-name on a disposable project with a consenting test account.

## Import constraints

The importer reads ordinary HTTPS HTML with bounded fetch time/body size, no follow
redirects, and a pinned public IPv4 address. Use the final URL for sites that redirect.
Text is read as data and displayed as text. Sparse or JS-only websites can require
manual completion. Inquiry submission uses the existing simulation. Challenge credit
is claimed only for the explicit server-side privacy policy, not the three unselected
challenge scenarios. Real OAuth, production fixture fetching, private staff setup,
deploy SHA and public fixture partner URL need verification before submission.

## Local verification

Run `npm ci`, `npm --prefix backend ci`, `npm run check:r3`, `npm run check:r4`,
`npm run test:r3`, `npm run test:r4`, `npm test`, and `npm run build` from the repository root.
The R4 integration suite exercises the real Express handlers and PostgreSQL SQL
against disposable PGlite data with mocked sessions and fixture fetches.
The headless browser walkthrough passed locally at desktop and 390 CSS pixels
on November 20, 2026. See [local verification in the submission draft](release_submission.md#local-verification).
Repeat the public mobile flow, real GitHub sign-in and staff authorization, and
hosted HTTPS fixture imports on Render before recording production evidence.
