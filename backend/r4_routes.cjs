const { webUrl, fetchHtml, extractCompany } = require('./r4_import.cjs');
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const str=(v,max=1600)=>typeof v==='string'?v.trim().slice(0,max):'';
const reqText=(v,label,max)=>str(v,max)||(()=>{throw fail(400,label+' is required.');})();
const uuid=v=>{if(!UUID.test(v||''))throw fail(400,'Invalid record ID.');return v;};
const values=(v)=>[...new Set(Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.length<=60):[])].slice(0,30);
const projectCatalog="SELECT id::text AS id,title,'shared' AS kind FROM r3_projects";
const publicProjectCatalog=projectCatalog+" WHERE published UNION ALL SELECT id,title,'legacy' AS kind FROM projects";

function mountR4(app,{pool,getSession,ready,origin,staffGithubIds,readHtml=fetchHtml}) {
  const staffIds=new Set((staffGithubIds||'').split(',').map(x=>x.trim()).filter(x=>/^\d+$/.test(x)));
  const q=(sql,args)=>pool.query(sql,args);
  const rows=async (sql,args)=>(await q(sql,args)).rows;
  const one=async (sql,args)=>(await rows(sql,args))[0];
  function route(method,path,access,fn) {
    app[method]('/api/r4'+path,async (req,res,next)=>{
      try {
        await ready;
        if(method!=='get' && ![origin].flat().includes(req.get('origin'))) throw fail(403,'Request origin is not allowed.');
        let actor=null;
        if(access!=='public'){
          const id=getSession(req);
          if(!id)throw fail(401,'Sign in with GitHub first.');
          actor=await one('SELECT user_id,github_id,verified_at FROM r2_accounts WHERE user_id=$1',[id]);
          if(!actor)throw fail(401,'Sign in with GitHub first.');
          if(access==='staff' && !staffIds.has(actor.github_id))throw fail(403,'Staff access is required.');
          if(access==='student' && !actor.verified_at)throw fail(403,'Verify your Algoma email first.');
        }
        if(access!=='public')res.set('Cache-Control','no-store');
        res.json(await fn(req,actor));
      } catch(e){if(e.status)res.status(e.status).json({error:e.message});else next(e);}
    });
  }
  const admin=(method,path,f)=>route(method,'/staff'+path,'staff',f);
  const pub=(path,f)=>route('get','/public'+path,'public',f);

  admin('get','/queue',async()=>{
    const [requests,partners,collaborations,projects,students]=await Promise.all([
      rows(`SELECT r.*,p.title AS project_title,p.description AS project_description,p.published AS project_published,
        c.name AS company_name,COALESCE((SELECT json_agg(json_build_object('label',COALESCE(s.name,a.github_login,'Student contributor'),'role',x.role))
          FROM r3_contributors x LEFT JOIN r2_accounts a ON a.user_id=x.student_id
          LEFT JOIN students s ON s.id='U'||x.student_id::text
          WHERE x.project_id=p.id AND x.state='accepted'),'[]') AS contributors
        FROM r4_requests r JOIN r3_projects p ON p.id=r.project_id LEFT JOIN r4_partners c ON c.id=r.partner_id
        WHERE r.state='pending' ORDER BY r.created_at`),
      rows('SELECT * FROM r4_partners ORDER BY published,name'),
      rows('SELECT * FROM r4_collaborations ORDER BY period DESC,title'),
      rows(projectCatalog+" UNION ALL SELECT id,title,'legacy' AS kind FROM projects ORDER BY title"),
      rows("SELECT id,name FROM students WHERE profile_status='published' ORDER BY name")
    ]);
    return {requests,partners,collaborations,projects,students};
  });
  admin('post','/import',async req=>{
    let url;
    try {url=webUrl(req.body?.url).href;}catch{throw fail(400,'Enter a public HTTPS website.');}
    try{
      const draft=extractCompany(await readHtml(url),url);
      return one('INSERT INTO r4_partners(name,website,description,sector,location,source_url,imported_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING *',
        [draft.name,draft.website,draft.description,draft.sector,draft.location,draft.source_url]);
    }catch(e){
      if(e.code)console.error('R4 import failed:',e.code);
      throw fail(422,'Could not import this page. Try its final HTTPS URL or create/edit the company manually. Your existing draft was not changed.');
    }
  });
  admin('post','/partners',async req=>{
    const b=req.body||{};
    let website='';
    try{if(str(b.website,2048))website=webUrl(b.website).href;}catch{throw fail(400,'Enter a public HTTPS company website.');}
    const args=[reqText(b.name,'Company name',160),website,str(b.description),str(b.sector,300),str(b.location,240)];
    if(b.id){
      const record=await one('UPDATE r4_partners SET name=$2,website=$3,description=$4,sector=$5,location=$6 WHERE id=$1 RETURNING *',[uuid(b.id),...args]);
      if(!record)throw fail(404,'Company record not found.');
      return record;
    }
    return one('INSERT INTO r4_partners(name,website,description,sector,location) VALUES ($1,$2,$3,$4,$5) RETURNING *',args);
  });
  admin('post','/partners/:id/publish',async req=>{
    if(typeof req.body?.published!=='boolean')throw fail(400,'Choose a publication state.');
    const record=await one('UPDATE r4_partners SET published=$2 WHERE id=$1 RETURNING id,published',[uuid(req.params.id),req.body.published]);
    if(!record)throw fail(404,'Company not found.');
    return record;
  });
  admin('post','/collaborations',async req=>{
    const b=req.body||{}, vis=b.visibility;
    if(!['public','limited','private'].includes(vis)||!['current','past'].includes(b.status))throw fail(400,'Choose a visibility and status.');
    const projects=values(b.project_ids), students=values(b.student_ids);
    const [validProjects,validStudents]=await Promise.all([
      rows('SELECT id FROM ('+projectCatalog+" UNION ALL SELECT id,title,'legacy' AS kind FROM projects) p WHERE id=ANY($1::text[])",[projects]),
      rows("SELECT id FROM students WHERE profile_status='published' AND id=ANY($1::text[])",[students])
    ]);
    if(new Set(validProjects.map(x=>x.id)).size!==projects.length||validStudents.length!==students.length)throw fail(400,'Select existing projects and public students.');
    const summary=vis==='limited'?reqText(b.public_summary,'Anonymized public summary',1600):'';
    const args=[uuid(b.partner_id),reqText(b.title,'Title',160),reqText(b.period,'Year or date range',100),str(b.description),str(b.outcome),b.status,vis,summary,projects,students];
    const result=b.id
      ? await one(`UPDATE r4_collaborations SET title=$2,period=$3,description=$4,outcome=$5,status=$6,visibility=$7,public_summary=$8,project_ids=$9,student_ids=$10 WHERE partner_id=$1 AND id=$11 RETURNING id`,[...args,uuid(b.id)])
      : await one(`INSERT INTO r4_collaborations(partner_id,title,period,description,outcome,status,visibility,public_summary,project_ids,student_ids)
          SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 WHERE EXISTS(SELECT 1 FROM r4_partners WHERE id=$1) RETURNING id`,args);
    if(!result)throw fail(404,'Company or collaboration not found.');
    return result;
  });
  admin('post','/requests/:id/review',async(req,actor)=>{
    const b=req.body||{}, decision=b.decision;
    if(!['approved','rejected'].includes(decision))throw fail(400,'Choose approve or reject.');
    const result=await one(`UPDATE r4_requests SET state=$2,reviewed_by=$3,reviewed_at=now(),
       partner_id=COALESCE($4::uuid,partner_id)
       WHERE id=$1 AND state='pending'
       AND ($2<>'approved' OR kind='verification' OR EXISTS (SELECT 1 FROM r4_partners WHERE id=COALESCE($4::uuid,r4_requests.partner_id) AND published))
       RETURNING id,state`,[uuid(req.params.id),decision,actor.user_id,b.partner_id?uuid(b.partner_id):null]);
    if(!result)throw fail(409,'Request already reviewed, or select a published company before approving.');
    return result;
  });

  async function owned(req,actor) {
    const id=uuid(req.params.id);
    const project=await one('SELECT id,title,maintainer_id FROM r3_projects WHERE id=$1',[id]);
    if(!project||project.maintainer_id!==actor.user_id)throw fail(403,'Only the project maintainer can submit or view these requests.');
    return project;
  }
  route('get','/projects/:id/requests','student',async(req,a)=>{
    const p=await owned(req,a);
    return rows(`SELECT r.kind,r.state,r.suggested_company,c.name AS partner_name FROM r4_requests r
      LEFT JOIN r4_partners c ON r.partner_id=c.id WHERE r.project_id=$1 ORDER BY r.created_at DESC`,[p.id]);
  });
  route('post','/projects/:id/requests','student',async(req,a)=>{
    const p=await owned(req,a),b=req.body||{};
    if(!['verification','partner'].includes(b.kind))throw fail(400,'Choose a request type.');
    const partnerId=b.kind==='partner'&&b.partner_id?uuid(b.partner_id):null;
    const suggestion=b.kind==='partner'&&!partnerId?reqText(b.suggested_company,'Company suggestion',160):'';
    if(partnerId&&!await one('SELECT 1 FROM r4_partners WHERE id=$1 AND published',[partnerId]))throw fail(400,'Select a published company or submit a suggestion.');
    return one('INSERT INTO r4_requests(project_id,requested_by,kind,partner_id,suggested_company,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,state',
      [p.id,a.user_id,b.kind,partnerId,suggestion,reqText(b.note,'Supporting note or relationship explanation',2200)]);
  });

  pub('/partners',()=>rows('SELECT id,name,description,sector,location FROM r4_partners WHERE published ORDER BY name'));
  pub('/partners/:id',async req=>{
    const id=uuid(req.params.id);
    const partner=await one('SELECT id,name,description,website,sector,location FROM r4_partners WHERE id=$1 AND published',[id]);
    if(!partner)throw fail(404,'Published partner not found.');
    const collaborations=await rows(`SELECT id,title,period,description,outcome,status,project_ids,student_ids
      FROM r4_collaborations WHERE partner_id=$1 AND visibility='public' ORDER BY period DESC,title`,[id]);
    const limited=await rows("SELECT public_summary FROM r4_collaborations WHERE partner_id=$1 AND visibility='limited' ORDER BY id",[id]);
    for(const c of collaborations){
      c.projects=await rows('SELECT id,title,kind FROM ('+publicProjectCatalog+') p WHERE id=ANY($1::text[])',[c.project_ids]);
      c.students=await rows("SELECT id,name FROM students WHERE profile_status='published' AND id=ANY($1::text[])",[c.student_ids]);
      delete c.project_ids;delete c.student_ids;
    }
    const verifiedProjects=await rows(`SELECT DISTINCT p.id,p.title,'shared' AS kind FROM r4_requests r
      JOIN r3_projects p ON r.project_id=p.id AND p.published WHERE r.partner_id=$1 AND r.kind='partner' AND r.state='approved' ORDER BY p.title`,[id]);
    return {partner,collaborations,limited,verifiedProjects};
  });
  pub('/projects/:id',async req=>{
    const id=uuid(req.params.id);
    if(!await one('SELECT 1 FROM r3_projects WHERE id=$1 AND published',[id]))throw fail(404,'Published project not found.');
    const verified=!!await one("SELECT 1 FROM r4_requests WHERE project_id=$1 AND kind='verification' AND state='approved'",[id]);
    const partners=await rows(`SELECT DISTINCT p.id,p.name FROM r4_requests r JOIN r4_partners p ON p.id=r.partner_id AND p.published
      WHERE r.project_id=$1 AND r.kind='partner' AND r.state='approved' ORDER BY p.name`,[id]);
    return {verified,partners};
  });
}
module.exports={mountR4};
