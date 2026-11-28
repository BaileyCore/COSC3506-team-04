'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function profile({search = '', status = 401, data = {authenticated: false}, networkError = false} = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {hidden: true, value: '', textContent: '', className: '', dataset: {}, replaceChildren() {}});
    return nodes.get(id);
  };
  const requests = [];
  const context = vm.createContext({
    window: {API_BASE_URL: 'https://api.example'}, location: {search}, URLSearchParams,
    document: {getElementById: node, querySelectorAll: () => []},
    fetch: async (url, options) => {
      requests.push({url, options});
      if (networkError) throw new TypeError('Failed to fetch');
      if (url.endsWith('/skills')) return {ok: true, json: async () => []};
      if (url.endsWith('/profile')) return {ok: true, json: async () => ({profile: {}, published: false})};
      return {ok: status === 200, status, json: async () => data};
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../frontend/profile.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return {node, requests};
}

test('ordinary signed-out visit offers GitHub sign-in without an error', async () => {
  const {node, requests} = await profile();
  assert.equal(node('signedOut').hidden, false);
  assert.equal(node('signIn').href, 'https://api.example/api/auth/github');
  assert.equal(node('notice').className, 'status');
  assert.equal(requests[0].options.credentials, 'include');
});

test('OAuth return with no usable session reports failure and keeps retry visible', async () => {
  const {node} = await profile({search: '?auth=github'});
  assert.equal(node('signedOut').hidden, false);
  assert.equal(node('verification').hidden, true);
  assert.equal(node('editor').hidden, true);
  assert.match(node('notice').className, /error/);
  assert.match(node('notice').textContent, /session/i);
});

test('network or CORS failure offers retry and an actionable error', async () => {
  const {node} = await profile({networkError: true});
  assert.equal(node('signedOut').hidden, false);
  assert.equal(node('verification').hidden, true);
  assert.equal(node('editor').hidden, true);
  assert.match(node('notice').textContent, /reach|connection/i);
});

test('server error mentioning sign-in is not mistaken for HTTP 401', async () => {
  const {node} = await profile({status: 503, data: {error: 'Sign in service unavailable'}});
  assert.match(node('notice').className, /error/);
  assert.match(node('notice').textContent, /unavailable/);
  assert.equal(node('signedOut').hidden, false);
});

test('authenticated unverified account sees Algoma verification', async () => {
  const {node} = await profile({status: 200, data: {authenticated: true, verified: false, github_login: 'reviewer'}});
  assert.equal(node('signedOut').hidden, true);
  assert.equal(node('verification').hidden, false);
  assert.equal(node('editor').hidden, true);
});

test('verified account reaches the editor and callback marker grants no access', async () => {
  const {node} = await profile({search: '?auth=github', status: 200, data: {authenticated: true, verified: true, email: 'test@algomau.ca'}});
  assert.equal(node('signedOut').hidden, true);
  assert.equal(node('verification').hidden, true);
  assert.equal(node('editor').hidden, false);
});
