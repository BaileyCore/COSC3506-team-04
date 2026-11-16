# Post-R3 invitation name picker

Implemented locally on `fix/r3-invite-by-name`, starting from reviewed QA commit `6cac0652205be75cdf405828c29f8fee78b891aa`. The initial worktree was clean; the existing QA report is preserved. This is a small R3 usability change, not Release 4 work.

The maintainer types at least two characters and, after a 250 ms debounce, receives up to eight case-insensitive partial-name matches. Public program/headline help distinguish namesakes. Native result buttons support Tab, Enter and Space; Arrow Down from the search field focuses the first result. A result must be explicitly selected before inviting. Editing the query, switching modes, or loading/resetting a project invalidates selection and pending responses. No result is automatically invited. Loading, empty and error messages are announced through a status region. Result buttons wrap on small screens and have a minimum 44 px height.

`GET /api/r3/projects/:id/invitees?q=...` requires the same verified account resolver and current project maintainer authorization used by R3. It queries the published `students` snapshot joined to verified `r2_accounts`. Only public ID/name/program/headline are selected. Private draft JSON, email addresses and university student numbers are never selected. The query matches names only, treats SQL wildcard characters literally, accepts 2–100 characters and returns at most eight rows in stable name/ID order. It excludes the maintainer and already accepted contributors; pending/declined/removed relationships remain eligible under the existing invite endpoint's semantics. The SQL uses one joined lookup rather than per-result account queries. No schema migration, dependencies or changes to the broad public directory endpoint were needed.

“Enter public ID instead” retains access to the existing invite endpoint for verified students with unpublished profiles. The server still validates the ID, standardized role, target's verification and current maintainer. It remains authoritative if permissions, publication or membership change after a lookup. The invite endpoint and invitation acceptance SQL are unchanged. The GitHub sign-in reporting patch and all authentication/email guards remain intact. No production project, contributor, database, Render configuration or frozen tag was changed.

Validation on November 15, 2026 (Node 24.21.0):

| Check | Actual local result |
|---|---|
| `npm.cmd run check:r3` | PASS |
| `npm.cmd run test:r3` | 54 passed, 0 failed, 0 skipped |
| `npm.cmd test` | 4 passed, 0 failed, 0 skipped |
| `npm.cmd run build` | PASS |
| `git diff --check` | PASS |

New regression coverage uses disposable PGlite data for actual route SQL and a VM DOM/fetch/timer harness executing `frontend/r3.js`. It covers partial/case-insensitive name matching, namesakes with distinct IDs, profile/account eligibility, authorization, bounded/literal searches, intended recipient/role, unpublished-ID fallback, debounce, stale results, selection clearing, loading/empty/error states and keyboard focus. These are local tests, not browser or live Render acceptance. The live sign-in cause from issue #6 remains unconfirmed.

Browser retest checklist — use a disposable local/staging project and test accounts, never alter the published QA project:

1. As a verified maintainer, open My Shared Projects. One character makes no lookup; two characters show loading then a short list. Search with different capitalization and a middle fragment of a name. Headline/skill-only matches must not appear.
2. With two published verified namesakes, use program/headline to select the intended person. Confirm no invite occurs until Invite teammate is pressed, then inspect that the existing `/invite` request contains that person's public ID and chosen role. A non-maintainer must get 403 from direct lookup requests.
3. Edit a selected name and confirm invitation is disabled. With network throttling, type two different queries rapidly; older results/errors must not replace the latest state. Switch projects or select New Project while a request is pending and confirm results are discarded.
4. Verify private/unverified/legacy-only/accepted-contributor profiles are absent. Test empty and offline/error messages. Toggle Enter public ID instead, invite a verified unpublished disposable account, and confirm an unverified account or university number is rejected.
5. Use Tab, Arrow Down, Enter and Space without a mouse. At 390 px, check wrapped result labels, focus outlines, status announcements, fallback control and Invite button. Check normal invitation acceptance still works with the existing fix.

No push, merge or deployment is authorized by this work. `R3-submission` remains at `692e2dcafdc7d132a0a1abc2118e045cf557068a`.
