'use client';

import { useState } from 'react';
import type { QuizQuestion } from '@/types';
import NclexRationaleCard from './NclexRationaleCard';
import { TYPE_LABELS, type QuizScore } from './QuizPlayer';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
function verdict(pct: number) {
  if (pct >= 90)
    return [
      'Excellent.',
      'This material is solid. Space out the next quiz by a few days.',
    ];
  if (pct >= 80)
    return ['Strong.', 'Close the last gaps by retrying what you missed.'];
  if (pct >= 60)
    return [
      'Getting there.',
      'Retry the misses now, then revisit their slides in the walkthrough.',
    ];
  return [
    'Early days.',
    'That’s useful information. Walk through the slides again, then retry the misses.',
  ];
}

function yourAnswer(q: QuizQuestion, a: QuizScore['answers'][number]) {
  if (q.question_type === 'multiple_select')
    return (
      a.selected_answers
        .map((i) => `${LETTERS[i]}. ${q.choices[i]}`)
        .join(' · ') || '—'
    );
  if (q.question_type === 'short_answer' || q.question_type === 'engineering')
    return a.typed_answer || '—';
  return a.selected_answer >= 0
    ? `${LETTERS[a.selected_answer]}. ${q.choices[a.selected_answer]}`
    : '—';
}
function rightAnswer(q: QuizQuestion) {
  if (q.question_type === 'multiple_select')
    return (q.correct_answers ?? [])
      .map((i) => `${LETTERS[i]}. ${q.choices[i]}`)
      .join(' · ');
  if (q.question_type === 'short_answer') return q.correct_answer_text ?? '';
  if (q.question_type === 'engineering')
    return `${q.numeric_answer} ${q.answer_unit ?? ''}`;
  return `${LETTERS[q.correct_answer]}. ${q.choices[q.correct_answer]}`;
}

export default function ScoreDisplay({
  score,
  questions,
  onRetryMissed,
  onNewQuiz,
  flashcardsHref,
}: {
  score: QuizScore;
  questions: QuizQuestion[];
  onRetryMissed: () => void;
  onNewQuiz: () => void;
  flashcardsHref: string;
}) {
  const [filter, setFilter] = useState<'missed' | 'all'>('missed');
  const pct = Math.round(score.score_percentage);
  const missed = score.answers.filter((a) => !a.is_correct).length;
  const [title, advice] = verdict(pct);
  const circumference = 2 * Math.PI * 54;
  const rows = questions
    .map((q) => ({ q, a: score.answers.find((a) => a.question_id === q.id) }))
    .filter(({ a }) => a && (filter === 'all' || !a.is_correct));
  return (
    <div className="quiz-results">
      <section className="quiz-score">
        <svg viewBox="0 0 120 120" className="quiz-ring" aria-hidden>
          <circle cx="60" cy="60" r="54" />
          <circle
            cx="60"
            cy="60"
            r="54"
            className="quiz-ring-value"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - pct / 100),
            }}
          />
        </svg>
        <div className="quiz-score-number">
          <strong>{pct}</strong>
          <span className="mono">%</span>
        </div>
        <div className="quiz-score-copy">
          <span className="eyebrow">
            {score.correct_answers} of {score.total_questions} correct
          </span>
          <h2 className="display">{title}</h2>
          <p>{advice}</p>
          <div className="page-head-actions">
            {missed > 0 && (
              <button className="primary-button" onClick={onRetryMissed}>
                Retry the {missed} you missed <span className="arrow">→</span>
              </button>
            )}
            <button
              className={missed ? 'secondary-button' : 'primary-button'}
              onClick={onNewQuiz}
            >
              New quiz
            </button>
            <a className="ghost-button" href={flashcardsHref}>
              Flashcards
            </a>
          </div>
        </div>
      </section>

      <section className="quiz-review">
        <div className="section-title">
          <h2>Review</h2>
          <div className="segmented">
            <button
              aria-pressed={filter === 'missed'}
              onClick={() => setFilter('missed')}
            >
              Missed ({missed})
            </button>
            <button
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All ({score.total_questions})
            </button>
          </div>
        </div>
        {!rows.length && <p className="notice">Nothing missed. Nice work.</p>}
        <ol>
          {rows.map(({ q, a }, i) => (
            <li
              key={q.id}
              className={a!.is_correct ? 'is-right' : 'is-wrong'}
              style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
            >
              <span className="chip">
                {TYPE_LABELS[q.question_type || 'mcq']}
              </span>
              <h3>{q.question}</h3>
              <dl>
                {!a!.is_correct && (
                  <div className="is-wrong">
                    <dt>You answered</dt>
                    <dd>{yourAnswer(q, a!)}</dd>
                  </div>
                )}
                <div className="is-right">
                  <dt>Answer</dt>
                  <dd>{rightAnswer(q)}</dd>
                </div>
              </dl>
              {q.explanation &&
                (q.question_type === 'nclex' ? (
                  <NclexRationaleCard text={q.explanation} />
                ) : (
                  <p>{q.explanation}</p>
                ))}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
