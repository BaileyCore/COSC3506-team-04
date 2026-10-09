# Release 1 — Team 03 Peer QA Response

Date: 2026-10-09
Original frozen version: `R1-submission@6c1d24127a964a5c51e8850cc541ab465a9e68fe`
Frontend: https://cosc3506-team-04-1.onrender.com/
Backend: https://cosc3506-team-04.onrender.com/

## Finding 1 — Restored filters disagree with results (Moderate)

**Status:** Fix committed; production retest pending.

**Cause:** The directory loaded and rendered every student regardless of browser-restored search, availability, or status values. Rebuilding skill checkboxes also discarded previous skill selections.

**Correction:** The directory now saves filter selections in tab session storage, restores search, skill, availability, and status after dynamically populating skills, and applies the restored selection to the results. It also recalculates results after returning from back/forward cache and after Clear Filters.

**Commit:** `f85d7b744f336c346c0a988576ea9a91e93a3e39`.

**Retest:** On the public frontend, select Unity, C#, and Internship; confirm four matching candidates (Avery Chen, Emma Wilson, Ethan Brown, Samir Haddad), open Avery's profile, then press browser Back. Verify those selections and matching results persist. Repeat with text AVERY, Contract + Alumni, and Alumni alone. Use Clear Filters and confirm 17 published profiles with no selections.

## Finding 2 — Evaluator uses incorrect API origin (Moderate)

**Status:** Adapter correction committed; evaluator compatibility / HTTP retest pending.

**Cause:** The submitted adapter used relative API endpoints, which resolved against the separately deployed static frontend. The backend API is hosted at another origin.

**Correction:** `evaluation_adapter.json` now lists full backend URLs for the directory, student detail, and project detail API endpoints.

**Commit:** `5f60b0d8cf33442958e0ba38c2a4d1e4301cd4ff`.

**Retest:** Check HTTP 200 JSON at:
- https://cosc3506-team-04.onrender.com/api/students
- https://cosc3506-team-04.onrender.com/api/students/S01
- https://cosc3506-team-04.onrender.com/api/projects/P01

Confirm the evaluator accepts absolute endpoint URLs. If the evaluator requires relative endpoints, coordinate the supported adapter representation with the instructor instead of altering the frozen release.

## Release and evidence handling

The original `R1-submission` tag remains the immutable reference point. The corrections are post-freeze commits on `main` and should be reported as follow-up work, not presented as changes to the frozen version. The team should record the deployed commit, browser results, HTTP status evidence, and Team 03's agreed retest in its course submission.
