import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_MODEL, AI_TEXT_OPTIONS, getAI } from '../src/lib/ai';

test('Luna text requests preserve JSON and streaming contracts with supported parameters', async (t) => {
  assert.equal(AI_MODEL, process.env.OPENAI_MODEL || 'gpt-6-luna');
  assert.equal(AI_TEXT_OPTIONS.model, AI_MODEL);
  if (AI_MODEL.startsWith('gpt-6-luna'))
    assert.equal(AI_TEXT_OPTIONS.reasoning_effort, 'none');
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';
  const requests: Record<string, unknown>[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (_input: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      if (body.stream)
        return new Response(
          `data: ${JSON.stringify({ id: 'test-stream', object: 'chat.completion.chunk', created: 0, model: body.model, choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: null }] })}\n\ndata: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      return Response.json({
        id: 'test-json',
        object: 'chat.completion',
        created: 0,
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{"ok":true}' },
            finish_reason: 'stop',
          },
        ],
      });
    },
  );
  try {
    const client = getAI();
    const response = await client.chat.completions.create({
      ...AI_TEXT_OPTIONS,
      messages: [{ role: 'user', content: 'Return JSON with ok=true.' }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_completion_tokens: 64,
    });
    assert.deepEqual(JSON.parse(response.choices[0].message.content!), {
      ok: true,
    });
    const stream = await client.chat.completions.create({
      ...AI_TEXT_OPTIONS,
      messages: [{ role: 'user', content: 'Reply OK.' }],
      temperature: 0.7,
      max_completion_tokens: 32,
      stream: true,
    });
    let output = '';
    for await (const chunk of stream)
      output += chunk.choices[0]?.delta.content || '';
    assert.equal(output, 'OK');
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.model, AI_MODEL);
      assert.ok(!('max_tokens' in request));
      assert.ok(Number(request.max_completion_tokens) > 0);
      if (AI_MODEL.startsWith('gpt-6-luna'))
        assert.equal(request.reasoning_effort, 'none');
    }
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
