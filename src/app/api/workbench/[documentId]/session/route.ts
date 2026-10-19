import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { gradePracticeAnswer } from '@/lib/workbench-grading';
import {
  newLearningState,
  practiceItems,
  recordAttempt,
  reviewSchedule,
  validGroup,
  type Confidence,
  type LearningSession,
  type LearningState,
} from '@/lib/workbench-learning';
export const maxDuration = 300;
type Context = { params: Promise<{ documentId: string }> };
async function load(documentId: string, group: string) {
  const { data: content, error } = await database
    .from('workbench_content')
    .select()
    .eq('document_id', documentId)
    .eq('group_name', group)
    .maybeSingle();
  if (error) throw new Error('Could not load the lesson.');
  if (!content) return null;
  const { data: doc, error: docError } = await database
    .from('documents')
    .select('study_mode')
    .eq('id', documentId)
    .single();
  if (docError) throw new Error('Could not load the document.');
  const items = practiceItems({ ...content, study_mode: doc.study_mode });
  if (!items.length)
    throw new Error(
      'This lesson has no practice questions. Try another topic.',
    );
  const loadedSession = await database
    .from('workbench_sessions')
    .select()
    .eq('document_id', documentId)
    .eq('group_name', group)
    .maybeSingle();
  if (loadedSession.error) throw new Error('Could not load saved progress.');
  let session = loadedSession.data;
  if (!session) {
    const inserted = await database
      .from('workbench_sessions')
      .insert({
        document_id: documentId,
        group_name: group,
        content_id: content.id,
        state: newLearningState(items),
      })
      .select()
      .single();
    if (inserted.error && inserted.error.code !== '23505')
      throw new Error('Could not start a saved session.');
    if (inserted.error) {
      const found = await database
        .from('workbench_sessions')
        .select()
        .eq('document_id', documentId)
        .eq('group_name', group)
        .single();
      if (found.error) throw new Error('Could not load saved progress.');
      session = found.data;
    } else session = inserted.data;
  }
  return { session: session!, items };
}
export async function GET(request: NextRequest, { params }: Context) {
  const group = request.nextUrl.searchParams.get('group');
  if (!validGroup(group))
    return NextResponse.json(
      { error: 'Choose a topic from the workbench.' },
      { status: 400 },
    );
  try {
    const { documentId } = await params;
    const loaded = await load(documentId, group);
    return loaded
      ? NextResponse.json(loaded.session)
      : NextResponse.json(
          { error: 'Prepare this lesson first.' },
          { status: 404 },
        );
  } catch (error) {
    console.error('Workbench session failed:', error);
    return NextResponse.json(
      { error: 'Could not load your learning session. Please retry.' },
      { status: 503 },
    );
  }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const body = await request.json();
    const { group, action, revision } = body;
    if (
      !validGroup(group) ||
      !Number.isInteger(revision) ||
      !['start', 'answer', 'next', 'restart', 'hint'].includes(action)
    )
      return NextResponse.json(
        { error: 'Invalid learning session request.' },
        { status: 400 },
      );
    const { documentId } = await params;
    const loaded = await load(documentId, group);
    if (!loaded)
      return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
    const { session, items } = loaded;
    if (session.revision !== revision)
      return NextResponse.json(
        {
          error: 'Progress changed in another tab. Reload to continue.',
          session,
        },
        { status: 409 },
      );
    let state: LearningState = structuredClone(session.state);
    let schedule: Partial<LearningSession> = {};
    if (action === 'start') {
      if (state.phase !== 'learn')
        return NextResponse.json(
          { error: 'This session has already started.' },
          { status: 409 },
        );
      state.phase = 'practice';
    } else if (action === 'restart') {
      if (state.phase !== 'complete')
        return NextResponse.json(
          { error: 'Finish the current session before starting a review.' },
          { status: 409 },
        );
      const previous = state;
      state = newLearningState(items);
      state.phase = 'practice';
      // Prioritize the items that needed help in the previous session.
      state.queue.sort((a, b) => {
        const need = (id: string) => {
          const attempts = previous.attempts[id];
          return !attempts?.[0]?.correct || attempts?.[0]?.assisted ? 0 : 1;
        };
        return need(a) - need(b);
      });
    } else if (action === 'hint') {
      if (state.phase !== 'practice' || state.feedback)
        return NextResponse.json(
          { error: 'Support is available before checking an answer.' },
          { status: 400 },
        );
      state.supportUsed = true;
    } else if (action === 'answer') {
      if (state.phase !== 'practice' || state.feedback)
        return NextResponse.json(
          { error: 'Continue to the next question before answering again.' },
          { status: 409 },
        );
      const item = items.find((i) => i.id === state.queue[state.cursor]);
      if (
        !item ||
        typeof body.answer !== 'string' ||
        !body.answer.trim() ||
        body.answer.length > 6000 ||
        !['unsure', 'fairly-sure', 'certain'].includes(body.confidence)
      )
        return NextResponse.json(
          { error: 'Enter an answer and choose your confidence.' },
          { status: 400 },
        );
      const grade = await gradePracticeAnswer(item, body.answer);
      state = recordAttempt(state, item, {
        answer: body.answer.trim(),
        confidence: body.confidence as Confidence,
        assisted: state.supportUsed === true,
        ...grade,
      });
    } else {
      if (state.phase !== 'practice' || !state.feedback)
        return NextResponse.json(
          { error: 'Attempt this question before continuing.' },
          { status: 400 },
        );
      state.cursor++;
      state.feedback = null;
      state.supportUsed = false;
      if (state.cursor >= state.queue.length) {
        state.phase = 'complete';
        schedule = {
          ...reviewSchedule(state, session.interval_days),
          completed_at: new Date().toISOString(),
        };
      }
    }
    const saved = await database
      .from('workbench_sessions')
      .update({
        state,
        ...schedule,
        revision: revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .eq('revision', revision)
      .select()
      .maybeSingle();
    if (saved.error)
      throw new Error('Could not save this answer. Please retry.');
    if (!saved.data)
      return NextResponse.json(
        { error: 'Progress changed in another tab. Reload to continue.' },
        { status: 409 },
      );
    return NextResponse.json(saved.data);
  } catch (error) {
    console.error('Workbench practice failed:', error);
    return NextResponse.json(
      {
        error:
          'Could not check or save this answer. Your previous progress is safe; please retry.',
      },
      { status: 503 },
    );
  }
}
