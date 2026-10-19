import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  learningSummary,
  localGrade,
  newLearningState,
  practiceItems,
  recordAttempt,
  reviewSchedule,
  topicContext,
  validGroup,
  resolveTopicParam,
  workbenchGroups,
  type PracticeItem,
} from '../src/lib/workbench-learning';
import type { WorkbenchContent } from '../src/types';
const item: PracticeItem = {
  id: 'recall-0',
  phase: 'recall',
  kind: 'explain',
  prompt: 'Why does the sender wait?',
  ideal:
    'The sender waits for an acknowledgement before sending another packet.',
  hints: ['Consider the acknowledgement.'],
};
test('workbench rejects malformed graph arrays and never turns text characters into concepts', () => {
  assert.throws(
    () => workbenchGroups({ nodes: JSON.stringify([item]), edges: [] }),
    /structure/,
  );
  const { groups } = workbenchGroups({
    nodes: [
      { id: 'central', label: 'Root', definition: 'A root', group: 'Main' },
      { id: 'a', label: 'A', definition: 'Definition', group: 'Topic' },
    ],
    edges: [],
  });
  assert.deepEqual([...groups.keys()], ['Topic']);
  assert.equal(groups.get('Topic')?.length, 1);
  for (const bad of [undefined, 'undefined', 'null', ''])
    assert.equal(validGroup(bad), false);
  assert.equal(validGroup('Loss & recovery / 100%'), true);
});
test('missed or assisted questions return after intervening practice and retries are bounded', () => {
  const items = [
    item,
    ...[1, 2, 3].map((i) => ({ ...item, id: `recall-${i}` })),
  ];
  let state = newLearningState(items);
  state.phase = 'practice';
  state = recordAttempt(state, item, {
    answer: 'I am not sure',
    correct: false,
    confidence: 'certain',
    assisted: false,
    feedback: 'Review the mechanism.',
  });
  assert.deepEqual(state.queue, [
    'recall-0',
    'recall-1',
    'recall-2',
    'recall-0',
    'recall-3',
  ]);
  assert.throws(() => recordAttempt(state, item, state.feedback!), /not ready/);
  state = { ...state, cursor: 3, feedback: null };
  state = recordAttempt(state, item, {
    answer: 'Still unsure',
    correct: false,
    confidence: 'unsure',
    assisted: true,
    feedback: 'Review this later.',
  });
  assert.equal(state.queue.length, 5);
  assert.deepEqual(learningSummary(state).needsReview, ['recall-0']);
  assert.equal(learningSummary(state).overconfident, 1);
});
test('review scheduling distinguishes independent retrieval from correction with help', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  let state = newLearningState([item]);
  state.phase = 'practice';
  state = recordAttempt(state, item, {
    answer: item.ideal,
    correct: true,
    confidence: 'fairly-sure',
    assisted: false,
    feedback: 'Correct',
  });
  assert.equal(
    reviewSchedule(state, 0, now).next_review_at,
    '2026-10-20T12:00:00.000Z',
  );
  assert.equal(reviewSchedule(state, 3, now).interval_days, 6);
  assert.equal(reviewSchedule(state, 30, now).interval_days, 30);
  const assisted = {
    ...state,
    attempts: { [item.id]: [{ ...state.feedback!, assisted: true }] },
  };
  assert.equal(
    reviewSchedule(assisted, 3, now).next_review_at,
    '2026-10-19T12:10:00.000Z',
  );
  assert.equal(learningSummary(assisted).independent, 0);
});
test('explanations require semantic grading; negated keywords and malformed numbers never pass locally', () => {
  assert.equal(
    localGrade(
      item,
      'The sender does not wait for an acknowledgement before sending another packet.',
    ),
    null,
  );
  const numeric = {
    ...item,
    kind: 'numeric' as const,
    numericAnswer: -2,
    tolerance: 0.1,
  };
  assert.equal(localGrade(numeric, '-2e0'), true);
  assert.equal(localGrade(numeric, '-2 incorrect'), false);
  assert.equal(localGrade(numeric, '2'), false);
});
test('topic context retrieves relevant material beyond the beginning of a source', () => {
  const source =
    'Unrelated intro.\n\n' +
    'More unrelated detail.\n\n'.repeat(900) +
    'Rdt3.0 uses a timer to recover from loss.';
  assert.match(
    topicContext(source, [
      {
        id: 'rdt3',
        label: 'Rdt3.0',
        definition: 'Recovers loss',
        group: 'Recovery',
      },
    ]),
    /uses a timer/,
  );
});
test('a worked example is separated from independent application problems', () => {
  const problem = {
    problem: 'Calculate a result',
    givenData: ['Given'],
    answer: 5,
    unit: 's',
    tolerance: 0.1,
    solutionSteps: ['Work it out'],
  };
  const content = {
    study_mode: 'engineers',
    inquiry_questions: [],
    application_questions: [],
    engineering_problems: [{ ...problem, problem: 'Worked example' }, problem],
    nclex_questions: [],
    faded_blanks: [],
  } as unknown as WorkbenchContent;
  const items = practiceItems(content);
  assert.equal(items.length, 1);
  assert.equal(items[0].prompt, 'Calculate a result');
  assert.equal(items[0].phase, 'apply');
});

test('topic links resolve encoded names while preserving literal percent signs', () => {
  const names = [
    'Error Recovery',
    'Loss / recovery',
    '100% complete',
    'Literal%20name',
  ];
  assert.equal(resolveTopicParam('Error%20Recovery', names), 'Error Recovery');
  assert.equal(
    resolveTopicParam('Loss%20%2F%20recovery', names),
    'Loss / recovery',
  );
  assert.equal(resolveTopicParam('100% complete', names), '100% complete');
  assert.equal(resolveTopicParam('Literal%20name', names), 'Literal%20name');
  assert.equal(resolveTopicParam('undefined', names), null);
});
