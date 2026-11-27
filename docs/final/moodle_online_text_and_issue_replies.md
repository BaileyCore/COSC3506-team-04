# Draft Moodle Online Text & GitHub Issue Replies

> **Note:** Fill in `<FINAL_COMMIT_SHA>` and `<REVIEWER_GITHUB_IDS>` once the team merges, deploys to Render, and pushes the immutable `FINAL-submission` tag.

---

## 1. Moodle Online Text (`Final Product Result` — due Fri Nov 27, 11:59 p.m. EST)

```markdown
## Final Release Summary — Team 04 (Option 1: ImmXrsive Talent and Industry Platform)

- **Public Frontend:** https://cosc3506-team04-frontend.onrender.com
- **Account & Staff Backend:** https://cosc3506-team-04-ey5d.onrender.com
- **Repository:** https://github.com/BaileyCore/COSC3506-team-04
- **Assessed Tag:** `FINAL-submission`
- **Full Commit SHA:** `<FINAL_COMMIT_SHA>`
- **Key Evidence Files:** `release_submission.md`, `evaluation_adapter.json`, `docs/final/migration_report.md`, `docs/final/scale_evidence.md`, `docs/final/operational_notes.md`, `docs/final/regression_checklist.md`

## Reviewer test access

- **Public Visitor / Employer:** No sign-in required. Open https://cosc3506-team04-frontend.onrender.com (Talent Directory, Industry Partners, Student/Project pages, and Inquiry simulation).
- **Student / Contributor Role:** Sign in at https://cosc3506-team-04-ey5d.onrender.com/profile.html using your own GitHub account and verify your `@algomau.ca` email via the one-time code flow. After verification, you can edit/publish/retire your profile, claim an imported legacy profile, and create/join shared projects at https://cosc3506-team-04-ey5d.onrender.com/r3-projects.html.
- **Staff Role:** Staff access is controlled server-side via the backend's `R4_STAFF_GITHUB_IDS` allowlist (stable numeric GitHub user IDs). Once signed in with an allowlisted GitHub account at https://cosc3506-team-04-ey5d.onrender.com/profile.html, open https://cosc3506-team-04-ey5d.onrender.com/r4-staff.html.
  - **Currently allowlisted staff GitHub accounts:** `<CONFIRM WITH DEPLOYMENT OWNER: deployment owner + assigned Final Peer QA reviewer / instructor GitHub username & numeric ID>`.
  - *(If an additional reviewer GitHub account needs staff access, reply with the GitHub username and we will add its numeric ID immediately via Render environment config without altering the frozen code.)*
```

---

## 2. Draft GitHub Reply — Issue #9 (Professor `ffp03` deadline: Fri Nov 27, 11:59 p.m. EST)

```markdown
**Decision: ACCEPT — Repaired in Final Release (`FINAL-submission`)**

Thank you for the feedback. We have preserved the immutable `R4-submission` tag (`9c4ac4760f4c832e31c7ba919481edf53729c61a`) unchanged.

- **Completed R4 post-freeze evidence:** Root `release_submission.md`, `evaluation_adapter.json`, and Team 10 staff access provisioning were recorded on `r4/production-sign-in` through commit `958634f246ab96d3cc0f7c8651c2a8561a0bd77b` (see `docs/r4/qa-reviewer-access-2026-11-23.md`).
- **Final Release repair:** For `FINAL-submission` (`<FINAL_COMMIT_SHA>`), the authoritative root `release_submission.md` and `evaluation_adapter.json` were finalized and committed **before** tagging `FINAL-submission`, with all Final Release routes, migration/scale evidence, and no pending placeholders. Reviewer test access details are included in the Moodle Final Product Result Online text under **Reviewer test access**.
```

---

## 3. Draft GitHub Reply — Issue #11 (Professor `ffp03` deadline: Fri Nov 27, 11:59 p.m. EST)

```markdown
**Decision: ACCEPT — Repaired in Final Release (`FINAL-submission`)**

Thank you for the feedback. We repaired this in `FINAL-submission` (`<FINAL_COMMIT_SHA>`):

- Added a server-side public collaboration lookup endpoint (`GET /api/r4/public/collaborations/:id`, restricted to `visibility = 'public'` and published partners).
- Updated `frontend/inquiry.js` and `frontend/inquiry.html` so the inquiry page resolves `source_type` + `source_id` directly from the backend public API instead of trusting `source_name` or `source_url` from URL parameters.
- Replaced the raw internal `Type` and UUID display with plain-language context (e.g., *"Collaboration inquiry for North Shore Simulations"*) and a contextual Back link returning to the partner, project, or student page.
- Verified with automated integration tests (`tests/final_scale_and_qa.test.mjs`) confirming public collaboration verification and HTTP 404 rejection for private/non-existent records.
```

---

## 4. Draft GitHub Updates — Issues #10, #12, #13, #6

- **Issue #10:** `ACCEPT — Repaired in FINAL-submission (<FINAL_COMMIT_SHA>). POST /api/r4/projects/:id/requests now checks for an existing pending request for the same project/kind/partner or suggested company and returns HTTP 409. Covered by tests/final_scale_and_qa.test.mjs.`
- **Issue #12:** `ACCEPT — Repaired in FINAL-submission (<FINAL_COMMIT_SHA>). backend/r4_import.cjs now strips trailing punctuation and deduplicates extracted sector keywords case-insensitively. Covered by tests/final_scale_and_qa.test.mjs.`
- **Issue #13:** `ACCEPT — Repaired in FINAL-submission (<FINAL_COMMIT_SHA>). Added optional decision_note on r4_requests, a staff reason input in /r4-staff.html, and student-visible display in /r3-projects.html. Covered by tests/final_scale_and_qa.test.mjs.`
- **Issue #6:** `Fixed in R4-submission (9c4ac4760f4c832e31c7ba919481edf53729c61a) and retained in FINAL-submission (<FINAL_COMMIT_SHA>): signed-in account pages run on the first-party backend origin so the session cookie is established reliably after GitHub OAuth.`
