# Team 04 R3 acceptance checklist — REQUIRED live verification

**Mark each case only after seeing the behavior on deployed Render, using genuine accounts and browser/network evidence.** This plan accompanies the locally integrated R2+R3 source package; all boxes start unchecked. For every failed case capture time, deployed SHA, actor, URL, request, response, screenshot, GitHub issue ID, fix SHA, and retest result. Do not use real resumes or credentials in issues.

| ID | Deployed acceptance test | Result |
|---|---|---|
| R3.01 | Verified member A sees **Add Project** in My Projects and creates a project; unverified student cannot | ☐ |
| R3.02 | Manual form saves title, description, domain, technologies, date/status, public links, playable/video/fallback | ☐ |
| R3.03 | Import public GitHub repo suggestions; verify title/description/repo/languages, edit before saving | ☐ |
| R3.04 | Remove repository link then add/change two links; project UUID and public URL remain unchanged | ☐ |
| R3.05 | Same shared project UUID appears in 2+ accepted contributor public profiles; no copied records | ☐ |
| R3.06 | Creator A is accepted initial maintainer and can update shared fields | ☐ |
| R3.07 | Transfer to accepted B; same project UUID; B can edit, A cannot | ☐ |
| R3.08 | Maintainer invites an existing verified student with standardized role; unknown student rejected | ☐ |
| R3.09* | Invitee sees invitation/project/role, can explicitly accept or decline; pending is not accepted | ☐ |
| R3.10 | Accepted B/C has standardized role plus optional personal statement | ☐ |
| R3.11 | B edits B's own contribution. A and C cannot silently rewrite B's contribution | ☐ |
| R3.12 | B turns off featured on B's profile; canonical project and accepted membership persist | ☐ |
| R3.13 | Maintainer soft-removes C; historical relationship preserved and can be restored by maintainer | ☐ |
| R3.14 | Editing project technologies does not add those terms to B/C's personal R2 skills | ☐ |
| R3.15 | Anonymous public project page shows accepted contributors and understandable roles | ☐ |
| R3.16 | Supplied exact-repo duplicate warns/exposes existing project; similar-title cases are not silently merged | ☐ |
| R3.17 | Tab 1 saves latest project; stale tab 2 save yields 409 conflict, not silent overwrite | ☐ |
| R3.18 | Project stores distinct HTTPS playable, video and source URLs; any one type may be absent | ☐ |
| R3.19 | Script/iframe markup entered as field text is escaped; no arbitrary embed or JS execution | ☐ |
| R3.20 | Public page shows obvious **Play Demo/Launch Experience** action when playable URL exists | ☐ |
| R3.21 | Hosted SVG fallback loads without Moodle login; video/source remain separate | ☐ |
| R3.22 | Broken/absent demo leaves project page, student links, fallback and navigation usable | ☐ |
| R3.23 | At **390 CSS pixels**, project title, roles, fallback and CTA are usable | ☐ |
| R3.24 | Signed-in unauthorized account cannot update another project's shared fields by changing ID/body | ☐ |
| R3.25 | R1 directory/filter, R2 private draft/publish/privacy, themes and inquiry still work | ☐ |
| R3.26 | Maintainer transfer and repo edit do not change existing public project link | ☐ |
| R3.27 | Immutable **R3-submission** tag points to actual assessed deployed code SHA | ☐ |

\*The uploaded screenshots skip exact wording for R3.09 between R3.08 and R3.10. This case follows the stated contributor core journey; compare to the original Moodle book before final adapter submission.

## Required fixture walkthrough

1. `fixtures/standard_roles.json`: all 12 role options exist and arbitrary role values are refused by API.
2. `fixtures/project_duplicate_cases.json`: exact repository case warns; similar-title/different-repo may warn but never auto-merge; same-title/different-domain can be distinct.
3. `fixtures/working_demo.html`: host at public site `/r3-working-demo.html` and click **Interact**, observing counter increment without authentication.
4. `fixtures/fallback.svg`: host at public site `/fallback.svg`, reference via public project and verify 200 without authentication.

## Required multi-account script

- **A**: verified project creator/maintainer. Create project, import public repository, supply demo/fallback, invite B/C.
- **B**: verified accepted contributor. Review invitation, accept, write own personal statement, hide/unhide own featured state.
- **C**: verified accepted contributor. Review invitation, accept, write different personal statement; test transfer, recovery of removed relationship.
- **Anonymous/incognito**: read published project, play demo, view source/fallback, inspect featured projects on B/C student profiles.
- **Unauthorized signed-in student (optional fourth account)**: attempt modifying A's project via project identifier. If only A/B/C are available, B or C must attempt edits before maintenance is transferred to them; these are unauthorized shared-field edits.

## Security and regression additions

- Inspect cookies and CORS; no manual student ID in signed-in session lookup; only allowed frontend Origin can mutate.
- Attempt `javascript:`, `http:`, malformed URL, and HTML strings in links: backend refuses unsafe demo/media/links.
- Check old published R1 project IDs still work; current R3 module does not yet integrate duplicate matching across legacy R1 fixture projects, so inspect/fix your existing schema behavior.
- Recheck unauthenticated public responses never contain verified email, secrets, draft JSON or challenges.
- Test keyboard navigation, field labels, 390px responsive mode, and clear 409/403 errors.
- Redeploy backend (same code) and confirm project, contributors and fallback remain persisted.

## Release artifacts / evidence bundle

- Screenshot of public project and two accepted contributors.
- Screenshot of host demo after clicking **Interact**.
- Screenshot of fallback after temporarily breaking demo URL and then restoring correct one.
- Screenshot/HTTP trace of duplicate warning and 409 stale edit conflict.
- Screenshot/HTTP trace of unauthorized 403 shared edit attempt.
- Screenshot of exact R3 tag SHA on GitHub, and backend/frontend Render Live SHA.
- Screenshot of Moodle **Submitted for grading** after Submit.

**Local checks completed:** Existing R2 source integrated; `npm run check:r3`, `npm run test:r3` (18 tests), `npm test` (4 original Phase 0 tests), `npm run build` frontend, and local HTTP 200 responses for 7 old/new assets. The 18 R3 tests include mocked SQL routes, not a production PostgreSQL instance. **Still not performed:** live migration against Supabase, OAuth with three actual accounts, Render live API checks, release tag/freeze, Moodle submission.
