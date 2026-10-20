import { NextRequest, NextResponse } from 'next/server';
import { ai, AI_TEXT_OPTIONS } from '@/lib/ai';
import { database } from '@/lib/database';
import { normalizeGraph } from '@/lib/graph';
import {
  MAX_STORY_CONCEPTS,
  MIN_STORY_CONCEPTS,
  parseStoryLine,
  CAST_PROMPT,
  castRequest,
  nameLeaksTerm,
  parseCast,
  WORLD_PROMPT,
  worldRequest,
  SCENES_PROMPT,
  scenesRequest,
  type StoryConcept,
  type StoryEvent,
  type StoryPlan,
} from '@/lib/memory-story';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
async function json(messages: Message[], maxTokens: number) {
  const response = await ai.chat.completions.create({
    ...AI_TEXT_OPTIONS,
    messages,
    response_format: { type: 'json_object' },
    temperature: 1,
    max_completion_tokens: maxTokens,
  });
  const content = response.choices[0]?.message?.content ?? '{}';
  return { content, value: JSON.parse(content) as unknown };
}

/** Cast one batch; if any name just repeats its term, ask once more. */
async function castBatch(world: string, batch: StoryConcept[]) {
  const messages: Message[] = [
    { role: 'system', content: CAST_PROMPT },
    { role: 'user', content: castRequest(world, batch) },
  ];
  let { content, value } = await json(messages, 220 * batch.length + 200);
  let cast = parseCast(value, batch);
  const lazy = cast.filter((c) => nameLeaksTerm(c.name, c.concept));
  if (lazy.length) {
    messages.push(
      { role: 'assistant', content },
      {
        role: 'user',
        content: `These names reuse the term's own words, which is lazy: ${lazy
          .map((c) => `"${c.name}" for ${c.concept}`)
          .join(
            '; ',
          )}. Replace them with sound-alike puns that avoid those words. Return the full JSON again.`,
      },
    );
    ({ content, value } = await json(messages, 220 * batch.length + 200));
    const retried = parseCast(value, batch);
    if (retried.length >= cast.length) cast = retried;
  }
  return cast;
}

/** Stream a completion and hand each finished line to `onLine`. */
async function streamLines(
  system: string,
  user: string,
  maxTokens: number,
  onLine: (line: string) => void,
  isOpen: () => boolean,
) {
  const completion = await ai.chat.completions.create({
    ...AI_TEXT_OPTIONS,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 1,
    max_completion_tokens: maxTokens,
    stream: true,
  });
  let pending = '';
  for await (const part of completion) {
    if (!isOpen()) return;
    pending += part.choices[0]?.delta?.content ?? '';
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    lines.forEach(onLine);
  }
  onLine(pending);
}

export const maxDuration = 120;

/**
 * Streams a memory story as NDJSON events (title, cast, scene, moral) so the
 * reader and the narrator can start before the whole story is written.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const body = await request.json().catch(() => null);
  const ids: unknown = body?.conceptIds;
  if (
    !Array.isArray(ids) ||
    ids.length < MIN_STORY_CONCEPTS ||
    ids.length > MAX_STORY_CONCEPTS ||
    ids.some((id) => typeof id !== 'string')
  )
    return NextResponse.json(
      {
        error: `Choose between ${MIN_STORY_CONCEPTS} and ${MAX_STORY_CONCEPTS} concepts.`,
      },
      { status: 400 },
    );
  const [graphRow, doc] = await Promise.all([
    database
      .from('concept_graphs')
      .select('nodes,edges')
      .eq('document_id', documentId)
      .maybeSingle(),
    database
      .from('documents')
      .select('filename')
      .eq('id', documentId)
      .maybeSingle(),
  ]);
  if (graphRow.error || doc.error)
    return NextResponse.json(
      { error: 'Could not load the concept map.' },
      { status: 503 },
    );
  if (!graphRow.data || !doc.data)
    return NextResponse.json(
      { error: 'This document has no concept map.' },
      { status: 404 },
    );
  let concepts: StoryConcept[];
  let subject = doc.data.filename.replace(/\.[^.]+$/, '');
  try {
    const nodes = normalizeGraph(graphRow.data).nodes;
    // The core concept names the subject better than a file name does.
    subject =
      (nodes.find((n) => n.id === 'central') ?? nodes[0])?.label ?? subject;
    concepts = (ids as string[])
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map((n) => ({
        id: n.id,
        label: n.label,
        definition: n.definition.slice(0, 600),
        group: n.group,
      }));
  } catch {
    concepts = [];
  }
  if (concepts.length < MIN_STORY_CONCEPTS)
    return NextResponse.json(
      { error: 'Those concepts are no longer in this map. Refresh and retry.' },
      { status: 400 },
    );

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StoryEvent) => {
        if (open)
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };
      let scenes = 0;
      const plan: StoryPlan = { world: '', title: '', cast: [] };
      try {
        // Step 1: a shared world and title, then the cast in parallel
        // batches so a big selection doesn't mean a long wait.
        const setup = (
          await json(
            [
              { role: 'system', content: WORLD_PROMPT },
              { role: 'user', content: worldRequest(concepts, subject) },
            ],
            200,
          )
        ).value as { world?: unknown; title?: unknown };
        plan.world = String(setup.world ?? 'A wedding on a sinking ship.');
        plan.title = String(setup.title ?? 'A Very Strange Story').slice(
          0,
          160,
        );
        send({ type: 'title', text: plan.title });
        const size = Math.ceil(
          concepts.length / Math.ceil(concepts.length / 5),
        );
        const batches: StoryConcept[][] = [];
        for (let i = 0; i < concepts.length; i += size)
          batches.push(concepts.slice(i, i + size));
        const casts = await Promise.all(
          batches.map((batch) =>
            castBatch(plan.world, batch).then((cast) => {
              for (const c of cast)
                send({
                  type: 'cast',
                  name: c.name,
                  concept: c.concept,
                  meaning: c.meaning,
                  conceptId: c.conceptId,
                });
              return cast;
            }),
          ),
        );
        // Anyone the batches dropped gets one more audition.
        const missing = concepts.filter(
          (c) => !casts.flat().some((m) => m.conceptId === c.id),
        );
        if (missing.length) {
          const extra = await castBatch(plan.world, missing).catch(() => []);
          for (const c of extra)
            send({
              type: 'cast',
              name: c.name,
              concept: c.concept,
              meaning: c.meaning,
              conceptId: c.conceptId,
            });
          casts.push(extra);
        }
        // Keep the cast in the order the learner picked the concepts.
        plan.cast = concepts
          .map((c) => casts.flat().find((m) => m.conceptId === c.id))
          .filter((m): m is NonNullable<typeof m> => !!m);
        if (plan.cast.length < MIN_STORY_CONCEPTS)
          throw new Error('The cast never showed up.');
        // Step 2: scenes and the moral, written from the plan.
        await streamLines(
          SCENES_PROMPT,
          scenesRequest(plan, subject),
          2400,
          (line) => {
            const event = parseStoryLine(line, concepts, scenes);
            if (event?.type === 'scene') {
              scenes++;
              send(event);
            } else if (event?.type === 'moral') send(event);
          },
          () => open,
        );
        if (!scenes) throw new Error('No scenes were written.');
        send({ type: 'done' });
      } catch (error) {
        console.error('Memory story failed:', error);
        send({
          type: 'error',
          message: 'The story fell apart mid-sentence. Try again.',
        });
      } finally {
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
