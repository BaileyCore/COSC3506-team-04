# Google verification email sender

Use this sender when a Gmail address sent through a third-party provider is
accepted by the recipient server but does not reach the inbox.

## Set up Apps Script

1. In a personal Google account, create an Apps Script project and paste
   `Code.gs` into its editor.
2. Save and run `setupMailer` once. This creates a random `MAILER_SECRET`
   script property and preserves it on later runs.
3. In Project Settings, copy that property privately. Never put it in this
   repository, screenshots, issues, frontend code, or submission documents.
4. Deploy a new **Web app**, **Execute as: Me**, **Who has access: Anyone**.
   Authorize the script to send email. The HTTP endpoint is reachable publicly;
   email sending requires a valid HMAC signed by the backend.
5. Copy the deployment URL ending in `/exec`.

## Configure the backend in Render

- `GOOGLE_MAILER_URL`: the Apps Script web app URL.
- `GOOGLE_MAILER_SECRET`: the same private value as the `MAILER_SECRET` property.

Save and redeploy the backend. Google takes priority when either Google setting
exists; incomplete Google configuration fails closed rather than silently using
another sender. Existing Mailjet and Resend configurations remain available when
both Google settings are absent.

## Verify delivery

Use the actual deployed profile workflow: GitHub sign-in, request one code,
receive it in the Algoma inbox, enter it, then save a private profile draft.
Provider acceptance alone is not evidence of inbox delivery. Record real results
and defects in the project issues, preserving the assessed release tag.

The consumer Google Apps Script quota is currently 100 email recipients daily;
Google may change quotas. The script checks its remaining quota and returns an
error when exhausted. The app's per-account request and code-attempt limits
continue to apply.

Only fixed verification messages to `@algomau.ca` addresses are accepted. Each
request is HMAC-SHA256 signed, expires after five minutes, and has a random request
ID cached for ten minutes to suppress duplicate sends. The signing secret and
verification code are never returned by the relay or logged by this code.
Google returns JSON errors with HTTP 200, so the backend checks `ok === true`.
No deployment URL or secret needs to appear in public submission files.

Official references:
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/reference/mail/mail-app
- https://developers.google.com/apps-script/guides/services/quotas
