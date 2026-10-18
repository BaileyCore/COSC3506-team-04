# Release Submission

Release: R2
Team: team-04
Project Option: Project 1 — Public Talent Directory
Deployment: https://cosc3506-team04-frontend.onrender.com
Repository: https://github.com/BaileyCore/COSC3506-team-04
Release tag: R2-submission
Commit: d97c6477f680a6a9b7764aa6107ceb31003c0e0c
Adapter: evaluation_adapter.json
Known issues: Heuristic PDF extraction can mix columns/headings; the mail relay is limited to algomau.ca; explicit foreign-identifier refusal needs further verification. See below.
Test notes: Prepared for the instructor's extension to October 18, as reported by the team. Create R2-submission on the exact commit above before clicking Moodle Submit. Do not move the tag afterward.

## Test accounts

Use your own GitHub account and an algomau.ca mailbox you control. Project 1 roles are public visitor, signed-in unverified student and verified student; shared passwords or an administrator-created account are not required.

1. Open https://cosc3506-team04-frontend.onrender.com/profile.html in a fresh browser session and select Continue with GitHub.
2. Enter your approved Algoma address, select Send verification code, read your private inbox, and select Verify email.
3. Save a private draft; import a synthetic PDF; review/edit/select candidates before applying; choose visibility; preview; publish/unpublish.
4. Use a separate second GitHub account/mailbox for ownership checks. Arrange reviewer-specific setup through the course-approved private channel. Never commit access credentials, verification codes or real private résumé data.

Verification codes expire after a configurable 1–30 minutes (default 30), are single-use and permit five wrong attempts per challenge. Requests allow one per minute and five per hour per account, including failed deliveries. Wait for cooldown or request a fresh challenge as directed.

## Release-specific evidence

### Version and deployment

- Assessed code target: R2-submission at d97c6477f680a6a9b7764aa6107ceb31003c0e0c. The backend deployment screenshot identified this exact commit as Live.
- Frontend working commit: 469d38a4f91ce79eddaa24afea7ca7a33cc8db2e. Its complete frontend tree is identical to the frontend tree in the assessed code target.
- Backend health: https://cosc3506-team-04-ey5d.onrender.com/api/health.
- Working branch and subsequent documentation: r2/student-self-service. These uploaded files clarify the assessed code snapshot; later documentation commits do not change the code in the tag.
- Repository is public, not archived, and Issues are enabled. Assigned reviewers/instructor must confirm they can open it and create issues before Moodle Submit.
- The team reported no previous R2 Moodle submission. This package does not assert an earlier freeze or an October 16 submission. Later QA repairs must reference project issues and retain their later deployed SHA.

### Release notes and setup

GitHub sign-in, Algoma verification, private drafts, structured professional fields, standardized skills, local PDF import, editable unchecked suggestions, field visibility, preview, publish/unpublish, three themes, optional-section order and a default avatar are implemented. The invalid profile-control lookups were repaired before this snapshot.

R1 JSON fixtures are in fixtures/. They were imported once using `node seed-release1.js` from backend with DATABASE_URL configured privately. API checks confirmed 24 shared skills and 17 published fixture profiles persisted after a further backend redeployment. Normal backend Build Command was restored to `npm install`; do not reset the database for QA.

Download the four R2 synthetic PDFs from Moodle Release 2 Fixtures (folder 3925), then select each in the editor. No server preload is needed. Import reads the first eight pages, up to 10 MB, using PDF.js 4.4.168 from a CDN; failure allows manual editing.

Hosting is Render with persistent Supabase PostgreSQL. GitHub OAuth and the Google mail relay are configured privately. A modern browser must allow the cross-site HTTPS session cookie and access GitHub, the mailbox and the PDF.js CDN. Free hosting can need time to wake. No instructor-approved verification bypass is enabled.

### Privacy/visibility summary

A private draft belongs to an internal UUID associated with the stable GitHub numeric ID. Canonical owner routes select the account from the signed HttpOnly session. Public APIs return only published student profiles, without verified email, challenges or the private draft. Publishing copies a public snapshot: hidden availability becomes [] and hidden professional links become {}; the maintained private values remain in the draft. Unpublishing hides the public profile without deleting the draft. Selected PDFs and full extracted résumé text stay in browser memory; neither is uploaded/persisted or publicly downloadable. Only explicitly reviewed/applied and then saved profile fields are maintained. Custom text is escaped and saved professional links are restricted to HTTPS. See R2_PRIVACY_SUMMARY.md for the repository summary.

### Evidence and remaining limits

Observed in the deployed workflow: GitHub sign-in, affiliation verification, draft save, preview, publish and unpublish. Incognito showed the published profile, then Student not found after unpublishing. Public API checks confirmed hidden availability/links were []/{} in both detail and directory responses. Changing Warm/About-first to Compact/Project-Evidence-first preserved skills and the same combined-skill filter result.

Local checks used all four supplied PDFs with the app's PDF.js version and the actual import/review handlers in a DOM-stub harness. Import preserved existing fields, suggestions started unchecked, edited selections applied explicitly, and import/apply sent no save/publish request. A malformed PDF preserved fields and showed a recoverable error. Sparse content produced no invented skills/experience; embedded instructions triggered no action. These are local checks, not a claim that every deployed requirement passed.

Known issues / uncompleted checks:

- Multi-column extraction can mix adjacent text and include headings; review/edit/reject candidates.
- Backend domains are configurable, but the current relay additionally hardcodes algomau.ca. A second domain requires updating the relay.
- Canonical writes use session ownership and cannot select another owner, but unknown body/query identifiers are ignored. Explicit rejection of requests naming a different profile, as required by R2.30, is not fully verified.
- Full 390 CSS-pixel self-service, two-account tampering, repeated sign-in, challenge expiry/reuse/attempt limits, all presentation combinations and complete R1 project/inquiry regression remain to be verified.
- CDN availability, mail-delivery quota and browser third-party-cookie settings are external dependencies. The evaluation adapter describes routes/expected behavior and is not proof all checks passed.
