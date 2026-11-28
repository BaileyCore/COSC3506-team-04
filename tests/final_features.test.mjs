import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(new URL('../backend/server.js', import.meta.url));
const express = require('express');
const { mountR3 } = require('./../backend/r3_routes.cjs');
const { mountR4 } = require('./../backend/r4_routes.cjs');
const { mountFinal } = require('./../backend/final_routes.cjs');
const { importLegacyExport } = require('./../backend/final_migration.cjs');
const { queryStudentsDirectory, queryStudentDetail } = require('./../backend/directory_query.cjs');
const { sanitize } = require('./../backend/diagnostics.cjs');

test('F.07-F.21 & F.32 & F.37: claim safety, stale availability, retirement, duplicate merge + redirect, maintainer recovery, demo state, diagnostics', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const schema = (await readFile(new URL('../schema.sql', import.meta.url), 'utf8'))
    .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
  await db.exec(schema);

  const legacy = JSON.parse(await readFile(new URL('../fixtures/final/legacy_export.json', import.meta.url), 'utf8'));
  await importLegacyExport(db, legacy, { fixtureName: 'legacy_export.json' });

  const ids = {
    staff: '00000000-0000-4000-8000-000000000001',
    avery: '00000000-0000-4000-8000-000000000002',
    other: '00000000-0000-4000-8000-000000000003',
    unverified: '00000000-0000-4000-8000-000000000004',
  };
  await db.query("INSERT INTO r2_accounts(user_id,github_id,github_login,email,verified_at) VALUES($1,'1','staff-user','staff@algomau.ca',now())", [ids.staff]);
  await db.query("INSERT INTO r2_accounts(user_id,github_id,github_login,email,verified_at) VALUES($1,'2','avery-gh','avery.chen@algoma.example',now())", [ids.avery]);
  await db.query("INSERT INTO r2_accounts(user_id,github_id,github_login,email,verified_at) VALUES($1,'3','other-gh','other@algomau.ca',now())", [ids.other]);
  await db.query("INSERT INTO r2_accounts(user_id,github_id,github_login,email,verified_at) VALUES($1,'4','unver-gh',NULL,NULL)", [ids.unverified]);

  // Seed a shared project for maintainer recovery (F.19) and demo build state (F.37)
  const projId = '00000000-0000-4000-8000-000000000099';
  await db.query("INSERT INTO r3_projects(id,maintainer_id,title,published,playable_url,demo_status,demo_note) VALUES($1,$2,'XR Recovery Demo',true,'https://demo.example.test','unavailable','Retired WebGL build')", [projId, ids.avery]);
  await db.query("INSERT INTO r3_contributors(project_id,student_id,role,state,joined_at) VALUES($1,$2,'Project Manager','accepted',now())", [projId, ids.avery]);

  const origin = 'https://frontend.example.com';
  const app = express();
  app.use(express.json());
  const getSession = (req) => ids[req.get('x-test-role')] || null;
  mountR3(app, {
    pool: db,
    frontendOrigin: origin,
    getVerifiedStudentId: async (req) => {
      const uid = getSession(req);
      if (!uid) return null;
      const r = await db.query('SELECT user_id FROM r2_accounts WHERE user_id=$1 AND verified_at IS NOT NULL', [uid]);
      return r.rows[0]?.user_id || null;
    },
    studentExists: async (sid) => (await db.query('SELECT 1 FROM r2_accounts WHERE user_id=$1 AND verified_at IS NOT NULL', [sid])).rows.length > 0,
  });
  mountR4(app, { pool: db, ready: Promise.resolve(), origin, staffGithubIds: '1', getSession });
  mountFinal(app, { pool: db, ready: Promise.resolve(), origin, staffGithubIds: '1', getSession });
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;

  const call = async (path, actor, body, expected = 200) => {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { origin, 'x-test-role': actor || '', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json();
    assert.equal(r.status, expected, `${path} expected ${expected}, got ${r.status}: ${JSON.stringify(d)}`);
    return d;
  };

  // F.07 & F.20: claimable list never exposes legacy_email
  const claimable = await call('/api/final/claimable', 'other');
  assert.ok(claimable.length >= 3);
  assert.equal('legacy_email' in claimable[0], false);

  // F.08 & F.09: exact verified email match auto-approves LS01 for avery
  const autoClaim = await call('/api/final/claims', 'avery', { student_id: 'LS01', note: 'My profile' });
  assert.equal(autoClaim.state, 'approved');
  assert.equal(autoClaim.auto_approved, true);

  // F.09: different Algoma email (other@algomau.ca) claiming LS02 (daniel.kim@alumni.example) MUST NOT auto-approve
  const pendingClaim = await call('/api/final/claims', 'other', { student_id: 'LS02', note: 'Name similar' });
  assert.equal(pendingClaim.state, 'pending');
  assert.equal(pendingClaim.auto_approved, false);

  // F.21: non-staff cannot access staff claims queue or merge endpoints
  await call('/api/final/staff/claims', 'other', undefined, 403);
  await call('/api/final/staff/merge/students', 'other', { source_id: 'LS04', target_id: 'LS01' }, 403);

  // F.10: staff rejects ambiguous claim with reason
  const staffClaims = await call('/api/final/staff/claims', 'staff');
  assert.equal(staffClaims.length, 1);
  const reviewed = await call('/api/final/staff/claims/' + pendingClaim.id + '/review', 'staff', {
    decision: 'rejected',
    decision_note: 'Email does not match record owner.',
  });
  assert.equal(reviewed.state, 'rejected');

  // F.14: LS02 has availability_confirmed = 2024-06-01 (>365 days old) -> stale -> must NOT be shown as active job-seeking
  const ls02Detail = await queryStudentDetail(db, 'LS02');
  assert.equal(ls02Detail.status, 200);
  assert.equal(ls02Detail.body.availability_stale, true);
  assert.equal(ls02Detail.body.availability_state, 'showcase');
  assert.deepEqual(ls02Detail.body.availability, []);
  const activeFullTime = await queryStudentsDirectory(db, { availability: 'full-time' });
  assert.equal(activeFullTime.students.some((s) => s.id === 'LS02'), false);

  // F.15 & F.16: retiring profile hides from directory while preserving historical collaboration attribution
  const lc01Id = (await db.query("SELECT id FROM r4_partners WHERE legacy_id='LC01'")).rows[0].id;
  await db.query("UPDATE r4_collaborations SET student_ids=ARRAY['LS01','LS06'] WHERE legacy_id='LCO1'");
  await call('/api/final/profile/retire', 'avery', {});
  const dirAfterRetire = await queryStudentsDirectory(db, {});
  assert.equal(dirAfterRetire.students.some((s) => s.id === 'LS01'), false);
  const partnerDetail = await call('/api/r4/public/partners/' + lc01Id, null);
  const lco1 = partnerDetail.collaborations.find((c) => c.title === 'Industrial Safety Training');
  assert.ok(lco1.students.some((s) => s.id === 'LS01' && s.retired === true));
  assert.ok(lco1.students.some((s) => s.id === 'LS06' && s.retired === true));
  // Re-publish LS01 for merge test below
  await db.query("UPDATE students SET profile_status='published' WHERE id='LS01'");

  // F.17 & F.18: staff merges duplicate student LS04 -> LS01 and duplicate partner LC02 -> LC01
  const studentMerge = await call('/api/final/staff/merge/students', 'staff', { source_id: 'LS04', target_id: 'LS01', reason: 'Same email duplicate' });
  assert.equal(studentMerge.target_id, 'LS01');
  const mergedStudentLookup = await queryStudentDetail(db, 'LS04');
  assert.equal(mergedStudentLookup.status, 200);
  assert.equal(mergedStudentLookup.body.merged, true);
  assert.equal(mergedStudentLookup.body.merged_into_id, 'LS01');
  assert.equal(mergedStudentLookup.body.redirect_url, '/student.html?id=LS01');

  const lc02Id = (await db.query("SELECT id FROM r4_partners WHERE legacy_id='LC02'")).rows[0].id;
  await call('/api/final/staff/merge/partners', 'staff', { source_id: lc02Id, target_id: lc01Id, reason: 'Same normalized domain' });
  const mergedPartnerLookup = await call('/api/r4/public/partners/' + lc02Id, null);
  assert.equal(mergedPartnerLookup.merged, true);
  assert.equal(mergedPartnerLookup.merged_into_id, lc01Id);
  // LCO4 collaboration moved to LC01
  const survivingPartner = await call('/api/r4/public/partners/' + lc01Id, null);
  assert.ok(survivingPartner.collaborations.some((c) => c.title === 'Legacy Brand Event'));

  // F.19: staff reassigns shared project maintainer without erasing contributor history
  const reassigned = await call('/api/final/staff/projects/' + projId + '/reassign-maintainer', 'staff', {
    student_id: ids.other,
    reason: 'Original maintainer graduated and unavailable',
  });
  assert.equal(reassigned.maintainer_id, ids.other);
  const contribs = await db.query('SELECT student_id, state FROM r3_contributors WHERE project_id=$1 ORDER BY student_id', [projId]);
  assert.equal(contribs.rows.length, 2);
  const audit = await db.query("SELECT action FROM r3_audit WHERE project_id=$1 AND action='staff-maintainer-reassigned'", [projId]);
  assert.equal(audit.rows.length, 1);

  // F.37: public project exposes broken/retired demo_status and demo_note
  const pubProj = await call('/api/r3/public/projects/' + projId, null);
  assert.equal(pubProj.project.demo_status, 'unavailable');
  assert.equal(pubProj.project.demo_note, 'Retired WebGL build');

  // F.32: diagnostics sanitizer strips secrets and cookies
  const cleaned = sanitize({ authorization: 'Bearer supersecret', cookie: 'r2_session=abc.def', msg: 'Bearer xyz123 failed' });
  assert.equal(cleaned.authorization, '[redacted]');
  assert.equal(cleaned.cookie, '[redacted]');
  assert.equal(cleaned.msg, 'Bearer [redacted] failed');
});
