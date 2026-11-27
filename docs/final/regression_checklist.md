# Final Release Team Regression & Acceptance Checklist (F.39)

Status key: `PASS (Local Automated)` = verified via PGlite/Node test suite on `final/launch-candidate`; `PENDING LIVE` = to be re-confirmed on Render after team merges & deploys.

| Area | Requirement(s) | Automated Local Status | Live Render Check (Post-Deploy) |
| :--- | :--- | :--- | :--- |
| **R1 Public Directory & Filters** | R1.01–R1.10, Issue #2 | PASS (SQL filtering, pagination, `sessionStorage` restore) | PENDING LIVE |
| **R2 Auth, Verification & Profile** | R2.01–R2.15, Issue #6 | PASS (`r3_auth_flow`, `r3_auth_ui`, `r4_account_origin`) | PENDING LIVE |
| **R3 Shared Projects & Invite Picker** | R3.01–R3.20 | PASS (56/56 `test:r3` tests) | PENDING LIVE |
| **R4 Staff Queue, Partners & R4.19 Privacy** | R4.01–R4.28 | PASS (`r4_integration.test.mjs`) | PENDING LIVE |
| **R4 QA Fixes (#10, #11, #12, #13)** | R4.05, R4.08, R4.20, R4.24 | PASS (`final_scale_and_qa.test.mjs`) | PENDING LIVE |
| **Legacy Migration & Idempotency** | F.01–F.06 | PASS (`final_migration.test.mjs` + CLI `--repeat`) | PENDING LIVE |
| **Profile Claim & Claim Safety** | F.07–F.10 | PASS (`final_features.test.mjs`) | PENDING LIVE |
| **Alumni, Availability, 365d Stale, Retire** | F.11–F.16 | PASS (`final_features.test.mjs`) | PENDING LIVE |
| **Duplicate Merge & Redirect Continuity** | F.17–F.18 | PASS (`final_features.test.mjs`) | PENDING LIVE |
| **Staff Maintainer Recovery** | F.19 | PASS (`final_features.test.mjs`) | PENDING LIVE |
| **Privacy, Auth, Untrusted Input, Secrets** | F.20–F.23 | PASS (`final_features`, `final_scale_and_qa`, `r4_integration`) | PENDING LIVE |
| **Keyboard Accessibility & 390px Mobile** | F.24–F.26 | Verified in CSS/HTML (`:focus-visible`, `@media (max-width: 390px)`) | PENDING LIVE (fresh 390px browser pass) |
| **Scale Fixture & Bounded Directory** | F.27–F.29 | PASS (`final_scale_and_qa.test.mjs`, 220 students / 110 projects) | PENDING LIVE |
| **External Failure & Diagnostics** | F.30–F.32 | PASS (`diagnostics.cjs` redaction, `r4_import` failure isolation) | PENDING LIVE |
| **Playable/XR Hardening & Demo State** | F.33–F.38 | PASS (`final_features.test.mjs`, `r3-public.js` WebGL fallback & `https:` check) | PENDING LIVE |
| **Final Docs & Immutable Tag** | F.40–F.41 | Drafted locally (`release_submission.md`, `evaluation_adapter.json`) | PENDING LIVE (`FINAL-submission` tag + Moodle submit) |
