# Final Release Product Submission — Team 04

- **Release:** FINAL (Cumulative R1–R4 + Final Release F.01–F.41)
- **Team:** Team 04 (Ran Zhai, Bhumika Rai, Thahira Bailey)
- **Project Option:** Project Option 1 — ImmXrsive Talent and Industry Platform
- **Public deployment:** https://cosc3506-team04-frontend.onrender.com
- **Account and staff application:** https://cosc3506-team-04-ey5d.onrender.com
- **Repository:** https://github.com/BaileyCore/COSC3506-team-04
- **Preparation branch:** `final/launch-candidate` (branched off `r4/production-sign-in` @ `958634f`)
- **Assessed tag:** `FINAL-submission` *(to be created on the verified deployed commit prior to Moodle freeze)*
- **Assessed full commit SHA:** *(fill with exact 40-character SHA of `FINAL-submission` after team merge & Render deployment)*
- **Prior immutable tags:** `R1-submission` (`6c1d241`), `R2-submission` (`d97c647`), `R3-submission` (`692e2dc`), `R4-submission` (`9c4ac47`) — all preserved unchanged.

## Launch Notes & What Changed Since Release 4

The Final Release hardens the cumulative R1–R4 platform for production readiness:

1. **Legacy Migration & Record Continuity (F.01–F.06):**
   - Repeatable, idempotent migration engine (`backend/final_migration.cjs`), CLI (`scripts/migrate-legacy.mjs`), and staff UI trigger (`POST /api/final/staff/import-legacy`).
   - Full validation report (`docs/final/migration_report.md`) matching `legacy_expected_results.json` (6 students, 3 projects, 3 companies, 4 collaborations; detects duplicate student `LS04`→`LS01`, duplicate company `LC02`→`LC01`, broken contributor ref `LP02`→`LS99`, unclaimed profiles `LS02`/`LS05`/`LS06`; second run creates 0 duplicates).
2. **Legacy Profile Claim & Recovery (F.07–F.10):**
   - Unclaimed imported profiles exist before account creation (`GET /api/final/claimable` omits `legacy_email`).
   - Approved imported portfolios can be selected in the existing profile editor. Private drafts are kept per portfolio and author; publish/unpublish retains the original student ID, URL, and project links. Staff reassignment revokes the previous owner's access without transferring private draft content. See `docs/final/claim_editor_review.md`.
   - Exact verified Algoma email match auto-approves (`POST /api/final/claims`); any other claim (name similarity, different email, missing email) enters staff review (`GET /api/final/staff/claims`, `POST /api/final/staff/claims/:id/review`, `POST /api/final/staff/profiles/:id/reassign`).
3. **Alumni, Availability, 365-Day Staleness & Retirement (F.11–F.16):**
   - Students can switch `status` (`current`/`alumni`) without expiring verified Algoma affiliation (`r2_accounts.verified_at`).
   - Distinguishes `Active Talent` vs `Showcase Only`; tracks `availability_confirmed_at` with 365-day staleness enforcement (stale availability is hidden from active job-seeking views/filters until reconfirmed via `POST /api/final/profile/reconfirm-availability`).
   - Non-destructive `retired` lifecycle (`POST /api/final/profile/retire`) removes personal profile from directory while preserving shared projects and historical partner collaboration attribution.
4. **Duplicate Resolution & Maintainer Recovery (F.17–F.19):**
   - Staff duplicate merge for student profiles and company records (`POST /api/final/staff/merge/students`, `POST /api/final/staff/merge/partners`) with continuity redirects (`final_merge_redirects` — visiting merged URLs displays a clear notice and link to the surviving record instead of a bare 404).
   - Staff shared-project maintainer recovery (`POST /api/final/staff/projects/:id/reassign-maintainer`) preserves contributor history and appends an audit event.
5. **Scale & Bounded Directory Loading (F.27–F.29):**
   - SQL-level filtering and pagination (`LIMIT`/`OFFSET`, default 20/page, max 50) on `GET /api/students` and `frontend/app.js` with Previous/Next controls. Verified over `scale_fixture.json` (220 students, 110 projects, 25 companies) in `docs/final/scale_evidence.md`.
6. **Playable/XR Hardening & Diagnostics (F.30–F.38):**
   - Broken/retired demo build state (`demo_status`: `active`/`unavailable`/`archived`/`replaced`, `demo_note`) preserves project history and fallback evidence without deleting the project.
   - Explicit-click launch preserved, lightweight WebGL capability fallback notice added, strict `https:` link validation enforced, and structured timestamped diagnostics with secret redaction added (`backend/diagnostics.cjs`).
7. **Professor & R4 Peer QA Repairs (Issues #9, #10, #11, #12, #13):**
   - **#11 (Professor-flagged):** `inquiry.html` / `inquiry.js` now verifies `source_type` + `source_id` server-side (including new `GET /api/r4/public/collaborations/:id`), displays plain-language context without raw UUIDs/types, and provides a contextual Back link.
   - **#10:** Duplicate pending verification/partner requests return HTTP `409`.
   - **#12:** Company import strips trailing punctuation and deduplicates keywords.
   - **#13:** Staff review accepts an optional rejection/decision reason (`decision_note`), displayed to students.
   - **#9:** Root `release_submission.md` and `evaluation_adapter.json` updated for Final prior to tagging.

## Required Supporting Evidence in Repo

- Migration command & report: [docs/final/migration_report.md](docs/final/migration_report.md)
- Scale fixture evidence (220 students / 110 projects): [docs/final/scale_evidence.md](docs/final/scale_evidence.md)
- Operational & diagnostics note: [docs/final/operational_notes.md](docs/final/operational_notes.md)
- Regression checklist (R1–R4 + Final): [docs/final/regression_checklist.md](docs/final/regression_checklist.md)
- Moodle Online text (Reviewer test access) & GitHub issue replies: [docs/final/moodle_online_text_and_issue_replies.md](docs/final/moodle_online_text_and_issue_replies.md)

## Known Issues, Operational Assumptions & Remaining Risks (F.40)

- **Production deployment & DB migration pending team merge:** All 73 automated tests, syntax checks, frontend build, legacy migration, and scale tests passed locally against PGlite on `final/launch-candidate`. Before freezing `FINAL-submission`, apply additive `backend/final_schema.sql` to Supabase PostgreSQL, deploy to Render, and run live smoke checks.
- **Render free-tier cold start:** Backend may take ~10–30 seconds to wake after inactivity.
- **Simulated employer inquiry:** `inquiry.html` logs verified inquiries in-browser as a simulation (no outbound employer email).
- **Synthetic fixture domains:** Supplied course fixtures use reserved `.example` / `.example.test` domains.
- **Reviewer test access:** Supplied in Moodle Online text under **Reviewer test access** (never committed as secrets in Git).

## Automated Verification Summary (Local Baseline on `final/launch-candidate`)

- `npm run check:r3`, `npm run check:r4`, and `npm run check:final-release`: **PASS**
- `npm run test:r3`: **57 / 57 PASS**
- `npm test` (R4 + Phase 0 + Final migration, features, scale, QA): **16 / 16 PASS** (**73 / 73 total**)
- `npm run build`: **PASS** (`frontend/dist`)
