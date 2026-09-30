# Release 1 setup and verification

This change replaces the Items frontend with ImmXrsive public talent discovery. Phase 0 API endpoints and evidence are preserved.

## Review and deploy

1. Review and merge the Release 1 pull request into `main` when ready to deploy.
2. Confirm the Render backend is connected to **BaileyCore/COSC3506-team-04**, branch `main`, root `backend`, build `npm install`, start `npm start`, health check `/api/health`.
3. Keep the existing secret `DATABASE_URL` in Render. It must point to your team's persistent Supabase PostgreSQL database. The database role needs permission to create tables and read/write records.
4. On first backend startup, a transaction creates `talent_students`, `talent_projects`, `talent_skills`, and `talent_inquiries`, then imports the supplied fixtures if the student table is empty. Later starts retain database changes. No public import or administrative endpoint is exposed.
5. The frontend currently uses `https://cosc3506-team-04.onrender.com`. **Verify that this is the team backend**, rather than the course-registration API for a separate assignment. Check `/api/health` and `/api/students`. If Render shows a different team backend URL, update `frontend/config.js` and the three API endpoint URLs in `evaluation_adapter.json` together.
6. Frontend: existing Render Static Site, root `frontend`, build `npm install && npm run build`, publish `dist`. The public URL is `https://cosc3506-team-04-1.onrender.com`.
7. Set backend `PUBLIC_FRONTEND_URL` to the frontend origin if its URL changes. The current origin is the default used to derive inquiry context.

## Stable URLs and inquiry

Profiles use `/?student=S01`; projects use `/?project=P01`. Query-string routes work directly and on reload on a static host without rewrite rules. Inquiry links add `&inquiry=1`. Student inquiry context identifies the student; project inquiry context identifies the canonical project. Context is shown on the form, included as hidden fields, and re-derived on the server before saving. Employer fields follow the supplied `company_intake_simulation.md` contract.

Inquiries are simulations saved to PostgreSQL, with no email delivery. Use fictional contact information. Inquiry records have no public read endpoint.

The adapter uses absolute API URLs because frontend and backend are hosted on separate origins. Confirm the course evaluator supports these values before submitting; if relative API paths are required, configure a same-origin proxy and update the adapter to the actual exposed paths.

## Checks before freezing

Run `npm ci`, `npm --prefix backend install`, `npm test`, and `npm run build` locally. For browser checks, install Chromium with `npx playwright install chromium`, then run `node scripts/verify-r1-browser.mjs` from the repository root. Release 1 tests use an in-memory PostgreSQL emulator to exercise the real router. They do not prove deployed database persistence.

On the deployed app, verify:

- Directory shows 17 published students; S16 is not discoverable and its detail API returns 404.
- Search `aVeRy`, a headline substring, and `openxr`; then clear filters.
- Skills Unity + Blender match only students claiming both; project technologies do not become contributor skills.
- Availability choices use OR; statuses use OR; categories use AND.
- S01 and S02 share canonical project P01 with distinct contributor roles.
- Open and reload direct student/project/inquiry URLs. Unknown IDs have a useful not-found state.
- Project P07's broken demo opens separately without breaking discovery.
- Submit a fictional student inquiry and a project inquiry. Check the receipt retains the correct source.
- At 390 CSS pixels, complete directory → profile → project → inquiry without horizontal scrolling.
- Use only the keyboard to search, select a filter, apply, open a profile, and reach inquiry. Focus should remain visible.
- Restart/redeploy the backend, then repeat directory and detail checks to prove persisted fixture data survives.

## Submission preparation

`release_submission.md` is a draft based on the instructor template. Complete the team, final tag/commit, release notes, known issues, testing evidence, stack summary, and intake configuration only after deployment verification.

`evaluation_adapter.json` describes the new implementation, but its backend origin remains **unverified** until the deployment checks pass. Neither file is ready to submit as-is.

After testing the assessed deployment, create `R1-submission` on the final verified commit, record its full SHA, and submit the two completed files. Do not tag this development branch or claim it is the frozen release. Submission deadline: October 2, 2026, 11:59 p.m. Toronto time. QA runs October 3–6; responses and repair evidence are due October 9, 11:59 p.m., in project issues/repository.
