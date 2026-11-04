/* Public smoke tests. Does NOT replace three-account workflow and DB checks.
 * Example: node tests/r3_smoke.mjs https://BACKEND.onrender.com https://FRONTEND.onrender.com PROJECT_UUID STUDENT_UUID
 */
const [backend,frontend,projectId,studentId]=process.argv.slice(2);
if(!backend||!frontend||!projectId||!studentId){console.error('Usage: node tests/r3_smoke.mjs BACKEND FRONTEND PROJECT_UUID STUDENT_UUID');process.exit(2);}
let failed=0;
async function check(name,url,verify){
  try{const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(15000)});
    const body=await r.text();if(!r.ok)throw Error(`HTTP ${r.status}`);
    await verify?.(body);console.log(`PASS: ${name}`);
  }catch(e){failed++;console.log(`FAIL: ${name}: ${e.message}`);}
}
await check('Backend health',`${backend}/api/health`,text=>{if(!text.includes('"ok"'))throw Error('No health status');});
await check('12 standardized roles',`${backend}/api/r3/roles`,text=>{if(JSON.parse(text).roles.length!==12)throw Error('Expected 12 roles');});
await check('R3 editor page',`${frontend}/r3-projects.html`,text=>{if(!text.includes('Add Project'))throw Error('Missing editor');});
await check('R3 public project page',`${frontend}/r3-project.html?id=${encodeURIComponent(projectId)}`,text=>{if(!text.includes('Demo and source evidence'))throw Error('Missing public page');});
await check('Public project API',`${backend}/api/r3/public/projects/${encodeURIComponent(projectId)}`,text=>{const p=JSON.parse(text).project;if(!p.published)throw Error('Not published');if(p.contributors.filter(c=>c.state==='accepted').length<2)throw Error('Less than two accepted contributors');if(!p.fallback_url)throw Error('Missing fallback image');});
await check('Public student profile references shared project',`${backend}/api/r3/public/students/${encodeURIComponent(studentId)}/projects`,text=>{if(!JSON.parse(text).projects.some(p=>p.id===projectId))throw Error('Not listed on this public student profile');});
console.log(failed===0?'PUBLIC CHECKS: PASS':'PUBLIC CHECKS: FAIL');process.exit(failed?1:0);
