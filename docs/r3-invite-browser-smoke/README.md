# Local invite-by-name browser smoke results

Tested November 15, 2026, approximately 21:12 EST (Toronto), on local branch `fix/r3-invite-by-name`, commit `1fa1a232e2c2d3566ab12d9d182ded80595a34f9`.

Browser: installed Chrome 157.0.8103.51, headless, driven through the Chrome DevTools Protocol. Viewports: desktop 1280 × 900 CSS px and mobile emulation 390 × 844 CSS px. Mobile interactions used touch events; desktop used mouse events. Text was entered through browser input events; replacement text used the input's native selection API. The role dropdown value was set through DOM automation with a change event, rather than opening the native dropdown popup.

## Isolation and mocking

- The actual local `frontend/r3-projects.html`, `r3.js` and CSS were served on loopback by an ephemeral Express server.
- The actual `mountR3` route handlers ran against a new in-memory PGlite database initialized from the repository schema. Search and invite HTTP responses were **not mocked**. A middleware recorded the actual invite request bodies/statuses; SQL assertions checked the resulting student IDs, roles and pending states.
- Authentication **was mocked**: the harness's `getVerifiedStudentId` resolver returned a disposable verified maintainer UUID. This does not test GitHub OAuth, session cookies, Algoma email delivery, or the unresolved production sign-in cause. Target eligibility used a real query of the disposable verified-account records.
- Local `/config.js` pointed the page at the ephemeral loopback server. Browser page requests outside that origin were blocked; none were observed. No production URLs, live project, live database, real account or email service was used.
- The database contained one disposable project, a maintainer, two published verified namesakes (Alice Morgan, Computing / Business) and one unpublished verified fallback account. It was discarded after the run. Invitation POSTs created only disposable local pending relationships, never real invitations.

## Results

| Check | Desktop 1280 px | Mobile 390 px |
|---|---|---|
| Typing `liC` shows both published Alice Morgan profiles, with program details | PASS | PASS |
| Selecting the second result and role sends that student's ID | PASS | PASS |
| Editing the selected name to `Alice M` clears selection and disables Invite, including after results return | PASS | PASS |
| Public-ID fallback submits the unpublished verified test account | PASS | PASS |
| No horizontal page overflow | PASS | PASS |

The namesake request sent `student_id: U00000000-0000-4000-8000-000000000003`, `role: QA/Tester`; fallback sent `student_id: U00000000-0000-4000-8000-000000000004`, `role: Backend Developer`. Each invitation response was HTTP 201 and the expected pending relationship was verified in the disposable database. No invitation was sent automatically when search results appeared. No uncaught browser exceptions were observed. On mobile, repeated lookup requests received normal HTTP 304 revalidation responses; Chrome displayed the matching results correctly.

No application failures were found in the completed run. Two initial automation/environment problems were corrected: restricted Chrome renderer access initially prevented CDP attachment; running the local browser with the required process permissions resolved it. The first input-replacement driver appended `Alice M` to the selected name because its synthetic Ctrl+A did not select text. Network evidence showed the erroneous query `Alice MorganAlice M`; replacing the driver's selection step with the native input selection API resolved it. No application source changes were made for either problem.

## Evidence

- [Machine-readable results and request bodies](results.json)
- [Desktop matching-results screenshot](1280-matches.png)
- [390 px matching-results screenshot](390-matches.png)

Both screenshots were visually inspected. Labels wrap at 390 px and the result buttons, ID fallback and Invite control remain visible and within the viewport. This smoke run does not establish full keyboard/screen-reader accessibility, all eligibility edge cases, live PostgreSQL performance, OAuth, or Render behavior; previous automated regression coverage remains separate.

Application source was unchanged by the smoke run. Before publication, the README, JSON and both screenshots were reviewed: names and IDs are disposable fixtures, and no credentials, real student information, cookies or OAuth values are present. This evidence is being committed separately from the tested application revision. Publication does not establish production acceptance; deployment remains pending owner access and user approval. `R3-submission` remains `692e2dcafdc7d132a0a1abc2118e045cf557068a`.
