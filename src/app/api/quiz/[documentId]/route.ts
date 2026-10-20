import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  const { data, error } = await database
    .from('quiz_questions')
    .select(
      'id, document_id, question, question_type, choices, correct_answer, correct_answers, correct_answer_text, numeric_answer, answer_tolerance, answer_unit, explanation',
    )
    .eq('document_id', documentId);

  if (error) {
    return NextResponse.json(
      { error: 'Could not load questions. Please retry.' },
      { status: 500 },
    );
  }

  const cleaned = (data ?? []).filter((question) => {
    if (question.question_type !== 'multiple_select') {
      return true;
    }

    const choices = Array.isArray(question.choices) ? question.choices : [];
    const correctAnswers = Array.isArray(question.correct_answers)
      ? question.correct_answers.filter(
          (index) =>
            Number.isInteger(index) && index >= 0 && index < choices.length,
        )
      : [];

    return (
      choices.length === 4 &&
      correctAnswers.length >= 2 &&
      correctAnswers.length < choices.length
    );
  });

  return NextResponse.json(cleaned);
}
