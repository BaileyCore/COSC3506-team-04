'use strict';
const { importLegacyExport, normalizeEmail } = require('./final_migration.cjs');
const { logDiagnostic } = require('./diagnostics.cjs');

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const STALE_DAYS = 365;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

const fail = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max = 1600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const uuid = (v) => {
  if (!UUID.test(v || '')) throw fail(400, 'Invalid record ID.');
  return v;
};

function computeAvailability(row, nowMs = Date.now()) {
  const confirmedAt = row.availability_confirmed_at ? new Date(row.availability_confirmed_at) : null;
  const confirmedValid = confirmedAt && !Number.isNaN(confirmedAt.getTime());
  const rawState = row.availability_state === 'showcase' ? 'showcase' : 'active';
  const rawAvailability = Array.isArray(row.availability) ? row.availability : [];
  const isStale = confirmedValid ? (nowMs - confirmedAt.getTime()) > STALE_MS : false;
  const effectiveState = (rawState === 'showcase' || isStale || rawAvailability.length === 0) ? 'showcase' : 'active';
  return {
    availability: effectiveState === 'active' ? rawAvailability : [],
    availability_state: effectiveState,
    availability_stale: isStale,
    availability_confirmed_at: confirmedValid ? confirmedAt.toISOString() : null,
  };
}

function mountFinal(app, { pool, getSession, ready, origin, staffGithubIds }) {
  const staffIds = new Set(
    (staffGithubIds || '').split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x))
  );
  const q = (sql, args) => pool.query(sql, args);
  const rows = async (sql, args) => (await q(sql, args)).rows;
  const one = async (sql, args) => (await rows(sql, args))[0];

  function route(method, path, access, fn) {
    app[method]('/api/final' + path, async (req, res, next) => {
      try {
        await ready;
        if (method !== 'get' && ![origin].flat().includes(req.get('origin'))) {
          throw fail(403, 'Request origin is not allowed.');
        }
        let actor = null;
        if (access !== 'public') {
          const id = getSession(req);
          if (!id) throw fail(401, 'Sign in with GitHub first.');
          actor = await one('SELECT user_id, github_id, github_login, email, verified_at FROM r2_accounts WHERE user_id=$1', [id]);
          if (!actor) throw fail(401, 'Sign in with GitHub first.');
          if (access === 'staff' && !staffIds.has(actor.github_id)) {
            throw fail(403, 'Staff access is required.');
          }
          if (access === 'student' && !actor.verified_at) {
            throw fail(403, 'Verify your Algoma email first.');
          }
        }
        if (access !== 'public') res.set('Cache-Control', 'no-store');
        res.json(await fn(req, actor));
      } catch (e) {
        if (e.status) {
          res.status(e.status).json({ error: e.message });
        } else {
          logDiagnostic('error', 'final_route_error', {
            requestId: req.requestId,
            path: req.originalUrl,
            message: e.message,
          });
          next(e);
        }
      }
    });
  }

  const staff = (method, path, fn) => route(method, '/staff' + path, 'staff', fn);

  // --- F.01-F.06: Staff repeatable legacy migration ---
  staff('post', '/import-legacy', async (req, actor) => {
    const payload = req.body?.data || req.body;
    if (!payload || typeof payload !== 'object' || (!Array.isArray(payload.students) && !Array.isArray(payload.projects))) {
      throw fail(400, 'Provide a legacy export JSON object containing students, projects, companies, or collaborations.');
    }
    const fixtureName = str(req.body?.fixture_name, 120) || 'staff_upload.json';
    const report = await importLegacyExport(pool, payload, { fixtureName, actorId: actor.user_id });
    logDiagnostic('info', 'legacy_import_completed', {
      requestId: req.requestId,
      fixtureName,
      source_counts: report.source_counts,
    });
    return { ok: true, report };
  });

  staff('get', '/migration-runs', async () => {
    return rows('SELECT id, fixture_name, report, created_at FROM final_migration_runs ORDER BY created_at DESC LIMIT 20');
  });

  // --- F.07-F.10: Profile Claim & Recovery ---
  route('get', '/claimable', 'student', async () => {
    return rows(
      `SELECT id, name, headline, program, status, profile_status
       FROM students
       WHERE claimed_by_user_id IS NULL
         AND merged_into_id IS NULL
         AND profile_status IN ('published', 'retired')
         AND id NOT LIKE 'U%'
       ORDER BY name ASC
       LIMIT 100`
    );
  });

  route('get', '/claims/mine', 'student', async (_req, actor) => {
    return rows(
      `SELECT c.id, c.student_id, s.name AS student_name, c.state, c.auto_approved, c.decision_note, c.created_at
       FROM final_claim_requests c
       JOIN students s ON s.id = c.student_id
       WHERE c.claimant_user_id = $1
       ORDER BY c.created_at DESC`,
      [actor.user_id]
    );
  });

  route('post', '/claims', 'student', async (req, actor) => {
    const studentId = str(req.body?.student_id, 80);
    const note = str(req.body?.note, 1000);
    if (!studentId) throw fail(400, 'Select a profile to claim.');

    const student = await one(
      'SELECT id, name, legacy_email, claimed_by_user_id, merged_into_id FROM students WHERE id=$1',
      [studentId]
    );
    if (!student || student.merged_into_id) throw fail(404, 'Profile not found.');
    if (student.claimed_by_user_id) throw fail(409, 'This profile has already been claimed.');

    const dup = await one(
      "SELECT id FROM final_claim_requests WHERE student_id=$1 AND claimant_user_id=$2 AND state='pending'",
      [studentId, actor.user_id]
    );
    if (dup) throw fail(409, 'You already have a pending claim request for this profile.');

    // F.08 & F.09: Automatic approval is permitted ONLY when the verified R2.04 email
    // exactly matches the non-null email carried by the legacy record.
    const verifiedEmail = normalizeEmail(actor.email);
    const legacyEmail = normalizeEmail(student.legacy_email);
    const exactEmailMatch = Boolean(actor.verified_at && verifiedEmail && legacyEmail && verifiedEmail === legacyEmail);

    if (exactEmailMatch) {
      await q('UPDATE students SET claimed_by_user_id=$2 WHERE id=$1 AND claimed_by_user_id IS NULL', [studentId, actor.user_id]);
      const claim = await one(
        `INSERT INTO final_claim_requests (student_id, claimant_user_id, note, state, auto_approved, reviewed_at, decision_note)
         VALUES ($1, $2, $3, 'approved', TRUE, NOW(), 'Auto-approved via exact verified email match.')
         RETURNING id, student_id, state, auto_approved, decision_note`,
        [studentId, actor.user_id, note]
      );
      return claim;
    }

    return one(
      `INSERT INTO final_claim_requests (student_id, claimant_user_id, note, state, auto_approved)
       VALUES ($1, $2, $3, 'pending', FALSE)
       RETURNING id, student_id, state, auto_approved`,
      [studentId, actor.user_id, note]
    );
  });

  staff('get', '/claims', async () => {
    return rows(
      `SELECT c.id, c.student_id, s.name AS student_name, s.legacy_email IS NOT NULL AS has_legacy_email,
              c.claimant_user_id, a.github_login AS claimant_github, a.email AS claimant_email,
              c.note, c.state, c.auto_approved, c.decision_note, c.created_at
       FROM final_claim_requests c
       JOIN students s ON s.id = c.student_id
       JOIN r2_accounts a ON a.user_id = c.claimant_user_id
       WHERE c.state = 'pending'
       ORDER BY c.created_at ASC`
    );
  });

  staff('post', '/claims/:id/review', async (req, actor) => {
    const claimId = uuid(req.params.id);
    const decision = req.body?.decision;
    const decisionNote = str(req.body?.decision_note, 600);
    if (!['approved', 'rejected'].includes(decision)) throw fail(400, 'Choose approved or rejected.');

    const claim = await one("SELECT * FROM final_claim_requests WHERE id=$1 AND state='pending'", [claimId]);
    if (!claim) throw fail(409, 'Claim request not found or already reviewed.');

    if (decision === 'approved') {
      const updated = await one(
        'UPDATE students SET claimed_by_user_id=$2 WHERE id=$1 AND (claimed_by_user_id IS NULL OR claimed_by_user_id=$2) RETURNING id',
        [claim.student_id, claim.claimant_user_id]
      );
      if (!updated) throw fail(409, 'Profile was already claimed by another user.');
    }

    return one(
      `UPDATE final_claim_requests
       SET state=$2, reviewed_by=$3, reviewed_at=NOW(), decision_note=$4
       WHERE id=$1
       RETURNING id, student_id, state, decision_note`,
      [claimId, decision, actor.user_id, decisionNote]
    );
  });

  staff('post', '/profiles/:id/reassign', async (req) => {
    const studentId = str(req.params.id, 80);
    const targetUserId = uuid(req.body?.user_id);
    const acct = await one('SELECT user_id FROM r2_accounts WHERE user_id=$1 AND verified_at IS NOT NULL', [targetUserId]);
    if (!acct) throw fail(404, 'Verified target account not found.');
    const updated = await one(
      'UPDATE students SET claimed_by_user_id=$2 WHERE id=$1 AND merged_into_id IS NULL RETURNING id, claimed_by_user_id',
      [studentId, targetUserId]
    );
    if (!updated) throw fail(404, 'Student profile not found.');
    return updated;
  });

  // --- F.14 & F.15/F.16: Reconfirm Availability & Retire/Archive Profile ---
  route('post', '/profile/reconfirm-availability', 'student', async (_req, actor) => {
    const ownId = 'U' + String(actor.user_id);
    const updated = await rows(
      `UPDATE students
       SET availability_confirmed_at = NOW(), availability_state = 'active'
       WHERE id = $1 OR claimed_by_user_id = $2
       RETURNING id, availability_state, availability_confirmed_at`,
      [ownId, actor.user_id]
    );
    await q(
      `UPDATE r2_profiles
       SET profile = jsonb_set(profile, '{availability_confirmed_at}', to_jsonb(NOW()::text), true),
           updated_at = NOW()
       WHERE user_id = $1`,
      [actor.user_id]
    );
    return { ok: true, confirmed_at: new Date().toISOString(), updated_profiles: updated.map((r) => r.id) };
  });

  route('post', '/profile/retire', 'student', async (_req, actor) => {
    const ownId = 'U' + String(actor.user_id);
    await q(
      `UPDATE students
       SET profile_status = 'retired'
       WHERE id = $1 OR claimed_by_user_id = $2`,
      [ownId, actor.user_id]
    );
    await q('UPDATE r2_profiles SET published = FALSE, updated_at = NOW() WHERE user_id = $1', [actor.user_id]);
    return { ok: true, profile_status: 'retired', shared_history_preserved: true };
  });

  // --- F.17 & F.18: Staff Duplicate Merge + Redirect Continuity ---
  staff('post', '/merge/students', async (req, actor) => {
    const sourceId = str(req.body?.source_id, 80);
    const targetId = str(req.body?.target_id, 80);
    const reason = str(req.body?.reason, 400) || 'Duplicate student profile merged by staff.';
    if (!sourceId || !targetId || sourceId === targetId) {
      throw fail(400, 'Choose two distinct student profiles to merge.');
    }
    const [src, tgt] = await Promise.all([
      one('SELECT id, name, merged_into_id FROM students WHERE id=$1', [sourceId]),
      one('SELECT id, name, merged_into_id FROM students WHERE id=$1', [targetId]),
    ]);
    if (!src || !tgt) throw fail(404, 'Source or target student profile not found.');
    if (tgt.merged_into_id) throw fail(409, 'Target student has already been merged into another profile.');

    // Move skills without duplicate conflicts
    await q(
      `INSERT INTO student_skills (student_id, skill_name)
       SELECT $2, skill_name FROM student_skills WHERE student_id = $1
       ON CONFLICT DO NOTHING`,
      [sourceId, targetId]
    );
    await q('DELETE FROM student_skills WHERE student_id = $1', [sourceId]);

    // Move project_contributors without duplicate conflicts
    await q(
      `INSERT INTO project_contributors (project_id, student_id, role)
       SELECT project_id, $2, role FROM project_contributors WHERE student_id = $1
       ON CONFLICT (project_id, student_id) DO NOTHING`,
      [sourceId, targetId]
    );
    await q('DELETE FROM project_contributors WHERE student_id = $1', [sourceId]);

    // Update r4_collaborations.student_ids array references
    await q(
      `UPDATE r4_collaborations
       SET student_ids = ARRAY(
         SELECT DISTINCT CASE WHEN x = $1 THEN $2 ELSE x END
         FROM unnest(student_ids) AS x
       )
       WHERE $1 = ANY(student_ids)`,
      [sourceId, targetId]
    );

    // Mark source merged & record redirect
    await q(
      "UPDATE students SET merged_into_id = $2, profile_status = 'merged' WHERE id = $1",
      [sourceId, targetId]
    );
    await q(
      `INSERT INTO final_merge_redirects (entity_type, source_id, target_id, reason, merged_by)
       VALUES ('student', $1, $2, $3, $4)
       ON CONFLICT (entity_type, source_id) DO UPDATE SET target_id=EXCLUDED.target_id, reason=EXCLUDED.reason, merged_by=EXCLUDED.merged_by, merged_at=NOW()`,
      [sourceId, targetId, reason, actor.user_id]
    );
    // Update any earlier redirects pointing to sourceId so chains resolve directly to targetId
    await q(
      "UPDATE final_merge_redirects SET target_id = $2 WHERE entity_type = 'student' AND target_id = $1",
      [sourceId, targetId]
    );

    return { ok: true, entity_type: 'student', source_id: sourceId, target_id: targetId, redirect_url: '/student.html?id=' + encodeURIComponent(targetId) };
  });

  staff('post', '/merge/partners', async (req, actor) => {
    const sourceId = uuid(req.body?.source_id);
    const targetId = uuid(req.body?.target_id);
    const reason = str(req.body?.reason, 400) || 'Duplicate company record merged by staff.';
    if (sourceId === targetId) throw fail(400, 'Choose two distinct company records to merge.');

    const [src, tgt] = await Promise.all([
      one('SELECT id, name, merged_into_id FROM r4_partners WHERE id=$1', [sourceId]),
      one('SELECT id, name, merged_into_id FROM r4_partners WHERE id=$1', [targetId]),
    ]);
    if (!src || !tgt) throw fail(404, 'Source or target company record not found.');
    if (tgt.merged_into_id) throw fail(409, 'Target company has already been merged.');

    await q('UPDATE r4_collaborations SET partner_id = $2 WHERE partner_id = $1', [sourceId, targetId]);
    await q('UPDATE r4_requests SET partner_id = $2 WHERE partner_id = $1', [sourceId, targetId]);
    await q('UPDATE r4_partners SET merged_into_id = $2, published = FALSE WHERE id = $1', [sourceId, targetId]);
    await q(
      `INSERT INTO final_merge_redirects (entity_type, source_id, target_id, reason, merged_by)
       VALUES ('partner', $1, $2, $3, $4)
       ON CONFLICT (entity_type, source_id) DO UPDATE SET target_id=EXCLUDED.target_id, reason=EXCLUDED.reason, merged_by=EXCLUDED.merged_by, merged_at=NOW()`,
      [sourceId, targetId, reason, actor.user_id]
    );
    await q(
      "UPDATE final_merge_redirects SET target_id = $2 WHERE entity_type = 'partner' AND target_id = $1",
      [sourceId, targetId]
    );

    return { ok: true, entity_type: 'partner', source_id: sourceId, target_id: targetId, redirect_url: '/r4-partners.html?id=' + encodeURIComponent(targetId) };
  });

  // --- F.19: Staff Project Maintainer Recovery ---
  staff('post', '/projects/:id/reassign-maintainer', async (req, actor) => {
    const projectId = uuid(req.params.id);
    const rawStudent = str(req.body?.student_id, 80).replace(/^U/i, '');
    const newMaintainerId = uuid(rawStudent);
    const reason = str(req.body?.reason, 400) || 'Maintainer reassigned by staff.';

    const project = await one('SELECT id, maintainer_id FROM r3_projects WHERE id=$1', [projectId]);
    if (!project) throw fail(404, 'Shared project not found.');
    const acct = await one('SELECT user_id FROM r2_accounts WHERE user_id=$1 AND verified_at IS NOT NULL', [newMaintainerId]);
    if (!acct) throw fail(404, 'New maintainer must be a verified account.');

    await q('UPDATE r3_projects SET maintainer_id=$2, version=version+1, updated_at=NOW() WHERE id=$1', [projectId, newMaintainerId]);
    await q(
      `INSERT INTO r3_contributors (project_id, student_id, role, state, joined_at)
       VALUES ($1, $2, 'Project Manager', 'accepted', NOW())
       ON CONFLICT (project_id, student_id) DO UPDATE SET state='accepted', changed_at=NOW()`,
      [projectId, newMaintainerId]
    );
    await q(
      `INSERT INTO r3_audit (project_id, actor_id, subject_id, action, data)
       VALUES ($1, $2, $3, 'staff-maintainer-reassigned', $4::jsonb)`,
      [projectId, actor.user_id, newMaintainerId, JSON.stringify({ previous_maintainer_id: project.maintainer_id, reason })]
    );

    return { ok: true, project_id: projectId, previous_maintainer_id: project.maintainer_id, maintainer_id: newMaintainerId };
  });

  // Staff helper list of verified accounts & shared projects for recovery UI
  staff('get', '/recovery-options', async () => {
    const [accounts, sharedProjects, allStudents] = await Promise.all([
      rows("SELECT user_id, github_login FROM r2_accounts WHERE verified_at IS NOT NULL ORDER BY github_login"),
      rows("SELECT id, title, maintainer_id FROM r3_projects ORDER BY title"),
      rows("SELECT id, name, profile_status FROM students WHERE merged_into_id IS NULL ORDER BY name LIMIT 300"),
    ]);
    return { accounts, sharedProjects, students: allStudents };
  });
}

module.exports = { mountFinal, computeAvailability, STALE_DAYS };
