import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const { importLegacyExport } = require('../backend/final_migration.cjs');

async function freshDb(t) {
  const db = new PGlite();
  t.after(() => db.close());
  const schema = (await readFile(new URL('../schema.sql', import.meta.url), 'utf8'))
    .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
  await db.exec(schema);
  // Also verify standalone backend/final_schema.sql is idempotent on top of schema.sql
  const finalSql = await readFile(new URL('../backend/final_schema.sql', import.meta.url), 'utf8');
  await db.exec(finalSql);
  return db;
}

test('F.01-F.06: legacy_export.json migration matches legacy_expected_results.json and is idempotent on re-import', async (t) => {
  const db = await freshDb(t);
  const legacy = JSON.parse(await readFile(new URL('../fixtures/final/legacy_export.json', import.meta.url), 'utf8'));
  const expected = JSON.parse(await readFile(new URL('../fixtures/final/legacy_expected_results.json', import.meta.url), 'utf8'));

  const run1 = await importLegacyExport(db, legacy, { fixtureName: 'legacy_export.json' });
  assert.deepEqual(run1.source_counts, expected.source_counts);
  assert.deepEqual(run1.duplicate_student_candidates, expected.duplicate_student_candidates);
  assert.deepEqual(run1.broken_references, expected.broken_references);
  assert.deepEqual(run1.unclaimed_profiles, expected.unclaimed_profiles);
  assert.equal(run1.operation_counts.students.created, 6);
  assert.equal(run1.operation_counts.projects.created, 3);
  assert.equal(run1.operation_counts.companies.created, 3);
  assert.equal(run1.operation_counts.collaborations.created, 4);

  // Verify shared project LP01 has both contributors (LS01, LS02)
  const lp01 = await db.query("SELECT student_id, role FROM project_contributors WHERE project_id='LP01' ORDER BY student_id");
  assert.deepEqual(lp01.rows, [
    { student_id: 'LS01', role: 'XR Developer' },
    { student_id: 'LS02', role: 'Interaction Developer' },
  ]);

  // Verify broken reference LS99 was NOT invented on LP02
  const lp02 = await db.query("SELECT student_id FROM project_contributors WHERE project_id='LP02'");
  assert.deepEqual(lp02.rows.map((r) => r.student_id), ['LS03']);

  // Verify retired contributor LS06 survives on historical project LP03
  const lp03 = await db.query("SELECT student_id FROM project_contributors WHERE project_id='LP03'");
  assert.deepEqual(lp03.rows.map((r) => r.student_id), ['LS06']);

  // Verify private collaboration LCO3 preserved private visibility
  const lco3 = await db.query("SELECT visibility FROM r4_collaborations WHERE legacy_id='LCO3'");
  assert.equal(lco3.rows[0].visibility, 'private');

  // F.02: Idempotent re-import creates 0 duplicates and skips unchanged records
  const run2 = await importLegacyExport(db, legacy, { fixtureName: 'legacy_export.json' });
  assert.equal(run2.operation_counts.students.created, 0);
  assert.equal(run2.operation_counts.students.skipped, 6);
  assert.equal(run2.operation_counts.projects.created, 0);
  assert.equal(run2.operation_counts.projects.skipped, 3);
  assert.equal(run2.operation_counts.companies.created, 0);
  assert.equal(run2.operation_counts.companies.skipped, 3);
  assert.equal(run2.operation_counts.collaborations.created, 0);
  assert.equal(run2.operation_counts.collaborations.skipped, 4);

  const totalStudents = (await db.query('SELECT COUNT(*)::int AS n FROM students')).rows[0].n;
  const totalProjects = (await db.query('SELECT COUNT(*)::int AS n FROM projects')).rows[0].n;
  const totalPartners = (await db.query('SELECT COUNT(*)::int AS n FROM r4_partners')).rows[0].n;
  const totalCollabs = (await db.query('SELECT COUNT(*)::int AS n FROM r4_collaborations')).rows[0].n;
  assert.equal(totalStudents, 6);
  assert.equal(totalProjects, 3);
  assert.equal(totalPartners, 3);
  assert.equal(totalCollabs, 4);
});
