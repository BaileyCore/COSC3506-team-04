'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
function loadSessionResolver(){
  const orig=Module._load;
  try {
    Module._load=function(request,parent,isMain){
      if(request==='express')return {Router:()=>({})};
      return orig.apply(this,arguments);
    };
    return require('../backend/r2.js').getSession;
  }finally{Module._load=orig;}
}
test('Release 3 can reuse the original R2 HMAC session and rejects a forged signature',()=>{
  const prev=process.env.R2_SESSION_SECRET;
  process.env.R2_SESSION_SECRET='a-long-test-secret-for-local-only-123456';
  try{
    const getSession=loadSessionResolver();
    const user='5f8a78df-38fd-4e49-aea2-a5a8484ba9ca';
    const payload=Buffer.from(JSON.stringify({sub:user,exp:Date.now()+60_000})).toString('base64url');
    const signature=crypto.createHmac('sha256',process.env.R2_SESSION_SECRET).update(payload).digest('base64url');
    assert.equal(getSession({headers:{cookie:'r2_session='+payload+'.'+signature}}),user);
    assert.equal(getSession({headers:{cookie:'r2_session='+payload+'.FAKESIGNATURE'}}),null);
    const expired=Buffer.from(JSON.stringify({sub:user,exp:Date.now()-60_000})).toString('base64url');
    const expSig=crypto.createHmac('sha256',process.env.R2_SESSION_SECRET).update(expired).digest('base64url');
    assert.equal(getSession({headers:{cookie:'r2_session='+expired+'.'+expSig}}),null);
  }finally{
    if(prev===undefined)delete process.env.R2_SESSION_SECRET;
    else process.env.R2_SESSION_SECRET=prev;
  }
});
test('R3 schema is additive and bundled with the existing automatic initialization',()=>{
  const schema=fs.readFileSync(path.join(base,'schema.sql'),'utf8');
  const migration=fs.readFileSync(path.join(base,'backend/r3_schema.sql'),'utf8');
  for(const table of ['r3_projects','r3_repositories','r3_contributors','r3_join_requests','r3_audit']){
    assert.match(migration,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\b'));
    assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS '+table));
  }
  assert.doesNotMatch(migration,/\b(drop|truncate)\s+table\b/i);
});
test('R2 frontend build explicitly includes all R3 public assets',()=>{
  const build=fs.readFileSync(path.join(base,'frontend/build.mjs'),'utf8');
  for(const name of ['r3-projects.html','r3-project.html','r3.js','r3-public.js','r3-profile-projects.js','r3.css','r3-working-demo.html','fallback.svg']){
    assert.ok(build.includes('"'+name+'"'),name+' included');
    assert.ok(fs.existsSync(path.join(base,'frontend',name)),name+' exists');
  }
});
