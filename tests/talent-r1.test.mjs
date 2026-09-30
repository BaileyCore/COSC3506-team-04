import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, initializeTalent } from './helpers/talent-db.mjs';
test('Release 1 public workflow and filter semantics against seeded datastore',async () => {
  const {pool,server,base} = await setup();
  const get = path => fetch(base+'/api'+path);
  const ids = rows => rows.map(s=>s.id);
  try {
    const all = await (await get('/students')).json();
    assert.equal(all.length,17); assert.ok(!ids(all).includes('S16'));
    assert.equal((await get('/students/S16')).status,404);
    assert.equal((await get('/students/unknown')).status,404);
    assert.equal((await get('/projects/unknown')).status,404);
    assert.deepEqual(ids(await (await get('/students?search=aVeRy')).json()),['S01']);
    const headlineMatches = await (await get('/students?search=training%20sim')).json(); assert.ok(ids(headlineMatches).includes('S01'));
    assert.ok(ids(await (await get('/students?search=openxr')).json()).includes('S01'));
    const both = await (await get('/students?skill=Unity&skill=Blender')).json();
    assert.ok(ids(both).includes('S02')); assert.ok(!ids(both).includes('S01')); // P01 uses Blender, but Avery does not claim it.
    for (const s of both) assert.ok(s.skills.includes('Unity') && s.skills.includes('Blender'));
    const query = '/students?availability=internship&availability=contract&status=current&skill=Unity';
    const filtered = await (await get(query)).json();
    for (const s of filtered) assert.ok(s.status==='current' && s.skills.includes('Unity') && s.availability.some(x=>['internship','contract'].includes(x)));
    assert.deepEqual(filtered,await (await get(query)).json());
    const either = await (await get('/students?status=current&status=alumni')).json(); assert.equal(either.length,17);
    assert.equal((await (await get('/students?skill=NotARealSkill')).json()).length,0);
    const avery = await (await get('/students/S01')).json(), maya = await (await get('/students/S02')).json();
    assert.equal(avery.project_count,2); assert.equal(avery.projects.find(p=>p.id==='P01').title,maya.projects.find(p=>p.id==='P01').title);
    const p03 = await (await get('/projects/P03')).json();
    assert.ok(!JSON.stringify(p03).includes('S16')); assert.ok(p03.contributors.some(c=>c.name==='Unpublished contributor'));
    const broken = await (await get('/projects/P07')).json(); assert.equal(broken.links.demo,'https://example.invalid/demo');
    assert.equal((await get('/students')).status,200);
    const post = body => fetch(base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const fields = {company_name:'Example Co',contact_name:'Example Tester',contact_email:'tester@example.com',inquiry_description:'Synthetic inquiry'};
    const response = await post({...fields,source_type:'project',source_id:'P01',source_name:'tampered',source_url:'https://wrong.invalid'});
    assert.equal(response.status,201); const inquiry = await response.json(); assert.equal(inquiry.source_id,'P01'); assert.equal(inquiry.source_name,'Industrial Safety VR Trainer'); assert.ok(inquiry.source_url.endsWith('/?project=P01'));
    assert.equal((await post({...fields,source_type:'student',source_id:'S01'})).status,201);
    assert.equal((await post({...fields,source_type:'student',source_id:'S16'})).status,400);
    assert.equal((await post({...fields,source_type:'student',source_id:'S01',company_name:'   '})).status,400);
    assert.equal((await post({...fields,source_type:'student',source_id:'S01',contact_email:'invalid'})).status,400);
    assert.equal((await pool.query('SELECT id FROM talent_inquiries')).rows.length,2);
    // Existing database edits survive initialization; JSON is seed data, not the runtime source.
    const changed = {...all[0],headline:'Stored database edit'};
    await pool.query('UPDATE talent_students SET data=$1 WHERE id=$2',[JSON.stringify(changed),changed.id]);
    await initializeTalent(pool);
    assert.equal((await (await get('/students/'+changed.id)).json()).headline,'Stored database edit');
  } finally {await new Promise(resolve=>server.close(resolve)); await pool.end();}
});
