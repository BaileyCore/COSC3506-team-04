# Final fixture and claim editor verification — November 27, 2026

The four course files supplied by the deployment owner (`README.md`,
`legacy_export.json`, `legacy_expected_results.json`, and `scale_fixture.json`)
are byte-for-byte identical to `fixtures/final/` in the Final candidate. The
scale dataset contains 220 students, 110 projects, and 25 companies. The legacy
acceptance checks remain the supplied expected-results file, not import data.

## Reproduced defect and repair

At candidate `7b25026c6f63dcbe0ebfe40e6095313a897d7b02`, claiming synthetic
profile LS02 was approved, but `/api/profile` returned an empty account draft.
Publishing from that editor created a separate `U<account UUID>` profile and
left LS02 unchanged. Passing the original 66 checks did not cover this path.

Approved claims now expose an Edit action and a labelled Profile to manage
selector. The existing profile API accepts an optional `student_id` query
parameter and checks ownership against the signed-in account before reading,
saving, publishing, or unpublishing. An approved imported portfolio keeps its
original public ID and project relationships. The ordinary account profile is
still independent. Attempts to edit a merged record require the surviving
profile, and wrong owners receive HTTP 403.

`final_profile_drafts` stores private drafts by both student ID and author ID.
Staff reassignment revokes the previous author's access. The next owner starts
from the public portfolio, never from the previous author's private draft.
Retirement and availability reconfirmation in the editor target the selected
portfolio. No production database or hosting configuration was changed by this
verification.

## Local evidence

- The original migration, repeated-import, scale, R4, and R3 tests passed.
- `tests/final_claim_editor.test.mjs` uses the real R2 session, HTTP routes,
  staff claim approval, and isolated PGlite PostgreSQL. It verifies draft
  privacy, ownership denial, publication at LS02, unchanged contributor links,
  alumni verification persistence, unpublish/retire, and staff reassignment.
- `tests/final_claim_editor_ui.test.cjs` exercises actual frontend event
  handlers with a DOM stub, including selecting an approved claim, saving,
  publishing, unpublishing, retirement, and returning to the account draft.
- Combined suite: 16 ESM tests and 57 CommonJS tests, all passing.
- R3, R4, and Final syntax checks and the frontend production build passed.

These are local checks. A real 390 CSS-pixel browser pass and deployed
student/staff acceptance remain pending; the DOM stub is not mobile or keyboard
accessibility evidence.

## Deployment and handoff

Include this repair in the Final candidate before deploying. If the deployment
uses `SKIP_SCHEMA_INIT=1`, apply the updated `backend/final_schema.sql` using the
existing authorized database migration process; otherwise the normal additive
startup schema includes the new private draft table. Its RLS and privilege
revocations are included in both schema files.

After deployment, claim only synthetic data as the designated reviewer, approve
as staff if needed, and edit/publish/unpublish the selected imported portfolio.
Confirm its URL remains `/student.html?id=<original ID>`. Then verify assigned
reviewer/instructor access, finish the live checklist, fill the assessed SHA and
test-access details, create `FINAL-submission` on the verified candidate, and
complete the Moodle submission. Earlier assessed tags remain unchanged.
