# Team 04 — Release 3 integrated application: START HERE

**Project:** COSC 3506, Project 1 — ImmXrsive Talent and Industry Platform.  
**Source used:** both user-uploaded `COSC3506-team-04-R2-submission.zip` and `.tar.gz` have identical 42 file payloads; this archive incorporates the ZIP source. This source has `backend/r2.js`, `frontend/profile.html`, and the real R2 database schema.  
**Status:** Source integrated and locally tested, **NOT YET PUSHED, DEPLOYED, TAGGED, OR SUBMITTED**. The uploaded archive contained no Git history, so the documented R2 base SHA cannot be independently verified from the archive.  
**Deadline in Moodle screenshot:** Wednesday November 4, 2026, 11:59 p.m. Toronto time. One team submission; click **Submit**.

## What is implemented in the source

The R2 backend remains in place. The new R3 router uses the original R2 `getSession(req)` signed session cookie and verifies the same stable internal UUID in `r2_accounts` with `verified_at IS NOT NULL`. The creator is the maintainer; only maintainer can edit shared fields. A contributor can accept/decline a standardized role invitation, maintain only their own statement and featured toggle, and participate in maintainer transfer. Soft removal is recoverable with an audit record. Project ID is a stable UUID even if repositories change. Shared edits require `version`; stale edits return HTTP 409. Import previews metadata and languages from a public GitHub repo, with editable suggestions. Exact repository duplicates across R3 projects receive warnings. URLs are HTTPS-only and displayed without injected embed markup.

New UI: `/r3-projects.html` (My Projects / Add Project) and `/r3-project.html?id=UUID` (anonymous public shared project with contributors, roles, playable/video/source actions and fallback). Existing public student profiles show their featured accepted R3 shared projects; R1 projects still use their preexisting URLs. Instructor fixture `/r3-working-demo.html` and `/fallback.svg` are included in the production static build. Mobile rules target 390 CSS px.

## What was actually tested locally

Run in project root (Node.js 20+):

```bash
npm run check:r3
npm run test:r3
npm test
npm run build
```

**Observed on supplied source:** JavaScript syntax checks pass; **18 R3 tests pass** (5 helpers, 10 mocked-route cases, 3 R2 session / schema / static build assertions); **4 original Phase 0 tests pass**; the frontend static build succeeds. A local frontend HTTP server served 7 old/new assets with status 200 (including `r3.css` with CSS MIME type and `fallback.svg` with SVG MIME type). **This is NOT proof of runtime integration with real PostgreSQL, OAuth, SMTP/Google mailer, or Render.** No credentials were available or used.

## Do this next (specific to your repository)

1. **Use the real Git repository.** Clone `https://github.com/BaileyCore/COSC3506-team-04` and inspect its current branch/tag and Render deployment SHA. The source ZIP is called `R2-submission`, but its Git history was not provided. Create a new `r3/shared-projects` branch from the deployed R2 commit/branch, not the obsolete Phase 0 main.
2. **Copy these project files into that Git worktree**, retaining its `.git` folder. On Windows, extract this ZIP and copy its contents on top of the cloned project using File Explorer. Back up any custom edits after R2. Compare changed R2 files (`backend/server.js`, `backend/r2.js`, `schema.sql`, `frontend/build.mjs`, `frontend/server.mjs`, `frontend/profile.html`, `frontend/student.html`, `frontend/index.html`) before overwriting if colleagues edited them since R2. Do NOT copy this archive's whole root as a new repository and expect old history/tags.
3. **Check production configuration** without publishing secrets: keep `DATABASE_URL`, `FRONTEND_ORIGIN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `R2_SESSION_SECRET`, and Google mail relay secrets from the working R2 Render backend. No extra R3 secrets are required. `frontend/config.js` still points to the existing backend. Do not share or commit `.env` files.
4. **Apply the additive R3 schema to persistent Supabase DB**. The existing R2 backend automatically executes `schema.sql` on startup and that file now includes the five R3 tables. If your database role cannot create the extension/tables, run `backend/r3_schema.sql` with an appropriately privileged database owner through Supabase SQL Editor, then restart the backend. Do **not** reset or reimport R1/R2 data. Make a database backup before changing production.
5. **Commit, push and deploy**. Run the four local commands above. Push your branch and merge into the branch configured for the backend and frontend Render services; ensure both services deploy the assessed final code. Backend root directory `backend`, normal build `npm install`, start `npm start`; frontend root directory `frontend`, build `npm install && npm run build`, static publish directory `dist` (or use your existing R2 deployment settings). Verify deployed backend `/api/health`, frontend `/r3-projects.html`, `/r3-project.html`, `/r3-working-demo.html`, `/fallback.svg`.
6. **Create live acceptance evidence with your real three accounts** (below). Only verified Algoma students may create/invite/contribute; use your own GitHub account and Algoma verification inbox. Create/publish three R2 student profiles so their IDs are visible from their public profile URL `student.html?id=U<UUID>`. Use their IDs to invite contributors.
7. **Verify every R3.01–R3.27 case** using `docs/R3_QA_CHECKLIST.md`, including stale edit 409, unauthorized edit 403, duplicate repository warning, 390px viewport, the demo counter, fallback, stable project URL, 2+ accepted contributors, and R1/R2 regression. For anonymous smoke tests run `node tests/r3_smoke.mjs BACKEND_URL FRONTEND_URL PROJECT_UUID STUDENT_UUID` (fill real IDs). Check production persisted after redeploy.
8. **Freeze correctly**. Once Render deployment is live and tested, record full Git SHA and create immutable `R3-submission` tag pointing to the assessed code. If a tag already exists, **do not move it**. Ensure Render backend/frontend revisions are consistent with the tagged release.
9. **Finish actual submission files**, `release_submission.md` and `evaluation_adapter.json`, replacing placeholders and recording observed pass/fail outcomes, live project URLs, owner/contributors, Render deployed SHAs, known issues, test access and fixture locations. Do not describe untested functions as passing.
10. **Submit ON MOODLE**. Upload the completed R3 Markdown/JSON files and links as directed in `sub.pdf`, click **Submit** (not only Add submission), then verify status **Submitted for grading**. One team member's submission counts for the entire group. Instructor peer QA runs Nov 5–8; responses/repairs due Nov 11, with original code tag preserved.

## Three-person demonstration script

- **Member A (maintainer):** Open `/profile.html`, sign in, verify affiliation if needed, publish R2 profile. Open `/r3-projects.html`, click **New Project**, use public GitHub repository preview, edit suggestions, create and invite both teammates by their `U<UUID>` public student IDs with standardized roles. Set `playable_url` to `https://cosc3506-team04-frontend.onrender.com/r3-working-demo.html`, `fallback_url` to `https://cosc3506-team04-frontend.onrender.com/fallback.svg`, save and publish.
- **Member B (contributor):** Sign in with own verified GitHub/Algoma account, open `/r3-projects.html`, accept invitation and write a personal contribution statement. Toggle off/on the option to feature the shared project in their own portfolio. Confirm B cannot edit shared title/status.
- **Member C (contributor/QA):** Accept own invitation, write C's own statement, test stale-version collision using two browser tabs, then with A test maintainer transfer to B and recoverable soft removal/restore. Open the public project with no login, select **Play Demo** and press **Interact**; inspect source/fallback after intentionally using a broken demo URL; then restore the working URL.

## Known limits and honesty checks

- All local route tests use a **mock database**; database schema was not executed on a live Supabase instance here. Real user sessions, three-account invites and live deploy were not tested in this environment.
- Exact duplicate-repository detection covers new `r3_repositories`, **not legacy R1 project links**; assess and note this R3.16 limitation. Similar project titles are not auto-merged.
- R2 carried-forward issues include heuristic multi-column PDF extraction and relay restrictions described in R2 release notes; re-verify each in R3 instead of assuming fixed.
- GitHub API public import requires GitHub availability, and public demo links must be hosted and reachable without Moodle login.
- This source package supplies neither a real R3 tag/SHA nor actual submission: those require your team's authenticated GitHub, Render, Supabase and Moodle access.

**Files to hand in after real deployment:** `release_submission.md` and `evaluation_adapter.json` completed from course templates; publicly accessible deployment/repository/demo/fallback links; `R3-submission` full SHA; one project with at least two accepted contributors.
