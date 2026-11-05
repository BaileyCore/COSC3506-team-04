'use strict';
const ROLES = Object.freeze([
  'Software Developer','XR Developer','Frontend Developer','Backend Developer',
  'Game Developer','3D Artist','Technical Artist','UI/UX Designer',
  'Project Manager','Researcher','QA/Tester','Data/AI Developer'
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v) { return typeof v === 'string' && UUID.test(v); }
function publicStudentId(id) {
  const cleaned = String(id || '').replace(/^U/i, '');
  return isUuid(cleaned) ? cleaned : null;
}
function githubRepo(input) {
  try {
    const u = new URL(String(input || '').trim());
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'github.com' || u.port || u.username || u.password || u.search || u.hash) return null;
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (parts.length !== 2 || !/^[\w-]{1,39}$/.test(parts[0]) || !/^[\w.-]{1,100}$/.test(parts[1])) return null;
    const name = parts[1].replace(/\.git$/i, '');
    if (!name || name === '.' || name === '..') return null;
    const owner = parts[0];
    return {url:`https://github.com/${owner}/${name}`, key:`${owner}/${name}`.toLowerCase(), owner, name};
  } catch { return null; }
}
function httpsUrl(value) {
  if (value === undefined || value === null || value === '') return null;
  try {
    const u = new URL(String(value).trim());
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname || u.href.length > 2048) return false;
    return u.href;
  } catch { return false; }
}
function projectPayload(input, previous) {
  const body = input || {};
  const base = previous || {};
  const get = (key, alt) => Object.prototype.hasOwnProperty.call(body, key) ? body[key] : (base[key] ?? alt);
  const title = String(get('title','')).trim().slice(0,180);
  if (!title) throw new Error('Project title is required');
  const description = String(get('description','')).trim().slice(0,5000);
  const domain = String(get('domain','Other')).trim().slice(0,120) || 'Other';
  const status = String(get('status','In progress')).trim().slice(0,32) || 'In progress';
  const tech = get('technologies',[]);
  if (!Array.isArray(tech)) throw new Error('Technologies must be an array');
  const technologies = [...new Set(tech.map(x=>String(x).trim()).filter(Boolean))].slice(0,25);
  let date = get('started_on',null);
  if (date instanceof Date) date=date.toISOString().slice(0,10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(Date.parse(String(date))))) throw new Error('Invalid start date');
  const playable_url = httpsUrl(get('playable_url',null));
  const video_url = httpsUrl(get('video_url',null));
  const fallback_url = httpsUrl(get('fallback_url',null));
  if ([playable_url,video_url,fallback_url].includes(false)) throw new Error('Demo, video and fallback URLs must be public HTTPS URLs');
  return {title,description,domain,status,technologies,started_on:date || null,playable_url,video_url,fallback_url};
}
module.exports = {ROLES,isUuid,publicStudentId,githubRepo,httpsUrl,projectPayload};
