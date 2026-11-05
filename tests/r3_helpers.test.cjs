'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ROLES,isUuid,publicStudentId,githubRepo,httpsUrl,projectPayload}=require('../backend/r3_helpers.cjs');
const valid='5f8a78df-38fd-4e49-aea2-a5a8484ba9ca';
test('standard roles match supplied fixture',()=>{assert.equal(ROLES.length,12);assert.ok(ROLES.includes('XR Developer'));});
test('public UUIDs map to R2 internal UUIDs',()=>{assert.ok(isUuid(valid));assert.equal(publicStudentId('U'+valid),valid);assert.equal(publicStudentId('other'),null);});
test('github repo normalizes case and .git extension',()=>{
  assert.equal(githubRepo('https://github.com/Example-Org/Demo.git').key,'example-org/demo');
  assert.equal(githubRepo('https://github.com/Example-Org/Demo/').url,'https://github.com/Example-Org/Demo');
  assert.equal(githubRepo('https://evil.example/owner/repo'),null);
  assert.equal(githubRepo('https://github.com/owner/repo/tree/main'),null);
});
test('unsafe schemes and auth-host URLs rejected',()=>{
  assert.equal(httpsUrl('javascript:alert(1)'),false);
  assert.equal(httpsUrl('http://example.org'),false);
  assert.equal(httpsUrl('https://user:pw@example.com'),false);
  assert.match(httpsUrl('https://example.org/demo'),/^https:/);
});
test('project input validates and makes repo independent',()=>{
  const p=projectPayload({title:'  XR Anatomy  ',technologies:['JS','JS','WebGL']});
  assert.equal(p.title,'XR Anatomy');assert.deepEqual(p.technologies,['JS','WebGL']);
  assert.equal(p.playable_url,null);
  assert.throws(()=>projectPayload({title:'   '}),/title/);
  assert.throws(()=>projectPayload({title:'Test',playable_url:'data:text/html,x'}),/HTTPS/);
});
