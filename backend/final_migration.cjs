'use strict';
/**
 * Repeatable, idempotent legacy & scale migration engine (F.01-F.06, F.27).
 * Uses ordinary application tables (students, student_skills, projects,
 * project_contributors, r4_partners, r4_collaborations) so migrated and scale
 * records flow through the exact same query paths as ordinary records.
 */

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function normalizeDomain(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

function mapPublication(value) {
  const raw = String(value || 'published').trim().toLowerCase();
  if (raw === 'retired' || raw === 'archived') return 'retired';
  if (raw === 'unpublished' || raw === 'draft') return 'draft';
  return 'published';
}

function mapAvailability(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim().toLowerCase()];
  }
  return [];
}

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function importLegacyExport(pool, payload, options = {}) {
  const students = Array.isArray(payload?.students) ? payload.students : [];
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  const companies = Array.isArray(payload?.companies) ? payload.companies : [];
  const collaborations = Array.isArray(payload?.collaborations) ? payload.collaborations : [];

  const counts = {
    students: { created: 0, updated: 0, skipped: 0, conflicts: 0 },
    projects: { created: 0, updated: 0, skipped: 0, conflicts: 0 },
    companies: { created: 0, updated: 0, skipped: 0, conflicts: 0 },
    collaborations: { created: 0, updated: 0, skipped: 0, conflicts: 0 },
  };

  const duplicate_student_candidates = [];
  const duplicate_company_candidates = [];
  const broken_references = [];
  const unclaimed_profiles = [];

  // 1. Detect duplicate student candidates by normalized email (and explicit hint)
  const emailFirstSeen = new Map();
  const duplicateStudentIds = new Set();
  for (const s of students) {
    const legacyId = String(s.legacy_id || s.id || '').trim();
    if (!legacyId) continue;
    const email = normalizeEmail(s.email);
    if (email) {
      if (emailFirstSeen.has(email)) {
        duplicate_student_candidates.push({
          legacy_id: legacyId,
          possible_duplicate_of: emailFirstSeen.get(email),
          reason: 'same email',
        });
        duplicateStudentIds.add(legacyId);
        counts.students.conflicts++;
      } else {
        emailFirstSeen.set(email, legacyId);
      }
    } else if (s.possible_duplicate_of) {
      duplicate_student_candidates.push({
        legacy_id: legacyId,
        possible_duplicate_of: String(s.possible_duplicate_of),
        reason: 'flagged possible duplicate',
      });
      duplicateStudentIds.add(legacyId);
      counts.students.conflicts++;
    }
  }

  // 2. Import students idempotently by legacy_id
  const knownStudentIds = new Set();
  const existingStudentsRes = await pool.query('SELECT id, legacy_id FROM students');
  for (const row of existingStudentsRes.rows) {
    knownStudentIds.add(row.id);
    if (row.legacy_id) knownStudentIds.add(row.legacy_id);
  }

  for (const s of students) {
    const legacyId = String(s.legacy_id || s.id || '').trim();
    if (!legacyId || !s.name) {
      counts.students.conflicts++;
      continue;
    }
    const status = String(s.status || 'current').trim().toLowerCase() === 'alumni' ? 'alumni' : 'current';
    const profileStatus = mapPublication(s.publication);
    const availability = mapAvailability(s.availability);
    const availabilityState = availability.length > 0 ? 'active' : 'showcase';
    const confirmedAt = parseIsoDate(s.availability_confirmed);
    const legacyEmail = normalizeEmail(s.email);
    const headline = typeof s.headline === 'string' && s.headline.trim()
      ? s.headline.trim()
      : (status === 'alumni' ? 'ImmXrsive Alumni' : 'ImmXrsive Student');
    const program = typeof s.program === 'string' && s.program.trim()
      ? s.program.trim()
      : 'Computer Science / XR';

    const existing = await pool.query(
      'SELECT id, name, status, profile_status, availability, availability_state, availability_confirmed_at, legacy_email, claimed_by_user_id FROM students WHERE legacy_id=$1 OR id=$1',
      [legacyId]
    );

    if (existing.rows.length > 0) {
      const cur = existing.rows[0];
      const same =
        cur.name === s.name &&
        cur.status === status &&
        cur.profile_status === profileStatus &&
        JSON.stringify(cur.availability || []) === JSON.stringify(availability) &&
        cur.availability_state === availabilityState &&
        (cur.legacy_email || null) === legacyEmail;

      if (same) {
        counts.students.skipped++;
      } else {
        await pool.query(
          `UPDATE students
           SET name=$2, status=$3, profile_status=$4, availability=$5::jsonb,
               availability_state=$6, availability_confirmed_at=$7, legacy_id=$1, legacy_email=$8
           WHERE id=$9`,
          [legacyId, s.name, status, profileStatus, JSON.stringify(availability), availabilityState, confirmedAt, legacyEmail, cur.id]
        );
        counts.students.updated++;
      }
      knownStudentIds.add(cur.id);
      knownStudentIds.add(legacyId);
      if (s.claimed === false && !cur.claimed_by_user_id && !duplicateStudentIds.has(legacyId)) {
        unclaimed_profiles.push(legacyId);
      }
    } else {
      await pool.query(
        `INSERT INTO students (id, legacy_id, legacy_email, name, headline, program, status, profile_status, availability, availability_state, availability_confirmed_at, links)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, '{}'::jsonb)`,
        [legacyId, legacyEmail, s.name, headline, program, status, profileStatus, JSON.stringify(availability), availabilityState, confirmedAt]
      );
      counts.students.created++;
      knownStudentIds.add(legacyId);
      if (s.claimed === false && !duplicateStudentIds.has(legacyId)) {
        unclaimed_profiles.push(legacyId);
      }
    }

    if (Array.isArray(s.skills) && s.skills.length > 0) {
      for (const skill of s.skills) {
        const cleanSkill = String(skill || '').trim();
        if (!cleanSkill) continue;
        await pool.query('INSERT INTO skills (name) VALUES ($1) ON CONFLICT DO NOTHING', [cleanSkill]);
        await pool.query(
          'INSERT INTO student_skills (student_id, skill_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [legacyId, cleanSkill]
        );
      }
    }
  }

  // 3. Import projects and shared contributor links, reporting broken student references
  const knownProjectIds = new Set();
  const existingProjectsRes = await pool.query('SELECT id, legacy_id FROM projects');
  for (const row of existingProjectsRes.rows) {
    knownProjectIds.add(row.id);
    if (row.legacy_id) knownProjectIds.add(row.legacy_id);
  }

  for (const p of projects) {
    const legacyId = String(p.legacy_id || p.id || '').trim();
    if (!legacyId || !p.title) {
      counts.projects.conflicts++;
      continue;
    }
    const description = typeof p.description === 'string' && p.description.trim()
      ? p.description.trim()
      : `Migrated project: ${p.title}`;
    const domain = typeof p.domain === 'string' && p.domain.trim() ? p.domain.trim() : 'XR / Software';
    const technologies = Array.isArray(p.technologies) ? p.technologies : [];
    const links = {};
    if (typeof p.repository === 'string' && /^https:\/\//i.test(p.repository.trim())) {
      links.repository = p.repository.trim();
    }
    if (typeof p.demo_url === 'string' && /^https:\/\//i.test(p.demo_url.trim())) {
      links.demo = p.demo_url.trim();
    }

    const existing = await pool.query(
      'SELECT id, title, description, domain, technologies, links FROM projects WHERE legacy_id=$1 OR id=$1',
      [legacyId]
    );
    if (existing.rows.length > 0) {
      const cur = existing.rows[0];
      const same =
        cur.title === p.title &&
        cur.description === description &&
        JSON.stringify(cur.technologies || []) === JSON.stringify(technologies) &&
        JSON.stringify(cur.links || {}) === JSON.stringify(links);
      if (same) {
        counts.projects.skipped++;
      } else {
        await pool.query(
          'UPDATE projects SET title=$2, description=$3, domain=$4, technologies=$5::jsonb, links=$6::jsonb, legacy_id=$1 WHERE id=$7',
          [legacyId, p.title, description, domain, JSON.stringify(technologies), JSON.stringify(links), cur.id]
        );
        counts.projects.updated++;
      }
      knownProjectIds.add(cur.id);
      knownProjectIds.add(legacyId);
    } else {
      await pool.query(
        'INSERT INTO projects (id, legacy_id, title, description, domain, technologies, links) VALUES ($1, $1, $2, $3, $4, $5::jsonb, $6::jsonb)',
        [legacyId, p.title, description, domain, JSON.stringify(technologies), JSON.stringify(links)]
      );
      counts.projects.created++;
      knownProjectIds.add(legacyId);
    }

    const contributors = Array.isArray(p.contributors) ? p.contributors : [];
    for (const c of contributors) {
      const studentRef = String(c.student_legacy_id || c.student_id || '').trim();
      const role = String(c.role || 'Contributor').trim();
      if (!studentRef || !knownStudentIds.has(studentRef)) {
        broken_references.push({
          project_legacy_id: legacyId,
          student_legacy_id: studentRef || '(missing)',
        });
        counts.projects.conflicts++;
        continue;
      }
      await pool.query(
        `INSERT INTO project_contributors (project_id, student_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, student_id) DO UPDATE SET role = EXCLUDED.role`,
        [legacyId, studentRef, role]
      );
    }
  }

  // 4. Import companies into r4_partners idempotently by legacy_id, detecting domain duplicates
  const domainFirstSeen = new Map();
  const partnerIdByLegacy = new Map();
  const existingPartnersRes = await pool.query('SELECT id, legacy_id, name, website FROM r4_partners');
  for (const row of existingPartnersRes.rows) {
    if (row.legacy_id) partnerIdByLegacy.set(row.legacy_id, row.id);
  }

  for (const c of companies) {
    const legacyId = String(c.legacy_id || c.id || '').trim();
    if (!legacyId || !c.name) {
      counts.companies.conflicts++;
      continue;
    }
    const normDomain = normalizeDomain(c.domain || c.website || '');
    if (normDomain) {
      if (domainFirstSeen.has(normDomain)) {
        duplicate_company_candidates.push({
          legacy_id: legacyId,
          possible_duplicate_of: domainFirstSeen.get(normDomain),
          reason: 'same normalized domain',
        });
        counts.companies.conflicts++;
      } else {
        domainFirstSeen.set(normDomain, legacyId);
      }
    }
    const website = normDomain ? `https://${String(c.domain || normDomain).trim().replace(/^https?:\/\//, '')}` : '';
    const existing = await pool.query('SELECT id, name, website, published FROM r4_partners WHERE legacy_id=$1', [legacyId]);
    if (existing.rows.length > 0) {
      const cur = existing.rows[0];
      if (cur.name === c.name && cur.website === website) {
        counts.companies.skipped++;
      } else {
        await pool.query('UPDATE r4_partners SET name=$2, website=$3 WHERE id=$1', [cur.id, c.name, website]);
        counts.companies.updated++;
      }
      partnerIdByLegacy.set(legacyId, cur.id);
    } else {
      const inserted = await pool.query(
        `INSERT INTO r4_partners (legacy_id, name, website, description, published)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
        [legacyId, c.name, website, `Migrated industry partner (${legacyId}).`]
      );
      partnerIdByLegacy.set(legacyId, inserted.rows[0].id);
      counts.companies.created++;
    }
  }

  // 5. Import collaborations into r4_collaborations idempotently by legacy_id
  for (const col of collaborations) {
    const legacyId = String(col.legacy_id || col.id || '').trim();
    const companyLegacyId = String(col.company_legacy_id || '').trim();
    const partnerUuid = partnerIdByLegacy.get(companyLegacyId);
    if (!legacyId || !partnerUuid) {
      broken_references.push({
        collaboration_legacy_id: legacyId || '(missing)',
        company_legacy_id: companyLegacyId || '(missing)',
      });
      counts.collaborations.conflicts++;
      continue;
    }
    const status = col.status === 'current' ? 'current' : 'past';
    const visibility = ['public', 'limited', 'private'].includes(col.visibility) ? col.visibility : 'private';
    const period = typeof col.period === 'string' && col.period.trim()
      ? col.period.trim()
      : (status === 'current' ? 'Current' : 'Historical');
    const rawProjectIds = Array.isArray(col.project_legacy_ids) ? col.project_legacy_ids : [];
    const validProjectIds = [];
    for (const pid of rawProjectIds) {
      if (knownProjectIds.has(pid)) {
        validProjectIds.push(pid);
      } else {
        broken_references.push({
          collaboration_legacy_id: legacyId,
          project_legacy_id: pid,
        });
        counts.collaborations.conflicts++;
      }
    }

    const existing = await pool.query(
      'SELECT id, partner_id, title, status, visibility, project_ids FROM r4_collaborations WHERE legacy_id=$1',
      [legacyId]
    );
    if (existing.rows.length > 0) {
      const cur = existing.rows[0];
      const same =
        cur.partner_id === partnerUuid &&
        cur.title === col.title &&
        cur.status === status &&
        cur.visibility === visibility &&
        JSON.stringify(cur.project_ids || []) === JSON.stringify(validProjectIds);
      if (same) {
        counts.collaborations.skipped++;
      } else {
        await pool.query(
          'UPDATE r4_collaborations SET partner_id=$2, title=$3, period=$4, status=$5, visibility=$6, project_ids=$7 WHERE id=$1',
          [cur.id, partnerUuid, col.title, period, status, visibility, validProjectIds]
        );
        counts.collaborations.updated++;
      }
    } else {
      await pool.query(
        `INSERT INTO r4_collaborations (legacy_id, partner_id, title, period, description, outcome, status, visibility, public_summary, project_ids, student_ids)
         VALUES ($1, $2, $3, $4, $5, '', $6, $7, $8, $9, '{}')`,
        [
          legacyId,
          partnerUuid,
          col.title,
          period,
          `Migrated ${status} collaboration (${legacyId}).`,
          status,
          visibility,
          visibility === 'limited' ? `Anonymized historical collaboration (${period}).` : '',
          validProjectIds,
        ]
      );
      counts.collaborations.created++;
    }
  }

  const report = {
    source_counts: {
      students: students.length,
      projects: projects.length,
      companies: companies.length,
      collaborations: collaborations.length,
    },
    operation_counts: counts,
    duplicate_student_candidates,
    duplicate_company_candidates,
    broken_references,
    unclaimed_profiles,
  };

  if (options.recordRun !== false) {
    await pool.query(
      'INSERT INTO final_migration_runs (fixture_name, actor_id, report) VALUES ($1, $2, $3::jsonb)',
      [options.fixtureName || 'legacy_export.json', options.actorId || null, JSON.stringify(report)]
    );
  }

  return report;
}

module.exports = { importLegacyExport, normalizeEmail, normalizeDomain };
