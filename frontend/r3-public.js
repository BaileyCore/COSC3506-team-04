'use strict';
(async()=>{
  const $=id=>document.getElementById(id),base=(window.API_BASE_URL||'').replace(/\/$/,'');
  const id=new URLSearchParams(location.search).get('id');
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
  const feedback=msg=>$('feedback').textContent=msg;
  function link(href,text){const a=node('a',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.className='button-link';return a;}
  try{
    const response=await fetch(base+`/api/r3/public/projects/${encodeURIComponent(id||'')}`,{credentials:'omit'});
    if(!response.ok)throw Error('Project is not published or cannot be reached.');
    const {project:p}=await response.json();document.title=`${p.title} — Shared Project`;
    $('title').textContent=p.title;$('description').textContent=p.description||'No description added.';
    $('domain').textContent=p.domain;$('status').textContent=p.status;
    $('technologies').textContent=(p.technologies||[]).join(', ')||'Not specified';
    $('started-on').textContent=p.started_on?String(p.started_on).slice(0,10):'Not specified';
    if(p.playable_url)$('links').append(link(p.playable_url,'Play Demo / Launch Experience'));
    if(p.video_url)$('links').append(link(p.video_url,'Watch Demo'));
    for(const repo of (p.repositories||[]))$('links').append(link(repo,'View Source'));
    if(p.fallback_url){const img=node('img');img.className='fallback';img.src=p.fallback_url;img.alt='Project fallback evidence';img.loading='lazy';
      img.onerror=()=>{img.remove();$('fallback').append(node('p','Fallback image unavailable; project details and other evidence remain available.'));};
      $('fallback').append(img);
    }else $('fallback').append(node('p','No fallback image has been supplied.'));
    const box=$('contributors');
    for(const c of p.contributors){const row=node('div');row.className='item';
      const a=node('a',c.display_name||`Student U${c.student_id}`);a.href=`/student.html?id=U${c.student_id}`;row.append(a);
      row.append(node('p',`Role: ${c.role}`));if(c.contribution_statement)row.append(node('p',c.contribution_statement));box.append(row);
    }
    if(!p.contributors.length)box.append(node('p','No accepted contributors listed.'));
    $('join-form').addEventListener('submit',async e=>{
      e.preventDefault();try{
        const r=await fetch(base+`/api/r3/projects/${id}/join-request`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:$('join-message').value})});
        const result=await r.json();if(!r.ok)throw Error(result.error||'Request failed');feedback('Join request sent.');
      }catch(err){feedback(err.message);}
    });
  }catch(err){feedback(err.message);$('join-form').hidden=true;}
})();
