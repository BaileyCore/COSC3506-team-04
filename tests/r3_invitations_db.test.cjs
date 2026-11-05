'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {mountR3} = require('../backend/r3_routes.cjs');

const OWNER = '5f8a78df-38fd-4e49-aea2-a5a8484ba9ca';
const STUDENT = 'affeeedf-38fd-4e49-aea2-a5a8484ba9ca';
const PROJECT = 'b877b2ce-1122-4f91-8a0e-39f93a67ad42';
const ORIGIN = 'https://cosc3506-team04-frontend.onrender.com';

test('invitation responses execute against PostgreSQL with the deployed varchar state column', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const schema = fs.readFileSync(path.join(__dirname, '../backend/r3_schema.sql'), 'utf8');
  // gen_random_uuid is built into PostgreSQL; this test does not use pgcrypto.
  await db.exec(schema.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  await db.query('INSERT INTO r3_projects(id,maintainer_id,title) VALUES($1,$2,$3)', [PROJECT, OWNER, 'Invitation test']);
  await db.query("INSERT INTO r3_contributors(project_id,student_id,role) VALUES($1,$2,'Software Developer')", [PROJECT, STUDENT]);
  const routes = new Map();
  const app = {use() {}};
  for (const method of ['get', 'post', 'put', 'patch']) {
    app[method] = (route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler);
  }
  const pool = {
    query: (sql, params) => db.query(sql, params),
    connect: async () => ({query: (sql, params) => db.query(sql, params), release() {}})
  };
  mountR3(app, {pool, getVerifiedStudentId: async () => STUDENT, studentExists: async () => true, frontendOrigin: ORIGIN});
  async function respond(accept) {
    const response = {statusCode: 200, status(code) {this.statusCode = code; return this;}, json(data) {this.data = data; return this;}};
    let error;
    await routes.get('POST /api/r3/projects/:id/invitations/respond')(
      {params: {id: PROJECT}, body: {accept}, headers: {origin: ORIGIN}}, response, err => {error = err;});
    return {response, error};
  }
  async function relationship() {
    return (await db.query('SELECT state,joined_at FROM r3_contributors WHERE project_id=$1 AND student_id=$2', [PROJECT, STUDENT])).rows[0];
  }
  t.beforeEach(async () => {
    await db.query("UPDATE r3_contributors SET state='pending',joined_at=NULL");
    await db.query('DELETE FROM r3_audit');
  });

  await t.test('accept persists accepted state, join timestamp and audit together', async () => {
    const {response, error} = await respond(true);
    assert.ifError(error);
    assert.deepEqual(response.data, {state: 'accepted'});
    const member = await relationship();
    assert.equal(member.state, 'accepted');
    assert.ok(member.joined_at);
    const audit = await db.query('SELECT action,actor_id,subject_id FROM r3_audit');
    assert.deepEqual(audit.rows, [{action: 'invitation-accepted', actor_id: STUDENT, subject_id: STUDENT}]);
  });
  await t.test('repeating a response returns a conflict without another audit event', async () => {
    assert.ifError((await respond(true)).error);
    const {error} = await respond(true);
    assert.equal(error?.status, 409);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM r3_audit')).rows[0].count, 1);
  });
  await t.test('decline persists declined state and leaves join timestamp empty', async () => {
    const {response, error} = await respond(false);
    assert.ifError(error);
    assert.deepEqual(response.data, {state: 'declined'});
    assert.deepEqual(await relationship(), {state: 'declined', joined_at: null});
    assert.equal((await db.query('SELECT action FROM r3_audit ORDER BY id DESC LIMIT 1')).rows[0].action, 'invitation-declined');
  });
  await t.test('non-boolean response cannot change the relationship', async () => {
    const {error} = await respond('true');
    assert.equal(error?.status, 400);
    assert.equal((await relationship()).state, 'pending');
  });
});
