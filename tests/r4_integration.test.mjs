import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(new URL('../backend/server.js',import.meta.url));
const express=require('express');
const {mountR4}=require('./../backend/r4_routes.cjs');
const {extractCompany}=require('./../backend/r4_import.cjs');
const given=new URL('../fixtures/r4/',import.meta.url);
const fixtures=JSON.parse(await readFile(new URL('expected_company_imports.json',given),'utf8'));
const htmlFor=file=>readFile(new URL(file,given),'utf8');
test('all course import fixtures produce correct drafts; never act on page content',async()=>{
  const drafts=[];
  for(const [file,expected] of Object.entries(fixtures)){
    const d=extractCompany(await htmlFor(file),'https://fixtures.example.com/'+file);
    drafts.push(d);assert.equal(d.name,expected.name);
    if(expected.location)assert.ok(d.location.includes(expected.location));
    for(const keyword of expected.keywords||[])assert.ok(d.sector.split(', ').includes(keyword));
    assert.ok(!('published' in d)&&!('verified' in d)&&!('role' in d));
  }
  assert.equal(drafts[1].needs_manual_completion,true);
  assert.notEqual(drafts[0].domain,drafts[3].domain);
});
test('R4 staff, student and anonymous HTTP workflow uses real PostgreSQL SQL',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  const schema=(await readFile(new URL('../schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
  await db.exec(schema);await db.exec(schema);
  const ids={staff:'00000000-0000-4000-8000-000000000001',student:'00000000-0000-4000-8000-000000000002',other:'00000000-0000-4000-8000-000000000003',project:'00000000-0000-4000-8000-000000000004',privateProject:'00000000-0000-4000-8000-000000000005'};
  for(const [idx,key] of ['staff','student','other'].entries()){
    await db.query('INSERT INTO r2_accounts(user_id,github_id,github_login,verified_at) VALUES($1,$2,$3,now())',[ids[key],String(idx+1),key]);
  }
  for(const [id,title,published] of [[ids.project,'Public QA Project',true],[ids.privateProject,'PRIVATE_PROJECT',false]]){
    await db.query('INSERT INTO r3_projects(id,maintainer_id,title,published) VALUES($1,$2,$3,$4)',[id,ids.student,title,published]);
  }
  for(const [id,name,pub] of [['S1','Public QA Student','published'],['S2','PRIVATE_STUDENT','draft']]){
    await db.query("INSERT INTO students(id,name,headline,program,status,profile_status) VALUES($1,$2,'Title','Program','student',$3)",[id,name,pub]);
  }
  await db.query("INSERT INTO r3_contributors(project_id,student_id,role,state) VALUES($1,$2,'Developer','accepted')",[ids.project,ids.student]);
  await db.query("INSERT INTO projects(id,title,description) VALUES('P01','Legacy QA Project','Description')");
  const app=express();app.use(express.json());
  mountR4(app,{pool:db,ready:Promise.resolve(),origin:'https://frontend.example.com',staffGithubIds:'1',
    getSession:req=>ids[req.get('x-test-role')]||null,
    readHtml:async url=>{const file=new URL(url).pathname.slice(1);if(!Object.hasOwn(fixtures,file))throw Error('fixture unavailable');return htmlFor(file);}
  });
  app.use((err,req,res,next)=>{res.status(500).json({error:err.message});});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const origin='https://frontend.example.com',base='http://127.0.0.1:'+server.address().port+'/api/r4';
  const call=async(path,actor,body,expected=200,from=origin)=>{
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{origin:from,'x-test-role':actor||'','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const d=await r.json();assert.equal(r.status,expected,path+' '+JSON.stringify(d));return d;
  };
  await call('/staff/queue',null,undefined,401);
  await call('/staff/queue','student',undefined,403);
  await call('/staff/partners','student',{name:'Forbidden'},403);
  await call('/staff/partners','staff',{name:'Wrong origin'},403,'https://wrong.example.com');
  const path='/projects/'+ids.project+'/requests';
  await call(path,'other',{kind:'verification',note:'Not permitted.'},403);
  const verification=await call(path,'student',{kind:'verification',note:'Please check the evidence.',state:'approved'});
  assert.equal(verification.state,'pending');
  assert.equal((await call('/public/projects/'+ids.project)).verified,false);
  const partner=await call('/staff/import','staff',{url:'https://fixtures.example.com/company_normal.html'});
  const partner2=await call('/staff/partners','staff',{name:'Independent studio',website:'https://studio.example.com'});
  assert.equal(partner.name,'North Shore Simulations');assert.equal(partner.published,false);assert.ok(partner.imported_at);
  await call('/public/partners/'+partner.id,null,undefined,404);
  assert.deepEqual(await call('/public/partners'),[]);
  await call('/staff/import','staff',{url:'https://fixtures.example.com/unavailable.html'},422);
  const saved=await call('/staff/partners','staff',{id:partner.id,name:partner.name,website:partner.website,description:'Staff reviewed public description.'});
  assert.equal(saved.source_url,partner.source_url);
  for(const p of [partner,partner2])await call('/staff/partners/'+p.id+'/publish','staff',{published:true});
  const req1=await call(path,'student',{kind:'partner',partner_id:partner.id,note:'Joint prototype.'});
  const req2=await call(path,'student',{kind:'partner',suggested_company:partner2.name,note:'Joint design.'});
  const queue=await call('/staff/queue','staff');
  assert.equal(queue.requests.length,3);assert.equal(queue.requests[0].contributors[0].label,'student');
  await call('/staff/requests/'+verification.id+'/review','student',{decision:'approved'},403);
  await call('/staff/requests/'+verification.id+'/review','staff',{decision:'approved'});
  await call('/staff/requests/'+req1.id+'/review','staff',{decision:'approved'});
  await call('/staff/requests/'+req2.id+'/review','staff',{decision:'approved',partner_id:partner2.id});
  assert.equal((await call('/staff/queue','staff')).requests.length,0);
  const evidence=await call('/public/projects/'+ids.project);
  assert.equal(evidence.verified,true);assert.equal(evidence.partners.length,2);
  const c={partner_id:partner.id,period:'2026',description:'Public collaboration',outcome:'Showcase',status:'current',visibility:'public',title:'Public current collaboration',project_ids:[ids.project,ids.privateProject,'P01'],student_ids:['S1']};
  await call('/staff/collaborations','staff',c);
  await call('/staff/collaborations','staff',{...c,title:'Public past collaboration',period:'2025',status:'past'});
  const privateWork=await call('/staff/collaborations','staff',{...c,title:'SECRET_PRIVATE_TITLE',visibility:'private',outcome:'SECRET_PRIVATE_OUTCOME'});
  const limited=await call('/staff/collaborations','staff',{...c,title:'SECRET_LIMITED_TITLE',visibility:'limited',public_summary:'An anonymized XR workshop.'});
  await db.query("UPDATE students SET profile_status='draft',name='SECRET_UNPUBLISHED_STUDENT' WHERE id='S1'");
  const publicRecord=await call('/public/partners/'+partner.id);
  assert.deepEqual(publicRecord.collaborations.map(x=>x.status),['current','past']);
  assert.equal(publicRecord.collaborations[0].projects.length,2);
  assert.equal(publicRecord.collaborations[0].students.length,0);
  assert.deepEqual(publicRecord.limited,[{public_summary:'An anonymized XR workshop.'}]);
  for(const leak of ['SECRET','PRIVATE_PROJECT',ids.privateProject,privateWork.id,limited.id,'source_url','project_ids','student_ids']) assert.ok(!JSON.stringify(publicRecord).includes(leak),leak);
  assert.equal(publicRecord.verifiedProjects[0].id,ids.project);
  await call('/staff/collaborations','staff',{...c,id:privateWork.id,visibility:'public',student_ids:[]});
  assert.equal((await call('/public/partners/'+partner.id)).collaborations.length,3);
});
