import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readUploadProgress } from '../src/lib/upload-progress';
const result = {
  type: 'complete',
  document_id: '5718dee7-eef8-49fd-8c7b-a89e06d4830e',
  flashcard_count: 9,
  quiz_question_count: 25,
  topic_summary_count: 4,
  concept_node_count: 11,
};
function fragmentedResponse(events: object[]) {
  const bytes = new TextEncoder().encode(
    events.map((event) => JSON.stringify(event)).join('\n'),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7)
          controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    }),
  );
}
test('upload progress survives fragmented frames and a final frame without newline', async () => {
  const seen: unknown[] = [];
  const progress = { type: 'progress', stage: 'generating', ready: 'graph' };
  const saved = await readUploadProgress(
    fragmentedResponse([{ type: 'heartbeat' }, progress, result]),
    (e) => seen.push(e),
  );
  assert.deepEqual(seen, [progress]);
  assert.deepEqual(saved, result);
});
test('upload progress propagates server errors including fragmented Unicode', async () => {
  await assert.rejects(
    readUploadProgress(
      fragmentedResponse([
        { type: 'error', message: 'Couldn’t read this document.' },
      ]),
      () => {},
    ),
    /Couldn’t read/,
  );
});
test('an interrupted upload never reports success or navigates to a dashboard', async () => {
  await assert.rejects(
    readUploadProgress(
      fragmentedResponse([{ type: 'progress', stage: 'saving' }]),
      () => {},
    ),
    /connection ended/,
  );
  await assert.rejects(
    readUploadProgress(
      fragmentedResponse([{ ...result, document_id: 'https://example.com' }]),
      () => {},
    ),
    /invalid document/,
  );
});
