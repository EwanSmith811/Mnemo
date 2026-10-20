import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import type { QuestionType } from '@/types';
import { gradeAnswer } from '@/lib/quiz-grading';

interface SubmittedAnswer {
  question_id: string;
  question_type: QuestionType;
  selected_answer: number;
  selected_answers: number[];
  typed_answer: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const body = await request.json().catch(() => null);
  const answers = body?.answers as SubmittedAnswer[];

  if (
    !Array.isArray(answers) ||
    !answers.length ||
    answers.length > 200 ||
    answers.some(
      (a) =>
        !a ||
        typeof a.question_id !== 'string' ||
        !Array.isArray(a.selected_answers) ||
        typeof a.typed_answer !== 'string' ||
        a.typed_answer.length > 12000,
    ) ||
    new Set(answers.map((a) => a.question_id)).size !== answers.length
  )
    return NextResponse.json(
      { error: 'Provide one valid answer per question.' },
      { status: 400 },
    );

  // Fetch correct answers with type info
  const { data: questions, error } = await database
    .from('quiz_questions')
    .select(
      'id, question_type, correct_answer, correct_answers, correct_answer_text, numeric_answer, answer_tolerance',
    )
    .eq('document_id', documentId);

  if (error || !questions) {
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
      { status: 500 },
    );
  }

  const questionMap = new Map(questions.map((q) => [q.id, q]));

  if (answers.some((a) => !questionMap.has(a.question_id)))
    return NextResponse.json(
      { error: 'A question does not belong to this document.' },
      { status: 400 },
    );

  const gradedAnswers = answers.map((a) => {
    const q = questionMap.get(a.question_id)!;
    return {
      question_id: a.question_id,
      question_type: q.question_type,
      selected_answer: a.selected_answer,
      selected_answers: a.selected_answers,
      typed_answer: a.typed_answer,
      is_correct: gradeAnswer(q, a),
    };
  });

  const correctCount = gradedAnswers.filter((a) => a.is_correct).length;
  const totalQuestions = answers.length;
  const scorePercentage =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Store the attempt
  const { data: attempt, error: insertError } = await database
    .from('quiz_attempts')
    .insert({
      document_id: documentId,
      total_questions: totalQuestions,
      correct_answers: correctCount,
      score_percentage: scorePercentage,
      answers: gradedAnswers,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: 'Could not save quiz results. Please retry.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    attempt_id: attempt.id,
    total_questions: totalQuestions,
    correct_answers: correctCount,
    score_percentage: scorePercentage,
    answers: gradedAnswers,
  });
}
