'use strict';

// Resolve an editor target from the signed-in account, never from a claimed
// identity supplied by the browser. Imported portfolios retain their public ID.
async function profileTarget(db, userId, requestedId, lock = false) {
  const ownId = 'U' + userId;
  if (requestedId !== undefined && (typeof requestedId !== 'string' || !requestedId || requestedId.length > 80)) {
    throw Object.assign(new Error('Invalid profile selection.'), { status: 400 });
  }
  const id = requestedId || ownId;
  const { rows } = await db.query(
    `SELECT * FROM students WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id]
  );
  const student = rows[0];
  if (student?.merged_into_id) {
    throw Object.assign(new Error('This profile was merged. Select the surviving profile.'), { status: 409 });
  }
  if (id !== ownId && (!student || student.claimed_by_user_id !== userId)) {
    throw Object.assign(new Error('You do not own this profile.'), { status: 403 });
  }
  // A staff reassignment can also move an account-created public record.
  if (student?.claimed_by_user_id && student.claimed_by_user_id !== userId) {
    throw Object.assign(new Error('You do not own this profile.'), { status: 403 });
  }
  return { id, student, imported: id !== ownId };
}

async function editorProfile(db, userId, target, lock = false) {
  if (!target.imported) {
    const { rows } = await db.query(`SELECT profile, published FROM r2_profiles WHERE user_id=$1 ${lock ? 'FOR UPDATE' : ''}`, [userId]);
    return rows[0] || { profile: {}, published: false };
  }
  const { rows } = await db.query(
    `SELECT profile FROM final_profile_drafts WHERE student_id=$1 AND user_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [target.id, userId]
  );
  const s = target.student;
  const skills = await db.query('SELECT skill_name FROM student_skills WHERE student_id=$1 ORDER BY skill_name', [target.id]);
  // On first ownership, seed only from the public portfolio; another owner's
  // private draft is never transferred during staff recovery/reassignment.
  const profile = rows[0]?.profile || {
    name: s.name, headline: s.headline, program: s.program,
    biography: s.biography, location: s.location, status: s.status,
    theme: s.theme, section_order: s.section_order,
    availability: s.availability, availability_state: s.availability_state,
    availability_confirmed_at: s.availability_confirmed_at,
    links: s.links, skills: skills.rows.map(r => r.skill_name),
    show_availability: true, show_links: true,
  };
  return { profile, published: s.profile_status === 'published' };
}

async function saveEditorProfile(db, userId, target, profile) {
  if (target.imported) {
    await db.query(
      `INSERT INTO final_profile_drafts (student_id,user_id,profile) VALUES ($1,$2,$3::jsonb)
       ON CONFLICT (student_id,user_id) DO UPDATE SET profile=EXCLUDED.profile, updated_at=NOW()`,
      [target.id, userId, JSON.stringify(profile)]
    );
  } else {
    await db.query(
      `INSERT INTO r2_profiles (user_id,profile) VALUES ($1,$2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET profile=EXCLUDED.profile, updated_at=NOW()`,
      [userId, JSON.stringify(profile)]
    );
  }
}

module.exports = { profileTarget, editorProfile, saveEditorProfile };
