import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, normalizeAnswer } from '../src/lib/quiz-grading';

const base = {
  correct_answer: 1,
  correct_answers: [0, 2],
  correct_answer_text: 'The Frank–Starling law',
  numeric_answer: 12.5,
  answer_tolerance: 0.1,
};
const answer = { selected_answer: -1, selected_answers: [], typed_answer: '' };

test('short answers ignore case, punctuation, articles and spacing', () => {
  assert.equal(
    normalizeAnswer('  The Frank–Starling   LAW. '),
    'frank starling law',
  );
  const q = { ...base, question_type: 'short_answer' as const };
  assert.ok(gradeAnswer(q, { ...answer, typed_answer: 'frank-starling law' }));
  assert.ok(gradeAnswer(q, { ...answer, typed_answer: 'Frank Starling law' }));
  assert.ok(!gradeAnswer(q, { ...answer, typed_answer: '' }));
});

test('numeric answers accept units and separators within tolerance', () => {
  const q = { ...base, question_type: 'engineering' as const };
  assert.ok(gradeAnswer(q, { ...answer, typed_answer: '12.45 kN' }));
  assert.ok(gradeAnswer(q, { ...answer, typed_answer: '1.25e1' }));
  assert.ok(!gradeAnswer(q, { ...answer, typed_answer: '12.7' }));
  assert.ok(!gradeAnswer(q, { ...answer, typed_answer: 'twelve' }));
});

test('choice questions require the exact selection', () => {
  assert.ok(
    gradeAnswer(
      { ...base, question_type: 'mcq' },
      { ...answer, selected_answer: 1 },
    ),
  );
  const multi = { ...base, question_type: 'multiple_select' as const };
  assert.ok(gradeAnswer(multi, { ...answer, selected_answers: [2, 0] }));
  assert.ok(!gradeAnswer(multi, { ...answer, selected_answers: [0] }));
  assert.ok(!gradeAnswer(multi, { ...answer, selected_answers: [0, 1, 2] }));
});
