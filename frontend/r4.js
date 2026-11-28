'use strict';
(()=>{
  const $=id=>document.getElementById(id),apiBase=(window.API_BASE_URL||'').replace(/\/$/,'');
  function element(tag,value) { const el=document.createElement(tag); if(value!==undefined)el.textContent=value; return el; }
  const paragraph=t=>element('p',t);
  function link(url,label){const a=element('a',label);a.href=url;return a;}
  function button(label,action){const b=element('button',label);b.type='button';b.addEventListener('click',run(action,b));return b;}
  function status(text){const d=$('r4-status');if(d)d.textContent=text;}
  function run(action,b){return async ev=>{ev?.preventDefault();const submit=b||ev?.submitter;if(submit)submit.disabled=true;
    try{await action();}catch(e){status(e.message);}finally{if(submit)submit.disabled=false;}
  };}
  const data=f=>Object.fromEntries(new FormData(f));
  const api=async(path,body,isPublic=false)=>{
    const r=await fetch(apiBase+'/api/r4'+path,body===undefined?{credentials:isPublic?'omit':'include'}:{
      credentials:'include',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const out=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(out.error||'Could not complete this request.'),{status:r.status});
    return out;
  };
  function options(select,records,placeholder){
    select.replaceChildren(new Option(placeholder,''));
    records.forEach(r=>select.add(new Option(r.name||r.title,r.id)));
  }
  const partnerUrl=id=>'r4-partners.html?id='+encodeURIComponent(id);
  const projectUrl=p=>(p.kind==='legacy'?'project.html':'r3-project.html')+'?id='+encodeURIComponent(p.id);
  const studentUrl=id=>'student.html?id='+encodeURIComponent(id);
  function inquiry(kind,id,name){
    return link('inquiry.html?'+new URLSearchParams({source_type:kind,source_id:id,source_name:name,source_url:location.href}),
      'Start a collaboration inquiry');
  }
  function safeWebsite(value){
    try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}
    return null;
  }

  if($('staff')){
    let queue=null, editing=null, collabEditing=null;
    const editor=$('company-form'), cf=$('collab-form'), company=$('collab-company');
    const fixtureBox=$('fixture-links');
    for(const n of ['normal','sparse','prompt_injection','same_name_other_domain']){
      const url=new URL('r4-fixtures/company_'+n+'.html',location.href).href;
      const p=paragraph(n.replaceAll('_',' ')+' · ');p.append(link(url,'Open fixture'),document.createTextNode(' '),
        button('Use this URL',()=>{$('company-import').elements.url.value=url;$('company-import').elements.url.focus();}));fixtureBox.append(p);
    }
    $('r4-login').href='profile.html';
    const edit=(record,focus=true)=>{
      editing=record;
      $('company-heading').textContent=record?'Review company: '+record.name:'Add a company manually';
      for(const k of ['name','website','description','sector','location'])editor.elements[k].value=record?.[k]||'';
      $('company-provenance').textContent=record?.source_url?'Imported from '+record.source_url+' at '+new Date(record.imported_at).toLocaleString()+'. Review the suggested details before publishing.':'';
      const actions=$('publish-actions');actions.replaceChildren();
      if(record)actions.append(button(record.published?'Unpublish partner':'Publish partner',async()=>{
        await api('/staff/partners/'+record.id+'/publish',{published:!record.published});
        await refresh();
        status(record.published?'Partner unpublished.':'Partner published.');
      }));
      if(record?.published)actions.append(link(partnerUrl(record.id),'View public partner page'));
      if(record)actions.append(button('Add or edit collaborations',()=>{company.value=record.id;selectCompany();company.focus();}));
      if(focus)editor.elements.name.focus();
    };
    function makeChecks(target,records,key,checked){
      target.replaceChildren();
      for(const r of records){
        const l=element('label');l.className='check';
        const i=element('input');i.type='checkbox';i.name=key;i.value=r.id;i.checked=checked.includes(r.id);
        l.append(i,document.createTextNode(r.title||r.name));target.append(l);
      }
    }
    const editCollab=(c)=>{
      collabEditing=c;
      cf.reset();$('collab-heading').textContent=c?'Edit collaboration':'Add collaboration';
      if(c)for(const k of ['title','period','description','outcome','status','visibility','public_summary'])cf.elements[k].value=c[k];
      makeChecks($('collab-projects'),queue.projects,'project_ids',c?.project_ids||[]);
      makeChecks($('collab-students'),queue.students,'student_ids',c?.student_ids||[]);
      cf.querySelector('button').disabled=!company.value;
    };
    function selectCompany(){
      const items=$('existing-collabs');items.replaceChildren();
      for(const c of queue.collaborations.filter(c=>c.partner_id===company.value)){
        const p=paragraph(c.title+' · '+c.period+' · '+c.status+' · '+c.visibility+' ');p.append(button('Edit',()=>{editCollab(c);cf.elements.title.focus();}));items.append(p);
      }
      editCollab(null);
    }
    function cards(target,requests){
      target.replaceChildren();
      if(!requests.length)target.append(paragraph('No pending work.'));
      for(const r of requests){
        const row=element('article');row.className='item';
        row.append(element('h3',r.project_title),paragraph(r.project_description),paragraph('Request: '+r.note),
          paragraph('Contributors: '+(r.contributors.map(c=>c.label+' ('+c.role+')').join(', ')||'None listed.')));
        if(r.project_published)row.append(link(projectUrl({id:r.project_id}),'View published project'));
        const actions=element('div');actions.className='actions';
        let partner=null;
        if(r.kind==='partner'){
          row.append(paragraph('Company requested: '+(r.company_name||r.suggested_company)));
          partner=element('select');options(partner,queue.partners.filter(p=>p.published),'Choose a published company');
          partner.value=r.partner_id||'';const l=element('label','Partner to approve');l.append(partner);row.append(l);
        }
        const reasonInput=element('input');reasonInput.type='text';reasonInput.maxLength=600;reasonInput.placeholder='Optional reason or next steps (shown to student on rejection)';
        const reasonLabel=element('label','Decision note / rejection reason');reasonLabel.append(reasonInput);row.append(reasonLabel);
        for(const [decision,label] of [['approved','Approve'],['rejected','Reject']]){
          actions.append(button(label,async()=>{
            if(partner&&decision==='approved'&&!partner.value)throw Error('Choose a published company, or publish it as a draft first.');
            await api('/staff/requests/'+r.id+'/review',{decision,partner_id:partner?.value||undefined,decision_note:reasonInput.value.trim()});await refresh();status('Request '+decision+'.');
          }));
        }
        row.append(actions);target.append(row);
      }
    }
    async function refresh(){
      const oldCompany=company.value,oldEdit=editing?.id;
      queue=await api('/staff/queue');$('staff-work').hidden=false;$('staff-sign-in').hidden=true;
      const verification=queue.requests.filter(r=>r.kind==='verification'), association=queue.requests.filter(r=>r.kind==='partner');
      $('verify-count').textContent='('+verification.length+')';$('partner-count').textContent='('+association.length+')';
      cards($('verify-queue'),verification);cards($('partner-queue'),association);
      const drafts=queue.partners.filter(p=>!p.published);
      $('draft-count').textContent='('+drafts.length+')';$('draft-queue').replaceChildren();
      for(const p of queue.partners){
        const row=paragraph((p.published?'Published':'Draft')+' · '+p.name+' ');
        row.append(button('Review '+p.name,()=>edit(p)));$('draft-queue').append(row);
      }
      if(!queue.partners.length)$('draft-queue').append(paragraph('No companies yet.'));
      options(company,queue.partners,'Choose a company');
      company.value=oldCompany;
      selectCompany();
      if(oldEdit)edit(queue.partners.find(p=>p.id===oldEdit)||null,false);
      await refreshFinalStaff();
    }
    const finalApi=async(path,body)=>{
      const r=await fetch(apiBase+'/api/final'+path,body===undefined?{credentials:'include'}:{
        credentials:'include',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const out=await r.json().catch(()=>({}));
      if(!r.ok)throw Object.assign(new Error(out.error||'Could not complete this request.'),{status:r.status});
      return out;
    };
    async function refreshFinalStaff(){
      if(!$('claim-queue'))return;
      try{
        const [claims,opts]=await Promise.all([finalApi('/staff/claims'),finalApi('/staff/recovery-options')]);
        $('claim-count').textContent='('+claims.length+')';
        const cq=$('claim-queue');cq.replaceChildren();
        if(!claims.length)cq.append(paragraph('No pending profile claims.'));
        for(const c of claims){
          const row=element('article');row.className='item';
          row.append(element('h3',`${c.student_name} (${c.student_id})`),
            paragraph(`Claimant: @${c.claimant_github} (${c.claimant_email||'unverified'})`),
            paragraph('Note: '+(c.note||'None')));
          const noteInput=element('input');noteInput.type='text';noteInput.maxLength=600;noteInput.placeholder='Optional decision note';
          const lbl=element('label','Decision note');lbl.append(noteInput);row.append(lbl);
          const acts=element('div');acts.className='actions';
          for(const [decision,label] of [['approved','Approve claim'],['rejected','Reject claim']]){
            acts.append(button(label,async()=>{await finalApi('/staff/claims/'+c.id+'/review',{decision,decision_note:noteInput.value.trim()});await refresh();status('Claim '+decision+'.');}));
          }
          row.append(acts);cq.append(row);
        }
        const stuOpts=opts.students.map(s=>({id:s.id,name:`${s.name} (${s.id} · ${s.profile_status})`}));
        options($('merge-student-source'),stuOpts,'Select duplicate student');
        options($('merge-student-target'),stuOpts,'Select surviving student');
        const pOpts=queue.partners.filter(p=>!p.merged_into_id).map(p=>({id:p.id,name:`${p.name} (${p.published?'Published':'Draft'})`}));
        options($('merge-partner-source'),pOpts,'Select duplicate company');
        options($('merge-partner-target'),pOpts,'Select surviving company');
        options($('recover-project'),opts.sharedProjects,'Select shared project');
        options($('recover-maintainer'),opts.accounts.map(a=>({id:a.user_id,name:`@${a.github_login} (U${a.user_id})`})),'Select verified account');
      }catch{}
    }
    if($('merge-students-form'))$('merge-students-form').onsubmit=run(async()=>{
      const d=data($('merge-students-form'));
      const res=await finalApi('/staff/merge/students',d);
      await refresh();status(`Merged ${res.source_id} into ${res.target_id}. Redirect active at ${res.redirect_url}.`);
    });
    if($('merge-partners-form'))$('merge-partners-form').onsubmit=run(async()=>{
      const d=data($('merge-partners-form'));
      const res=await finalApi('/staff/merge/partners',d);
      await refresh();status(`Merged company into ${res.target_id}. Redirect active.`);
    });
    if($('reassign-maintainer-form'))$('reassign-maintainer-form').onsubmit=run(async()=>{
      const d=data($('reassign-maintainer-form'));
      if(!d.project_id||!d.student_id)throw Error('Select a project and new maintainer.');
      await finalApi('/staff/projects/'+encodeURIComponent(d.project_id)+'/reassign-maintainer',{student_id:d.student_id,reason:d.reason});
      await refresh();status('Project maintainer reassigned without erasing contributor history.');
    });
    if($('legacy-import-form'))$('legacy-import-form').onsubmit=run(async()=>{
      const raw=data($('legacy-import-form')).json;
      let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('Enter valid JSON.');}
      const res=await finalApi('/staff/import-legacy',{fixture_name:'staff_ui_import.json',data:parsed});
      $('legacy-import-report').textContent=JSON.stringify(res.report,null,2);
      await refresh();status('Legacy import completed. Review the validation report below.');
    });
    company.onchange=selectCompany;
    $('new-company').onclick=()=>edit(null);
    $('new-collab').onclick=()=>editCollab(null);
    $('company-import').onsubmit=run(async()=>{
      const draft=await api('/staff/import',data($('company-import')));
      await refresh();edit(draft);status('Draft imported. Check and save its details before publishing.');
    });
    editor.onsubmit=run(async()=>{
      const row=await api('/staff/partners',{...data(editor),id:editing?.id});
      await refresh();edit(row,false);status('Company details saved.');
    });
    cf.onsubmit=run(async()=>{
      const fd=new FormData(cf);
      await api('/staff/collaborations',{...Object.fromEntries(fd),partner_id:company.value,id:collabEditing?.id,
        project_ids:fd.getAll('project_ids'),student_ids:fd.getAll('student_ids')});
      await refresh();status('Collaboration saved.');
    });
    refresh().catch(e=>{$('staff-sign-in').hidden=e.status!==401;status(e.message);});
  }

  if($('partners')){
    const root=$('partner-content'),id=new URLSearchParams(location.search).get('id');
    async function show(){
      if(!id){
        const partners=await api('/public/partners',undefined,true);
        if(!partners.length)root.append(paragraph('No industry partners have been published yet.'));
        for(const p of partners){const s=element('section');s.append(element('h2'),paragraph(p.description));s.firstChild.append(link(partnerUrl(p.id),p.name));root.append(s);}
        return;
      }
      const res=await api('/public/partners/'+encodeURIComponent(id),undefined,true);
      if(res.merged&&res.redirect_url){
        $('partner-title').textContent='Industry partner moved';
        const s=element('section');
        s.append(paragraph(res.message||'This partner record was merged into a surviving record.'));
        s.append(link(res.redirect_url,'View surviving partner: '+(res.target_name||res.merged_into_id)));
        root.append(s);
        return;
      }
      const {partner:p,collaborations,limited,verifiedProjects}=res;
      $('partner-title').textContent=p.name;
      const intro=element('section');intro.append(paragraph(p.description));
      if(p.sector||p.location)intro.append(paragraph([p.sector,p.location].filter(Boolean).join(' · ')));
      const website=safeWebsite(p.website);if(website)intro.append(link(website,'Company website'),document.createElement('br'));
      intro.append(inquiry('partner',p.id,p.name));root.append(intro);
      for(const state of ['current','past']){
        const section=element('section');section.append(element('h2',state==='current'?'Current collaborations':'Past collaborations'));
        const matches=collaborations.filter(c=>c.status===state);
        if(!matches.length)section.append(paragraph('No '+state+' collaborations are public.'));
        for(const c of matches){
          const a=element('article');a.className='item';a.append(element('h3',c.title),paragraph(c.period),paragraph(c.description));
          if(c.outcome)a.append(paragraph('Outcome: '+c.outcome));
          for(const x of c.projects){const line=paragraph('Related project: ');line.append(link(projectUrl(x),x.title));a.append(line);}
          for(const x of c.students){
            const line=paragraph('Participating student: ');
            if(x.retired)line.append(document.createTextNode(x.name+' (retired profile)'));
            else line.append(link(studentUrl(x.id),x.name));
            a.append(line);
          }
          a.append(inquiry('collaboration',c.id,c.title+' — '+p.name));section.append(a);
        }
        root.append(section);
      }
      if(limited.length){const s=element('section');s.append(element('h2','Anonymized highlights'),...limited.map(x=>paragraph(x.public_summary)));root.append(s);}
      if(verifiedProjects.length){const s=element('section');s.append(element('h2','Verified related projects'));for(const x of verifiedProjects){const line=paragraph('');line.append(link(projectUrl(x),x.title));s.append(line);}root.append(s);}
    }
    show().catch(e=>status(e.message));
  }
  if($('r4-requests')){
    const form=$('r4-request-form'), partner=form.elements.partner_id, kind=form.elements.kind;
    let projectId=null, generation=0;
    const switchForm=()=>{
      const hidden=kind.value!=='partner';
      $('r4-partner-fields').hidden=hidden;partner.disabled=hidden;form.elements.suggested_company.disabled=hidden||Boolean(partner.value);
    };
    const list=$('r4-request-list');
    const message=t=>{$('r4-request-status').textContent=t;};
    async function readRequests(id,g){
      const rr=await api('/projects/'+encodeURIComponent(id)+'/requests');
      if(generation!==g)return;
      list.replaceChildren(...rr.map(r=>paragraph((r.kind==='verification'?'Project verification':'Industry partner: '+(r.partner_name||r.suggested_company))+' — '+r.state+(r.decision_note?' ('+r.decision_note+')':''))));
    }
    window.r4SelectProject=async(id,maintainer)=>{
      const g=++generation;projectId=maintainer?id:null;
      $('r4-requests').hidden=!projectId;form.reset();list.replaceChildren();switchForm();message('');
      if(!projectId)return;
      try{
        const directory=await api('/public/partners',undefined,true);
        if(generation!==g)return;
        options(partner,directory,'Suggest a company instead');switchForm();await readRequests(id,g);
      }catch(e){if(generation===g)message(e.message);}
    };
    kind.onchange=switchForm;partner.onchange=switchForm;
    form.onsubmit=async(ev)=>{
      ev.preventDefault();const id=projectId,g=generation,b=ev.submitter;if(!id)return;if(b)b.disabled=true;
      try{await api('/projects/'+encodeURIComponent(id)+'/requests',data(form));if(g===generation){form.reset();switchForm();message('Request sent for staff review.');await readRequests(id,g);}}
      catch(e){if(g===generation)message(e.message);}finally{if(b)b.disabled=false;}
    };
  }
  if($('r4-project-evidence')){
    const id=new URLSearchParams(location.search).get('id');
    if(id)api('/public/projects/'+encodeURIComponent(id),undefined,true).then(({verified,partners})=>{
      if(!verified&&!partners.length)return;
      const box=$('r4-project-evidence');box.hidden=false;
      if(verified)box.append(paragraph('Officially verified by ImmXrsive.'));
      for(const p of partners){const line=paragraph('Verified industry partner: ');line.append(link(partnerUrl(p.id),p.name));box.append(line);}
    }).catch(()=>{});
  }
})();
