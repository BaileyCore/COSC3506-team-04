import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(new URL('../backend/server.js', import.meta.url));
const express = require('express');
const createR2Router = require('./r2.js');
const { mountFinal } = require('./final_routes.cjs');
const { importLegacyExport } = require('./final_migration.cjs');
const { queryStudentDetail } = require('./directory_query.cjs');

test('approved legacy claims support private editing and publication at the original public identity', async t => {
  const origin = 'https://local-claim-review.example.test';
  const settings = { SKIP_SCHEMA_INIT: '1', FRONTEND_ORIGIN: origin, R2_SESSION_SECRET: 'isolated-claim-editor-test-secret' };
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec((await readFile(new URL('../schema.sql', import.meta.url), 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  await db.exec(await readFile(new URL('../backend/final_schema.sql', import.meta.url), 'utf8'));
  const pool = {
    query: (sql, params) => db.query(sql, params),
    connect: async () => ({ query: (sql, params) => db.query(sql, params), release() {} }),
  };
  await importLegacyExport(pool, JSON.parse(await readFile(new URL('../fixtures/final/legacy_export.json', import.meta.url), 'utf8')));
  const ids = {
    owner: '10000000-0000-4000-8000-000000000001',
    other: '10000000-0000-4000-8000-000000000002',
    staff: '10000000-0000-4000-8000-000000000003',
  };
  for (const [role, id] of Object.entries(ids)) {
    await db.query('INSERT INTO r2_accounts(user_id,github_id,github_login,email,verified_at) VALUES($1,$2,$3,$4,NOW())',
      [id, role === 'staff' ? '1' : id, role, role + '@algomau.ca']);
  }
  const app = express();
  app.use(express.json());
  app.use('/api', createR2Router(pool));
  mountFinal(app, { pool, getSession: createR2Router.getSession, ready: createR2Router.schemaReady, origin, staffGithubIds: '1' });
  app.use((error, _req, res, _next) => res.status(500).json({ error: 'unexpected server error' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(path, role = 'owner', method = 'GET', body, expected = 200) {
    const payload = Buffer.from(JSON.stringify({ sub: ids[role], exp: Date.now() + 60000 })).toString('base64url');
    const cookie = 'r2_session=' + payload + '.' + createHmac('sha256', settings.R2_SESSION_SECRET).update(payload).digest('base64url');
    const response = await fetch(base + path, {
      method, headers: { origin, cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const selected = '/api/profile?student_id=LS02';
  const action = name => '/api/profile/' + name + '?student_id=LS02';
  const initial = await queryStudentDetail(pool, 'LS02');
  const linksBefore = (await db.query("SELECT * FROM project_contributors WHERE student_id='LS02'")).rows;

  await t.test('ambiguous claim remains blocked until actual staff approval', async () => {
    const claim = await call('/api/final/claims', 'owner', 'POST', { student_id: 'LS02' });
    assert.equal(claim.state, 'pending');
    await call(selected, 'owner', 'GET', undefined, 403);
    await call(`/api/final/staff/claims/${claim.id}/review`, 'staff', 'POST', { decision: 'approved', decision_note: 'Synthetic authorized reviewer claim' });
    const editor = await call(selected);
    assert.equal(editor.student_id, 'LS02');
    assert.equal(editor.profile.name, 'Daniel Kim');
    assert.equal(editor.published, true);
    assert.ok(editor.owned_profiles.some(p => p.id === 'LS02'));
    assert.equal('legacy_email' in editor.profile, false);
  });

  const draft = { name: 'Daniel Kim Updated', headline: 'Alumni designer', program: 'Computer Science', status: 'alumni', availability: ['full-time'], availability_state: 'showcase', show_links: false, links: { Portfolio: 'https://private-draft.example.test' }, skills: [] };
  await t.test('private drafts stay separate and another account cannot read or change the claimed profile', async () => {
    await call(selected, 'owner', 'PUT', draft);
    assert.equal((await call(selected)).profile.name, draft.name);
    assert.equal((await queryStudentDetail(pool, 'LS02')).body.name, initial.body.name);
    assert.equal((await call('/api/profile')).profile.name, undefined);
    await call(selected, 'other', 'GET', undefined, 403);
    await call(selected, 'other', 'PUT', draft, 403);
    await call(action('publish'), 'other', 'POST', {}, 403);
    await call(action('unpublish'), 'other', 'POST', {}, 403);
    await call('/api/final/profile/retire', 'other', 'POST', { student_id: 'LS02' }, 403);
    await call('/api/final/profile/reconfirm-availability', 'other', 'POST', { student_id: 'LS02' }, 403);
  });

  await t.test('publication preserves stable ID, contributor links and affiliation verification', async () => {
    const publication = await call(action('publish'), 'owner', 'POST', {});
    assert.equal(publication.url, '/student.html?id=LS02');
    const publicProfile = (await queryStudentDetail(pool, 'LS02')).body;
    assert.equal(publicProfile.name, draft.name);
    assert.equal(publicProfile.status, 'alumni');
    assert.deepEqual(publicProfile.links, {});
    assert.deepEqual((await db.query("SELECT * FROM project_contributors WHERE student_id='LS02'")).rows, linksBefore);
    assert.equal((await db.query('SELECT id FROM students WHERE id=$1', ['U' + ids.owner])).rows.length, 0);
    assert.ok((await db.query('SELECT verified_at FROM r2_accounts WHERE user_id=$1', [ids.owner])).rows[0].verified_at);
    await call('/api/final/profile/reconfirm-availability', 'owner', 'POST', { student_id: 'LS02' });
    assert.equal((await call(selected)).profile.availability_state, 'active');
  });

  await t.test('unpublish and retirement apply to selected legacy record and preserve shared history', async () => {
    await call(action('unpublish'), 'owner', 'POST', {});
    assert.equal((await queryStudentDetail(pool, 'LS02')).status, 404);
    assert.equal((await call(selected)).published, false);
    await call(action('publish'), 'owner', 'POST', {});
    await call('/api/final/profile/retire', 'owner', 'POST', { student_id: 'LS02' });
    assert.equal((await db.query("SELECT profile_status FROM students WHERE id='LS02'")).rows[0].profile_status, 'retired');
    assert.deepEqual((await db.query("SELECT * FROM project_contributors WHERE student_id='LS02'")).rows, linksBefore);
    await call(action('publish'), 'owner', 'POST', {});
  });

  await t.test('staff reassignment revokes old author and never transfers that author\'s private draft', async () => {
    await call(selected, 'owner', 'PUT', { ...draft, biography: 'Private unsaved-to-public material', show_links: false });
    await call('/api/final/staff/profiles/LS02/reassign', 'staff', 'POST', { user_id: ids.other });
    await call(selected, 'owner', 'GET', undefined, 403);
    await call(selected, 'owner', 'PUT', draft, 403);
    const nextOwner = await call(selected, 'other');
    assert.notEqual(nextOwner.profile.biography, 'Private unsaved-to-public material');
    assert.equal(nextOwner.profile.links.Portfolio, undefined);
  });
});
