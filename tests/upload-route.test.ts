import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/upload/route';
import { database } from '../src/lib/database';
import { readUploadProgress } from '../src/lib/upload-progress';

const existing = {
  document_id: '5718dee7-eef8-49fd-8c7b-a89e06d4830e',
  flashcard_count: 9,
  quiz_question_count: 25,
  topic_summary_count: 4,
  concept_node_count: 11,
};

test('duplicate upload routes reuse existing documents or reject in-progress work before any AI call', async (t) => {
  const oldKey = process.env.OPENAI_API_KEY,
    oldDatabase = process.env.DATABASE_URL;
  process.env.OPENAI_API_KEY = 'test-only';
  process.env.DATABASE_URL = 'test-only';
  t.after(() => {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
    if (oldDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabase;
  });
  const bytes = await readFile(
    new URL('./fixtures/lecture.pps', import.meta.url),
  );
  const request = (stream = false) => {
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'renamed.pps');
    form.append('studyMode', 'engineers');
    return new NextRequest('http://localhost/api/upload', {
      method: 'POST',
      body: form,
      headers: stream ? { accept: 'application/x-ndjson' } : {},
    });
  };
  let modelCalls = 0,
    saves = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    modelCalls++;
    throw new Error('No AI call should happen');
  });
  t.mock.method(database, 'transaction', async () => {
    saves++;
    throw new Error('No save should happen');
  });
  const claim = t.mock.method(database.uploads, 'claim', async () => ({
    kind: 'existing' as const,
    document: existing,
  }));
  const json = await POST(request());
  assert.equal(json.status, 200);
  assert.deepEqual(await json.json(), {
    ...existing,
    study_mode: 'engineers',
    was_truncated: false,
    reused: true,
  });
  const streamed = await readUploadProgress(
    await POST(request(true)),
    () => {},
  );
  assert.equal(streamed.document_id, existing.document_id);
  claim.mock.mockImplementation(async () => ({ kind: 'pending' as const }));
  const conflict = await POST(request());
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /already being prepared/);
  await assert.rejects(
    readUploadProgress(await POST(request(true)), () => {}),
    /No second generation was started/,
  );
  assert.equal(modelCalls, 0);
  assert.equal(saves, 0);
});
