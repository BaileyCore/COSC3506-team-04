Chosen challenge: R4.19 - Server-Side Collaboration Privacy

# Release 4 submission draft

- Release: R4
- Team: 04
- Project Option: Project 1 - ImmXrsive Talent and Industry Platform
- Repository: https://github.com/BaileyCore/COSC3506-team-04
- Target deployment: https://cosc3506-team04-frontend.onrender.com
- Target backend: https://cosc3506-team-04-ey5d.onrender.com
- Assessed tag: R4-submission (not created by this local implementation)
- Assessed commit: fill from the verified deployed revision
- Staff reviewer access: privately arrange a designated GitHub account that the production owner allowlists. Sign in through /profile.html, then open /r4-staff.html. Do not put credentials in this file.
- Published fixture partner evidence: not created in production. Import and publish North Shore Simulations, add current and past collaborations and record the actual public partner URL.
- Project evidence: record the published project with a staff-approved verification and partner request after live testing.

## Release notes

R4 adds a staff work queue, project verification and partner requests, reviewable company imports,
collaboration records with current/past and visibility settings, and public partner browsing and inquiry.
The selected challenge removes private and nonpublic collaboration data from anonymous API responses.
R3's tested invitation name picker and sign-in error-reporting change carry forward.

## Fixture mappings

These paths are included in the frontend build. Check that the public URLs resolve after deploying.

- company_normal.html — https://cosc3506-team04-frontend.onrender.com/r4-fixtures/company_normal.html
- company_sparse.html — https://cosc3506-team04-frontend.onrender.com/r4-fixtures/company_sparse.html
- company_prompt_injection.html — https://cosc3506-team04-frontend.onrender.com/r4-fixtures/company_prompt_injection.html
- company_same_name_other_domain.html — https://cosc3506-team04-frontend.onrender.com/r4-fixtures/company_same_name_other_domain.html

## Known limitations and reviewer workflow

Local tests cover R4 workflows with disposable data and simulated identity and imports.
Live staff authorization, SMTP/OAuth, production website import and collaborator evidence need real verification.
The website importer does not execute scripts or follow redirects. Use the final HTTPS URL or enter data manually.
See docs/r4/README.md for the student, staff and anonymous walkthrough. No claim of deployment or Moodle submission is made.

## Local verification

On November 20, 2026, the moved checkout at `5879468` passed both syntax checks,
54 R3 tests, both R4 tests, all six tests in the combined original and R4 suite,
and the frontend build.

Headless Chrome passed the staff queue, draft import and publication, student
verification and partner requests, staff decisions, and the R4.19 public API
privacy checks. The public partner page and contextual inquiry simulation passed
at 1280 and 390 CSS pixels without horizontal overflow. The walkthrough served
the built frontend and real R3/R4 handlers on loopback, used disposable PGlite data,
and supplied test sessions and fixture HTML through the test harness. Production
OAuth, hosted HTTPS imports, staff access and public evidence remain pending.
