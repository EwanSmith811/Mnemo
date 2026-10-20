import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { loadDocumentSlides } from '@/lib/slide-store';
import type { DocumentSlide } from '@/lib/document-slides';
import { resumeIndex, type StudyProgress } from '@/lib/study-plan';
import { workbenchGroups } from '@/lib/workbench-learning';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const [slides, progress, cards, questions, attempts, graph, sessions] =
      await Promise.all([
        loadDocumentSlides(documentId)
          .then((data) => ({ data: data ?? [], error: null }))
          .catch((error: Error) => ({ data: [] as DocumentSlide[], error })),
        database
          .from('slide_progress')
          .select('slide_id,status')
          .eq('document_id', documentId),
        database
          .from('flashcards')
          .select('next_review_date,last_reviewed_at')
          .eq('document_id', documentId),
        database
          .from('quiz_questions')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', documentId),
        database
          .from('quiz_attempts')
          .select('score_percentage,answers,completed_at')
          .eq('document_id', documentId)
          .order('completed_at', { ascending: false }),
        database
          .from('concept_graphs')
          .select('nodes,edges')
          .eq('document_id', documentId)
          .maybeSingle(),
        database
          .from('workbench_sessions')
          .select('state,next_review_at')
          .eq('document_id', documentId),
      ]);
    for (const result of [slides, cards, questions, attempts, graph, sessions])
      if (result.error) throw new Error('Progress unavailable');
    // Before migration 007 is applied, slide progress simply starts empty.
    if (progress.error && progress.error.code !== '42P01')
      throw new Error('Slide progress unavailable');
    const now = Date.now();
    const status = new Map(
      (progress.data ?? []).map((p) => [p.slide_id, p.status]),
    );
    // Only slides worth studying count; resume points into the full deck.
    const core = slides.data.filter((s) => s.relevance !== 'skip');
    const statuses = core.map((s) => status.get(s.id) ?? null);
    const resume = resumeIndex(statuses);
    const scores = attempts.data.map((a) => Math.round(a.score_percentage));
    let topics = 0;
    try {
      topics = graph.data ? workbenchGroups(graph.data).groups.size : 0;
    } catch {
      topics = 0;
    }
    const body: StudyProgress = {
      slides: {
        total: statuses.length,
        seen: statuses.filter((s) => s === 'seen').length,
        shaky: statuses.filter((s) => s === 'shaky').length,
        understood: statuses.filter((s) => s === 'understood').length,
        resume: resume === null ? null : slides.data.indexOf(core[resume]),
      },
      cards: {
        total: cards.data.length,
        reviewed: cards.data.filter((c) => c.last_reviewed_at).length,
        due: cards.data.filter(
          (c) => new Date(c.next_review_date).getTime() <= now,
        ).length,
      },
      quiz: {
        questions: questions.count ?? 0,
        attempts: scores.length,
        lastScore: scores[0] ?? null,
        bestScore: scores.length ? Math.max(...scores) : null,
        lastMissed: Array.isArray(attempts.data[0]?.answers)
          ? attempts.data[0].answers.filter((a) => !a.is_correct).length
          : 0,
      },
      workbench: {
        topics,
        started: sessions.data.length,
        due: sessions.data.filter(
          (s) =>
            s.state?.phase === 'complete' &&
            s.next_review_at &&
            new Date(s.next_review_at).getTime() <= now,
        ).length,
      },
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error('Study progress failed:', error);
    return NextResponse.json(
      { error: 'Could not load your progress. Please retry.' },
      { status: 503 },
    );
  }
}
