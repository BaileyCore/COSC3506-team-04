const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const tables = ['talent_students', 'talent_projects', 'talent_skills'];
async function initializeTalent(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize first-deployment imports across backend instances.
    await client.query('SELECT pg_advisory_xact_lock(350604)');
    for (const table of tables) await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS talent_inquiries (
      id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const result = await client.query('SELECT id FROM talent_students LIMIT 1');
    if (result.rows.length === 0) {
      const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
      const students = read('students'), projects = read('projects'), skills = read('skills');
      if (students.some(s => s.skills.some(skill => !skills.includes(skill)))) throw new Error('Unknown structured skill in seed data');
      for (const [table, records] of [[tables[0], students], [tables[1], projects], [tables[2], skills.map(name => ({id: name, name}))]]) {
        for (const record of records) await client.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2)`, [record.id, JSON.stringify(record)]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
const selected = value => (Array.isArray(value) ? value : value ? [value] : []).flatMap(x => typeof x === 'string' ? x.split(',') : []).map(x => x.trim()).filter(Boolean);
function filterStudents(students, query) {
  const text = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
  const skills = selected(query.skill), availability = selected(query.availability), status = selected(query.status);
  return students.filter(s => s.profile_status === 'published')
    .filter(s => !text || [s.name, s.headline, ...s.skills].some(x => x.toLowerCase().includes(text)))
    .filter(s => skills.every(skill => s.skills.includes(skill)))
    .filter(s => !availability.length || availability.some(value => s.availability.includes(value)))
    .filter(s => !status.length || status.includes(s.status))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function talentRouter(pool) {
  const router = express.Router();
  async function snapshot() {
    // A single SQL statement keeps students and projects in the same database snapshot.
    const { rows } = await pool.query("SELECT 'student' AS kind, data FROM talent_students UNION ALL SELECT 'project' AS kind, data FROM talent_projects");
    return {students: rows.filter(r => r.kind === 'student').map(r => r.data), projects: rows.filter(r => r.kind === 'project').map(r => r.data)};
  }
  const publicStudent = (s, projects) => ({...s, project_ids: s.project_ids.filter(id => projects.some(p => p.id === id)), project_count: s.project_ids.filter(id => projects.some(p => p.id === id)).length});
  const publicProject = (p, students) => ({...p, contributors: p.contributors.map(c => {
    const student = students.find(s => s.id === c.student_id && s.profile_status === 'published');
    return student ? {...c, name: student.name} : {role: c.role, name: 'Unpublished contributor'};
  })});
  router.get('/skills', asyncRoute(async (_req, res) => {
    const { rows } = await pool.query('SELECT data FROM talent_skills ORDER BY id');
    res.json(rows.map(r => r.data.name));
  }));
  router.get('/students', asyncRoute(async (req, res) => {
    const {students, projects} = await snapshot();
    res.json(filterStudents(students, req.query).map(s => publicStudent(s, projects)));
  }));
  router.get('/students/:id', asyncRoute(async (req, res) => {
    const {students, projects} = await snapshot();
    const student = students.find(s => s.id === req.params.id && s.profile_status === 'published');
    if (!student) return res.status(404).json({error: 'Student profile not found'});
    res.json({...publicStudent(student, projects), projects: projects.filter(p => student.project_ids.includes(p.id)).map(p => publicProject(p, students))});
  }));
  router.get('/projects/:id', asyncRoute(async (req, res) => {
    const {students, projects} = await snapshot();
    const project = projects.find(p => p.id === req.params.id);
    if (!project) return res.status(404).json({error: 'Project not found'});
    res.json(publicProject(project, students));
  }));
  router.post('/inquiries', asyncRoute(async (req, res) => {
    const body = req.body || {};
    const {students, projects} = await snapshot();
    const source = body.source_type === 'student' ? students.find(s => s.id === body.source_id && s.profile_status === 'published') : body.source_type === 'project' ? projects.find(p => p.id === body.source_id) : null;
    if (!source) return res.status(400).json({error: 'Choose a public student or project before making an inquiry.'});
    const data = {};
    for (const field of ['company_name', 'contact_name', 'contact_email', 'inquiry_description']) {
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > 5000) return res.status(400).json({error: `${field.replaceAll('_', ' ')} is required and must be at most 5000 characters.`});
      data[field] = body[field].trim();
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email)) return res.status(400).json({error: 'Enter a valid contact email.'});
    // Derive context on the server; do not trust user-supplied names or URLs.
    const publicBase = process.env.PUBLIC_FRONTEND_URL || 'https://cosc3506-team-04-1.onrender.com';
    Object.assign(data, {source_type: body.source_type, source_id: source.id, source_name: source.name || source.title, source_url: `${publicBase.replace(/\/$/, '')}/?${body.source_type}=${encodeURIComponent(source.id)}`});
    const result = await pool.query('INSERT INTO talent_inquiries (data) VALUES ($1) RETURNING id', [JSON.stringify(data)]);
    res.status(201).json({id: result.rows[0].id, simulated: true, source_type: data.source_type, source_id: data.source_id, source_name: data.source_name, source_url: data.source_url});
  }));
  return router;
}
module.exports = {initializeTalent, talentRouter, filterStudents};
