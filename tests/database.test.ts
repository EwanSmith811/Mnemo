import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Query } from '../src/lib/database';

test('repository leaves JSON serialization to the PostgreSQL driver', async () => {
  const answers = [{ question_id: 'question', selected: [0, 2] }];
  const run = async (_sql: string, values: unknown[]) => {
    assert.deepEqual(values, ['document', answers]);
    assert.ok(Array.isArray(values[1]));
    // postgres serializes a JSONB parameter once, according to its column type.
    const stored = JSON.parse(JSON.stringify(values[1]));
    return [{ answers: stored }];
  };
  const result = await new Query<{ answers: typeof answers }>(
    'quiz_attempts',
    run,
  )
    .insert({ document_id: 'document', answers })
    .select('answers')
    .single();
  assert.equal(result.error, null);
  assert.deepEqual(result.data.answers, answers);
});

// Real PostgreSQL semantics in an isolated in-memory engine, no user DB needed.
test('Mnemo schema and repository preserve unrelated tables across CRUD and cascade delete', async (t) => {
  t.mock.method(console, 'error', () => {});
  const pg = new PGlite();
  try {
    await pg.exec(
      "CREATE TABLE documents (id text PRIMARY KEY, secret text); INSERT INTO documents VALUES ('unrelated', 'keep me');",
    );
    await pg.exec(
      await readFile(new URL('../db/001_mnemo.sql', import.meta.url), 'utf8'),
    );
    await pg.exec(
      await readFile(
        new URL('../db/002_powerpoint_formats.sql', import.meta.url),
        'utf8',
      ),
    );
    for (const type of ['ppt', 'pps', 'ppsx']) {
      await pg.query(
        'INSERT INTO public."mnemo-documents" (filename, file_type, study_mode) VALUES ($1, $2, $3)',
        ['legacy.' + type, type, 'engineers'],
      );
    }
    const invalid = pg.query(
      'INSERT INTO public."mnemo-documents" (filename, file_type, study_mode) VALUES ($1, $2, $3)',
      ['bad.exe', 'exe', 'engineers'],
    );
    await assert.rejects(invalid, /check constraint/);
    const run = async (sql: string, values: unknown[]) =>
      (await pg.query<Record<string, unknown>>(sql, values)).rows;
    const doc = await new Query<{ id: string; filename: string }>(
      'documents',
      run,
    )
      .insert({
        filename: "Study's notes.pdf",
        file_type: 'pdf',
        study_mode: 'engineers',
        status: 'completed',
      })
      .select()
      .single();
    assert.equal(doc.error, null);
    assert.ok(doc.data.id);
    const id = doc.data.id;
    const graph = {
      nodes: [
        { id: 'central', label: 'Root', definition: 'Root', group: 'Core' },
      ],
      edges: [],
    };
    const saved = await new Query('concept_graphs', run)
      .insert({ document_id: id, ...graph })
      .select()
      .single();
    assert.equal(saved.error, null);
    const fetched = await new Query<{ nodes: typeof graph.nodes }>(
      'concept_graphs',
      run,
    )
      .select('nodes')
      .eq('document_id', id)
      .single();
    assert.deepEqual(fetched.data.nodes, graph.nodes);
    const updated = await new Query<{ filename: string }>('documents', run)
      .update({ filename: 'Changed.pdf' })
      .eq('id', id)
      .select('filename')
      .single();
    assert.equal(updated.error, null);
    assert.equal(updated.data.filename, 'Changed.pdf');
    await new Query('workbench_mastery', run).upsert(
      { document_id: id, group_name: 'Topic', stage_completed: 1 },
      { onConflict: 'document_id,group_name' },
    );
    const mastery = await new Query<{ stage_completed: number }>(
      'workbench_mastery',
      run,
    )
      .upsert(
        { document_id: id, group_name: 'Topic', stage_completed: 2 },
        { onConflict: 'document_id,group_name' },
      )
      .select()
      .single();
    assert.equal(mastery.error, null);
    assert.equal(mastery.data.stage_completed, 2);
    const count = await new Query('documents', run)
      .select('*', { count: 'exact', head: true })
      .eq('id', id);
    assert.equal(count.count, 1);
    const absent = await new Query('documents', run)
      .select()
      .eq('filename', 'absent')
      .maybeSingle();
    assert.equal(absent.data, null);
    assert.equal(absent.error, null);
    assert.throws(() => new Query('payments', run), /namespace/);
    const unsafe = await new Query('documents', run).delete();
    assert.match(unsafe.error!.message, /Unfiltered/);
    const injection = await new Query('documents', run)
      .select()
      .eq('filename', "'; DROP TABLE documents; --");
    assert.deepEqual(injection.data, []);
    const card = await new Query<{ id: string }>('flashcards', run)
      .insert({
        document_id: id,
        term: 'Energy',
        definition: 'A conserved quantity',
      })
      .select('id')
      .single();
    assert.equal(card.error, null);
    const cardCount = await new Query<{ flashcard_count: number }>(
      'documents',
      run,
    )
      .select('flashcard_count')
      .eq('id', id)
      .single();
    assert.equal(cardCount.data.flashcard_count, 1);
    await new Query('flashcards', run).delete().eq('id', card.data.id);
    const afterCardDelete = await new Query<{ flashcard_count: number }>(
      'documents',
      run,
    )
      .select('flashcard_count')
      .eq('id', id)
      .single();
    assert.equal(afterCardDelete.data.flashcard_count, 0);
    const removed = await new Query('documents', run).delete().in('id', [id]);
    assert.equal(removed.error, null);
    const remaining = await pg.query(
      'SELECT * FROM public."mnemo-concept_graphs"',
    );
    assert.equal(remaining.rows.length, 0);
    const unrelated = await pg.query('SELECT * FROM documents');
    assert.deepEqual(unrelated.rows, [{ id: 'unrelated', secret: 'keep me' }]);
    const objects = await pg.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'documents'",
    );
    assert.ok(objects.rows.every((row) => row.tablename.startsWith('mnemo-')));
  } finally {
    await pg.close();
  }
});
