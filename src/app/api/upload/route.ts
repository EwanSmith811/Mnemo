import { storeDocumentSource } from '@/lib/source-preview';
import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { storeDocumentSlides } from '@/lib/slide-store';
import { readDeck } from '@/lib/read-deck';
import {
  combineDecks,
  deckPreview,
  MAX_DECKS,
  type Deck,
} from '@/lib/upload-parts';
import { prepareTextForLLM } from '@/lib/text-chunker';
import { generateFlashcardsAndQuiz } from '@/lib/generate-content';
import { generateConceptGraph } from '@/lib/generate-graph';
import { studyContentHash, type UploadClaim } from '@/lib/upload-registry';
import type { UploadEvent } from '@/lib/upload-progress';
export const maxDuration = 300;

async function readFile(
  file: FormDataEntryValue | null,
  emit: (event: UploadEvent) => void,
) {
  if (file instanceof File) emit({ type: 'progress', stage: 'reading' });
  const deck = await readDeck(file);
  return deck instanceof NextResponse ? deck : [deck];
}

function parsePartIds(value: FormDataEntryValue | null): string[] {
  try {
    const ids: unknown = JSON.parse(String(value));
    if (
      Array.isArray(ids) &&
      ids.length >= 2 &&
      ids.length <= MAX_DECKS &&
      new Set(ids).size === ids.length &&
      ids.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
    )
      return ids;
  } catch {}
  return [];
}

/** The decks of a study set, read earlier by /api/upload/parts, in order. */
async function readParts(value: FormDataEntryValue | null) {
  const ids = parsePartIds(value);
  if (!ids.length)
    return NextResponse.json(
      { error: `Choose between 2 and ${MAX_DECKS} different files.` },
      { status: 400 },
    );
  const rows = await database.from('upload_parts').select().in('id', ids);
  if (rows.error) throw new Error('Could not load the uploaded files.');
  if (rows.data.length !== ids.length)
    return NextResponse.json(
      {
        error: 'Some files expired before the study set was built.',
        detail: 'Retry to send them again.',
      },
      { status: 410 },
    );
  const byId = new Map(rows.data.map((r) => [r.id, r]));
  return ids.map((id): Deck => {
    const part = byId.get(id)!;
    return {
      filename: part.filename,
      fileType: part.file_type,
      size: part.file_size_bytes,
      text: part.text,
      slides: part.slides,
      buffer: Buffer.from(part.data_base64, 'base64'),
    };
  });
}

async function clearParts(ids: string[]) {
  if (!ids.length) return;
  const removed = await database.from('upload_parts').delete().in('id', ids);
  if (removed.error) console.error('Could not clear uploaded parts');
}

async function prepareUpload(
  request: NextRequest,
  emit: (event: UploadEvent) => void,
) {
  let claim: UploadClaim | undefined;
  try {
    if (!process.env.OPENAI_API_KEY || !process.env.DATABASE_URL)
      return NextResponse.json(
        {
          error: 'Study generation is not configured.',
          detail:
            'Set OPENAI_API_KEY and DATABASE_URL on the server, then run the Mnemo migration.',
        },
        { status: 503 },
      );
    const form = await request.formData();
    const mode = form.get('studyMode');
    if (mode !== 'nursing' && mode !== 'engineers')
      return NextResponse.json(
        { error: 'Choose a file and study focus.' },
        { status: 400 },
      );
    const decks = form.has('parts')
      ? await readParts(form.get('parts'))
      : await readFile(form.get('file'), emit);
    if (decks instanceof NextResponse) return decks;
    const name = form.get('name');
    const set = combineDecks(decks, typeof name === 'string' ? name : '');
    const { rawText, slides } = set;
    const partIds = form.has('parts') ? parsePartIds(form.get('parts')) : [];
    if (rawText.trim().length < 100)
      return NextResponse.json(
        {
          error: 'This document contains too little readable text.',
          detail: 'Use a text-based document instead of scanned images.',
        },
        { status: 400 },
      );
    emit({
      type: 'progress',
      stage: 'reading',
      preview: deckPreview(rawText, slides),
    });
    const { text, wasTruncated } = prepareTextForLLM(rawText);
    const identity = await database.uploads.claim(studyContentHash(text), mode);
    if (identity.kind === 'existing') {
      await storeDocumentSlides(identity.document.document_id, slides);
      for (const source of set.sources)
        await storeDocumentSource(
          identity.document.document_id,
          source.fileType,
          source.buffer,
          source.part,
          source.filename,
        );
      await clearParts(partIds);
      return NextResponse.json({
        ...identity.document,
        study_mode: mode,
        was_truncated: wasTruncated,
        reused: true,
      });
    }
    if (identity.kind === 'pending')
      return NextResponse.json(
        {
          error: 'This document is already being prepared.',
          detail:
            'Let the first upload finish, then retry to open it, or check your document library. No second generation was started.',
        },
        { status: 409 },
      );
    claim = identity.claim;
    // Independent model calls overlap; the transaction only holds a connection
    // while persisting the finished result, never while waiting on generation.
    emit({ type: 'progress', stage: 'generating' });
    const [content, graph] = await Promise.all([
      generateFlashcardsAndQuiz(text, set.filename, mode).then((content) => {
        emit({ type: 'progress', stage: 'generating', ready: 'materials' });
        return content;
      }),
      generateConceptGraph(text, set.filename).then((graph) => {
        emit({
          type: 'progress',
          stage: 'generating',
          ready: 'graph',
          concepts: graph.nodes.slice(0, 60).map((n) => n.label.slice(0, 60)),
        });
        return graph;
      }),
    ]);
    emit({ type: 'progress', stage: 'saving' });
    const doc = await database.transaction(async (db) => {
      const { data: document, error } = await db
        .from('documents')
        .insert({
          filename: set.filename,
          file_type: set.fileType,
          study_mode: mode,
          file_size_bytes: set.size,
          part_count: decks.length,
          extracted_text_length: rawText.length,
          content: text,
          status: 'completed',
          concept_node_count: graph.nodes.length,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      const rows = [
        await db.from('document_sources').insert(
          set.sources.map((source) => ({
            document_id: document.id,
            file_type: source.fileType,
            data_base64: source.buffer.toString('base64'),
            part: source.part,
            filename: source.filename,
          })),
        ),
        await db
          .from('document_slides')
          .insert(slides.map((s) => ({ ...s, document_id: document.id }))),
        await db.from('flashcards').insert(
          content.flashcards.map((f) => ({
            document_id: document.id,
            term: f.term,
            definition: f.definition,
          })),
        ),
        await db.from('quiz_questions').insert(
          content.quiz_questions.map((q) => ({
            ...q,
            document_id: document.id,
            correct_answers: q.correct_answers.length
              ? q.correct_answers
              : null,
            correct_answer_text: q.correct_answer_text || null,
            numeric_answer: q.numeric_answer ?? null,
            answer_tolerance: q.answer_tolerance ?? null,
            answer_unit: q.answer_unit ?? null,
          })),
        ),
        await db.from('topic_summaries').insert(
          content.topic_summaries.map((s) => ({
            ...s,
            document_id: document.id,
          })),
        ),
        await db.from('concept_graphs').insert({
          document_id: document.id,
          nodes: graph.nodes,
          edges: graph.edges,
        }),
      ];
      for (const result of rows)
        if (result.error) throw new Error(result.error.message);
      return document;
    }, claim);
    await clearParts(partIds);
    return NextResponse.json({
      document_id: doc.id,
      study_mode: mode,
      flashcard_count: content.flashcards.length,
      quiz_question_count: content.quiz_questions.length,
      topic_summary_count: content.topic_summaries.length,
      concept_node_count: graph.nodes.length,
      was_truncated: wasTruncated,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json(
      {
        error: 'Could not prepare the study material.',
        detail:
          'No partial document was saved. Check your server configuration and try again.',
      },
      { status: 500 },
    );
  } finally {
    if (claim)
      await database.uploads
        .release(claim)
        .catch((error) =>
          console.error('Could not release Mnemo upload claim:', error),
        );
  }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get('accept')?.includes('application/x-ndjson'))
    return prepareUpload(request, () => {});

  const encoder = new TextEncoder();
  let connected = true;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: UploadEvent) => {
        if (connected)
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };
      // A heartbeat keeps proxies from treating long model calls as idle.
      const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 15000);
      try {
        const response = await prepareUpload(request, emit);
        const data = await response.json();
        if (response.ok) emit({ type: 'complete', ...data });
        else
          emit({
            type: 'error',
            message: [data.error, data.detail].filter(Boolean).join(' '),
          });
      } catch {
        emit({
          type: 'error',
          message:
            'The connection was interrupted. Check your document library before retrying.',
        });
      } finally {
        clearInterval(heartbeat);
        if (connected) {
          connected = false;
          controller.close();
        }
      }
    },
    cancel() {
      connected = false;
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
