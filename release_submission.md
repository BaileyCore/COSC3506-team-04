# Release Submission

Release: R2
Team: team-04
Project Option: Project 1 — Public Talent Directory
Deployment: https://cosc3506-team04-frontend.onrender.com
Repository: https://github.com/BaileyCore/COSC3506-team-04
Release tag: R2-submission (required; not found in this repository at this check)
Commit: Original frozen-release SHA unconfirmed. Current working code: 469d38a4f91ce79eddaa24afea7ca7a33cc8db2e
Adapter: evaluation_adapter.json
Known issues: R1 fixtures are not yet loaded on the current database; shared skills and public directory APIs currently return empty arrays. Layout-heavy PDF columns can produce mixed review candidates. See open verification items below.
Test notes: This is a current-work/QA preparation record, not a claim that this version was submitted or frozen by the Oct 16 deadline.

## Test accounts

Project 1 roles are public visitor, GitHub-authenticated unverified student, and verified student. No staff/admin or pre-shared course password is required.

1. Open https://cosc3506-team04-frontend.onrender.com/profile.html in a fresh browser session and select Continue with GitHub.
2. Sign in with your own GitHub account. The app requests only read:user; its internal UUID is associated with the stable GitHub numeric ID.
3. Enter an algomau.ca address you control, select Send verification code, read your private Algoma inbox and select Verify email.
4. Codes expire within the configured 1–30 minute interval (default 30), are single-use, and allow five wrong attempts per challenge. Email requests allow one per minute and five per hour per GitHub account, including failed delivery requests.
5. Save a draft; preview it before publishing. A later GitHub sign-in uses the saved affiliation and draft.
6. Use two separate accounts/mailboxes for ownership checks. Arrange any reviewer-specific access or setup through the approved private course channel. Do not commit passwords, tokens, codes or real private resume content.

## Release-specific evidence

### Current deployment and version record

- Frontend: https://cosc3506-team04-frontend.onrender.com
- Backend: https://cosc3506-team-04-ey5d.onrender.com
- Health: https://cosc3506-team-04-ey5d.onrender.com/api/health
- Working branch: r2/student-self-service.
- Last backend deployment confirmed by screenshot: faded690df48bd7fadad97ee630422e51c155df2.
- Profile editor fix: 469d38a4f91ce79eddaa24afea7ca7a33cc8db2e. The user confirmed the frontend deployment was Live, then saved and published successfully.
- No R2-submission ref was found in this repository at this check. Confirm the team's actual Moodle submission and any approved equivalent before identifying an assessed commit.
- The published deadline is Oct 16, 2026, 11:59 p.m. Toronto time. The checks/repairs described here occurred Oct 17. They must not be represented as evidence that these behaviors passed in the original frozen version.
- Preserve any original assessed tag/SHA. Later repairs must be linked to project issues and recorded with their later deployed commit; do not move a frozen tag.

### Release notes

Adds GitHub sign-in, Algoma email verification, private profile drafts, structured fields, shared-skill selection, local PDF import with editable unchecked suggestions, public/private controls for availability and professional links, preview, publish/unpublish, three controlled themes, About/Project Evidence section order, and a default initials avatar. R1 public routes remain present.

Email delivery uses a Google Apps Script relay configured through private hosting settings. A mismatched relay secret was corrected. The user subsequently reached the verified profile editor. The frontend profile-loading bug (invalid ID lookups for visibility/style fields) was corrected in commit 469d38a4f91ce79eddaa24afea7ca7a33cc8db2e.

### Fixtures and setup

- R1: fixtures/students.json, fixtures/projects.json and fixtures/skills.json are in the repository. With the production DATABASE_URL privately configured, run `node seed-release1.js` from backend. The current live skills and directory responses are empty; loading remains pending. Do not reset the database or erase user profiles.
- R2: download resume_clean_single_column.pdf, resume_minimal.pdf, resume_layout_stress.pdf and resume_untrusted_text.pdf from Moodle Release 2 Fixtures, folder 3925. Select each locally in the profile editor. These PDFs are not preloaded server-side.
- The backend applies additive schema.sql to create the account, challenge, limit and draft tables. Initial schema creation needs a database role permitted to create/alter those tables.
- Node/Express backend, persistent Supabase PostgreSQL and Render static frontend. Required private settings: DATABASE_URL, FRONTEND_ORIGIN, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, R2_SESSION_SECRET, GOOGLE_MAILER_URL and GOOGLE_MAILER_SECRET. Approved domains are checked by the backend; the current Google relay additionally limits delivery to algomau.ca.
- Browser must allow the cross-site HTTPS session cookie and reach GitHub and the pinned PDF.js CDN. Manual editing remains available when PDF parsing fails. Free hosting may need time to wake.

### Privacy/visibility summary

See R2_PRIVACY_SUMMARY.md. Private drafts and verified email/challenge data are not normal public API responses. Public reads select published student records. At publication, hidden availability becomes [] and hidden professional links become {} in the public snapshot; maintained private values remain in the owner-only draft. Unpublishing removes the public profile without deleting the maintained draft. The PDF and full extracted resume text are processed only in browser memory; neither is uploaded/persisted or offered through a public download endpoint. Candidate selection/application is explicit and does not itself save or publish.

### Checks completed and limits

- User confirmed GitHub sign-in, arrival in the verified editor, saving after frontend repair, preview, publish and unpublish.
- Screenshots showed public profile access in Incognito after publication and Student not found after unpublication.
- Local tests using PDF.js 4.4.168 read all four supplied PDFs and the current candidate algorithm. A DOM-stub harness exercised the actual import/review handlers: upload preserved manual fields, candidates started unchecked, edited/selected candidates applied explicitly, and import/apply performed no profile-save or publish request. Malformed PDF produced a recoverable error and preserved existing fields.
- The minimal fixture produced no skills, work entries or links absent from its source. The untrusted-text fixture remained data; its instruction did not trigger a profile/network action.
- These local checks are not a claim that every fixture/viewport/security scenario passed in the deployed browser. The adapter describes routes and expected checks, not proof of passing.

### Known issues / remaining verification

1. Load R1 fixtures: production /api/skills and /api/students returned [] on Oct 17. Without shared skills the structured-skills requirement and meaningful R1 regression checks cannot be completed.
2. Confirm the original frozen Moodle version/tag/full SHA and assigned-reviewer/instructor access to repository and issue creation. The repository has no confirmed R2 tag at this check.
3. Complete deployed privacy toggles/API checks, 390 CSS-pixel workflow, both-account ownership tampering, repeated sign-in, expiry/reuse/wrong-attempt limits, all themes/orders with unchanged filters, and R1 project/inquiry regression checks.
4. The canonical write routes use session ownership, but currently ignore unrecognized body/query fields. Explicit foreign-identifier refusal needs a focused R2.30 check.
5. Layout-stress extraction can merge adjacent columns and include headings as candidates. Students must edit/reject candidates before applying. It is a heuristic parser, with a 10 MB limit and only the first eight pages read.
6. The Google relay's domain check is hardcoded to algomau.ca even though backend approved domains are configurable. Adding a second domain currently requires updating the relay.
7. PDF.js depends on CDN availability; delivery depends on the configured sender and its daily quota. No instructor-approved alternative delivery mode is asserted.
