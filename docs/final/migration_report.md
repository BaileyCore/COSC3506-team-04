# Final Release Legacy Migration Report (F.01–F.06)

## Repeatable Migration Command

```bash
# Against PostgreSQL (using DATABASE_URL):
node scripts/migrate-legacy.mjs --file fixtures/final/legacy_export.json

# Isolated local verification (in-memory PGlite, run twice to prove idempotency):
node scripts/migrate-legacy.mjs --file fixtures/final/legacy_export.json --pglite --repeat
```

Staff can also trigger the exact same `importLegacyExport` engine via the authenticated staff UI at `/r4-staff.html` (`POST /api/final/staff/import-legacy`).

## Verified Results Against `fixtures/final/legacy_export.json`

Executed locally on `final/launch-candidate` (2026-11-27, isolated PGlite PostgreSQL initialized with `schema.sql`):

### Run 1 (Initial Import)
- **Source counts:** `students: 6`, `projects: 3`, `companies: 3`, `collaborations: 4` (exact match with `legacy_expected_results.json`)
- **Operation counts:**
  - `students`: `created: 6, updated: 0, skipped: 0, conflicts: 1`
  - `projects`: `created: 3, updated: 0, skipped: 0, conflicts: 1`
  - `companies`: `created: 3, updated: 0, skipped: 0, conflicts: 1`
  - `collaborations`: `created: 4, updated: 0, skipped: 0, conflicts: 0`
- **Duplicate student candidates detected:** `[{"legacy_id": "LS04", "possible_duplicate_of": "LS01", "reason": "same email"}]`
- **Duplicate company candidates detected:** `[{"legacy_id": "LC02", "possible_duplicate_of": "LC01", "reason": "same normalized domain"}]`
- **Broken references detected (skipped without inventing data):** `[{"project_legacy_id": "LP02", "student_legacy_id": "LS99"}]`
- **Unclaimed profiles identified:** `["LS02", "LS05", "LS06"]`
- **Relationships & visibility preserved:**
  - `LP01` migrated as one shared project with both `LS01` (`XR Developer`) and `LS02` (`Interaction Developer`).
  - `LP02` preserved valid contributor `LS03` (`3D Artist`) and reported missing `LS99`.
  - `LP03` preserved historical contributor `LS06` (`Retired Contributor`, `profile_status = 'retired'`).
  - `LCO3` (`Confidential Prototype`) preserved `visibility = 'private'` and is omitted from public APIs.

### Run 2 (Idempotent Re-Import)
- **Operation counts:**
  - `students`: `created: 0, updated: 0, skipped: 6, conflicts: 1`
  - `projects`: `created: 0, updated: 0, skipped: 3, conflicts: 1`
  - `companies`: `created: 0, updated: 0, skipped: 3, conflicts: 1`
  - `collaborations`: `created: 0, updated: 0, skipped: 4, conflicts: 0`
- **Database row counts after Run 2:** `students = 6`, `projects = 3`, `r4_partners = 3`, `r4_collaborations = 4` (zero duplicates created).
