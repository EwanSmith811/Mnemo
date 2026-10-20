'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuizAnswer, QuizQuestion, QuestionType } from '@/types';
import { gradeAnswer } from '@/lib/quiz-grading';
import NclexRationaleCard from './NclexRationaleCard';
import { Icon } from './ui';

export const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  multiple_select: 'Select all that apply',
  short_answer: 'Short answer',
  nclex: 'NCLEX style',
  engineering: 'Calculation',
};
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export interface QuizScore {
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  answers: QuizAnswer[];
}
interface Draft {
  selected: number | null;
  multi: Set<number>;
  typed: string;
}
const empty = (): Draft => ({ selected: null, multi: new Set(), typed: '' });

export default function QuizPlayer({
  questions,
  documentId,
  onComplete,
  onQuit,
}: {
  questions: QuizQuestion[];
  documentId: string;
  onComplete: (score: QuizScore) => void;
  onQuit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(empty);
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const question = questions[index];
  const type = question.question_type || 'mcq';
  const choiceBased = type === 'mcq' || type === 'nclex';
  const last = index === questions.length - 1;

  const answer = useCallback(
    (d: Draft): QuizAnswer => ({
      question_id: question.id,
      question_type: type,
      selected_answer: d.selected ?? -1,
      selected_answers: [...d.multi],
      typed_answer: d.typed,
      is_correct: gradeAnswer(question, {
        selected_answer: d.selected ?? -1,
        selected_answers: [...d.multi],
        typed_answer: d.typed,
      }),
    }),
    [question, type],
  );
  const ready = choiceBased
    ? draft.selected !== null
    : type === 'multiple_select'
      ? draft.multi.size > 0
      : !!draft.typed.trim();

  const check = useCallback(
    (d = draft) => {
      if (checked) return;
      const a = answer(d);
      setChecked(true);
      setResults((r) => [...r, a.is_correct]);
      setAnswers((list) => [...list, a]);
    },
    [answer, checked, draft],
  );

  const finish = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/quiz/${documentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onComplete(data);
    } catch {
      setError(
        'Your results weren’t saved. Your answers are still here; try again.',
      );
      setSubmitting(false);
    }
  }, [answers, documentId, onComplete]);
  const next = useCallback(() => {
    if (!checked || submitting) return;
    if (last) return void finish();
    setIndex((i) => i + 1);
    setDraft(empty());
    setChecked(false);
  }, [checked, finish, last, submitting]);

  useEffect(() => {
    if (!checked && !choiceBased && type !== 'multiple_select')
      input.current?.focus();
  }, [index, checked, choiceBased, type]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea');
      if (e.key === 'Enter') {
        if (checked) {
          e.preventDefault();
          next();
        } else if (ready && !typing) {
          e.preventDefault();
          check();
        }
        return;
      }
      if (typing || checked || e.metaKey || e.ctrlKey) return;
      const n =
        '1234'.indexOf(e.key) >= 0
          ? '1234'.indexOf(e.key)
          : 'abcd'.indexOf(e.key.toLowerCase());
      if (n < 0 || n >= question.choices.length) return;
      if (choiceBased) {
        const d = { ...draft, selected: n };
        setDraft(d);
        check(d);
      } else if (type === 'multiple_select')
        setDraft((d) => {
          const multi = new Set(d.multi);
          if (multi.has(n)) multi.delete(n);
          else multi.add(n);
          return { ...d, multi };
        });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [
    check,
    checked,
    choiceBased,
    draft,
    next,
    question.choices.length,
    ready,
    type,
  ]);

  const correct = checked && results[index];
  const correctSet = new Set(
    type === 'multiple_select'
      ? (question.correct_answers ?? [])
      : [question.correct_answer],
  );
  return (
    <div className="quiz-player">
      <div className="quiz-progress">
        <button className="text-button" onClick={onQuit}>
          End quiz
        </button>
        <ol aria-label="Progress">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className={
                i < results.length
                  ? results[i]
                    ? 'is-right'
                    : 'is-wrong'
                  : i === index
                    ? 'is-current'
                    : ''
              }
            />
          ))}
        </ol>
        <span className="mono">
          {index + 1}/{questions.length}
        </span>
      </div>

      <article className="quiz-question" key={question.id}>
        <span className="chip">{TYPE_LABELS[type]}</span>
        <h2>{question.question}</h2>

        {(choiceBased || type === 'multiple_select') && (
          <div
            className={`quiz-choices ${type === 'multiple_select' ? 'is-multi' : ''}`}
            role={choiceBased ? 'radiogroup' : 'group'}
          >
            {question.choices.map((choice, i) => {
              const picked = choiceBased
                ? draft.selected === i
                : draft.multi.has(i);
              const state = !checked
                ? picked
                  ? 'is-picked'
                  : ''
                : correctSet.has(i)
                  ? 'is-right'
                  : picked
                    ? 'is-wrong'
                    : 'is-dim';
              return (
                <button
                  key={i}
                  className={`quiz-choice ${state}`}
                  role={choiceBased ? 'radio' : 'checkbox'}
                  aria-checked={picked}
                  disabled={checked}
                  onClick={() => {
                    if (choiceBased) {
                      const d = { ...draft, selected: i };
                      setDraft(d);
                      check(d);
                    } else
                      setDraft((d) => {
                        const multi = new Set(d.multi);
                        if (multi.has(i)) multi.delete(i);
                        else multi.add(i);
                        return { ...d, multi };
                      });
                  }}
                >
                  <span className="quiz-letter mono">
                    {checked && correctSet.has(i) ? (
                      <Icon name="check" size={14} />
                    ) : checked && picked ? (
                      <Icon name="close" size={14} />
                    ) : (
                      LETTERS[i]
                    )}
                  </span>
                  <span>{choice}</span>
                </button>
              );
            })}
          </div>
        )}

        {(type === 'short_answer' || type === 'engineering') && (
          <form
            className="quiz-typed"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) check();
            }}
          >
            <input
              ref={input}
              className={`input ${checked ? (correct ? 'is-right' : 'is-wrong') : ''}`}
              value={draft.typed}
              disabled={checked}
              inputMode={type === 'engineering' ? 'decimal' : 'text'}
              autoComplete="off"
              placeholder={
                type === 'engineering' ? 'Your numeric result' : 'Your answer'
              }
              onChange={(e) =>
                setDraft((d) => ({ ...d, typed: e.target.value }))
              }
            />
            {type === 'engineering' && question.answer_unit && (
              <span className="quiz-unit mono">{question.answer_unit}</span>
            )}
          </form>
        )}

        {!checked && !choiceBased && (
          <button
            className="primary-button quiz-check"
            disabled={!ready}
            onClick={() => check()}
          >
            Check answer <kbd className="kbd">↵</kbd>
          </button>
        )}
        {!checked && choiceBased && (
          <p className="quiz-hint muted">
            Pick an answer, or press <kbd className="kbd">1</kbd>–
            <kbd className="kbd">{question.choices.length}</kbd>
          </p>
        )}
      </article>

      {checked && (
        <section
          className={`quiz-feedback ${correct ? 'is-right' : 'is-wrong'}`}
          role="status"
        >
          <h3>
            {correct ? (
              <>
                <Icon name="check" size={20} /> Correct
              </>
            ) : (
              <>Not quite</>
            )}
          </h3>
          {!correct && (type === 'short_answer' || type === 'engineering') && (
            <p className="quiz-answer">
              Answer:{' '}
              <strong>
                {type === 'engineering'
                  ? `${question.numeric_answer} ${question.answer_unit ?? ''}`
                  : question.correct_answer_text}
              </strong>
            </p>
          )}
          {question.explanation &&
            (type === 'nclex' ? (
              <NclexRationaleCard text={question.explanation} />
            ) : (
              <p>{question.explanation}</p>
            ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            onClick={next}
            disabled={submitting}
            autoFocus
          >
            {submitting ? 'Saving…' : last ? 'See results' : 'Next question'}{' '}
            <kbd className="kbd">↵</kbd>
          </button>
        </section>
      )}
    </div>
  );
}
