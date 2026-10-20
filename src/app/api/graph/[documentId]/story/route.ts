import { NextRequest, NextResponse } from 'next/server';
import { ai, AI_TEXT_OPTIONS } from '@/lib/ai';
import { database } from '@/lib/database';
import { normalizeGraph } from '@/lib/graph';
import {
  cleanInterests,
  MAX_STORY_CONCEPTS,
  MIN_STORY_CONCEPTS,
  parseStoryLine,
  STORY_PROMPT,
  storyRequest,
  type StoryBit,
  type StoryConcept,
  type StoryEvent,
} from '@/lib/memory-story';

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
 * Streams memory riffs as NDJSON events (title, one bit per concept, encore)
 * so the reader and the narrator can start before every line is written.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const body = await request.json().catch(() => null);
  const ids: unknown = body?.conceptIds;
  const interests = cleanInterests(body?.interests);
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
      const bits: StoryBit[] = [];
      let encore = '';
      let titled = false;
      const write = (todo: StoryConcept[]) =>
        streamLines(
          STORY_PROMPT,
          storyRequest(todo, subject, interests, bits),
          140 * todo.length + 300,
          (line) => {
            const event = parseStoryLine(line, todo);
            if (event?.type === 'title' && !titled) {
              titled = true;
              send(event);
            } else if (
              event?.type === 'bit' &&
              !bits.some((b) => b.conceptId === event.conceptId)
            ) {
              bits.push(event);
              send(event);
            } else if (event?.type === 'encore') encore = event.text;
          },
          () => open,
        );
      try {
        await write(concepts);
        // Anything the model skipped gets one more pass, still on theme.
        const missing = concepts.filter(
          (c) => !bits.some((b) => b.conceptId === c.id),
        );
        if (missing.length && open) await write(missing);
        if (bits.length < MIN_STORY_CONCEPTS)
          throw new Error('Too few riffs were written.');
        // The encore lands last, after every gag it calls back.
        if (encore) send({ type: 'encore', text: encore });
        send({ type: 'done' });
      } catch (error) {
        console.error('Memory riffs failed:', error);
        send({
          type: 'error',
          message: 'The riffs fell apart mid-joke. Try again.',
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
