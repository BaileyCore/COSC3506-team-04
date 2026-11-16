'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const PROJECT='00000000-0000-4000-8000-000000000100';
const students=[
  {id:'U00000000-0000-4000-8000-000000000002',name:'Alice Smith',program:'Computing',headline:'Developer'},
  {id:'U00000000-0000-4000-8000-000000000003',name:'Alice Smith',program:'Business',headline:'Designer'}
];
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function page({lookup=async()=>({students}),canEdit=true}={}){
  const nodes=new Map(),timers=new Map(),requests=[];let nextTimer=0,focused;
  class Node {
    constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.style={};}
    append(...children){this.children.push(...children);if(this.tag==='select'&&!this.value)this.value=children[0]?.value||'';}
    replaceChildren(...children){this.children=[...children];}
    addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
    async emit(type,extra={}){for(const fn of this.listeners[type]||[])await fn({preventDefault(){},...extra});await settle();}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(selector.split(',').includes(child.tag)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0];}
    focus(){focused=this;}
  }
  // IDs/tags come from the actual page so missing picker markup fails the tests.
  for(const match of fs.readFileSync(require.resolve('../frontend/r3-projects.html'),'utf8').matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g))nodes.set(match[2],new Node(match[1]));
  const node=id=>{assert.ok(nodes.has(id),'page contains #'+id);return nodes.get(id);};
  const answer=data=>({ok:true,json:async()=>data});
  const context=vm.createContext({window:{API_BASE_URL:'https://api.example'},document:{getElementById:node,createElement:tag=>new Node(tag)},
    setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    fetch:async(url,options={})=>{
      requests.push({url,options});
      if(url.includes('/invitees?'))return answer(await lookup(new URL(url).searchParams.get('q')));
      if(options.method==='POST')return answer({state:'pending'});
      if(url.endsWith('/me'))return answer({student_id:'owner'});
      if(url.endsWith('/roles'))return answer({roles:['QA/Tester','Backend Developer']});
      if(url.endsWith('/my-projects'))return answer({projects:[{id:PROJECT,title:'Test project',role:'Project Manager',state:'accepted'}]});
      if(url.endsWith('/invitations'))return answer({invitations:[]});
      if(url.endsWith('/join-requests'))return answer({requests:[]});
      if(url.endsWith('/projects/'+PROJECT))return answer({project:{id:PROJECT,title:'Test project',contributors:[],version:1},can_edit_shared:canEdit});
      throw Error('Unexpected request: '+url);
    }});
  vm.runInContext(fs.readFileSync(require.resolve('../frontend/r3.js'),'utf8'),context);
  await settle();
  await node('my-projects').querySelector('button').emit('click');
  async function type(value){node('invite-name').value=value;await node('invite-name').emit('input');}
  async function tick(){const pending=[...timers.values()];timers.clear();for(const {fn} of pending)fn();await settle();}
  return {node,type,tick,requests,timers,focused:()=>focused};
}

test('two characters and debounce are required; namesakes are selectable buttons, never auto-selected',async()=>{
  const p=await page();await p.type('a');await p.tick();
  assert.equal(p.requests.filter(r=>r.url.includes('/invitees?')).length,0);
  await p.type('Al');assert.match(p.node('invite-status').textContent,/Searching/);
  assert.equal([...p.timers.values()][0].delay,250);
  await p.type('Ali');await p.tick();
  assert.equal(p.requests.filter(r=>r.url.includes('/invitees?')).length,1);
  const results=p.node('invite-results').querySelectorAll('button');
  assert.equal(results.length,2);assert.match(results[1].textContent,/Business.*Designer/);
  assert.equal(results[0].type,'button');assert.equal(p.node('invite-submit').disabled,true);
  await p.node('invite-form').emit('submit');
  assert.equal(p.requests.filter(r=>r.options.method==='POST').length,0);
});

test('explicitly choosing the second namesake sends that public ID and selected role',async()=>{
  const p=await page();await p.type('Alice');await p.tick();
  await p.node('invite-name').emit('keydown',{key:'ArrowDown'});
  assert.equal(p.focused(),p.node('invite-results').querySelector('button'));
  await p.node('invite-results').querySelectorAll('button')[1].emit('click');
  assert.equal(p.node('invite-submit').disabled,false);
  assert.equal(p.focused(),p.node('invite-name'));
  p.node('role').value='Backend Developer';await p.node('invite-form').emit('submit');
  const sent=p.requests.find(r=>r.options.method==='POST');
  assert.equal(sent.url,'https://api.example/api/r3/projects/'+PROJECT+'/invite');
  assert.deepEqual(JSON.parse(sent.options.body),{student_id:students[1].id,role:'Backend Developer'});
  assert.equal(sent.options.credentials,'include');
  assert.equal(p.node('invite-submit').disabled,true);
});

test('editing search text clears selection and blocks invite until a new result is selected',async()=>{
  const p=await page();await p.type('Alice');await p.tick();
  await p.node('invite-results').querySelector('button').emit('click');
  await p.type('Alice S');assert.equal(p.node('invite-submit').disabled,true);
  await p.node('invite-form').emit('submit');assert.equal(p.requests.filter(r=>r.options.method==='POST').length,0);
});

test('stale responses cannot replace newer results, including before the next debounce fires',async()=>{
  const pending=new Map();
  const p=await page({lookup:q=>new Promise(resolve=>pending.set(q,resolve))});
  await p.type('Al');await p.tick();await p.type('Bob');
  pending.get('Al')({students});await settle();
  assert.equal(p.node('invite-results').children.length,0);
  await p.tick();await p.type('Alice');await p.tick();
  pending.get('Alice')({students});await settle();
  pending.get('Bob')({students:[{id:'wrong',name:'Bob'}]});await settle();
  assert.equal(p.node('invite-results').querySelectorAll('button').length,2);
  assert.match(p.node('invite-results').querySelector('button').textContent,/Alice/);
});

test('empty and failed lookups explain fallback and remain unselected',async()=>{
  let fail=false;const p=await page({lookup:async()=>{if(fail)throw Error('Offline');return {students:[]};}});
  await p.type('Nobody');await p.tick();assert.match(p.node('invite-status').textContent,/No matches.*public ID.*not published/);
  fail=true;await p.type('Alice');await p.tick();assert.match(p.node('invite-status').textContent,/Could not search.*public ID/);
  assert.equal(p.node('invite-submit').disabled,true);
});

test('public ID fallback submits an unpublished student ID and invalidates pending name search',async()=>{
  let finish;const p=await page({lookup:()=>new Promise(resolve=>{finish=resolve;})});
  await p.type('Alice');await p.tick();
  p.node('invite-by-id').checked=true;await p.node('invite-by-id').emit('change');
  finish({students});await settle();assert.equal(p.node('invite-results').children.length,0);
  assert.equal(p.node('invite-name-panel').hidden,true);assert.equal(p.node('invite-id-panel').hidden,false);
  assert.equal(p.node('invite-id').required,true);assert.equal(p.node('invite-name').disabled,true);
  p.node('invite-id').value=' U00000000-0000-4000-8000-000000000004 ';
  await p.node('invite-id').emit('input');assert.equal(p.node('invite-submit').disabled,false);
  await p.node('invite-form').emit('submit');
  assert.equal(JSON.parse(p.requests.find(r=>r.options.method==='POST').options.body).student_id,'U00000000-0000-4000-8000-000000000004');
});

test('changing project or starting a new project invalidates pending lookup and selection',async()=>{
  let finish;const p=await page({lookup:()=>new Promise(resolve=>{finish=resolve;})});
  await p.type('Alice');await p.tick();await p.node('new-project').emit('click');
  finish({students});await settle();assert.equal(p.node('invite-results').children.length,0);
  assert.equal(p.node('invite-submit').disabled,true);
});

test('non-maintainer cannot search or submit invitations',async()=>{
  const p=await page({canEdit:false});
  assert.equal(p.node('invite-name').disabled,true);assert.equal(p.node('invite-by-id').disabled,true);
  await p.type('Alice');await p.tick();await p.node('invite-form').emit('submit');
  assert.equal(p.requests.filter(r=>r.url.includes('/invitees?')||r.options.method==='POST').length,0);
});
