# Phase 0 — Setup Guide and Milestone Checks

This is the supported beginner path for COSC 3506 Phase 0:

**GitHub template → Supabase PostgreSQL → local app → Render backend → Render static frontend → peer issue → server-side fix → redeploy → peer verification → `phase0-complete` tag**

Follow the milestones in order. Do not jump directly to deployment: each milestone proves one smaller part works and gives you a known-good place to return to when something fails.

The starter is also available as a GitHub template:

<https://github.com/ffp03/cosc3506-phase0-starter>

The Moodle ZIP is a fallback. If you use the ZIP, create your own GitHub repository and commit the extracted files before continuing.

## What you are building

The starter has three running parts:

- `frontend/` — the public page a user opens;
- `backend/` — a Node/Express API used by the frontend;
- Supabase — the PostgreSQL database that keeps records when the backend restarts or redeploys.

The repository also contains one intentional defect: the backend accepts a title made only of spaces. **Leave that defect in place until a student outside your team has reproduced it and filed the GitHub issue.**

## Before you begin

Every team needs:

- one GitHub account per member;
- one Supabase account for the database owner;
- one Render account for the deployment owner;
- Git installed;
- Node.js 20 or newer, including npm;
- a code editor and terminal.

Check the local tools:

```text
git --version
node --version
npm --version
```

Expected result: all three commands print a version. If `node --version` is lower than 20, install a current Node.js LTS release before continuing.

Render's free Hobby workspace has one member. Do not share a Render password. All team members can still trigger normal automatic deployments by pushing to the shared GitHub repository. Record who owns the Render service, and make sure at least one other member can explain the settings and recreate the deployment from the repository if needed.

Use only synthetic Phase 0 data. Never paste a database password or connection string into GitHub, a screenshot, an issue, an AI prompt, or Moodle.

---

## Milestone 1 — Create the team repository

### Do this

1. Open the template: <https://github.com/ffp03/cosc3506-phase0-starter>.
2. Select **Use this template → Create a new repository**.
3. Name it clearly, such as `cosc3506-team-04`.
4. Use a public repository for the supported path so the peer tester can open an issue. If the instructor approves a private repository, invite the peer tester as well as every team member.
5. Open **Settings → Collaborators** and invite every team member.
6. Each teammate must accept the invitation.
7. Clone the repository and enter its folder:

```text
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_NAME
```

8. Run:

```text
npm run check:repo
```

### Milestone passes when

- the repository contains `frontend/`, `backend/`, `schema.sql`, and `.github/ISSUE_TEMPLATE/bug_report.yml`;
- every member can open the repository;
- at least two members can create a branch or commit;
- `npm run check:repo` ends with `RESULT: PASS`.

Do not continue if `.env` appears on GitHub.

---

## Milestone 2 — Create and initialize PostgreSQL in Supabase

### Do this

1. In Supabase, create a new project for the team.
2. Save the database password in a password manager. Do not send it through chat or commit it.
3. Open **SQL Editor → New query**.
4. Open `schema.sql` from the repository, copy all of it into the SQL editor, and select **Run**.
5. Open **Table Editor → items**.

### Milestone passes when

- the `items` table exists; and
- it contains the seeded row `First item`.

If the table is missing, return to the SQL Editor and confirm the whole `schema.sql` file ran without an error.

---

## Milestone 3 — Configure and run the backend locally

### Do this

1. In Supabase, select **Connect** and choose the **Session pooler** connection string. Use the value Supabase displays; do not construct the hostname yourself.
2. Replace `[YOUR-PASSWORD]` with the database password. Reserved characters in a connection-string password must be percent-encoded. Supabase documents examples such as `&`, `#`, `?`, and spaces.
3. In the repository, copy `backend/.env.example` to `backend/.env`.
4. Put the connection string in `backend/.env`:

```text
DATABASE_URL=your-session-pooler-connection-string
PORT=3000
```

5. From the repository root:

```text
cd backend
npm install
npm start
```

6. Leave that terminal running. Open <http://localhost:3000/api/health>.

Expected response:

```json
{"ok":true,"database":"reachable"}
```

### Milestone passes when

- the terminal says the API is listening;
- `/api/health` returns HTTP 200 and `"ok": true`;
- `backend/.env` is not shown by `git status` and is not visible on GitHub.

If health reports `database unavailable`, check the Render/Supabase troubleshooting table at the end of this guide before changing application code.

---

## Milestone 4 — Run the complete application locally

### Do this

1. Keep the backend terminal running.
2. Confirm `frontend/config.js` contains:

```javascript
window.API_BASE_URL = "http://localhost:3000";
```

3. Open a second terminal at the repository root:

```text
cd frontend
npm install
npm start
```

4. Open <http://localhost:8080>.
5. Add a normal item, refresh the browser, and confirm the item is still present.
6. From the repository root, run the automated check:

```text
node scripts/verify-phase0.mjs app \
  --backend-url http://localhost:3000 \
  --frontend-url http://localhost:8080 \
  --expect defect
```

On Windows PowerShell, enter the command on one line instead of using `\` line continuations.

### Milestone passes when

- the page says `Backend reachable.`;
- a normal item remains after refresh;
- the verification command ends with `RESULT: PASS` and confirms that the intentional defect is still present.

Do not fix the whitespace defect yet.

---

## Milestone 5 — Commit the known-good local baseline

### Do this

From the repository root:

```text
git status
git add .
git commit -m "Complete Phase 0 local baseline"
git push
```

Open GitHub and inspect the files after the push.

### Milestone passes when

- the commit is visible on GitHub;
- `.env` and the database connection string are not visible;
- all team members can find the commit; and
- the intentional whitespace defect is still present.

If a secret was committed, stop. Do not merely delete the file in a later commit: rotate the exposed database password and ask the instructor for help cleaning the history.

---

## Milestone 6 — Deploy the backend on Render

### Do this

In Render, select **New → Web Service**, connect GitHub, select the team repository, and use these values:

| Setting | Value |
|---|---|
| Language/runtime | Node |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance type | Free |
| Health Check Path | `/api/health` |

Under **Environment**, add `DATABASE_URL` with the Supabase **Session pooler** connection string. Do not add `PORT`; Render provides it.

Wait for the deploy to finish, then open:

```text
https://YOUR-BACKEND.onrender.com/api/health
```

### Milestone passes when

- Render reports the deploy as live;
- the public HTTPS health URL returns `{"ok":true,"database":"reachable"}`;
- the Render environment contains `DATABASE_URL`, while GitHub does not.

A free Render service can sleep after inactivity. The first request after sleep may take about a minute; that delay alone is not a failure.

---

## Milestone 7 — Deploy the static frontend on Render

### Do this

1. Replace the local URL in `frontend/config.js` with the deployed backend URL, with no trailing slash:

```javascript
window.API_BASE_URL = "https://YOUR-BACKEND.onrender.com";
```

2. Commit and push that change.
3. In Render, select **New → Static Site**, connect the same repository, and use:

| Setting | Value |
|---|---|
| Branch | `main` |
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

4. Deploy the site and open its public `onrender.com` URL.
5. Run the production check from the repository root:

```text
node scripts/verify-phase0.mjs app --backend-url https://YOUR-BACKEND.onrender.com --frontend-url https://YOUR-FRONTEND.onrender.com --expect defect
```

### Milestone passes when

- both URLs use HTTPS;
- the public page says `Backend reachable.`;
- a normal item can be added and remains after refresh;
- the production verification command ends with `RESULT: PASS`;
- the intentional defect is still present.

---

## Milestone 8 — Prove persistence across a real redeployment

Refreshing a browser is not enough: it does not prove that data is outside the backend process.

### Do this

1. Create a uniquely named marker:

```text
node scripts/verify-phase0.mjs marker-create --backend-url https://YOUR-BACKEND.onrender.com
```

2. Copy the printed marker value into your team notes.
3. In Render, redeploy the backend using **Manual Deploy → Deploy latest commit**.
4. Wait until the deployment is live and the health endpoint is healthy.
5. Check the same marker:

```text
node scripts/verify-phase0.mjs marker-check --backend-url https://YOUR-BACKEND.onrender.com --marker YOUR_MARKER
```

### Milestone passes when

The marker check ends with `RESULT: PASS` after the backend redeployment.

---

## Milestone 9 — Have a peer report the intentional defect

The tester must be a student outside your team.

### Peer does this

1. Open the public frontend.
2. Add a normal item and confirm it persists.
3. Add a title containing only spaces.
4. Confirm the incorrect blank item is stored.
5. Open a GitHub issue using the repository's bug-report form.
6. Record environment, exact steps, expected result, actual result, evidence, severity, and reproducibility.

### Development team does this

Reply to acknowledge the issue and state whether the team reproduced it. Do not close it yet.

### Milestone passes when

- the issue was opened by somebody outside the development team;
- another person can reproduce it from the issue alone; and
- the issue existed before the correcting commit.

---

## Milestone 10 — Fix the backend boundary and redeploy

The fix must be enforced by the backend. A frontend-only check does not protect the API because another client can call `POST /api/items` directly.

### Do this

1. Change the backend so a blank or whitespace-only title receives a clear 4xx response and is not stored.
2. Test locally:

```text
node scripts/verify-phase0.mjs app --backend-url http://localhost:3000 --frontend-url http://localhost:8080 --expect fixed
```

3. Commit or open a pull request whose message links the issue, for example:

```text
Fixes #12
```

4. Push or merge the correction.
5. Wait for the Render backend to deploy the correcting commit.
6. Test production:

```text
node scripts/verify-phase0.mjs app --backend-url https://YOUR-BACKEND.onrender.com --frontend-url https://YOUR-FRONTEND.onrender.com --expect fixed
```

### Milestone passes when

- the direct API test rejects whitespace with a 4xx response;
- the invalid row is not stored;
- the commit or pull request links the peer issue;
- Render identifies the correcting commit as deployed; and
- the production check ends with `RESULT: PASS`.

---

## Milestone 11 — Peer verification, release tag, and Moodle submission

### Do this

1. Ask the original peer to repeat the production test.
2. The peer records the deployed URL, repeated steps, observed result, and whether the defect is resolved in the GitHub issue.
3. Create the required tag on the verified commit:

```text
git pull
git tag phase0-complete
git push origin phase0-complete
```

4. Run the final repository check:

```text
npm run check:final
```

5. Fill in `PHASE0_SUBMISSION_TEMPLATE.md` and paste its completed contents into the Moodle assignment.
6. Attach any screenshots or logs you rely on.
7. Select **Submit assignment**. Saving a draft is not a submission.

### Milestone passes when

- the peer verification is recorded after the production fix;
- `phase0-complete` points to the verified commit;
- `npm run check:final` ends with `RESULT: PASS`;
- the Moodle activity shows the submission as submitted, not draft.

---

## Troubleshooting: start with the failing boundary

| Symptom | Check first |
|---|---|
| `npm` is not recognized | Install Node.js LTS, close the terminal, and open a new terminal. |
| Backend exits with `DATABASE_URL is required` | Confirm `backend/.env` exists, is named exactly `.env`, and contains `DATABASE_URL=...`. |
| `password authentication failed` | Recopy the Supabase Session pooler string; check its pooled username and percent-encode reserved password characters. |
| Health says `database unavailable` | Check the Supabase project is active, `schema.sql` ran, and Render has the current `DATABASE_URL`. |
| Render cannot find `package.json` | The backend Root Directory must be `backend`. |
| Render cannot detect a port | Use the supplied server code and do not replace Render's `PORT` environment variable. |
| Frontend opens but says it cannot reach the backend | Check `frontend/config.js`, remove a trailing slash, push the change, and wait for the static site redeploy. |
| Frontend still uses `localhost` | Confirm the deployed commit contains the production backend URL and redeploy the static site. |
| First production request is slow | A free Render service may be waking after inactivity; wait about one minute and retry once. |
| Item disappears after backend redeploy | The app is not using persistent PostgreSQL or is using the wrong database. Stop and repair Milestone 8. |
| GitHub issue form is missing | Confirm `.github/ISSUE_TEMPLATE/bug_report.yml` exists on the default branch and Issues are enabled. |
| `check:final` cannot find the tag | Create and push `phase0-complete`, then confirm it appears on GitHub. |

When asking for help, provide the milestone number, the exact command or dashboard step, the complete non-secret error message, and what you expected. Never include `.env`, `DATABASE_URL`, passwords, tokens, or API keys.

## Current provider notes

- Render free web services may sleep after inactivity and use an ephemeral local filesystem. PostgreSQL must therefore remain external and persistent.
- Supabase free projects may pause after low activity. Resume the project from its dashboard if that happens.
- Free-tier policies change. Follow any updated course announcement if a dashboard or limit differs from this guide.
