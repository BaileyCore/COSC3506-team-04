# Release Submission

**DRAFT — deployment verification and final release commit/tag are still required. Do not submit this draft.**

Release: R1
Team: team-04
Deployment: https://cosc3506-team-04-1.onrender.com
Repository: https://github.com/BaileyCore/COSC3506-team-04
Release tag: R1-submission — NOT CREATED YET
Commit: TO COMPLETE after deployment verification and freeze
Adapter: evaluation_adapter.json — confirm backend origin before submitting
Known issues: Synthetic public evidence URLs may be placeholders; P07 deliberately has a broken demo link. Live backend reachability, mobile/keyboard behavior, and persistence across a real redeployment still require verification.
Test notes: `npm test` passes all five test suites, including Release 1 API/filter/context tests using pg-mem. `npm run build` passes. These checks do not verify the live deployment or a real PostgreSQL restart. Browser checks have not yet passed in the authoring environment because the Chromium download failed.

## Test accounts

None required. Directory, student profiles, project pages, and simulated employer intake are public.

## Release-specific evidence

### Release notes

The proposed Release 1 implementation replaces the Phase 0 Items UI with a data-backed talent directory, case-insensitive search, structured skill AND filtering, availability/status OR filtering, visible clearable filters, shareable profile/project URLs, canonical shared project evidence, and contextual simulated inquiry forms. Public detail endpoints reject unpublished student records and invalid IDs. Optional evidence links open separately.

### Technology / deployment summary

Frontend: static HTML, CSS, and JavaScript built with Node.js; existing Render Static Site.
Backend: Node.js, Express, and pg; existing team Render Web Service, currently configured as `https://cosc3506-team-04.onrender.com` (must be verified).
Database: persistent Supabase PostgreSQL, configured by the backend's secret `DATABASE_URL` environment variable.

On first startup, a transaction creates the talent tables and imports the instructor's synthetic students, projects, and standardized skills. Subsequent requests read PostgreSQL, and later starts preserve stored data. Simulated inquiry records are stored in PostgreSQL with no public read endpoint. Phase 0 API endpoints are retained. Setup and verification instructions: `RELEASE1_SETUP.md`.

### Employer inquiry configuration

Simulated intake contract: `backend/fixtures/company_intake_simulation.md`.
Student example: `https://cosc3506-team-04-1.onrender.com/?student=S01&inquiry=1`.
Project example: `https://cosc3506-team-04-1.onrender.com/?project=P01&inquiry=1`.

Both collect company name, contact name, contact email, and inquiry description. The form carries source_type, source_id, source_name, and source_url. The backend independently derives the canonical context before storing the inquiry. This saves a demonstration record; it sends no email. Use fictional contact details.

### Browser assumptions

A modern browser with JavaScript, Fetch, and AbortSignal.timeout support is expected. No employer login is needed. Live browser testing results must be added before submission.

### Release identification

TO COMPLETE: verified deployment commit SHA and the `R1-submission` tag pointing to it. The development branch is not the frozen assessed release.
