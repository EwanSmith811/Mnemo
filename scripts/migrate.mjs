import nextEnv from '@next/env';
import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL in .env.local before migrating.');
const directory = new URL('../db/', import.meta.url);
const filenames = (await readdir(directory))
  .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const migrations = await Promise.all(
  filenames.map(async (filename) => ({
    version: filename.slice(0, 3),
    sql: await readFile(new URL(filename, directory), 'utf8'),
  })),
);
if (new Set(migrations.map((m) => m.version)).size !== migrations.length)
  throw new Error('Duplicate Mnemo migration versions.');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(1835951471)`;
    await tx`CREATE TABLE IF NOT EXISTS public."mnemo-migrations" (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const applied = new Set(
      (await tx`SELECT version FROM public."mnemo-migrations"`).map(
        (row) => row.version,
      ),
    );
    let count = 0;
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await tx.unsafe(migration.sql);
      await tx`INSERT INTO public."mnemo-migrations" (version) VALUES (${migration.version})`;
      console.log(`Applied Mnemo migration ${migration.version}.`);
      count++;
    }
    if (!count) console.log('Mnemo database is up to date.');
  });
} finally {
  await sql.end();
}
