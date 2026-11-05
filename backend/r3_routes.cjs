'use strict';
/**
 * Additive R3 Express routes. REQUIRE the real R2 session and verified-email guard.
 * mountR3(app, {pool, getVerifiedStudentId, studentExists});
 * No auth bypass, synthetic accounts, or secrets are provided by this module.
 */
const {ROLES,isUuid,publicStudentId,githubRepo,projectPayload} = require('./r3_helpers.cjs');

function mountR3(app, {pool,getVerifiedStudentId,studentExists,frontendOrigin}) {
  if (!app || !pool || typeof getVerifiedStudentId !== 'function' || typeof studentExists !== 'function' || !frontendOrigin) {
    throw new Error('R3 requires Express app, PostgreSQL pool, R2 verified-session resolver, existing-student lookup, and frontendOrigin');
  }
  app.use('/api/r3', (req,res,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin !== frontendOrigin)
      return res.status(403).json({error:'Request origin is not allowed'});
    next();
  });
  const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
  const fail = (status, message, extra={}) => Object.assign(new Error(message), {status, extra});
  const id = req => { if (!isUuid(req.params.id)) throw fail(400,'Invalid project ID'); return req.params.id; };
  const tx = async fn => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
    catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  };
  const me = async req => {
    const found = await getVerifiedStudentId(req);
    const userId = typeof found === 'string' ? found : found?.id;
    if (!isUuid(userId)) throw fail(403,'Sign in and verify an approved student email first');
    return userId;
  };
  const getProject = async (db, projectId, lock=false) => {
    const {rows} = await db.query(`SELECT * FROM r3_projects WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [projectId]);
    if (!rows.length) throw fail(404,'Project not found');
    return rows[0];
  };
  const requireMaintainer = (p, userId) => { if (p.maintainer_id !== userId) throw fail(403,'Only the current maintainer can edit shared project fields'); };
  const contributor = async (db, projectId, studentId) => {
    const {rows} = await db.query('SELECT * FROM r3_contributors WHERE project_id=$1 AND student_id=$2',[projectId,studentId]);
    return rows[0];
  };
  const audit = (db, projectId, actor, action, subject=null, data={}) => db.query(
    'INSERT INTO r3_audit(project_id,actor_id,subject_id,action,data) VALUES($1,$2,$3,$4,$5::jsonb)',
    [projectId,actor,subject,action,JSON.stringify(data)]);
  const details = async (db, projectId) => {
    const [p, r, c] = await Promise.all([
      db.query('SELECT * FROM r3_projects WHERE id=$1',[projectId]),
      db.query('SELECT repo_url FROM r3_repositories WHERE project_id=$1 ORDER BY created_at',[projectId]),
      db.query(`SELECT c.student_id,c.role,c.contribution_statement,c.featured,c.state, s.name AS display_name, s.headline
        FROM r3_contributors c LEFT JOIN students s ON s.id=('U'||c.student_id::text) AND s.profile_status='published'
        WHERE c.project_id=$1 ORDER BY c.joined_at NULLS LAST, c.student_id`,[projectId])
    ]);
    if (!p.rows.length) throw fail(404,'Project not found');
    return {...p.rows[0], repositories:r.rows.map(x=>x.repo_url), contributors:c.rows};
  };
  const publicDetails = async (projectId) => {
    const d=await details(pool,projectId);
    if (!d.published) throw fail(404,'Published project not found');
    return {...d, contributors:d.contributors.filter(c=>c.state==='accepted'), maintainer_id:d.maintainer_id};
  };
  const normalizeRepos = raw => {
    if (raw == null) return [];
    if (!Array.isArray(raw) || raw.length > 10) throw fail(400,'repositories must be an array of at most 10 GitHub URLs');
    const repos = raw.map(githubRepo);
    if (repos.some(r=>!r)) throw fail(400,'Only public-format https://github.com/owner/repo URLs are supported');
    return [...new Map(repos.map(r=>[r.key,r])).values()];
  };
  const duplicateFor = async (db, repos, except=null) => {
    if (!repos.length) return null;
    const q=await db.query('SELECT project_id, repo_url FROM r3_repositories WHERE repo_key=ANY($1::text[]) AND ($2::uuid IS NULL OR project_id<>$2) LIMIT 1', [repos.map(r=>r.key),except]);
    return q.rows[0] || null;
  };
  const safe = (fn) => wrap(async (req,res) => { await fn(req,res); });

  app.get('/api/r3/roles', (_req,res)=>res.json({roles:ROLES}));
  app.get('/api/r3/me', safe(async(req,res)=>res.json({student_id:await me(req)}))); 
  app.get('/api/r3/github/preview', safe(async (req,res)=>{
    await me(req);
    const repo=githubRepo(req.query.repo);
    if (!repo) throw fail(400,'Enter a valid public GitHub repository URL');
    const result=await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`,{
      headers:{'Accept':'application/vnd.github+json','User-Agent':'COSC3506-Team04-R3'},signal:AbortSignal.timeout(7000)
    });
    if (!result.ok) throw fail(400,'Repository could not be read publicly from GitHub');
    const data=await result.json();
    if (data.private) throw fail(400,'Repository is not public');
    const langs=await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/languages`,{
      headers:{'Accept':'application/vnd.github+json','User-Agent':'COSC3506-Team04-R3'},signal:AbortSignal.timeout(7000)
    }).then(r=>r.ok?r.json():{}).catch(()=>({}));
    res.json({suggestions:{title:data.name,description:data.description||'',technologies:Object.keys(langs).slice(0,15),repositories:[repo.url]},editable:true});
  }));
  app.post('/api/r3/duplicate-check', safe(async (req,res)=>{
    await me(req);
    const repos=normalizeRepos(req.body?.repositories);
    const existing=await duplicateFor(pool,repos);
    res.json({duplicate:!!existing,existing_project_id:existing?.project_id||null,existing_url:existing?`/r3-project.html?id=${existing.project_id}`:null,warning:existing?'This repository is already connected to a shared project. View it or request to join instead.':null});
  }));
  app.get('/api/r3/my-projects', safe(async (req,res)=>{
    const userId=await me(req);
    const {rows}=await pool.query(`SELECT p.id,p.title,p.status,p.published,p.version,p.maintainer_id,c.state,c.role
      FROM r3_projects p INNER JOIN r3_contributors c ON c.project_id=p.id WHERE c.student_id=$1
      ORDER BY p.updated_at DESC`,[userId]);
    res.json({projects:rows});
  }));
  app.get('/api/r3/invitations', safe(async(req,res)=>{
    const userId=await me(req);
    const {rows}=await pool.query(`SELECT p.id,p.title,p.domain,c.role,c.state FROM r3_contributors c
      JOIN r3_projects p ON p.id=c.project_id WHERE c.student_id=$1 AND c.state='pending' ORDER BY c.changed_at DESC`,[userId]);
    res.json({invitations:rows});
  }));
  app.post('/api/r3/projects', safe(async(req,res)=>{
    const userId=await me(req); let payload;
    try { payload=projectPayload(req.body); } catch(e) { throw fail(400,e.message); }
    const repos=normalizeRepos(req.body?.repositories);
    const result=await tx(async(db)=>{
      const duplicate=await duplicateFor(db,repos);
      if (duplicate) throw fail(409,'Repository already belongs to a project; view or request to join it',{existing_project_id:duplicate.project_id});
      const v=Object.values(payload);
      const {rows}=await db.query(`INSERT INTO r3_projects
        (maintainer_id,title,description,domain,status,technologies,started_on,playable_url,video_url,fallback_url)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,version`,[userId,...v]);
      const created=rows[0];
      await db.query(`INSERT INTO r3_contributors(project_id,student_id,role,state,joined_at)
        VALUES($1,$2,'Project Manager','accepted',now())`,[created.id,userId]);
      for (const r of repos) await db.query('INSERT INTO r3_repositories(project_id,repo_url,repo_key) VALUES($1,$2,$3)',[created.id,r.url,r.key]);
      await audit(db,created.id,userId,'project-created',null,{repos:repos.map(r=>r.url)});
      return created;
    });
    res.status(201).json({project:result});
  }));
  app.get('/api/r3/projects/:id', safe(async(req,res)=>{
    const userId=await me(req); const projectId=id(req);
    const p=await getProject(pool,projectId); const c=await contributor(pool,projectId,userId);
    if (p.maintainer_id!==userId && (!c || !['accepted','pending'].includes(c.state))) throw fail(403,'Not an active project participant');
    // Invitees may inspect the proposed project and their role before accepting,
    // but cannot read other contributors' private editable statements.
    if (c?.state==='pending' && p.maintainer_id!==userId) {
      return res.json({project:{id:p.id,title:p.title,description:p.description,domain:p.domain,
        status:p.status,version:p.version,invited_role:c.role,contributors:[],repositories:[]},
        can_edit_shared:false});
    }
    res.json({project:await details(pool,projectId),can_edit_shared:p.maintainer_id===userId});
  }));
  app.put('/api/r3/projects/:id', safe(async(req,res)=>{
    const userId=await me(req); const projectId=id(req);
    const version=Number(req.body?.version);
    if (!Number.isInteger(version)||version<1) throw fail(400,'Expected numeric project version');
    const result=await tx(async(db)=>{
      const old=await getProject(db,projectId,true); requireMaintainer(old,userId);
      if(old.version!==version) throw fail(409,'Your copy is stale; reload before editing',{current_version:old.version});
      let payload;
      try { payload=projectPayload(req.body,old); } catch(e) { throw fail(400,e.message); }
      const repos=Object.prototype.hasOwnProperty.call(req.body||{},'repositories')?normalizeRepos(req.body.repositories):null;
      if (repos) {
        const dup=await duplicateFor(db,repos,projectId);
        if (dup) throw fail(409,'Repository connected to another project',{existing_project_id:dup.project_id});
      }
      const q=await db.query(`UPDATE r3_projects SET title=$2,description=$3,domain=$4,status=$5,
        technologies=$6,started_on=$7,playable_url=$8,video_url=$9,fallback_url=$10,
        version=version+1,updated_at=now() WHERE id=$1 RETURNING version`,[projectId,...Object.values(payload)]);
      if(repos) {
        await db.query('DELETE FROM r3_repositories WHERE project_id=$1',[projectId]);
        for(const r of repos) await db.query('INSERT INTO r3_repositories(project_id,repo_url,repo_key) VALUES($1,$2,$3)',[projectId,r.url,r.key]);
      }
      await audit(db,projectId,userId,'project-edited',null,{version:q.rows[0].version});
      return q.rows[0];
    });
    res.json({project:result});
  }));
  app.post('/api/r3/projects/:id/publish', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req);
    await tx(async db=>{
      const p=await getProject(db,projectId,true); requireMaintainer(p,userId);
      if (String(p.title||'').trim().length===0) throw fail(400,'Project must have a title');
      await db.query('UPDATE r3_projects SET published=true,version=version+1,updated_at=now() WHERE id=$1',[projectId]);
      await audit(db,projectId,userId,'published');
    });
    res.json({published:true});
  }));
  app.post('/api/r3/projects/:id/unpublish', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req);
    await tx(async db=>{
      const p=await getProject(db,projectId,true); requireMaintainer(p,userId);
      await db.query('UPDATE r3_projects SET published=false,version=version+1,updated_at=now() WHERE id=$1',[projectId]);
      await audit(db,projectId,userId,'unpublished');
    });
    res.json({published:false});
  }));
  app.post('/api/r3/projects/:id/invite', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req);
    const target=publicStudentId(req.body?.student_id), role=req.body?.role;
    if (!target || !ROLES.includes(role)) throw fail(400,'Existing student ID and a standardized role are required');
    if(!await studentExists(target)) throw fail(404,'Invited student does not exist on the platform');
    await tx(async db=>{
      const p=await getProject(db,projectId,true); requireMaintainer(p,userId);
      const old=await contributor(db,projectId,target);
      if(old && old.state==='accepted') throw fail(409,'Student is already an accepted contributor');
      await db.query(`INSERT INTO r3_contributors(project_id,student_id,role,state,invited_by,changed_at)
        VALUES($1,$2,$3,'pending',$4,now()) ON CONFLICT(project_id,student_id)
        DO UPDATE SET role=excluded.role,state='pending',invited_by=excluded.invited_by,changed_at=now()`,[projectId,target,role,userId]);
      await audit(db,projectId,userId,'invitation-sent',target,{role});
    });
    res.status(201).json({state:'pending'});
  }));
  app.post('/api/r3/projects/:id/invitations/respond', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req), accept=req.body?.accept;
    if(typeof accept!=='boolean') throw fail(400,'Set accept to true or false');
    await tx(async db=>{
      await getProject(db,projectId,true);
      const c=await contributor(db,projectId,userId);
      if(!c || c.state!=='pending') throw fail(409,'No pending invitation');
      const state=accept?'accepted':'declined';
      await db.query(`UPDATE r3_contributors SET state=$3::varchar,joined_at=CASE WHEN $3::varchar='accepted' THEN now() ELSE joined_at END,
        changed_at=now() WHERE project_id=$1 AND student_id=$2`,[projectId,userId,state]);
      await audit(db,projectId,userId,`invitation-${state}`,userId);
    });
    res.json({state:accept?'accepted':'declined'});
  }));
  app.patch('/api/r3/projects/:id/my-contribution', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req);
    const contribution=String(req.body?.contribution_statement??'').trim().slice(0,2500);
    if(typeof req.body?.featured!=='boolean') throw fail(400,'featured must be a boolean');
    const q=await pool.query(`UPDATE r3_contributors SET contribution_statement=$3,featured=$4,changed_at=now()
      WHERE project_id=$1 AND student_id=$2 AND state='accepted' RETURNING student_id`,[projectId,userId,contribution,req.body.featured]);
    if(!q.rowCount) throw fail(403,'Only an accepted contributor can maintain their own contribution');
    await audit(pool,projectId,userId,'contribution-updated',userId,{featured:req.body.featured});
    res.json({saved:true});
  }));
  app.post('/api/r3/projects/:id/transfer', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req), target=publicStudentId(req.body?.student_id);
    if(!target) throw fail(400,'Valid target student ID is required');
    await tx(async db=>{
      const p=await getProject(db,projectId,true); requireMaintainer(p,userId);
      const c=await contributor(db,projectId,target);
      if(!c || c.state!=='accepted') throw fail(400,'Target must be an accepted contributor');
      await db.query('UPDATE r3_projects SET maintainer_id=$2,version=version+1,updated_at=now() WHERE id=$1',[projectId,target]);
      await audit(db,projectId,userId,'maintainer-transferred',target);
    });
    res.json({maintainer_id:target,project_id:projectId});
  }));
  app.post('/api/r3/projects/:id/remove-contributor', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req), target=publicStudentId(req.body?.student_id);
    if(!target) throw fail(400,'Valid contributor ID required');
    await tx(async db=>{
      const p=await getProject(db,projectId,true); requireMaintainer(p,userId);
      if (target===p.maintainer_id) throw fail(400,'Transfer maintenance before removing the maintainer');
      const c=await contributor(db,projectId,target);
      if(!c || c.state!=='accepted') throw fail(409,'Contributor not accepted');
      await db.query(`UPDATE r3_contributors SET state='removed',featured=false,changed_at=now()
        WHERE project_id=$1 AND student_id=$2`,[projectId,target]);
      await audit(db,projectId,userId,'contributor-soft-removed',target,{previous_role:c.role});
    });
    res.json({state:'removed',recoverable:true});
  }));
  app.post('/api/r3/projects/:id/restore-contributor', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req), target=publicStudentId(req.body?.student_id);
    if(!target) throw fail(400,'Valid contributor ID required');
    await tx(async db=>{
      const p=await getProject(db,projectId,true); requireMaintainer(p,userId);
      const c=await contributor(db,projectId,target);
      if(!c || c.state!=='removed') throw fail(409,'No soft-removed relationship to restore');
      await db.query(`UPDATE r3_contributors SET state='accepted',changed_at=now() WHERE project_id=$1 AND student_id=$2`,[projectId,target]);
      await audit(db,projectId,userId,'contributor-restored',target);
    });
    res.json({state:'accepted'});
  }));
  app.get('/api/r3/projects/:id/audit', safe(async(req,res)=>{
    const userId=await me(req), projectId=id(req);
    const p=await getProject(pool,projectId); requireMaintainer(p,userId);
    const {rows}=await pool.query('SELECT actor_id,subject_id,action,created_at FROM r3_audit WHERE project_id=$1 ORDER BY id DESC LIMIT 100',[projectId]);
    res.json({events:rows});
  }));
  app.post('/api/r3/projects/:id/join-request', safe(async(req,res)=>{
    const userId=await me(req),projectId=id(req);
    const p=await getProject(pool,projectId);
    if(!p.published) throw fail(404,'Published project not found');
    const c=await contributor(pool,projectId,userId);
    if(c?.state==='accepted') throw fail(409,'Already a contributor');
    await pool.query(`INSERT INTO r3_join_requests(project_id,student_id,message,state) VALUES($1,$2,$3,'pending')
      ON CONFLICT(project_id,student_id) DO UPDATE SET message=excluded.message,state='pending',updated_at=now()`,[projectId,userId,String(req.body?.message||'').slice(0,500)]);
    res.status(201).json({state:'pending'});
  }));
  app.get('/api/r3/projects/:id/join-requests', safe(async(req,res)=>{
    const userId=await me(req),projectId=id(req),p=await getProject(pool,projectId); requireMaintainer(p,userId);
    const {rows}=await pool.query("SELECT student_id,message,state FROM r3_join_requests WHERE project_id=$1 AND state='pending'",[projectId]);
    res.json({requests:rows});
  }));
  app.post('/api/r3/projects/:id/join-requests/respond', safe(async(req,res)=>{
    const userId=await me(req),projectId=id(req),target=publicStudentId(req.body?.student_id),accept=req.body?.accept,role=req.body?.role;
    if(!target || typeof accept!=='boolean' || (accept&&!ROLES.includes(role))) throw fail(400,'Invalid join-response parameters');
    await tx(async db=>{
      const p=await getProject(db,projectId,true); requireMaintainer(p,userId);
      const q=await db.query("UPDATE r3_join_requests SET state=$3,updated_at=now() WHERE project_id=$1 AND student_id=$2 AND state='pending' RETURNING student_id",[projectId,target,accept?'approved':'declined']);
      if(!q.rowCount) throw fail(409,'No pending request');
      if(accept){
        await db.query(`INSERT INTO r3_contributors(project_id,student_id,role,state,joined_at,invited_by)
          VALUES($1,$2,$3,'accepted',now(),$4) ON CONFLICT(project_id,student_id)
          DO UPDATE SET role=excluded.role,state='accepted',joined_at=now(),changed_at=now()`,[projectId,target,role,userId]);
      }
      await audit(db,projectId,userId,accept?'join-approved':'join-declined',target,{role:accept?role:null});
    });
    res.json({state:accept?'approved':'declined'});
  }));
  app.get('/api/r3/public/projects/:id', safe(async(req,res)=>res.json({project:await publicDetails(id(req))})));
  app.get('/api/r3/public/students/:studentId/projects', safe(async(req,res)=>{
    const studentId=publicStudentId(req.params.studentId);
    if(!studentId) throw fail(400,'Invalid public student ID');
    const {rows}=await pool.query(`SELECT p.id,p.title,p.description,p.domain,c.role,c.contribution_statement
      FROM r3_projects p JOIN r3_contributors c ON c.project_id=p.id
      WHERE c.student_id=$1 AND c.state='accepted' AND c.featured=true AND p.published=true ORDER BY p.updated_at DESC`,[studentId]);
    res.json({projects:rows});
  }));

  // Mount this AFTER your existing error handlers? Add an explicit R3-scoped error handler
  // after routes but before any generic handler; next(error) handles unforeseen failures.
  app.use('/api/r3', (err,_req,res,next)=>{
    if(!err) return next();
    if(err.code==='23505') return res.status(409).json({error:'Duplicate repository or contributor'});
    if(err.code==='22P02'||err.code==='22007') return res.status(400).json({error:'Invalid identifier or date'});
    if(err.status) return res.status(err.status).json({error:err.message,...(err.extra||{})});
    console.error('R3 API error',err);
    return res.status(500).json({error:'Internal R3 service error'});
  });
}
module.exports={mountR3};
