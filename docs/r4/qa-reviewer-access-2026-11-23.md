# R4 QA reviewer access response — November 23, 2026

## Finding

The instructor reported that Team 10 could not reach the staff scenarios because designated reviewer access had not been provisioned. Accepted. This was disclosed in the original submission evidence and blocked staff-dependent testing.

## Configuration repair

With the deployment owner's approval, added GitHub account harshitp1009 (stable numeric ID 158309251) to the backend's R4 staff allowlist while retaining the owner's existing entry. No passwords, verification codes, or credentials were shared or committed.

Applied the environment update using Render's Save and deploy option, which reused the existing production build. Render deployment dep-dc29ds56e07s73b5qm40 succeeded on November 23, 2026 at 2:41:36 p.m. Toronto time. The recorded source remained 9c4ac4760f4c832e31c7ba919481edf53729c61a. R4-submission and R3-submission were not moved.

## Verification and requested retest

The deployment succeeded and the live /api/health response was {"ok":true,"database":"reachable"} after the update. This establishes deployment health and configuration application, not a successful login as the reviewer.

Harshit should sign in with harshitp1009 at https://cosc3506-team-04-ey5d.onrender.com/profile.html and open https://cosc3506-team-04-ey5d.onrender.com/r4-staff.html. Team 10 should confirm access and resume previously blocked staff scenarios.

The owner has a draft reply-all confirmation to the instructor/Team 10 email thread. Sending that reply and the reviewer's first successful staff login have not been verified in this record.

This is post-submission access-repair evidence. It does not change the frozen product version or erase the original access finding.
