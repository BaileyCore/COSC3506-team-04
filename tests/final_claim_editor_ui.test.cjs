'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('claim editor selection keeps save, publish, unpublish and retirement on the selected portfolio', async () => {
  const ownId = 'U10000000-0000-4000-8000-000000000001';
  const nodes = new Map(), requests = [];
  const element = tag => ({
    tag, children: [], value: '', hidden: false, disabled: false, textContent: '', className: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    add(option) { this.children.push(option); },
    scrollIntoView() {},
  });
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, element(id));
    return nodes.get(id);
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const editorData = id => ({
    student_id: id, published: true, owned_profiles: [{ id: 'LS02', name: 'Daniel Kim' }],
    profile: { name: id === 'LS02' ? 'Daniel Kim' : 'Independent account draft', headline: 'Designer', program: 'CS', links: {}, skills: [] },
  });
  const context = vm.createContext({
    window: { API_BASE_URL: 'https://api.example' }, location: { search: '' }, URLSearchParams,
    Option: function (label, value) { this.label = label; this.value = value; },
    confirm: () => true,
    document: {
      getElementById: node, createElement: element,
      querySelectorAll: selector => selector === '#editor button' ? ['save', 'publish', 'unpublish', 'retire'].map(node) : [],
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const path = new URL(url).pathname;
      const response = data => ({ ok: true, status: 200, json: async () => data });
      if (path.endsWith('/auth/me')) return response({ authenticated: true, verified: true, email: 'synthetic@algomau.ca' });
      if (path.endsWith('/skills') || path.endsWith('/claimable')) return response([]);
      if (path.endsWith('/claims/mine')) return response([{ student_id: 'LS02', student_name: 'Daniel Kim', state: 'approved' }]);
      if (path === '/api/profile' && !options.method) return response(editorData(new URL(url).searchParams.get('student_id') || ownId));
      if (path.endsWith('/publish')) return response({ ok: true, url: '/student.html?id=LS02' });
      return response({ ok: true });
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../frontend/profile.js'), 'utf8'), context);
  await flush();
  assert.equal(node('name').value, 'Independent account draft');
  const editClaim = node('myClaims').children.find(c => c.tag === 'button');
  assert.ok(editClaim, 'An approved claim must expose an edit action');
  editClaim.onclick();
  await flush();
  assert.equal(node('name').value, 'Daniel Kim');
  assert.equal(node('profileTarget').value, 'LS02');
  assert.equal(node('profileTarget').disabled, false);
  node('name').value = 'Edited imported name';
  await node('save').onclick();
  await node('publish').onclick();
  await node('unpublish').onclick();
  await node('retire').onclick();
  const writes = requests.filter(r => r.options.method && new URL(r.url).pathname.startsWith('/api/profile'));
  assert.ok(writes.some(r => r.options.method === 'PUT' && JSON.parse(r.options.body).name === 'Edited imported name'));
  assert.ok(writes.some(r => new URL(r.url).pathname.endsWith('/publish')));
  assert.ok(writes.some(r => new URL(r.url).pathname.endsWith('/unpublish')));
  for (const request of writes) assert.equal(new URL(request.url).searchParams.get('student_id'), 'LS02');
  const retirement = requests.find(r => new URL(r.url).pathname.endsWith('/final/profile/retire'));
  assert.equal(JSON.parse(retirement.options.body).student_id, 'LS02');
  node('profileTarget').value = ownId;
  node('profileTarget').onchange();
  await flush();
  assert.equal(node('name').value, 'Independent account draft');
});
