# Operational & Diagnostics Note (F.30–F.32)

## Deployment Architecture
- **Static Frontend:** Render Static Site (`https://cosc3506-team04-frontend.onrender.com`), built via `npm run build` (`frontend/build.mjs` → `frontend/dist`).
- **Backend API & First-Party Account Host:** Render Web Service (`https://cosc3506-team-04-ey5d.onrender.com`), running Node.js + Express (`backend/server.js`). Serves signed-in account and staff pages (`/profile.html`, `/r3-projects.html`, `/r4-staff.html`) on the same origin as the `r2_session` cookie.
- **Database:** Supabase PostgreSQL. Additive schema changes live in `backend/final_schema.sql` (also appended to `schema.sql`), with `ENABLE ROW LEVEL SECURITY` and `REVOKE ALL` from `PUBLIC`, `anon`, and `authenticated` on all new tables.

## External Dependencies & Failure Isolation (F.30–F.31)
1. **GitHub OAuth & Repository Metadata API:** Timeouts (7s on repo preview) and HTTP status checks ensure GitHub outages return actionable errors without breaking public browsing or existing records.
2. **Company Website Importer (`backend/r4_import.cjs`):** Enforces public HTTPS, SSRF IP checks, 2.5s DNS timeout, 5.5s fetch timeout, and 512 KB size limit. On failure, returns HTTP `422` with guidance and leaves unsaved staff drafts untouched.
3. **Verification Email Provider (`backend/r2.js`):** Supports Google Apps Script Mailer, Mailjet, or Resend with 15–30s timeouts and rate limiting; failures return HTTP `502` without exposing credentials or codes.
4. **External Playable Demos & Fallback Media (`frontend/r3-public.js`):** External demos open isolated (`target="_blank" rel="noopener noreferrer"`) only after explicit click; broken fallback images degrade gracefully to a readable notice; broken/retired builds can be marked `unavailable`/`archived`/`replaced` without deleting the project.

## Operational Diagnostics (F.32)
- `backend/diagnostics.cjs` attaches a unique `X-Request-Id` header to every HTTP response and writes structured JSON logs (`timestamp`, `level`, `event`, `requestId`, route/context) for health-check failures, migration runs, and unexpected errors.
- **Secret Redaction:** `sanitize()` automatically redacts keys matching `secret|token|password|cookie|authorization|api_key|code_hash|verification` as well as inline `Bearer ...` tokens and `r2_session=...` cookie values before logging.
- Public HTTP error responses return human-readable messages and `request_id` without stack traces or internal secrets.
