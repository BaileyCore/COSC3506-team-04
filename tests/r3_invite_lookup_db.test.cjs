'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
const {mountR3} = require('../backend/r3_routes.cjs');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const OWNER=uuid(1), PROJECT=uuid(100), ORIGIN='https://frontend.example';

test('invitation name lookup and existing invite endpoint use disposable PostgreSQL data', async t => {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(fs.readFileSync(require.resolve('../schema.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  async function student(n,name,{published=true,verified=true,account=true,program='Computing',headline='Public headline'}={}){
    if(account)await db.query('INSERT INTO r2_accounts(user_id,github_id,github_login,email,verified_at) VALUES($1,$2,$2,$3,$4)',
      [uuid(n),String(n),`private${n}@algomau.ca`,verified?new Date():null]);
    await db.query("INSERT INTO students(id,name,headline,program,status,profile_status) VALUES($1,$2,$3,$4,'current',$5)",
      ['U'+uuid(n),name,headline,program,published?'published':'draft']);
    if(account)await db.query('INSERT INTO r2_profiles(user_id,profile) VALUES($1,$2::jsonb)',[uuid(n),JSON.stringify({name:'Secret draft name',university_number:'1234567'})]);
  }
  await student(1,'Alice Maintainer');
  await student(2,'Alice Smith',{program:'Computer Science'});
  await student(3,'Alice Smith',{program:'Business',headline:'Designer'});
  await student(4,'Alice Private',{published:false});
  await student(5,'Alice Unverified',{verified:false});
  await student(6,'Alice Legacy',{account:false});
  await student(7,'Alice Accepted');
  await student(8,'Other Person',{headline:'Alice skills expert'});
  await student(9,'Percent %_ Name');
  await db.query('INSERT INTO r3_projects(id,maintainer_id,title) VALUES($1,$2,$3)',[PROJECT,OWNER,'Disposable project']);
  await db.query("INSERT INTO r3_contributors(project_id,student_id,role,state) VALUES($1,$2,'QA/Tester','accepted')",[PROJECT,uuid(7)]);
  const routes=new Map(), app={use(){}};
  for(const method of ['get','post','put','patch'])app[method]=(path,fn)=>routes.set(method+' '+path,fn);
  let actor=OWNER;
  const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  mountR3(app,{pool,frontendOrigin:ORIGIN,
    getVerifiedStudentId:async()=>actor&&(await db.query('SELECT user_id FROM r2_accounts WHERE user_id=$1 AND verified_at IS NOT NULL',[actor])).rows[0]?.user_id,
    studentExists:async target=>(await db.query('SELECT 1 FROM r2_accounts WHERE user_id=$1 AND verified_at IS NOT NULL',[target])).rows.length>0});
  async function request(method,route,{q='liCe',body={},project=PROJECT}={}){
    const response={statusCode:200,status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};
    let error;
    await routes.get(method+' /api/r3/projects/:id/'+route)({params:{id:project},query:{q},body,headers:{origin:ORIGIN}},response,e=>{error=e;});
    return {response,error};
  }
  await t.test('partial name matching is case insensitive and keeps same names with distinct public IDs',async()=>{
    const {response,error}=await request('get','invitees');assert.ifError(error);
    assert.deepEqual(response.data.students,[
      {id:'U'+uuid(2),name:'Alice Smith',program:'Computer Science',headline:'Public headline'},
      {id:'U'+uuid(3),name:'Alice Smith',program:'Business',headline:'Designer'}]);
    assert.doesNotMatch(JSON.stringify(response.data),/private\d@|Secret draft|1234567|email|university_number/);
  });
  await t.test('private, unverified, legacy, maintainer and accepted profiles are excluded; headline is not searched',async()=>{
    assert.equal((await request('get','invitees',{q:'Alice'})).response.data.students.length,2);
    assert.deepEqual((await request('get','invitees',{q:'expert'})).response.data.students,[]);
    assert.deepEqual((await request('get','invitees',{q:'Secret'})).response.data.students,[]);
  });
  await t.test('literal wildcard characters cannot broaden search and result count is bounded',async()=>{
    assert.deepEqual((await request('get','invitees',{q:'%_'})).response.data.students.map(s=>s.id),['U'+uuid(9)]);
    for(let n=20;n<31;n++)await student(n,'Bounded Match '+n);
    assert.equal((await request('get','invitees',{q:'Bounded'})).response.data.students.length,8);
    for(const q of ['', 'x', 'x'.repeat(101), ['Alice'], "' OR true --"]){
      const {response,error}=await request('get','invitees',{q});
      if(typeof q!=='string'||q.length<2||q.length>100)assert.equal(error?.status,400);
      else {assert.ifError(error);assert.deepEqual(response.data.students,[]);}
    }
  });
  await t.test('only a verified maintainer can look up invitees',async()=>{
    for(const denied of [null,uuid(5),uuid(2)]){
      actor=denied;assert.equal((await request('get','invitees')).error?.status,403);
    }
    actor=OWNER;
    assert.equal((await request('get','invitees',{project:uuid(999)})).error?.status,404);
    assert.equal((await request('get','invitees',{project:'invalid'})).error?.status,400);
  });
  await t.test('selected public ID invites exactly the intended namesake through the unchanged endpoint',async()=>{
    const {response,error}=await request('post','invite',{body:{student_id:'U'+uuid(3),role:'QA/Tester'}});
    assert.ifError(error);assert.equal(response.statusCode,201);
    assert.equal((await db.query('SELECT role FROM r3_contributors WHERE project_id=$1 AND student_id=$2',[PROJECT,uuid(3)])).rows[0].role,'QA/Tester');
    assert.equal((await db.query('SELECT 1 FROM r3_contributors WHERE project_id=$1 AND student_id=$2',[PROJECT,uuid(2)])).rows.length,0);
  });
  await t.test('public ID fallback invites verified unpublished account but rejects ineligible IDs',async()=>{
    assert.ifError((await request('post','invite',{body:{student_id:'U'+uuid(4),role:'Backend Developer'}})).error);
    for(const n of [5,6])assert.equal((await request('post','invite',{body:{student_id:'U'+uuid(n),role:'QA/Tester'}})).error?.status,404);
    assert.equal((await request('post','invite',{body:{student_id:'1234567',role:'QA/Tester'}})).error?.status,400);
    actor=uuid(2);
    assert.equal((await request('post','invite',{body:{student_id:'U'+uuid(4),role:'QA/Tester'}})).error?.status,403);
    actor=OWNER;
  });
});
