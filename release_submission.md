# Release 1 Submission

## Team
Team 04

## Deployment URL
https://cosc3506-team-04-1.onrender.com

## GitHub Repository
https://github.com/BaileyCore/COSC3506-team-04

## Release Tag
R1-submission

## Commit SHA
TO BE ADDED AFTER FINAL COMMIT

## Release Notes
Release 1 implements the public employer talent discovery workflow.

Implemented features include:

- Public Talent Directory
- Case-insensitive text search
- Standardized skill filtering
- Multiple skill filters using AND semantics
- Availability filtering
- Current/Alumni status filtering
- Clear Filters option
- Published student profiles only
- Student profile pages
- Project evidence pages
- Shared project contributors and roles
- Professional student links
- Project links/media
- Contextual student inquiry
- Contextual project inquiry
- Invalid student/project not-found states
- Mobile support at 390px width
- Keyboard-accessible navigation and form controls

## Known Issues
No known blocking issues at the time of Release 1 submission.

## Technology / Deployment Summary
Frontend:
- HTML
- CSS
- JavaScript

Backend:
- Node.js
- Express

Database:
- PostgreSQL
- Supabase

Deployment:
- Render frontend
- Render backend

Release 1 fixture data was imported into the persistent PostgreSQL database and is served through backend API routes.

## Browser Assumptions
Tested in Google Chrome.

The application is designed to work in current modern desktop and mobile browsers.

## Employer Inquiry
Release 1 uses the allowed simulated employer inquiry workflow.

Student inquiries preserve:
- source_type
- source_id
- source_name
- source_url

Project inquiries preserve the project context rather than selecting an arbitrary contributor.

## Evaluation Adapter
See:

evaluation_adapter.json