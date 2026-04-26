// Apply generated Drizzle migrations against the configured Postgres.
// Usage: node --env-file=.env.local scripts/db-apply.mjs
//
// Reads every .sql file in db/migrations/ in lexical order, splits on
// `--> statement-breakpoint`, executes each statement. Idempotent if the
// migrations themselves are written idempotently (use IF NOT EXISTS / ON
// CONFLICT in future migrations); the initial schema is not idempotent —
// run once per fresh DB.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error('POSTGRES_URL_NON_POOLING not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
const dir = join(process.cwd(), 'db', 'migrations');

try {
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    console.log(`\n→ Applying ${file}`);
    const content = await readFile(join(dir, file), 'utf-8');
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      const preview = stmt.split('\n')[0].slice(0, 80);
      try {
        await sql.unsafe(stmt);
        console.log(`  ✓ ${preview}`);
      } catch (err) {
        console.error(`  ✗ ${preview}`);
        console.error(`    ${err.message}`);
        throw err;
      }
    }
  }

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  console.log(`\nTables in DB: ${tables.map((t) => t.table_name).join(', ')}`);
} finally {
  await sql.end();
}
