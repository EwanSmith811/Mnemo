import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { database, Query } from '../src/lib/database';
import { GET, POST } from '../src/app/api/workbench/[documentId]/session/route';
import type { LearningSession } from '../src/lib/workbench-learning';
test('saved learning sessions enforce attempts, preserve hints, reject stale tabs, and schedule review', async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  t.mock.method(console, 'error', () => {});
  for (const file of [
    '001_mnemo.sql',
    '002_powerpoint_formats.sql',
    '003_upload_deduplication.sql',
    '004_repair_json_arrays.sql',
    '005_workbench_learning.sql',
  ])
    await pg.exec(
      await readFile(new URL('../db/' + file, import.meta.url), 'utf8'),
    );
  const run = async (sql: string, values: unknown[]) =>
    (await pg.query<Record<string, unknown>>(sql, values)).rows;
  t.mock.method(database, 'from', (table: string) => new Query(table, run));
  const doc = await new Query<{ id: string }>('documents', run)
    .insert({
      filename: 'learning.pdf',
      file_type: 'pdf',
      study_mode: 'nursing',
    })
    .select()
    .single();
  const id = doc.data.id;
  await new Query('workbench_content', run).insert({
    document_id: id,
    group_name: 'Recovery',
    brief_html: '<p>Brief</p>',
    inquiry_questions: [],
    nclex_questions: [
      {
        scenario: 'A scenario',
        question: 'Choose the best action',
        choices: ['A', 'B', 'C', 'D'],
        correct_answer: 1,
        rationale: 'B is correct.',
      },
    ],
    node_ids: [],
    required_node_ids: [],
  });
  const context = { params: Promise.resolve({ documentId: id }) };
  const get = () =>
    GET(
      new NextRequest('http://localhost/api/session?group=Recovery'),
      context,
    );
  const initial = (await (await get()).json()) as LearningSession;
  assert.equal(initial.state.phase, 'learn');
  const post = (
    session: LearningSession,
    action: string,
    extra: Record<string, unknown> = {},
  ) =>
    POST(
      new NextRequest('http://localhost/api/session', {
        method: 'POST',
        body: JSON.stringify({
          group: 'Recovery',
          revision: session.revision,
          action,
          ...extra,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
      context,
    );
  const started = (await (
    await post(initial, 'start')
  ).json()) as LearningSession;
  assert.equal((await post(started, 'next')).status, 400);
  assert.equal((await post(initial, 'start')).status, 409);
  const hinted = (await (
    await post(started, 'hint')
  ).json()) as LearningSession;
  const answered = (await (
    await post(hinted, 'answer', {
      answer: '1',
      confidence: 'certain',
      assisted: false,
    })
  ).json()) as LearningSession;
  assert.equal(answered.state.feedback?.correct, true);
  assert.equal(answered.state.feedback?.assisted, true);
  assert.equal(answered.state.queue.length, 2);
  assert.equal(
    (await post(answered, 'answer', { answer: '1', confidence: 'certain' }))
      .status,
    409,
  );
  const resumed = (await (await get()).json()) as LearningSession;
  assert.deepEqual(resumed.state, answered.state);
  const next = (await (await post(resumed, 'next')).json()) as LearningSession;
  assert.equal(next.state.supportUsed, false);
  const retry = (await (
    await post(next, 'answer', { answer: '1', confidence: 'fairly-sure' })
  ).json()) as LearningSession;
  const complete = (await (
    await post(retry, 'next')
  ).json()) as LearningSession;
  assert.equal(complete.state.phase, 'complete');
  assert.ok(complete.next_review_at);
  assert.equal(complete.interval_days, 0);
  const review = (await (
    await post(complete, 'restart')
  ).json()) as LearningSession;
  assert.equal(review.state.phase, 'practice');
  assert.equal(review.state.cursor, 0);
});
