import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';

/** The latest attempt's score and missed questions, for "retry what you missed". */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const { data, error } = await database
    .from('quiz_attempts')
    .select('score_percentage,answers,completed_at')
    .eq('document_id', documentId)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (error)
    return NextResponse.json(
      { error: 'Could not load your last quiz.' },
      { status: 503 },
    );
  const last = data[0];
  if (!last) return NextResponse.json(null);
  return NextResponse.json({
    score: Math.round(last.score_percentage),
    completed_at: last.completed_at,
    missed: (Array.isArray(last.answers) ? last.answers : [])
      .filter((a) => !a.is_correct)
      .map((a) => a.question_id),
  });
}
