# Post-R3 invite-by-name publication and production handoff

Prepared November 15, 2026. This is a review plan, not deployment authorization. Release 4 has not started.

## Reviewed source and validation

`git fetch origin` succeeded. Latest `origin/r3/shared-projects` is `e2b3b2a014bc365f85d6efd4bac37408251512d8`, with no new teammate changes to reconcile. `fix/r3-invite-by-name` includes the invitation acceptance fix `e2b3b2a`, sign-in reporting fix `6cac065`, and name-picker application commit `1fa1a232e2c2d3566ab12d9d182ded80595a34f9`. No wholesale merge from main or force-push is needed. The evidence/handoff commit adds documentation and screenshots only.

Publication checks rerun locally: 54 R3 tests pass, four original tests pass, R3 syntax checks and an additional `frontend/profile.js` syntax check pass, frontend build passes, and diff whitespace checks pass. Browser smoke at 1280 px and 390 px passed using real local frontend, R3 HTTP handlers and disposable PGlite data with **mocked maintainer authentication**. The [smoke evidence](r3-invite-browser-smoke/README.md), JSON and screenshots were reviewed for secrets/personal data and contain only synthetic fixtures. These results do not verify production sign-in or Render invite behavior.

The evidence commit uses `[skip render]` to avoid a Render auto-deploy when publishing the feature branch while production settings are unknown; it does not skip CI. Do not merge the PR until the user approves the reviewed PR and deployment plan and the production owner confirms the inventory below.

## Render access and rollback inventory

Connected workspace: `My Workspace`, `tea-dao77ijm8hqs73di1mv0`. The user previously confirmed this is not the original production workspace. A fresh inventory lists the R3 preview and an unrelated course-registration service; neither production hostname is accessible through this connection. No replacement services were created and no service settings were changed.

| Service | Configured branch | Current live deploy SHA / deploy ID | Auto-deploy | Pre-change rollback revision |
|---|---|---|---|---|
| Backend `cosc3506-team-04-ey5d.onrender.com` | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED; owner must record |
| Frontend `cosc3506-team04-frontend.onrender.com` | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED; owner must record |
| Accessible `cosc3506-team04-r3-preview.onrender.com` (not production) | `r3/shared-projects` | Not assessed for production rollback | Off (`autoDeploy: no`, trigger `off`) | Not a production rollback target |

**Would merging deploy production? Unknown.** If a production service follows `r3/shared-projects` with auto-deploy On Commit or After CI Checks Pass, merging can trigger a deploy. Off requires a manual trigger. Check build filters as well. The preview's settings do not establish either production service's behavior. Do not assume main, the frozen tag, or either feature branch is live.

## Exact handoff to Bhumika / production workspace owner

1. In the original Render workspace, locate the services by the exact production URLs above. For each, provide workspace/service ID and Dashboard link; configured repo, branch, build filters and auto-deploy mode; current **live successful deploy** full commit SHA, deploy ID and time. The latest attempted deploy or branch tip is insufficient. Record the existing live revisions separately as backend and frontend rollback targets, and confirm an eligible previous build artifact is available. Keep secret values and deploy-hook URLs private.
2. Confirm the existing frontend root/build/publish settings and current public `config.js` API URL. Confirm backend `FRONTEND_ORIGIN` and `GITHUB_CALLBACK_URL` match the original frontend/callback and GitHub OAuth app. Preserve database connection, schema-init policy, OAuth/session/mailer secrets and all existing settings. No schema migration, database reset, fixture import, secret rotation or project recreation is expected or authorized.
3. Before any merge, explain whether it would auto-deploy one or both production services. For backend-first manual rollout, agree with the user on holding both services' auto-deploys before merging if needed. Do not change those settings before approval. Document the original mode and deliberate restoration plan.
4. Return that inventory with the PR's exact reviewed SHA and successful CI run. Obtain user approval for the PR and concrete deployment plan. If the approved release is a merge commit, record its actual full SHA and confirm its checks/tree; do not silently deploy a newer branch tip. No merge/deploy has been performed by this handoff.
5. After approval only: deploy the exact reviewed revision to the original backend first. Wait for its deploy to be Live, record deploy ID and actual SHA, verify `/api/health` returns HTTP 200 with database reachable, and inspect safe error logs. If health fails, stop before deploying frontend and assess rollback to its recorded pre-change revision.
6. Deploy that same reviewed revision to the original frontend, wait for Live, record its actual SHA, and confirm `/config.js` points to `https://cosc3506-team-04-ey5d.onrender.com`. Verify the served picker assets are current. Compare both live deploy SHAs with the approved revision, not just commit titles. Recheck the chosen auto-deploy settings after any manual deployment.
7. If rollback is needed, use the recorded pre-change service deploys, not `R3-submission` by assumption. Database/project/contributor state is not rolled back; don't reset it. Check database/OAuth compatibility and the resulting auto-deploy modes, then verify health/assets. Render's Dashboard specific-commit deploy and Dashboard rollback can turn auto-deploy off, while API/CLI behavior differs. Coordinate the final mode with the owner.

The plan above follows the current official references: [deploys and automatic/manual modes](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks), and [rollback behavior](https://render.com/docs/rollbacks), read during preparation. No exact production deployment settings have been inferred from documentation.

## Verified-account live acceptance checklist (after approved deployment)

- Sign out/in with the user's genuine GitHub account. Verify `/api/auth/me` succeeds and reaches the editor or required Algoma verification. Record timestamp, browser mode and safe status information. Issue #6's production root cause remains unconfirmed; a healthy anonymous endpoint does not resolve it.
- On a **new disposable project**, type at least two characters of an agreed verified student's published name. Confirm matching public names/program/headlines; select the intended person and role. Editing the name must clear selection and disable Invite. Repeat at desktop width and 390 px.
- With the recipient's agreement, send **one** test invitation and verify the request's public student ID/role and pending state. Agree in advance whether this single invitation will test the name picker or public-ID fallback; use selection/request inspection for the other path without sending an extra invitation unless separately agreed.
- Toggle Enter public ID instead and verify it accepts the intended platform ID, including an unpublished verified test account if available. Do not enter university student numbers or use actual private data in evidence.
- Read the existing published QA project and contributor portfolios anonymously; confirm stable URL, accepted contributors, roles, demo/fallback and data persist. Do not edit, unpublish, remove/reinvite members or otherwise modify this project.
- Record actual backend/frontend live SHAs and each result. Distinguish checked HTTP/asset behavior from authenticated actions the owner performed. Leave unexecuted cases pending and do not close issue #6.

Read-only production probes during preparation returned frontend `/config.js` HTTP 200 with `API_BASE_URL` set to the intended backend, and backend `/api/health` HTTP 200 with `{"ok":true,"database":"reachable"}`. These verify current public reachability/configuration only, not this revision's deployment, authenticated invitation behavior or full live SHAs. No authenticated behavior has been verified on Render in this publication run and no deployment was made. `R3-submission` remains `692e2dcafdc7d132a0a1abc2118e045cf557068a`.
