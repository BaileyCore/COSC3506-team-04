'use strict';
const { computeAvailability } = require('./final_routes.cjs');

/**
 * Bounded SQL-level directory query (F.28) with stale availability enforcement (F.14)
 * and strict public-only column selection (F.20 — never selects legacy_email or claimed_by_user_id).
 */
async function queryStudentsDirectory(pool, query = {}) {
  const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
  const requestedSkills = query.skill
    ? (Array.isArray(query.skill) ? query.skill : [query.skill]).map((v) => String(v).trim()).filter(Boolean)
    : [];
  const requestedAvailability = query.availability
    ? (Array.isArray(query.availability) ? query.availability : [query.availability]).map((v) => String(v).trim()).filter(Boolean)
    : [];
  const requestedStatuses = query.status
    ? (Array.isArray(query.status) ? query.status : [query.status]).map((v) => String(v).trim()).filter(Boolean)
    : [];
  const requestedAvailabilityState = typeof query.availability_state === 'string'
    ? query.availability_state.trim().toLowerCase()
    : '';

  const rawLimit = Number.parseInt(String(query.limit ?? '20'), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 20;
  const rawPage = Number.parseInt(String(query.page ?? '1'), 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const offset = (page - 1) * limit;

  const where = ["s.profile_status = 'published'", 's.merged_into_id IS NULL'];
  const params = [];
  const addParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  if (search) {
    const p = addParam(search);
    where.push(`(
      position(${p} in lower(s.name)) > 0
      OR position(${p} in lower(s.headline)) > 0
      OR EXISTS (
        SELECT 1 FROM student_skills ss_s
        WHERE ss_s.student_id = s.id AND position(${p} in lower(ss_s.skill_name)) > 0
      )
    )`);
  }

  for (const sk of requestedSkills) {
    const p = addParam(sk);
    where.push(`EXISTS (SELECT 1 FROM student_skills ss_f WHERE ss_f.student_id = s.id AND ss_f.skill_name = ${p})`);
  }

  if (requestedAvailability.length > 0) {
    const p = addParam(requestedAvailability);
    // F.14: Stale availability (>365 days) must NOT match active job-seeking availability filters
    where.push(`s.availability_state = 'active'`);
    where.push(`(s.availability_confirmed_at IS NULL OR s.availability_confirmed_at >= NOW() - INTERVAL '365 days')`);
    where.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(s.availability) AS av WHERE av = ANY(${p}::text[]))`);
  }

  if (requestedStatuses.length > 0) {
    const p = addParam(requestedStatuses);
    where.push(`s.status = ANY(${p}::text[])`);
  }

  if (requestedAvailabilityState === 'active') {
    where.push(`s.availability_state = 'active'`);
    where.push(`jsonb_array_length(s.availability) > 0`);
    where.push(`(s.availability_confirmed_at IS NULL OR s.availability_confirmed_at >= NOW() - INTERVAL '365 days')`);
  } else if (requestedAvailabilityState === 'showcase') {
    where.push(`(
      s.availability_state = 'showcase'
      OR jsonb_array_length(s.availability) = 0
      OR (s.availability_confirmed_at IS NOT NULL AND s.availability_confirmed_at < NOW() - INTERVAL '365 days')
    )`);
  }

  const whereSql = where.join(' AND ');
  const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM students s WHERE ${whereSql}`, params);
  const total = countRes.rows[0]?.total || 0;

  const limitParam = addParam(limit);
  const offsetParam = addParam(offset);

  const dataRes = await pool.query(
    `SELECT
      s.id,
      s.name,
      s.headline,
      s.program,
      s.location,
      s.theme,
      s.section_order,
      s.status,
      s.profile_status,
      s.availability,
      s.availability_state,
      s.availability_confirmed_at,
      s.links,
      COALESCE(
        json_agg(DISTINCT ss.skill_name) FILTER (WHERE ss.skill_name IS NOT NULL),
        '[]'
      ) AS skills,
      COUNT(DISTINCT pc.project_id)::int AS project_count
    FROM students s
    LEFT JOIN student_skills ss ON ss.student_id = s.id
    LEFT JOIN project_contributors pc ON pc.student_id = s.id
    WHERE ${whereSql}
    GROUP BY s.id
    ORDER BY s.name ASC, s.id ASC
    LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  const students = dataRes.rows.map((row) => ({
    ...row,
    ...computeAvailability(row),
  }));

  return {
    students,
    total,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function queryStudentDetail(pool, id) {
  const studentResult = await pool.query(
    `SELECT
      s.id,
      s.name,
      s.headline,
      s.program,
      s.biography,
      s.location,
      s.theme,
      s.section_order,
      s.status,
      s.profile_status,
      s.availability,
      s.availability_state,
      s.availability_confirmed_at,
      s.links,
      COALESCE(
        json_agg(DISTINCT ss.skill_name) FILTER (WHERE ss.skill_name IS NOT NULL),
        '[]'
      ) AS skills
    FROM students s
    LEFT JOIN student_skills ss ON ss.student_id = s.id
    WHERE s.id = $1 AND s.profile_status = 'published' AND s.merged_into_id IS NULL
    GROUP BY s.id`,
    [id]
  );

  if (studentResult.rows.length === 0) {
    // F.18: Continuity after duplicate student merge (never bare 404 for a merged profile)
    const redirect = await pool.query(
      "SELECT target_id, reason FROM final_merge_redirects WHERE entity_type='student' AND source_id=$1",
      [id]
    );
    if (redirect.rows.length > 0) {
      const targetId = redirect.rows[0].target_id;
      const target = await pool.query(
        "SELECT id, name FROM students WHERE id=$1 AND profile_status='published' AND merged_into_id IS NULL",
        [targetId]
      );
      if (target.rows.length > 0) {
        return {
          status: 200,
          body: {
            merged: true,
            merged_into_id: target.rows[0].id,
            target_name: target.rows[0].name,
            redirect_url: '/student.html?id=' + encodeURIComponent(target.rows[0].id),
            message: redirect.rows[0].reason || `This profile was merged into ${target.rows[0].name}.`,
          },
        };
      }
    }
    return { status: 404, body: { error: 'Student not found' } };
  }

  const projectResult = await pool.query(
    `SELECT
      p.id,
      p.title,
      p.description,
      p.domain,
      p.technologies,
      p.links,
      pc.role
    FROM projects p
    JOIN project_contributors pc ON pc.project_id = p.id
    WHERE pc.student_id = $1
    ORDER BY p.title ASC`,
    [id]
  );

  const row = studentResult.rows[0];
  return {
    status: 200,
    body: {
      ...row,
      ...computeAvailability(row),
      projects: projectResult.rows,
    },
  };
}

module.exports = { queryStudentsDirectory, queryStudentDetail };
