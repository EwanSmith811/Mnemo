import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { database, Query } from '../src/lib/database';
import {
  combineDecks,
  defaultSetName,
  type Deck,
} from '../src/lib/upload-parts';
import { POST as SEND_PART } from '../src/app/api/upload/parts/route';
import { POST as UPLOAD } from '../src/app/api/upload/route';

const deck = (filename: string, pages: string[]): Deck => ({
  filename,
  fileType: 'pdf',
  size: 10,
  text: pages.join('\n\n'),
  slides: pages.map((text, i) => ({
    position: i + 1,
    source_number: i + 1,
    kind: 'page' as const,
    title: text,
    text,
    notes: '',
    text_truncated: false,
  })),
  buffer: Buffer.from('%PDF-'),
});

test('one deck passes through unchanged; several are numbered across the set', () => {
  const single = deck('only.pdf', ['First page', 'Second page']);
  const one = combineDecks([single], 'ignored');
  assert.equal(one.filename, 'only.pdf');
  assert.equal(one.rawText, single.text, 'deduplication text is unchanged');
  assert.deepEqual(
    one.slides.map((s) => [s.part, s.position]),
    [
      [0, 1],
      [0, 2],
    ],
  );

  const set = combineDecks([
    deck('10-1-26.pdf', ['UDP', 'Checksum']),
    deck('10-6-26.pps', ['Reliable transfer']),
  ]);
  assert.equal(set.filename, '10-1-26, 10-6-26');
  assert.match(set.rawText, /^Deck 1: 10-1-26\n\nUDP/);
  assert.match(set.rawText, /Deck 2: 10-6-26\n\nReliable transfer$/);
  assert.deepEqual(
    set.slides.map((s) => [s.part, s.position, s.source_number]),
    [
      [0, 1, 1],
      [0, 2, 2],
      [1, 3, 1],
    ],
  );
  assert.deepEqual(
    set.sources.map((s) => [s.part, s.filename]),
    [
      [0, '10-1-26.pdf'],
      [1, '10-6-26.pps'],
    ],
  );
  assert.equal(combineDecks([single, single], '  Exam 2  ').filename, 'Exam 2');
  assert.equal(
    defaultSetName(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf']),
    'a, b, c + 2 more',
  );
});

test('decks are read one per request, then built into one set with a source per deck', async (t) => {
  t.mock.method(console, 'error', () => {});
  const pg = new PGlite();
  t.after(() => pg.close());
  for (const file of (await readdir(new URL('../db/', import.meta.url))).sort())
    await pg.exec(
      await readFile(new URL('../db/' + file, import.meta.url), 'utf8'),
    );
  const run = async (sql: string, values: unknown[]) =>
    (await pg.query<Record<string, unknown>>(sql, values)).rows;
  t.mock.method(database, 'from', (table: string) => new Query(table, run));
  const env = { ...process.env };
  t.after(() => {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
    process.env.DATABASE_URL = env.DATABASE_URL;
  });
  process.env.OPENAI_API_KEY = 'test-only';
  process.env.DATABASE_URL = 'test-only';
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('No AI call should happen');
  });

  const send = async (name: string, bytes: Uint8Array<ArrayBuffer>) => {
    const form = new FormData();
    form.append('file', new Blob([bytes]), name);
    const res = await SEND_PART(
      new NextRequest('http://localhost/api/upload/parts', {
        method: 'POST',
        body: form,
      }),
    );
    return { status: res.status, body: await res.json() };
  };
  const pdf = await readFile(
    new URL('./fixtures/lecture.pdf', import.meta.url),
  );
  const pptx = await readFile(
    new URL('./fixtures/lecture.pptx', import.meta.url),
  );
  const first = await send('week-1.pdf', pdf);
  const second = await send('week-2.pptx', pptx);
  assert.equal(first.status, 200);
  assert.ok(first.body.preview.slides >= 1);
  const broken = await send('broken.pdf', new TextEncoder().encode('%PDF-no'));
  assert.equal(broken.status, 400);
  assert.match(broken.body.error, /broken\.pdf/);

  // The set's text is new to this test, so claim it as an existing document
  // to exercise storage without generating anything.
  const doc = (
    await database
      .from('documents')
      .insert({
        filename: 'week-1, week-2',
        file_type: 'pdf',
        study_mode: 'engineers',
        part_count: 2,
      })
      .select('id')
      .single()
  ).data.id;
  t.mock.method(database.uploads, 'claim', async () => ({
    kind: 'existing' as const,
    document: {
      document_id: doc,
      flashcard_count: 0,
      quiz_question_count: 0,
      topic_summary_count: 0,
      concept_node_count: 0,
    },
  }));
  const build = async (parts: unknown) => {
    const form = new FormData();
    form.append('studyMode', 'engineers');
    form.append('parts', JSON.stringify(parts));
    const res = await UPLOAD(
      new NextRequest('http://localhost/api/upload', {
        method: 'POST',
        body: form,
      }),
    );
    return { status: res.status, body: await res.json() };
  };
  assert.equal((await build([first.body.part_id])).status, 400);
  const built = await build([first.body.part_id, second.body.part_id]);
  assert.equal(built.status, 200, JSON.stringify(built.body));
  assert.equal(built.body.reused, true);

  const sources = await pg.query<{ part: number; filename: string }>(
    'SELECT part, filename FROM "mnemo-document_sources" WHERE document_id=$1 ORDER BY part',
    [doc],
  );
  assert.deepEqual(sources.rows, [
    { part: 0, filename: 'week-1.pdf' },
    { part: 1, filename: 'week-2.pptx' },
  ]);
  const slides = await pg.query<{ part: number; position: number }>(
    'SELECT part, position FROM "mnemo-document_slides" WHERE document_id=$1 ORDER BY position',
    [doc],
  );
  assert.deepEqual(
    [...new Set(slides.rows.map((s) => s.part))],
    [0, 1],
    'slides keep their deck',
  );
  assert.ok(slides.rows.every((s, i) => s.position === i + 1));
  assert.equal(
    (await pg.query('SELECT * FROM "mnemo-upload_parts"')).rows.length,
    0,
    'parked files are cleared once the set is saved',
  );
  const expired = await build([randomUUID(), randomUUID()]);
  assert.equal(expired.status, 410);
  await assert.rejects(
    pg.query(
      "INSERT INTO \"mnemo-document_sources\" (document_id,file_type,data_base64,part) VALUES ($1,'pdf','JVBERg==',1)",
      [doc],
    ),
    /unique/,
  );
});
