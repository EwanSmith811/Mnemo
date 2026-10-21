import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { database, Query } from '../src/lib/database';
import {
  GET,
  POST,
} from '../src/app/api/learn/[documentId]/slides/[slideId]/route';
test('slide threads preserve replies, replay retries, reject stale revisions and enforce document scope', async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  process.env.OPENAI_API_KEY = 'test-only';
  const reply = {
    title: 'Simple idea',
    blocks: [
      {
        type: 'text',
        heading: '',
        text: 'A reliable sender checks whether the receiver got the data.',
      },
    ],
    takeaway: 'Check that the data arrived.',
    check: null,
  };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(
      JSON.stringify({
        id: 'test',
        object: 'chat.completion',
        created: 1,
        model: 'test',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(reply) },
          },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  });
  for (const file of [
    '001_mnemo.sql',
    '002_powerpoint_formats.sql',
    '006_slide_tutor.sql',
    '008_combined_decks.sql',
  ])
    await pg.exec(
      await readFile(new URL('../db/' + file, import.meta.url), 'utf8'),
    );
  const run = async (sql: string, values: unknown[]) =>
    (await pg.query<Record<string, unknown>>(sql, values)).rows;
  t.mock.method(database, 'from', (table: string) => new Query(table, run));
  const doc = await database
    .from('documents')
    .insert({ filename: 'test.pps', file_type: 'pps', study_mode: 'engineers' })
    .select()
    .single();
  const slide = await database
    .from('document_slides')
    .insert({
      document_id: doc.data.id,
      position: 1,
      source_number: 1,
      kind: 'slide',
      title: 'Reliable data',
      text: 'The sender waits for feedback from the receiver before sending more data.',
    })
    .select()
    .single();
  await database
    .from('slide_explanations')
    .insert({ slide_id: slide.data.id, explanation: reply });
  const context = {
    params: Promise.resolve({
      documentId: doc.data.id,
      slideId: slide.data.id,
    }),
  };
  const requestId = randomUUID();
  const post = (revision: number, id = requestId) =>
    POST(
      new NextRequest('http://localhost/api/slides/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ask',
          message: 'Why wait for feedback?',
          revision,
          requestId: id,
        }),
      }),
      context,
    );
  const initial = await post(0);
  assert.equal(initial.status, 200);
  const saved = await initial.json();
  assert.equal(saved.thread.revision, 1);
  assert.equal(saved.thread.messages.length, 2);
  assert.equal(calls, 1);
  const replay = await post(0);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).thread.messages.length, 2);
  assert.equal(calls, 1);
  const stale = await post(0, randomUUID());
  assert.equal(stale.status, 409);
  assert.equal(calls, 1);
  const restored = await GET(
    new NextRequest('http://localhost/api/slides/test'),
    context,
  );
  assert.deepEqual(
    (await restored.json()).thread.messages,
    saved.thread.messages,
  );
  const wrongDocument = await GET(
    new NextRequest('http://localhost/api/slides/test'),
    {
      params: Promise.resolve({
        documentId: randomUUID(),
        slideId: slide.data.id,
      }),
    },
  );
  assert.equal(wrongDocument.status, 404);
});
