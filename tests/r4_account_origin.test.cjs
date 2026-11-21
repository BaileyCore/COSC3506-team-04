'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../frontend/config.js'), 'utf8');
const frontendOrigin = 'https://cosc3506-team04-frontend.onrender.com';
const accountOrigin = 'https://cosc3506-team-04-ey5d.onrender.com';

function openPage(origin, pathname) {
  const replacements = [];
  const location = {
    origin, pathname, protocol: new URL(origin).protocol,
    search: '?project=test', hash: '#review',
    replace: value => replacements.push(value)
  };
  vm.runInNewContext(source, {window: {location}, URL});
  return replacements;
}

test('signed-in entry points use the session hostname and preserve navigation context', () => {
  for (const pathname of ['/profile.html', '/r3-projects.html', '/r4-staff.html']) {
    assert.deepEqual(openPage(frontendOrigin, pathname), [accountOrigin + pathname + '?project=test#review']);
    assert.deepEqual(openPage(accountOrigin, pathname), []);
  }
});

test('public pages and local development retain their original entry points', () => {
  for (const pathname of ['/', '/student.html', '/r3-project.html', '/r4-partners.html', '/inquiry.html']) {
    assert.deepEqual(openPage(frontendOrigin, pathname), []);
  }
  assert.deepEqual(openPage('http://localhost:8080', '/profile.html'), []);
});
