# Release 2 privacy summary (Team 04)

This summary describes the R2 student self-service changes on branch `r2/student-self-service`. It is not evidence of a deployed privacy review; verify it against the configured production services before release.

## Information handled

GitHub OAuth supplies the student's GitHub numeric account ID and login name. Students enter an Algoma email address and receive a one-time verification code. The application stores the GitHub ID/login, verified Algoma email and verification time, plus the profile fields the student chooses to save: name, headline, program, availability, shared skills, and HTTPS professional links.

The PDF resume is read in the student's browser to identify text matching shared skills. The file and extracted resume text are not uploaded or stored by this implementation. Suggestions are editable and are not saved until the student saves the draft.

## Access and visibility

A private draft is stored in PostgreSQL and accessed through a signed, HTTP-only session tied to the signed-in GitHub account. Server routes use that account ID to enforce profile ownership. The public directory and public profile API expose only records with `profile_status = 'published'`. Email addresses, verification codes, and private drafts are not returned by public directory routes. Publishing makes the profile fields shown in the public preview visible; unpublishing removes the profile from those public routes.

Verification codes are stored as SHA-256 hashes, expire after 30 minutes, are single-use, and allow at most five attempts. Session, OAuth, database, and email-provider secrets belong in the hosting provider's private environment settings and must never be committed.

## Student control

Students can review and edit extracted suggestions, save a private draft, preview the profile, publish, and unpublish. Do not upload a real resume for peer testing; use the synthetic course fixtures. Test with a GitHub account and an Algoma address the tester controls.

## Before release

Confirm the production database, OAuth callback, email sender, CORS origin, HTTPS session cookie, reviewer access, and the public/private visibility checks in the deployed environment. The PDF parser is currently loaded from a third-party CDN; if it is unavailable, students can complete the profile manually.