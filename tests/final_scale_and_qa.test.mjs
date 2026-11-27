import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(new URL('../backend/server.js', import.meta.url));
const express = require('express');
const { mountR4 } = require('./../backend/r4_routes.cjs');
const { extractCompany } = require('./../backend/r4_import.cjs');
const { importLegacyExport } = require('./../backend/final_migration.cjs');
const { queryStudentsDirectory } = require('./../backend/directory_query.cjs');

test('F.27-F.28: scale_fixture.json (220 students, 110 projects) uses same import path and keeps directory first load bounded', async (t) => {
  const db20 = new PGlite();
  const db220 = new PGlite();
  t.after(() => Promise.all([db20.close(), db220.close()]));
  const schema = (await readFile(new URL('../schema.sql', import.meta.url), 'utf8'))
    .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
  await db20.exec(schema);
  await db220.exec(schema);

  const scale = JSON.parse(await readFile(new URL('../fixtures/final/scale_fixture.json', import.meta.url), 'utf8'));
  await importLegacyExport(db20, { students: scale.students.slice(0, 20), projects: scale.projects.slice(0, 10), companies: [] }, { fixtureName: 'scale_20.json' });
  const scaleReport = await importLegacyExport(db220, scale, { fixtureName: 'scale_fixture.json' });

  assert.equal(scaleReport.source_counts.students, 220);
  assert.equal(scaleReport.source_counts.projects, 110);
  assert.equal(scaleReport.source_counts.companies, 25);

  const page1Small = await queryStudentsDirectory(db20, { page: 1, limit: 20 });
  const page1Scale = await queryStudentsDirectory(db220, { page: 1, limit: 20 });

  assert.equal(page1Scale.students.length, 20);
  assert.equal(page1Scale.total, 208); // 208 published, 12 unpublished excluded
  assert.equal(page1Scale.total_pages, 11);

  const bytes20 = Buffer.byteLength(JSON.stringify(page1Small), 'utf8');
  const bytes220 = Buffer.byteLength(JSON.stringify(page1Scale), 'utf8');
  // First-load payload over 220 students stays bounded (~same order as 20 students, well under 2x)
  assert.ok(bytes220 < bytes20 * 2, `Expected bounded payload: 20=${bytes20}B, 220=${bytes220}B`);
  // F.20: no private fields leaked
  assert.equal('legacy_email' in page1Scale.students[0], false);
  assert.equal('claimed_by_user_id' in page1Scale.students[0], false);
});

test('R4 QA Issues #10, #11, #12, #13: duplicate pending blocked, public collaboration lookup verified, keywords cleaned, rejection reason persisted', async (t) => {
  // Issue #12: keyword extraction strips trailing period and deduplicates
  const normalHtml = await readFile(new URL('../fixtures/r4/company_normal.html', import.meta.url), 'utf8');
  const extracted = extractCompany(normalHtml, 'https://fixtures.example.com/company_normal.html');
  assert.equal(extracted.sector.includes('training.'), false, 'Stray period should be stripped: ' + extracted.sector);

  const db = new PGlite();
  t.after(() => db.close());
  const schema = (await readFile(new URL('../schema.sql', import.meta.url), 'utf8'))
    .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
  await db.exec(schema);

  const staffId = '00000000-0000-4000-8000-000000000001';
  const studentId = '00000000-0000-4000-8000-000000000002';
  const projectId = '00000000-0000-4000-8000-000000000004';
  await db.query("INSERT INTO r2_accounts(user_id,github_id,github_login,verified_at) VALUES($1,'1','staff',now()),($2,'2','stu',now())", [staffId, studentId]);
  await db.query("INSERT INTO r3_projects(id,maintainer_id,title,published) VALUES($1,$2,'QA Project',true)", [projectId, studentId]);

  const origin = 'https://frontend.example.com';
  const app = express();
  app.use(express.json());
  mountR4(app, {
    pool: db,
    ready: Promise.resolve(),
    origin,
    staffGithubIds: '1',
    getSession: (req) => ({ staff: staffId, student: studentId }[req.get('x-test-role')] || null),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port + '/api/r4';

  const call = async (path, actor, body, expected = 200) => {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { origin, 'x-test-role': actor || '', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json();
    assert.equal(r.status, expected, `${path}: ${JSON.stringify(d)}`);
    return d;
  };

  const partner = await call('/staff/partners', 'staff', { name: 'North Shore Simulations', website: 'https://northshore.example.test' });
  await call('/staff/partners/' + partner.id + '/publish', 'staff', { published: true });

  // Issue #10: submitting same partner request twice while pending returns 409
  const req1 = await call('/projects/' + projectId + '/requests', 'student', { kind: 'partner', partner_id: partner.id, note: 'First request' });
  await call('/projects/' + projectId + '/requests', 'student', { kind: 'partner', partner_id: partner.id, note: 'Duplicate request' }, 409);

  // Issue #13: staff rejects with a reason and student sees decision_note
  await call('/staff/requests/' + req1.id + '/review', 'staff', {
    decision: 'rejected',
    decision_note: 'Please attach a supervisor confirmation email and resubmit.',
  });
  const studentReqs = await call('/projects/' + projectId + '/requests', 'student');
  assert.equal(studentReqs[0].state, 'rejected');
  assert.equal(studentReqs[0].decision_note, 'Please attach a supervisor confirmation email and resubmit.');

  // Issue #11: public collaboration lookup returns canonical record for public only, 404 for private/limited
  const pubCol = await call('/staff/collaborations', 'staff', {
    partner_id: partner.id, title: 'Public XR Lab', period: '2026', status: 'current', visibility: 'public',
  });
  const privCol = await call('/staff/collaborations', 'staff', {
    partner_id: partner.id, title: 'Secret NDA', period: '2026', status: 'current', visibility: 'private',
  });
  const verifiedPub = await call('/public/collaborations/' + pubCol.id, null);
  assert.equal(verifiedPub.title, 'Public XR Lab');
  assert.equal(verifiedPub.partner_name, 'North Shore Simulations');
  await call('/public/collaborations/' + privCol.id, null, undefined, 404);
});
