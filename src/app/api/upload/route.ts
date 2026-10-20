import { storeDocumentSource } from '@/lib/source-preview';
import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { extractDocument } from '@/lib/document-parser';
import type { ExtractedSlide } from '@/lib/document-slides';
import { storeDocumentSlides } from '@/lib/slide-store';
import { getDocumentFileType } from '@/lib/document-formats';
import { prepareTextForLLM } from '@/lib/text-chunker';
import { generateFlashcardsAndQuiz } from '@/lib/generate-content';
import { generateConceptGraph } from '@/lib/generate-graph';
import { studyContentHash, type UploadClaim } from '@/lib/upload-registry';
import type { UploadEvent } from '@/lib/upload-progress';
export const maxDuration = 300;

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
    const file = form.get('file');
    const mode = form.get('studyMode');
    if (!(file instanceof File) || (mode !== 'nursing' && mode !== 'engineers'))
      return NextResponse.json(
        { error: 'Choose a file and study focus.' },
        { status: 400 },
      );
    if (!file.size || file.size > 4 * 1024 * 1024)
      return NextResponse.json(
        { error: 'Choose a file smaller than 4 MB.' },
        { status: 413 },
      );
    const extension = getDocumentFileType(file.name);
    if (!extension)
      return NextResponse.json(
        {
          error: 'Choose a PDF or PowerPoint file (.pptx, .ppt, .pps, .ppsx).',
        },
        { status: 400 },
      );
    emit({ type: 'progress', stage: 'reading' });
    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    let rawText: string;
    let slides: ExtractedSlide[] = [];
    try {
      const extracted = await extractDocument(sourceBuffer, extension);
      rawText = extracted.text;
      slides = extracted.slides;
    } catch (error) {
      console.error('Document extraction failed:', error);
      return NextResponse.json(
        {
          error: 'Could not read this file.',
          detail:
            'Use an unencrypted, text-based PDF or PowerPoint file. If an older slideshow fails, export it as PPTX or PDF.',
        },
        { status: 400 },
      );
    }
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
      preview: {
        slides: slides.length,
        words: rawText.split(/\s+/).filter(Boolean).length,
        titles: [...new Set(slides.map((s) => s.title.trim()))]
          .filter((t) => t && !/^(slide|page) \d+$/i.test(t))
          .slice(0, 40)
          .map((t) => t.slice(0, 80)),
      },
    });
    const { text, wasTruncated } = prepareTextForLLM(rawText);
    const identity = await database.uploads.claim(studyContentHash(text), mode);
    if (identity.kind === 'existing') {
      await storeDocumentSlides(identity.document.document_id, slides);
      await storeDocumentSource(
        identity.document.document_id,
        extension,
        sourceBuffer,
      );
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
      generateFlashcardsAndQuiz(text, file.name, mode).then((content) => {
        emit({ type: 'progress', stage: 'generating', ready: 'materials' });
        return content;
      }),
      generateConceptGraph(text, file.name).then((graph) => {
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
          filename: file.name,
          file_type: extension,
          study_mode: mode,
          file_size_bytes: file.size,
          extracted_text_length: rawText.length,
          content: text,
          status: 'completed',
          concept_node_count: graph.nodes.length,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      const rows = [
        await db.from('document_sources').insert({
          document_id: document.id,
          file_type: extension,
          data_base64: sourceBuffer.toString('base64'),
        }),
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
