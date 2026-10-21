import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { database } from '@/lib/database';
import {
  ensureSlideExplanation,
  generateSlideReply,
} from '@/lib/slide-tutor-server';
import {
  explanationText,
  parseSlideExplanation,
  SLIDE_STATUSES,
  type SlideStatus,
  type SlideThread,
  type TutorMessage,
} from '@/lib/slide-tutor';
export const maxDuration = 300;
type Context = { params: Promise<{ documentId: string; slideId: string }> };
async function load(context: Context) {
  const { documentId, slideId } = await context.params;
  const slide = await database
    .from('document_slides')
    .select()
    .eq('id', slideId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (slide.error) throw new Error('Slide lookup failed');
  if (!slide.data) return null;
  return slide.data;
}
export async function GET(_request: NextRequest, context: Context) {
  try {
    const slide = await load(context);
    if (!slide)
      return NextResponse.json(
        { error: 'Slide not found in this document.' },
        { status: 404 },
      );
    const [base, thread] = await Promise.all([
      database
        .from('slide_explanations')
        .select('explanation')
        .eq('slide_id', slide.id)
        .maybeSingle(),
      database
        .from('slide_threads')
        .select()
        .eq('slide_id', slide.id)
        .maybeSingle(),
    ]);
    if (base.error || thread.error)
      throw new Error('Saved study data unavailable');
    return NextResponse.json({
      slide,
      explanation: base.data
        ? parseSlideExplanation(base.data.explanation)
        : null,
      thread: thread.data,
    });
  } catch (error) {
    console.error('Slide load failed:', error);
    return NextResponse.json(
      { error: 'Could not load this slide. Please retry.' },
      { status: 503 },
    );
  }
}
/** Records walkthrough progress. Opening a slide never downgrades a rating. */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const body = await request.json().catch(() => null);
    if (body?.include === true) {
      const slide = await load(context);
      if (!slide)
        return NextResponse.json(
          { error: 'Slide not found in this document.' },
          { status: 404 },
        );
      const saved = await database
        .from('document_slides')
        .update({ relevance: 'core', relevance_reason: 'Included by you' })
        .eq('id', slide.id);
      if (saved.error) throw new Error('Could not include slide');
      return NextResponse.json({ relevance: 'core' });
    }
    const status = body?.status as SlideStatus;
    if (!SLIDE_STATUSES.includes(status))
      return NextResponse.json(
        { error: 'Choose seen, shaky, or understood.' },
        { status: 400 },
      );
    const slide = await load(context);
    if (!slide)
      return NextResponse.json(
        { error: 'Slide not found in this document.' },
        { status: 404 },
      );
    const row = {
      slide_id: slide.id,
      document_id: slide.document_id,
      status,
      updated_at: new Date().toISOString(),
    };
    const existing = await database
      .from('slide_progress')
      .select('status')
      .eq('slide_id', slide.id)
      .maybeSingle();
    if (existing.error) throw new Error('Could not load slide progress');
    if (status === 'seen' && existing.data)
      return NextResponse.json({ status: existing.data.status });
    const saved = await database
      .from('slide_progress')
      .upsert(row, { onConflict: 'slide_id' });
    if (saved.error) throw new Error('Could not save slide progress');
    return NextResponse.json({ status });
  } catch (error) {
    console.error('Slide progress failed:', error);
    return NextResponse.json(
      { error: 'Could not save your progress. Please retry.' },
      { status: 503 },
    );
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const body = await request.json();
    if (!['explain', 'ask'].includes(body.action))
      return NextResponse.json(
        { error: 'Choose explanation or a follow-up question.' },
        { status: 400 },
      );
    if (
      body.action === 'ask' &&
      (typeof body.message !== 'string' ||
        !body.message.trim() ||
        body.message.length > 4000 ||
        !Number.isInteger(body.revision) ||
        typeof body.requestId !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(body.requestId))
    )
      return NextResponse.json(
        { error: 'Enter a question of up to 4,000 characters.' },
        { status: 400 },
      );
    const slide = await load(context);
    if (!slide)
      return NextResponse.json(
        { error: 'Slide not found in this document.' },
        { status: 404 },
      );
    const doc = await database
      .from('documents')
      .select('filename,part_count')
      .eq('id', slide.document_id)
      .single();
    if (doc.error) throw new Error('Document lookup failed');
    // In a study set, name the deck the slide came from.
    if (doc.data.part_count > 1) {
      const deck = await database
        .from('document_sources')
        .select('filename')
        .eq('document_id', slide.document_id)
        .eq('part', slide.part)
        .maybeSingle();
      if (deck.data?.filename)
        doc.data.filename = `${doc.data.filename} (deck: ${deck.data.filename})`;
    }
    if ((slide.text + slide.notes).trim().length < 20)
      return NextResponse.json(
        {
          error:
            'This slide has too little readable text to explain reliably. Check the original slide or upload a text-based export.',
        },
        { status: 422 },
      );
    const explanation = await ensureSlideExplanation(slide, doc.data.filename);
    if (body.action === 'explain') return NextResponse.json({ explanation });
    let found = await database
      .from('slide_threads')
      .select()
      .eq('slide_id', slide.id)
      .maybeSingle();
    if (found.error) throw new Error('Thread lookup failed');
    if (!found.data) {
      const inserted = await database
        .from('slide_threads')
        .insert({ slide_id: slide.id, messages: [] })
        .select()
        .single();
      if (inserted.error && inserted.error.code !== '23505')
        throw new Error('Could not start conversation');
      found = inserted.error
        ? await database
            .from('slide_threads')
            .select()
            .eq('slide_id', slide.id)
            .single()
        : inserted;
    }
    if (found.error || !found.data)
      throw new Error('Could not load conversation');
    const thread = found.data as SlideThread;
    // A retry after a lost response returns the already saved exchange.
    if (thread.messages.some((m) => m.id === body.requestId))
      return NextResponse.json({ thread });
    if (thread.revision !== body.revision)
      return NextResponse.json(
        {
          error:
            'This conversation changed in another tab. Your latest messages have been loaded.',
          thread,
        },
        { status: 409 },
      );
    if (thread.messages.length >= 60)
      return NextResponse.json(
        {
          error:
            'This slide conversation is full. Continue in Ask Mnemo for a new conversation.',
        },
        { status: 400 },
      );
    const reply = await generateSlideReply(
      slide,
      doc.data.filename,
      explanation,
      thread.messages,
      body.message.trim(),
    );
    const messages: TutorMessage[] = [
      ...thread.messages,
      { id: body.requestId, role: 'user', content: body.message.trim() },
      {
        id: randomUUID(),
        role: 'assistant',
        content: explanationText(reply),
        reply,
      },
    ];
    const saved = await database
      .from('slide_threads')
      .update({
        messages,
        revision: thread.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', thread.id)
      .eq('revision', thread.revision)
      .select()
      .maybeSingle();
    if (saved.error) throw new Error('Could not save the reply');
    if (!saved.data) {
      const latest = await database
        .from('slide_threads')
        .select()
        .eq('slide_id', slide.id)
        .single();
      return NextResponse.json(
        {
          error:
            'Another reply was saved first. Review the latest conversation before resending.',
          thread: latest.error ? null : latest.data,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ thread: saved.data });
  } catch (error) {
    console.error('Slide tutor failed:', error);
    return NextResponse.json(
      {
        error:
          'Could not prepare or save this explanation. Please retry; saved conversations are preserved.',
      },
      { status: 503 },
    );
  }
}
