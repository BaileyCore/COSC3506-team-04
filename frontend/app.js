'use strict';
const main = document.getElementById('main');
const apiBase = window.API_BASE_URL.replace(/\/$/, '');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e = escapeHtml;
const route = (type, id, inquiry = false) => `/?${type}=${encodeURIComponent(id)}${inquiry ? '&inquiry=1' : ''}`;
const badges = values => `<div class="badges">${values.map(value => `<span class="badge">${e(value)}</span>`).join('')}</div>`;
let directoryState = new URLSearchParams(location.search);
let requestNumber = 0;
async function api(path, options) {
  const response = await fetch(`${apiBase}/api${path}`, {...options, signal: AbortSignal.timeout(90000)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status})`), {status: response.status});
  return data;
}
function links(values) {
  return `<div class="links">${Object.entries(values || {}).flatMap(([label, url]) => {
    try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return []; } catch { return []; }
    return [`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗<span class="meta"> (new tab)</span></a>`];
  }).join('')}</div>`;
}
function projectCard(p) { return `<article class="card"><p class="eyebrow">${e(p.domain || 'Project evidence')}</p><h2><a href="${route('project', p.id)}">${e(p.title)}</a></h2><p>${e(p.description)}</p>${badges(p.technologies)}<p class="meta muted">${p.contributors.map(c => `${e(c.name)} · ${e(c.role)}`).join('<br>')}</p></article>`; }
function notFound(message) {
  main.innerHTML = `<h1>Page not found</h1><p>${e(message)}</p><a class="button" href="/">Return to talent directory</a>`;
  document.title = 'Page not found — ImmXrsive';
}
function errorState(error) { main.innerHTML = `<h1>We couldn’t load this page</h1><p class="error" role="alert">${e(error.message)}</p><p>The backend may be starting. Please try again.</p><button id="retry">Try again</button> <a href="/">Talent directory</a>`; document.getElementById('retry').onclick = () => location.reload(); }
async function directory() {
  document.title = 'Discover Talent — ImmXrsive';
  const skills = await api('/skills');
  const group = (name, title, options) => `<fieldset><legend>${title}</legend><div class="${name === 'skill' ? 'skill-options' : ''}">${options.map((value, index) => `<label for="${name}-${index}"><input type="checkbox" id="${name}-${index}" name="${name}" value="${e(value)}" ${directoryState.getAll(name).includes(value) ? 'checked' : ''}>${e(value)}</label>`).join('')}</div></fieldset>`;
  main.innerHTML = `<p class="eyebrow">Public talent discovery</p><h1>Find the skills.<br>See the evidence.</h1><p class="intro">Explore student and alumni talent, discover their contributions, and start a conversation about your next opportunity.</p><div class="layout"><form id="filters" class="panel filters"><h2>Find your match</h2><label for="search">Search name, headline, or skill</label><input type="search" name="search" id="search" value="${e(directoryState.get('search') || '')}" placeholder="Try Unity or developer">${group('skill','Skills — match all selected',skills)}${group('availability','Availability',['internship','full-time','contract'])}${group('status','Student status',['current','alumni'])}<button type="submit">Apply filters</button> <button class="secondary" type="button" id="clear">Clear all</button></form><section aria-label="Matching talent"><div class="results-top"><p id="count" role="status" aria-live="polite">Loading published profiles…</p><div class="chips" id="active"></div></div><div id="results" class="grid"></div></section></div>`;
  const form = document.getElementById('filters');
  form.onsubmit = event => {event.preventDefault(); directoryState = new URLSearchParams(new FormData(form)); if (!directoryState.get('search')?.trim()) directoryState.delete('search'); history.replaceState(null, '', directoryState.size ? `/?${directoryState}` : '/'); updateResults();};
  document.getElementById('clear').onclick = () => { form.reset(); form.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false); form.querySelector('#search').value = ''; directoryState = new URLSearchParams(); history.replaceState(null, '', '/'); updateResults(); };
  await updateResults();
}
async function updateResults() {
  const current = ++requestNumber;
  const count = document.getElementById('count'), results = document.getElementById('results'), active = document.getElementById('active');
  active.innerHTML = '';
  for (const [key, value] of directoryState) {
    const button = document.createElement('button'); button.textContent = `${key}: ${value} ×`; button.setAttribute('aria-label', `Clear ${key} filter ${value}`);
    button.onclick = () => { const remaining = directoryState.getAll(key).filter(v => v !== value); directoryState.delete(key); remaining.forEach(v => directoryState.append(key, v)); history.replaceState(null, '', directoryState.size ? `/?${directoryState}` : '/'); directory().catch(errorState); };
    active.append(button);
  }
  count.textContent = 'Loading matches…'; results.setAttribute('aria-busy','true');
  try {
    const students = await api(`/students?${directoryState}`);
    if (current !== requestNumber) return;
    count.textContent = `${students.length} ${students.length === 1 ? 'profile' : 'profiles'} found`;
    results.innerHTML = students.length ? students.map(s => `<article class="card"><p class="eyebrow">${e(s.status)} · ${e(s.program)}</p><h2><a href="${route('student',s.id)}">${e(s.name)}</a></h2><p>${e(s.headline)}</p>${badges(s.skills)}<p class="meta muted">Available for ${s.availability.map(e).join(', ')}<br>${s.project_count} ${s.project_count === 1 ? 'project' : 'projects'} with evidence</p><a class="button secondary" href="${route('student',s.id)}">View profile<span class="meta"> — ${e(s.name)}</span></a></article>`).join('') : '<div class="panel"><h2>No matching talent</h2><p>Try fewer skills or clear your filters to see more profiles.</p></div>';
  } catch (error) { if (current !== requestNumber) return; count.textContent = 'Results unavailable'; results.innerHTML = `<p class="error" role="alert">${e(error.message)}. Try applying the filters again.</p>`; }
  finally { if (current === requestNumber) results.removeAttribute('aria-busy'); }
}
async function detail(type, id, inquiry) {
  const item = await api(`/${type === 'student' ? 'students' : 'projects'}/${encodeURIComponent(id)}`);
  const name = type === 'student' ? item.name : item.title;
  document.title = `${name} — ImmXrsive`;
  const shell = type === 'student' ? `<p class="eyebrow">${e(item.status)} · ${e(item.program)}</p><h1>${e(item.name)}</h1><p>${e(item.headline)}</p><p>Available for ${item.availability.map(e).join(', ')}</p><h2>Standardized skills</h2>${badges(item.skills)}${links(item.links)}` : `<p class="eyebrow">${e(item.domain)}</p><h1>${e(item.title)}</h1><p>${e(item.description)}</p><h2>Technologies</h2>${badges(item.technologies)}<h2>Contributors and roles</h2><ul>${item.contributors.map(c => `<li>${c.student_id ? `<a href="${route('student',c.student_id)}">${e(c.name)}</a>` : e(c.name)} — ${e(c.role)}</li>`).join('')}</ul><h2>Public links and media</h2>${links(item.links)}<p class="meta muted">External evidence opens separately. Some synthetic fixture links may be unavailable.</p>`;
  main.innerHTML = `<a class="back" href="/">← Talent directory</a><section class="panel profile-shell">${shell}${inquiry ? '' : `<a class="button" href="${route(type,id,true)}">${type === 'student' ? 'Interested in working with this student' : 'Inquire about this project'}</a>`}</section>${inquiry ? '<div id="intake"></div>' : type === 'student' ? `<h2>Project evidence (${item.projects.length})</h2><div class="project-list">${item.projects.map(projectCard).join('')}</div>` : ''}`;
  if (inquiry) inquiryForm(type,item,name);
}
function inquiryForm(type,item,name) {
  const sourceUrl = new URL(route(type,item.id), location.origin).href;
  const area = document.getElementById('intake');
  area.innerHTML = `<section class="panel inquiry"><h2>Employer inquiry</h2><p class="notice">Simulated course intake. Your inquiry will be saved for demonstration; no message is sent to the student or project team. Use fictional contact details.</p><p>Regarding <strong>${e(name)}</strong> (${e(item.id)})</p><form id="inquiry-form"><input type="hidden" name="source_type" value="${e(type)}"><input type="hidden" name="source_id" value="${e(item.id)}"><input type="hidden" name="source_name" value="${e(name)}"><input type="hidden" name="source_url" value="${e(sourceUrl)}"><label for="company">Company name</label><input id="company" name="company_name" type="text" required maxlength="5000" autocomplete="organization"><label for="contact">Contact name</label><input id="contact" name="contact_name" type="text" required maxlength="5000" autocomplete="name"><label for="email">Contact email</label><input id="email" name="contact_email" type="email" required maxlength="5000" autocomplete="email"><label for="description">Inquiry description</label><textarea id="description" name="inquiry_description" required maxlength="5000"></textarea><button type="submit">Submit simulated inquiry</button><p id="form-status" role="status" aria-live="polite"></p></form></section>`;
  document.getElementById('inquiry-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'), status = document.getElementById('form-status'); button.disabled = true; status.textContent = 'Saving inquiry…';
    try {
      const result = await api('/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      area.innerHTML = `<section class="panel inquiry"><h2>Simulated inquiry saved</h2><p role="status">Reference ${e(result.id)} is linked to ${e(result.source_name)} (${e(result.source_id)}).</p><p>This was a demonstration. No email or message was sent.</p><a class="button" href="${route(type,item.id)}">Back to ${type === 'student' ? 'profile' : 'project'}</a></section>`;
      area.querySelector('h2').tabIndex = -1; area.querySelector('h2').focus();
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  };
}
(async () => {
  try {
    const params = new URLSearchParams(location.search);
    if (location.pathname !== '/' && location.pathname !== '/index.html') return notFound('This route does not exist.');
    if (params.has('student') && params.has('project')) return notFound('Choose one student or project.');
    if (params.has('student')) await detail('student',params.get('student'),params.has('inquiry'));
    else if (params.has('project')) await detail('project',params.get('project'),params.has('inquiry'));
    else await directory();
  } catch (error) { if (error.status === 404) notFound(error.message); else errorState(error); }
})();
