import type { QuestionType } from '@/types';

export interface GradableQuestion {
  question_type: QuestionType;
  correct_answer: number;
  correct_answers: number[] | null;
  correct_answer_text: string | null;
  numeric_answer: number | null;
  answer_tolerance: number | null;
}
export interface GradableAnswer {
  selected_answer: number;
  selected_answers: number[];
  typed_answer: string;
}

/** Case, punctuation, articles and spacing never decide a short answer. */
export function normalizeAnswer(text: string) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\p{L})[-\u2010-\u2015](?=\p{L})/gu, '$1 ')
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
}

export function parseNumber(text: string) {
  const match = text.replace(/,/g, '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/i);
  return match ? Number(match[0]) : NaN;
}

export function gradeAnswer(q: GradableQuestion, a: GradableAnswer): boolean {
  switch (q.question_type) {
    case 'mcq':
    case 'nclex':
      return q.correct_answer === a.selected_answer;
    case 'multiple_select': {
      const correct = new Set(q.correct_answers ?? []);
      const chosen = new Set(a.selected_answers);
      return (
        correct.size === chosen.size && [...correct].every((v) => chosen.has(v))
      );
    }
    case 'short_answer': {
      const typed = normalizeAnswer(a.typed_answer || '');
      return !!typed && typed === normalizeAnswer(q.correct_answer_text || '');
    }
    case 'engineering': {
      const typed = parseNumber(a.typed_answer || '');
      return (
        Number.isFinite(typed) &&
        typeof q.numeric_answer === 'number' &&
        typeof q.answer_tolerance === 'number' &&
        Math.abs(typed - q.numeric_answer) <= q.answer_tolerance
      );
    }
    default:
      return false;
  }
}
