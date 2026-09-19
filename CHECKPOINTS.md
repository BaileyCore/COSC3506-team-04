# Phase 0 Checkpoints

Use this as a progress card. The evidence is for your team unless the instructor asks for it.

| Checkpoint | Complete when | Evidence to keep |
|---|---|---|
| 1. Team repository | Every member has repository access and `check:repo` passes | Repository URL and teammate confirmation |
| 2. PostgreSQL | `items` exists with `First item` | Table Editor screenshot without credentials |
| 3. Local backend | Local `/api/health` returns `ok: true` | Health response |
| 4. Local application | Normal item survives refresh; defect check passes | Local verifier output |
| 5. Safe baseline | Baseline is pushed and no `.env` is tracked | Commit URL and repository check |
| 6. Public backend | Public HTTPS health endpoint works | Health URL |
| 7. Public frontend | Frontend reaches backend; production defect check passes | Frontend URL and verifier output |
| 8. Persistence | Named marker survives backend redeployment | Marker and verifier output |
| 9. Peer issue | Outside tester files reproducible issue before fix | Issue URL |
| 10. Fix | Direct API rejects whitespace; linked fix is deployed | Commit/PR URL and fixed verifier output |
| 11. Release | Peer verifies production; tag exists; Moodle says submitted | Verification comment, tag URL, Moodle confirmation |

Do not mark a checkpoint complete because somebody says it should work. Use the stated observable result.
