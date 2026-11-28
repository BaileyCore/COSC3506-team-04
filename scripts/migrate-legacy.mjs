#!/usr/bin/env node
/**
 * Repeatable CLI for Final Release legacy and scale fixture imports (F.01-F.06, F.27).
 *
 * Usage:
 *   node scripts/migrate-legacy.mjs --file fixtures/final/legacy_export.json
 *   node scripts/migrate-legacy.mjs --file fixtures/final/legacy_export.json --pglite --repeat
 *   node scripts/migrate-legacy.mjs --file fixtures/final/scale_fixture.json --pglite
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { importLegacyExport } = require('../backend/final_migration.cjs');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name, fallback = null) => {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};

const fileArg = valueOf('--file', 'fixtures/final/legacy_export.json');
const usePglite = flag('--pglite');
const repeat = flag('--repeat');

async function main() {
  const resolved = path.resolve(process.cwd(), fileArg);
  const payload = JSON.parse(await readFile(resolved, 'utf8'));

  let pool;
  let closeFn;

  if (usePglite) {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    const schema = (await readFile(path.resolve(process.cwd(), 'schema.sql'), 'utf8'))
      .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
    await db.exec(schema);
    pool = db;
    closeFn = () => db.close();
  } else {
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is required (or pass --pglite for isolated local verification).');
      process.exit(1);
    }
    const { Pool } = require('../backend/node_modules/pg');
    const isLocal = process.env.DATABASE_URL.includes('localhost');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    closeFn = () => pool.end();
  }

  try {
    const first = await importLegacyExport(pool, payload, { fixtureName: path.basename(resolved) });
    const output = { first_run: first };
    if (repeat) {
      output.second_run = await importLegacyExport(pool, payload, { fixtureName: path.basename(resolved) });
    }
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await closeFn();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
