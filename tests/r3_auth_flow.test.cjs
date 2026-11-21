'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('R3 reuses the OAuth session and keeps affiliation and profile guards', async t => {
  const origin = 'https://frontend.example';
  const userId = '5f8a78df-38fd-4e49-aea2-a5a8484ba9ca';
  const settings = {
    SKIP_SCHEMA_INIT: '1', R2_SESSION_SECRET: 'local-regression-secret-12345678901234567890',
    FRONTEND_ORIGIN: origin, GITHUB_CLIENT_ID: 'local-client', GITHUB_CLIENT_SECRET: 'local-secret',
    GITHUB_CALLBACK_URL: 'https://api.example/api/auth/github/callback'
  };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const originalLoad = Module._load, originalFetch = global.fetch;
  const modulePath = require.resolve('../backend/r2.js');
  const routes = new Map();
  const router = {use() {}};
  for (const method of ['get', 'post', 'put']) router[method] = (path, ...handlers) => routes.set(method + ' ' + path, handlers);
  let createRouter;
  delete require.cache[modulePath];
  try {
    Module._load = function(request) {
      if (request === 'express') return {Router: () => router};
      return originalLoad.apply(this, arguments);
    };
    createRouter = require(modulePath);
  } finally {Module._load = originalLoad;}
  t.after(() => {
    global.fetch = originalFetch;
    delete require.cache[modulePath];
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  let verified = false, challenge, tokenOK = true;
  const queries = [], upstream = [];
  createRouter({query: async (sql, params) => {
    queries.push({sql, params});
    if (sql === 'SELECT 1') return {rows: []};
    if (sql.startsWith('INSERT INTO r2_accounts')) return {rows: [{user_id: userId}]};
    if (sql.startsWith('SELECT github_login')) return {rows: [{github_login: 'reviewer', email: null, verified_at: verified ? new Date() : null}]};
    if (sql.startsWith('SELECT verified_at')) return {rows: [{verified_at: verified ? new Date() : null}]};
    if (sql.startsWith('SELECT email, code_hash')) return {rows: challenge ? [challenge] : []};
    throw Error('Unexpected SQL: ' + sql);
  }});
  global.fetch = async (url, options) => {
    upstream.push({url, options});
    if (url === 'https://github.com/login/oauth/access_token') return {json: async () => tokenOK ? {access_token: 'test-token'} : {error: 'bad_verification_code'}};
    if (url === 'https://api.github.com/user') return {json: async () => ({id: 123, login: 'reviewer'})};
    throw Error('Unexpected network request');
  };
  async function request(method, path, {query = {}, cookie = '', body = {}, requestOrigin = origin} = {}) {
    const req = {query, body, headers: {cookie}, get: name => name === 'origin' ? requestOrigin : undefined};
    const res = {
      statusCode: 200, cookies: [],
      status(code) {this.statusCode = code; return this;},
      cookie(name, value, options) {this.cookies.push({name, value, options}); return this;},
      clearCookie() {return this;},
      redirect(url) {this.statusCode = 302; this.location = url; return this;},
      send(data) {this.data = data; return this;}, json(data) {this.data = data; return this;}
    };
    for (const handler of routes.get(method + ' ' + path)) {
      let nextCalled = false;
      await handler(req, res, err => {assert.ifError(err); nextCalled = true;});
      if (!nextCalled) break;
    }
    return res;
  }
  async function begin() {
    const start = await request('get', '/auth/github');
    const url = new URL(start.location);
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.searchParams.get('redirect_uri'), settings.GITHUB_CALLBACK_URL);
    assert.equal(url.searchParams.get('scope'), 'read:user');
    const state = url.searchParams.get('state');
    assert.deepEqual(start.cookies[0].options, {httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600000, path: '/api/auth'});
    return {state, cookie: 'r2_oauth_state=' + state};
  }
  let session;
  await t.test('callback sets the signed session and redirects with a reporting marker', async () => {
    const {state, cookie} = await begin();
    const res = await request('get', '/auth/github/callback', {query: {state, code: 'test-code'}, cookie});
    assert.equal(res.location, new URL(settings.GITHUB_CALLBACK_URL).origin + '/profile.html?auth=github');
    const issued = res.cookies.find(c => c.name === 'r2_session');
    assert.deepEqual(issued.options, {httpOnly: true, secure: true, sameSite: 'none', maxAge: 28800000, path: '/'});
    session = 'r2_session=' + issued.value;
    assert.equal(createRouter.getSession({headers: {cookie: session}}), userId);
    assert.equal(JSON.parse(upstream[0].options.body).redirect_uri, settings.GITHUB_CALLBACK_URL);
    assert.equal(queries.filter(q => q.sql.startsWith('INSERT INTO r2_accounts')).length, 1);
  });
  await t.test('me accepts the callback cookie but not a missing or forged cookie', async () => {
    const res = await request('get', '/auth/me', {cookie: session});
    assert.deepEqual(res.data, {authenticated: true, github_login: 'reviewer', email: null, verified: false});
    for (const cookie of ['', session + 'tampered']) {
      const denied = await request('get', '/auth/me', {cookie});
      assert.equal(denied.statusCode, 401);
      assert.deepEqual(denied.data, {authenticated: false});
    }
  });
  await t.test('unverified account cannot access private profile', async () => {
    const res = await request('get', '/profile', {cookie: session});
    assert.equal(res.statusCode, 403);
    assert.match(res.data.error, /Verify your Algoma email/);
  });
  await t.test('missing, mismatched and replayed state cannot create sessions', async () => {
    const {state, cookie} = await begin();
    const count = upstream.length;
    for (const suppliedCookie of ['', 'r2_oauth_state=wrong', cookie]) {
      const res = await request('get', '/auth/github/callback', {query: {state, code: 'test-code'}, cookie: suppliedCookie});
      assert.equal(res.statusCode, 400);
      assert.equal(res.cookies.length, 0);
    }
    assert.equal(upstream.length, count);
  });
  await t.test('GitHub token refusal does not issue a session or redirect as success', async () => {
    const {state, cookie} = await begin();
    tokenOK = false;
    const res = await request('get', '/auth/github/callback', {query: {state, code: 'bad-code'}, cookie});
    tokenOK = true;
    assert.equal(res.statusCode, 401);
    assert.equal(res.cookies.length, 0);
    assert.equal(res.location, undefined);
  });
  await t.test('affiliation requires session, allowed origin and an Algoma address', async () => {
    assert.equal((await request('post', '/affiliation/request')).statusCode, 401);
    assert.equal((await request('post', '/affiliation/request', {cookie: session, requestOrigin: 'https://attacker.example'})).statusCode, 403);
    assert.equal((await request('post', '/affiliation/request', {cookie: session, body: {email: 'test@example.com'}})).statusCode, 400);
  });
  await t.test('expired or missing verification challenge cannot verify an account', async () => {
    for (const value of [undefined, {expires_at: new Date(0), used_at: null, attempts: 0}]) {
      challenge = value;
      const res = await request('post', '/affiliation/verify', {cookie: session, body: {code: '123456'}});
      assert.equal(res.statusCode, 400);
    }
    assert.ok(!queries.some(q => q.sql.startsWith('UPDATE r2_accounts')));
  });
});
