import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { UploadRegistry, studyContentHash } from '../src/lib/upload-registry';

test('upload migration preserves duplicate material and unrelated data while enforcing one library entry', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "CREATE TABLE unrelated_data (id text); INSERT INTO unrelated_data VALUES ('keep');",
    );
    for (const migration of ['001_mnemo.sql', '002_powerpoint_formats.sql'])
      await pg.exec(
        await readFile(new URL('../db/' + migration, import.meta.url), 'utf8'),
      );
    const content = 'The same lecture, regardless of its filename.';
    const original = await pg.query<{ id: string }>(
      `INSERT INTO public."mnemo-documents" (filename, file_type, study_mode, content, status, created_at)
      VALUES ('original.pps','pps','engineers',$1,'completed','2026-01-01'),
             ('renamed.pps','pps','engineers',$1,'completed','2026-01-02') RETURNING id`,
      [content],
    );
    await pg.query(
      `INSERT INTO public."mnemo-flashcards" (document_id, term, definition) VALUES ($1, 'Retain', 'Keep duplicate study history')`,
      [original.rows[1].id],
    );
    await pg.exec(
      await readFile(
        new URL('../db/003_upload_deduplication.sql', import.meta.url),
        'utf8',
      ),
    );
    const docs = await pg.query<{ id: string; is_duplicate: boolean }>(
      `SELECT id,is_duplicate FROM public."mnemo-documents" ORDER BY created_at`,
    );
    assert.equal(docs.rows.length, 2);
    assert.equal(docs.rows[0].is_duplicate, false);
    assert.equal(docs.rows[1].is_duplicate, true);
    assert.equal(
      (await pg.query('SELECT * FROM public."mnemo-flashcards"')).rows.length,
      1,
    );
    assert.deepEqual((await pg.query('SELECT * FROM unrelated_data')).rows, [
      { id: 'keep' },
    ]);
    const registry = new UploadRegistry(
      async (sql, values) =>
        (await pg.query<Record<string, unknown>>(sql, values)).rows,
    );
    const existing = await registry.claim(
      studyContentHash(content),
      'engineers',
    );
    assert.equal(existing.kind, 'existing');
    if (existing.kind === 'existing')
      assert.equal(existing.document.document_id, original.rows[0].id);
    await assert.rejects(
      pg.query(
        `INSERT INTO public."mnemo-documents" (filename,file_type,study_mode,content,status) VALUES ('different-name.pdf','pdf','engineers',$1,'completed')`,
        [content],
      ),
      /unique/,
    );
    // Same source in a different study mode is a distinct study set.
    assert.equal(
      (await registry.claim(studyContentHash(content), 'nursing')).kind,
      'claimed',
    );
  } finally {
    await pg.close();
  }
});

test('concurrent upload claims permit one generation; failures and stale leases recover safely', async () => {
  const pg = new PGlite();
  try {
    for (const migration of [
      '001_mnemo.sql',
      '002_powerpoint_formats.sql',
      '003_upload_deduplication.sql',
    ])
      await pg.exec(
        await readFile(new URL('../db/' + migration, import.meta.url), 'utf8'),
      );
    const run = async (sql: string, values: unknown[]) =>
      (await pg.query<Record<string, unknown>>(sql, values)).rows;
    const registry = new UploadRegistry(run);
    const hash = studyContentHash('New source');
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => registry.claim(hash, 'engineers')),
    );
    assert.equal(attempts.filter((r) => r.kind === 'claimed').length, 1);
    assert.equal(attempts.filter((r) => r.kind === 'pending').length, 5);
    const first = attempts.find((r) => r.kind === 'claimed')!;
    assert.equal(first.kind, 'claimed');
    if (first.kind !== 'claimed') throw new Error('Expected an upload claim');
    await registry.assertOwned(first.claim);
    await registry.release(first.claim);
    const retry = await registry.claim(hash, 'engineers');
    assert.equal(retry.kind, 'claimed');
    if (retry.kind !== 'claimed') throw new Error('Expected retry claim');
    await run(
      `UPDATE public."mnemo-upload_claims" SET expires_at=now()-interval '1 minute' WHERE content_hash=$1`,
      [hash],
    );
    await assert.rejects(registry.assertOwned(retry.claim), /lease expired/);
    const recovered = await registry.claim(hash, 'engineers');
    assert.equal(recovered.kind, 'claimed');
    if (recovered.kind !== 'claimed')
      throw new Error('Expected recovered claim');
    assert.notEqual(recovered.claim.owner, retry.claim.owner);
    await registry.release(retry.claim);
    await registry.assertOwned(recovered.claim);
    await assert.rejects(registry.assertOwned(retry.claim), /lease expired/);
    assert.equal(
      (await registry.claim(studyContentHash('Changed source'), 'engineers'))
        .kind,
      'claimed',
    );
  } finally {
    await pg.close();
  }
});
