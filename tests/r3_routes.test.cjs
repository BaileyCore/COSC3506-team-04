'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mountR3}=require('../backend/r3_routes.cjs');
const A='5f8a78df-38fd-4e49-aea2-a5a8484ba9ca';
const B='affeeedf-38fd-4e49-aea2-a5a8484ba9ca';
const P='b877b2ce-1122-4f91-8a0e-39f93a67ad42';
const FRONTEND='https://cosc3506-team04-frontend.onrender.com';
const baseProject={id:P,title:'Shared XR demo',description:'A sample project',domain:'XR',status:'In progress',version:3,
  maintainer_id:A,published:true,technologies:['JavaScript'],playable_url:null,fallback_url:'https://example.com/fallback.svg'};
function harness({project=baseProject,actor=A,contributorState='accepted',duplicate=false}={}){
  const routes=new Map(), middlewares=[];
  const app={use:(path,fn)=>middlewares.push({path,fn})};
  for(const method of ['get','put','post','patch'])app[method]=(path,fn)=>routes.set(method.toUpperCase()+' '+path,fn);
  const recorded=[];
  const pool={
    async query(raw,params=[]){
      const sql=String(raw).replace(/\s+/g,' ').trim();recorded.push({sql,params});
      if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[],rowCount:0};
      if(sql.startsWith('SELECT * FROM r3_projects WHERE id='))return {rows:project?[project]:[],rowCount:project?1:0};
      if(sql.startsWith('SELECT * FROM r3_contributors WHERE project_id='))return {rows:contributorState?[{student_id:params[1],state:contributorState}]:[],rowCount:contributorState?1:0};
      if(sql.startsWith('SELECT project_id, repo_url FROM r3_repositories'))return {rows:duplicate?[{project_id:P,repo_url:'https://github.com/org/repo'}]:[]};
      if(sql.startsWith('SELECT * FROM r3_projects WHERE'))return {rows:[project]};
      if(sql.startsWith('SELECT repo_url FROM r3_repositories'))return {rows:[{repo_url:'https://github.com/org/repo'}]};
      if(sql.startsWith('SELECT c.student_id,c.role'))return {rows:[
        {student_id:A,role:'Project Manager',state:'accepted',featured:true,display_name:'Creator',contribution_statement:'Design'},
        {student_id:B,role:'XR Developer',state:'pending',featured:true,display_name:null,contribution_statement:'Private draft'}]};
      if(sql.startsWith('UPDATE r3_contributors SET contribution_statement='))return {rows:contributorState==='accepted'?[{student_id:params[1]}]:[],rowCount:contributorState==='accepted'?1:0};
      if(sql.startsWith('INSERT INTO r3_audit'))return {rows:[],rowCount:1};
      throw new Error('Unexpected SQL: '+sql.slice(0,150));
    },
    async connect(){return {query:(...args)=>pool.query(...args),release(){}};}
  };
  mountR3(app,{pool,getVerifiedStudentId:async()=>actor,studentExists:async()=>true,frontendOrigin:FRONTEND});
  async function request(method,path,{headers={},params={},body={},query={}}={}){
    const response={statusCode:200,data:null, status(n){this.statusCode=n;return this;},json(x){this.data=x;return this;}};
    const req={headers:{origin:FRONTEND,...headers},params,body,query};
    const errorMiddleware=middlewares.find(x=>x.fn.length===4);
    const next=(err)=>{if(err && errorMiddleware)errorMiddleware.fn(err,req,response,()=>{});};
    for(const m of middlewares.filter(x=>x.fn.length!==4)){
      if(path.startsWith(m.path)) {await m.fn(req,response,next);if(response.data)return response;}
    }
    const fn=routes.get(method+' '+path);assert.ok(fn,'Route exists: '+method+' '+path);
    await fn(req,response,next);return response;
  }
  return {request,recorded};
}
test('R3 cannot be installed without real verified-session resolver',()=>{
  assert.throws(()=>mountR3({use(){}},{pool:{},studentExists:async()=>true,frontendOrigin:FRONTEND}),/requires/);
});
test('authenticated R2 UUID required for project editor',async()=>{
  const r=await harness({actor:null}).request('GET','/api/r3/me');
  assert.equal(r.statusCode,403);assert.match(r.data.error,/verify/);
  const yes=await harness().request('GET','/api/r3/me');assert.equal(yes.data.student_id,A);
});
test('cross-origin requests blocked for writes',async()=>{
  const h=harness();const r=await h.request('POST','/api/r3/duplicate-check',{headers:{origin:'https://attacker.example'},body:{repositories:[]}});
  assert.equal(r.statusCode,403);
  assert.equal(h.recorded.length,0);
});
test('editing somebody else shared project is denied irrespective of client-submitted IDs',async()=>{
  const h=harness({actor:B});const r=await h.request('PUT','/api/r3/projects/:id',{params:{id:P},body:{version:3,student_id:A,title:'Hijacked'}});
  assert.equal(r.statusCode,403);assert.ok(h.recorded.some(x=>x.sql==='ROLLBACK'));
  assert.ok(!h.recorded.some(x=>x.sql.startsWith('UPDATE r3_projects')));
});
test('stale edits are rejected with 409 and no overwrite',async()=>{
  const h=harness();const r=await h.request('PUT','/api/r3/projects/:id',{params:{id:P},body:{version:2,title:'Stale update'}});
  assert.equal(r.statusCode,409);assert.equal(r.data.current_version,3);
  assert.ok(!h.recorded.some(x=>x.sql.startsWith('UPDATE r3_projects')));
});
test('duplicate repo path returns join-or-view target',async()=>{
  const h=harness({duplicate:true});const r=await h.request('POST','/api/r3/duplicate-check',{body:{repositories:['https://github.com/org/repo.git']}});
  assert.equal(r.statusCode,200);assert.equal(r.data.duplicate,true);assert.equal(r.data.existing_project_id,P);
});
test('only accepted own contributor may change own statement',async()=>{
  const denied=await harness({contributorState:'pending'}).request('PATCH','/api/r3/projects/:id/my-contribution',{
    params:{id:P},body:{contribution_statement:'My work',featured:true}});
  assert.equal(denied.statusCode,403);
  const accepted=await harness({contributorState:'accepted'}).request('PATCH','/api/r3/projects/:id/my-contribution',{
    params:{id:P},body:{contribution_statement:'My work',featured:true}});
  assert.equal(accepted.statusCode,200);assert.equal(accepted.data.saved,true);
});
test('public detail hides pending contributor statement and allows access only when published',async()=>{
  const h=harness();const r=await h.request('GET','/api/r3/public/projects/:id',{params:{id:P}});
  assert.equal(r.statusCode,200);assert.equal(r.data.project.contributors.length,1);
  assert.equal(r.data.project.contributors[0].display_name,'Creator');
  assert.ok(!JSON.stringify(r.data).includes('Private draft'));
  const unpublished=await harness({project:{...baseProject,published:false}}).request('GET','/api/r3/public/projects/:id',{params:{id:P}});
  assert.equal(unpublished.statusCode,404);
});
test('removed or declined participants cannot open unpublished draft',async()=>{
  const h=harness({actor:B,contributorState:'removed'});
  const r=await h.request('GET','/api/r3/projects/:id',{params:{id:P}});
  assert.equal(r.statusCode,403);
});

test('invitee reviews role without reading other personal contribution statements',async()=>{
  const h=harness({actor:B,contributorState:'pending'});
  const r=await h.request('GET','/api/r3/projects/:id',{params:{id:P}});
  assert.equal(r.statusCode,200);assert.equal(r.data.project.invited_role,undefined); // stub has no role, real DB includes it
  assert.deepEqual(r.data.project.contributors,[]);
});
