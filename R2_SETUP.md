# Release 2 setup notes (Team 04)

This branch adds an R2 student self-service path to the existing Release 1 directory. It is not ready to freeze until the configuration and deployed workflow below are completed.

## Required service configuration

Configure the backend service with:

- `DATABASE_URL`: the existing PostgreSQL connection string.
- `FRONTEND_ORIGIN`: exact public frontend origin, without a trailing slash.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: from a GitHub OAuth App.
- `GITHUB_CALLBACK_URL`: `https://<backend-host>/api/auth/github/callback`; set the same callback URL in the OAuth App.
- `R2_SESSION_SECRET`: a long random secret.
- `ALGOMA_EMAIL_DOMAIN=algomau.ca`.
- `RESEND_API_KEY` and `VERIFICATION_FROM_EMAIL`: a verified sender configured with the email service.

Never commit real secrets. Put them in the hosting provider's environment settings.

## Database

The backend applies the additive root `schema.sql` when an R2 API request arrives. The script uses `IF NOT EXISTS` and preserves existing tables. Confirm the hosting database role can create tables; if not, run the updated root `schema.sql` once using the database owner account.

## Local/deployed check sequence

1. Open the frontend in a fresh browser session and select **Student? Sign in to manage your profile**.
2. Complete GitHub OAuth. The application requests only `read:user user:email`.
3. Request a code for an `@algomau.ca` address and verify it before the 30-minute expiry.
4. Create and save a private draft. Confirm it is not present in `/api/students`.
5. Import one of the supplied resume PDFs. The PDF is parsed in the browser; suggestions are editable and are not saved automatically.
6. Preview, save, publish, and confirm the profile appears in the directory.
7. Unpublish and confirm the profile disappears from public directory/API results.
8. Repeat with a second account and verify it cannot access or change the first account's draft.

## Known limitations before freeze

- This branch has not been deployed or tested against the team's hosted GitHub OAuth and email-provider configuration.
- PDF parsing loads PDF.js from a CDN; a failed CDN load shows a recoverable manual-entry path.
- Only the profile fields implemented in the editor are self-service editable; existing project-evidence records remain in the R1 workflow.
- A real Algoma mailbox is required; do not replace email verification with an unapproved bypass or test mode.
