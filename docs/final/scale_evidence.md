# Final Release Scale & Performance Evidence (F.27–F.29)

## Repeatable Scale Import Command (Same Code Path as Ordinary Records)

```bash
# Against PostgreSQL (using DATABASE_URL):
node scripts/migrate-legacy.mjs --file fixtures/final/scale_fixture.json

# Isolated local verification (in-memory PGlite):
node scripts/migrate-legacy.mjs --file fixtures/final/scale_fixture.json --pglite
```

The scale fixture is imported through `backend/final_migration.cjs` (`importLegacyExport`) directly into the ordinary `students`, `student_skills`, `projects`, `project_contributors`, and `r4_partners` tables, and queried via the ordinary `GET /api/students` (`backend/directory_query.cjs`) SQL path.

## Measured Local Results (`fixtures/final/scale_fixture.json`)

Executed locally on `final/launch-candidate` (2026-11-27, in-memory PGlite PostgreSQL):

- **Dataset imported:** **220 students** (208 published, 12 unpublished), **110 projects**, **25 companies**
- **Import duration:** **240 ms**
- **First-page directory query duration (`page=1&limit=20`):** **3 ms**

| Metric | 20-Student Subset (19 published) | 220-Student Scale Fixture (208 published, 12 unpublished) |
| :--- | :--- | :--- |
| Records returned on first load (`limit=20`) | 19 | **20** |
| Total matching published profiles | 19 | **208** (12 unpublished excluded server-side) |
| Total pages (`limit=20`) | 1 | **11** |
| JSON response payload size | **7,683 bytes** | **8,085 bytes** |
| Private fields (`legacy_email`, `claimed_by_user_id`) | Absent | **Absent** |
| Heavy media / playable runtimes / resumes fetched | None | **None** |

**Result:** Initial directory transfer stays bounded (~8 KB for 20 cards) whether the database holds 20 students or 220 students, satisfying **F.27**, **F.28**, and **F.29**. Covered automatically by `tests/final_scale_and_qa.test.mjs`.
