import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import type { QuestionType } from '@/types';

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
  const body = await request.json();
  const { answers } = body as { answers: SubmittedAnswer[] };

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

  // Grade each answer based on question type
  const gradedAnswers = answers.map((a) => {
    const q = questionMap.get(a.question_id);
    if (!q) {
      return { ...a, is_correct: false };
    }

    let isCorrect = false;

    switch (q.question_type) {
      case 'mcq':
        isCorrect = q.correct_answer === a.selected_answer;
        break;
      case 'multiple_select': {
        const correctSet = new Set(q.correct_answers as number[]);
        const selectedSet = new Set(a.selected_answers);
        isCorrect =
          correctSet.size === selectedSet.size &&
          [...correctSet].every((v) => selectedSet.has(v));
        break;
      }
      case 'short_answer':
        isCorrect =
          (a.typed_answer || '').trim().toLowerCase() ===
          (q.correct_answer_text || '').trim().toLowerCase();
        break;
      case 'nclex':
        isCorrect = q.correct_answer === a.selected_answer;
        break;
      case 'engineering': {
        const typed = parseFloat(
          (a.typed_answer || '').replace(/[^\d.\-eE]/g, ''),
        );
        isCorrect =
          !Number.isNaN(typed) &&
          typeof q.numeric_answer === 'number' &&
          typeof q.answer_tolerance === 'number' &&
          Math.abs(typed - q.numeric_answer) <= q.answer_tolerance;
        break;
      }
    }

    return {
      question_id: a.question_id,
      question_type: q.question_type,
      selected_answer: a.selected_answer,
      selected_answers: a.selected_answers,
      typed_answer: a.typed_answer,
      is_correct: isCorrect,
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
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    attempt_id: attempt.id,
    total_questions: totalQuestions,
    correct_answers: correctCount,
    score_percentage: scorePercentage,
    answers: gradedAnswers,
  });
}
