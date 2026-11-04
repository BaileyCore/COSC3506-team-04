/* Add <script src="r3-profile-projects.js"></script> AFTER config.js on student.html.
 * Public student ID must appear in ?id=U<uuid>. This script never changes R2 APIs.
 */
'use strict';
(async()=>{
  const id=new URLSearchParams(location.search).get('id');
  if(!id||!/^U?[0-9a-f-]{36}$/i.test(id))return;
  const main=document.querySelector('main');if(!main)return;
  const section=document.createElement('section');section.id='r3-shared-projects';
  const heading=document.createElement('h2');heading.textContent='Featured shared projects';section.append(heading);main.append(section);
  try{
    const base=(window.API_BASE_URL||'').replace(/\/$/,'');
    const result=await fetch(base+`/api/r3/public/students/${encodeURIComponent(id)}/projects`,{credentials:'omit'});
    if(!result.ok)throw Error('Shared projects unavailable');
    const {projects}=await result.json();
    if(!projects.length){section.remove();return;}
    for(const p of projects){
      const item=document.createElement('article');
      const a=document.createElement('a');a.href=`/r3-project.html?id=${encodeURIComponent(p.id)}`;a.textContent=p.title;item.append(a);
      const role=document.createElement('p');role.textContent=`${p.role} · ${p.domain}`;item.append(role);
      if(p.contribution_statement){const c=document.createElement('p');c.textContent=p.contribution_statement;item.append(c);}
      section.append(item);
    }
  }catch{section.remove();}
})();
