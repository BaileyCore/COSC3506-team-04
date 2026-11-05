/* Team 04 R3 vanilla-JS UI. R2 config.js must set window.API_BASE_URL. */
'use strict';
(() => {
  const apiBase=(window.API_BASE_URL||'').replace(/\/$/,'');
  const $=id=>document.getElementById(id);
  const state={project:null, me:null, canEdit:false, roles:[]};
  const feedback=(msg)=>{$('feedback').textContent=msg;};
  const duplicateMessage=(d)=>{
    feedback(d.warning || 'Repository already connected to a shared project.');
    if(d.existing_project_id){
      const a=document.createElement('a');
      a.href=`r3-project.html?id=${encodeURIComponent(d.existing_project_id)}`;
      a.textContent='View existing project / request to join';
      a.style.display='block';
      $('feedback').append(a);
    }
  };
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node;};
  const btn=(label,fn)=>{const b=el('button',label);b.type='button';b.addEventListener('click',fn);return b;};
  const post=async(path,method='POST',data={})=>{
    const response=await fetch(apiBase+path,{method,credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    let payload={};try{payload=await response.json();}catch{}
    if(!response.ok)throw Error(payload.error||`HTTP ${response.status}`);
    return payload;
  };
  const get=async(path)=>{
    const response=await fetch(apiBase+path,{credentials:'include'});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
    return data;
  };
  const go=fn=>async(...args)=>{try{feedback('');await fn(...args);}catch(e){feedback(e.message||'Request failed');}};
  const repos=()=> $('repositories').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const readForm=()=>({title:$('title').value,description:$('description').value,domain:$('domain').value,
    status:$('status').value,technologies:$('technologies').value.split(',').map(s=>s.trim()).filter(Boolean),
    started_on:$('started_on').value||null,repositories:repos(),
    playable_url:$('playable_url').value||null,video_url:$('video_url').value||null,fallback_url:$('fallback_url').value||null});
  const fillForm=p=>{for(const id of ['title','description','domain','status','started_on','playable_url','video_url','fallback_url']){
      $(id).value=id==='started_on'&&p?.[id]?String(p[id]).slice(0,10):p?.[id]||'';
    }
    $('technologies').value=(p?.technologies||[]).join(', ');
    $('repositories').value=(p?.repositories||[]).join('\n');
  };
  async function refreshLists(){
    const {projects}=await get('/api/r3/my-projects'); const box=$('my-projects');box.replaceChildren();
    if(!projects.length)box.append(el('p','No projects yet. Use Add Project below.'));
    for(const p of projects){const div=el('div',undefined,'item');div.append(el('strong',p.title));
      div.append(el('p',`Your role: ${p.role} · Invitation state: ${p.state} · ${p.published?'Published':'Not published'}`,'muted'));
      div.append(btn('Open project',go(()=>load(p.id))));
      if(p.published){const a=el('a','Public page');a.href=`r3-project.html?id=${encodeURIComponent(p.id)}`;a.style.marginLeft='.8rem';div.append(a);}
      box.append(div);
    }
    const {invitations}=await get('/api/r3/invitations'), invitationBox=$('invitations');invitationBox.replaceChildren();
    if(!invitations.length)invitationBox.append(el('p','No pending invitations.'));
    for(const inv of invitations){const div=el('div',undefined,'item');div.append(el('strong',`${inv.title} — ${inv.role}`));
      div.append(btn('Accept',go(async()=>{await post(`/api/r3/projects/${inv.id}/invitations/respond`,'POST',{accept:true});feedback('Invitation accepted');await refreshLists();await load(inv.id);})),
        btn('Decline',go(async()=>{await post(`/api/r3/projects/${inv.id}/invitations/respond`,'POST',{accept:false});feedback('Invitation declined');await refreshLists();})));
      invitationBox.append(div);
    }
  }
  async function load(id){
    const result=await get(`/api/r3/projects/${encodeURIComponent(id)}`);state.project=result.project;state.canEdit=result.can_edit_shared;
    fillForm(state.project);$('form-title').textContent=`Project: ${state.project.title}`;
    $('save').textContent='Save changes';
    for(const element of $('project-form').querySelectorAll('input,textarea,select'))element.disabled=!state.canEdit;
    $('save').disabled=!state.canEdit;$('github-preview').disabled=!state.canEdit;$('duplicate-check').disabled=!state.canEdit;
    $('publish').disabled=!state.canEdit;$('unpublish').disabled=!state.canEdit;
    $('members-section').hidden=false;
    renderMembers(); await loadJoinRequests();
    feedback(`Loaded ${state.project.title}. Project version ${state.project.version}. ${state.canEdit?'You are the maintainer.':'Shared fields are read-only; you may edit your own contribution.'}`);
  }
  function renderMembers(){
    const box=$('members');box.replaceChildren();
    const self=state.project.contributors.find(c=>c.student_id===state.me);
    $('statement').value=self?.contribution_statement||''; $('featured').checked=self?.featured??true;
    for(const c of state.project.contributors){const div=el('div',undefined,'item');
      div.append(el('strong',`U${c.student_id}`));div.append(el('p',`Role: ${c.role} · ${c.state}`));
      if(c.contribution_statement)div.append(el('p',c.contribution_statement));
      if(state.canEdit&&c.student_id!==state.project.maintainer_id&&c.state==='accepted'){
        div.append(btn('Transfer maintenance',go(async()=>{
          if(!confirm('Transfer edit control to this accepted contributor?'))return;
          await post(`/api/r3/projects/${state.project.id}/transfer`,'POST',{student_id:c.student_id});await load(state.project.id);
        })));
        div.append(btn('Soft-remove contributor',go(async()=>{
          if(!confirm('Temporarily remove this contributor? The relationship can be restored.'))return;
          await post(`/api/r3/projects/${state.project.id}/remove-contributor`,'POST',{student_id:c.student_id});await load(state.project.id);
        })));
      }
      if(state.canEdit&&c.state==='removed')div.append(btn('Restore contributor',go(async()=>{
        await post(`/api/r3/projects/${state.project.id}/restore-contributor`,'POST',{student_id:c.student_id});await load(state.project.id);
      })));
      box.append(div);
    }
    $('invite-form').querySelectorAll('input,select,button').forEach(n=>{n.disabled=!state.canEdit;});
  }
  async function loadJoinRequests(){
    const box=$('join-requests');box.replaceChildren();
    if(!state.canEdit){box.append(el('p','Maintainer only.'));return;}
    const {requests}=await get(`/api/r3/projects/${state.project.id}/join-requests`);
    if(!requests.length)box.append(el('p','No pending join requests.'));
    for(const r of requests){const div=el('div',undefined,'item');div.append(el('strong',`U${r.student_id}`));div.append(el('p',r.message));
      div.append(btn('Approve as selected role',go(async()=>{
        await post(`/api/r3/projects/${state.project.id}/join-requests/respond`,'POST',{student_id:r.student_id,accept:true,role:$('role').value});await load(state.project.id);
      })));
      div.append(btn('Decline',go(async()=>{
        await post(`/api/r3/projects/${state.project.id}/join-requests/respond`,'POST',{student_id:r.student_id,accept:false});await loadJoinRequests();
      })));
      box.append(div);
    }
  }
  $('new-project').addEventListener('click',()=>{
    state.project=null;state.canEdit=true;fillForm({});$('domain').value='Software / XR';
    $('status').value='In progress';$('form-title').textContent='Add Project';
    $('save').textContent='Create project';
    for(const element of $('project-form').querySelectorAll('input,textarea,select'))element.disabled=false;
    $('save').disabled=false;$('github-preview').disabled=false;$('duplicate-check').disabled=false;
    $('publish').disabled=true;$('unpublish').disabled=true;$('members-section').hidden=true;
    feedback('Ready to create a new project.');
  });
  $('project-form').addEventListener('submit',go(async(e)=>{
    e.preventDefault();const body=readForm();
    if(state.project){body.version=state.project.version;await post(`/api/r3/projects/${state.project.id}`,'PUT',body);await load(state.project.id);feedback('Project saved.');}
    else{
      if(body.repositories.length){
        const duplicate=await post('/api/r3/duplicate-check','POST',{repositories:body.repositories});
        if(duplicate.duplicate){duplicateMessage(duplicate);return;}
      }
      const result=await post('/api/r3/projects','POST',body);await refreshLists();await load(result.project.id);feedback('Project created. Invite your teammates next.');
    }
  }));
  $('github-preview').addEventListener('click',go(async()=>{
    const repo=repos()[0];if(!repo)throw Error('Enter a GitHub repository URL first.');
    const {suggestions}=await get('/api/r3/github/preview?repo='+encodeURIComponent(repo));
    if(!confirm('Apply editable GitHub metadata suggestions to title, description and technologies?'))return;
    $('title').value=suggestions.title;$('description').value=suggestions.description;
    $('technologies').value=(suggestions.technologies||[]).join(', ');
    feedback('GitHub suggestions filled in; review and edit before saving.');
  }));
  $('duplicate-check').addEventListener('click',go(async()=>{
    const d=await post('/api/r3/duplicate-check','POST',{repositories:repos()});
    if(d.duplicate)duplicateMessage(d);else feedback('No exact repository match detected. Similar project names should still be reviewed manually.');
  }));
  $('publish').addEventListener('click',go(async()=>{if(!state.project)throw Error('Create a project first.');
    await post(`/api/r3/projects/${state.project.id}/publish`);await load(state.project.id);await refreshLists();feedback('Project published. Confirm its public page in an incognito window.');
  }));
  $('unpublish').addEventListener('click',go(async()=>{if(!state.project)throw Error('Choose a project first.');
    await post(`/api/r3/projects/${state.project.id}/unpublish`);await load(state.project.id);await refreshLists();feedback('Project unpublished.');
  }));
  $('invite-form').addEventListener('submit',go(async(e)=>{e.preventDefault();if(!state.project)throw Error('Choose a project first.');
    await post(`/api/r3/projects/${state.project.id}/invite`,'POST',{student_id:$('invite-id').value,role:$('role').value});
    await load(state.project.id);feedback('Invitation sent. The student must sign in and accept.');
  }));
  $('contribution-form').addEventListener('submit',go(async(e)=>{e.preventDefault();if(!state.project)throw Error('Choose a project first.');
    await post(`/api/r3/projects/${state.project.id}/my-contribution`,'PATCH',{
      contribution_statement:$('statement').value,featured:$('featured').checked});
    await load(state.project.id);feedback('Your own statement saved.');
  }));
  go(async()=>{
    state.me=(await get('/api/r3/me')).student_id;
    state.roles=(await get('/api/r3/roles')).roles;
    for(const role of state.roles){const option=el('option',role);option.value=role;$('role').append(option);}
    await refreshLists();
  })();
})();
