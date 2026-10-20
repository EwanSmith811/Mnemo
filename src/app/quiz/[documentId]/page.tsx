'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import QuizPlayer, {
  TYPE_LABELS,
  type QuizScore,
} from '@/components/QuizPlayer';
import ScoreDisplay from '@/components/ScoreDisplay';
import { BackLink, Icon, PageLoading } from '@/components/ui';
import type { QuizQuestion, QuestionType } from '@/types';

const LIMIT = 100;
const LENGTHS = [5, 10, 15, 20];
function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
interface LastAttempt {
  score: number;
  missed: string[];
}

export default function QuizPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [pool, setPool] = useState<QuizQuestion[]>([]);
  const [last, setLast] = useState<LastAttempt | null>(null);
  const [phase, setPhase] = useState<'loading' | 'setup' | 'quiz' | 'results'>(
    'loading',
  );
  const [error, setError] = useState('');
  const [types, setTypes] = useState<Set<QuestionType> | null>(null);
  const [length, setLength] = useState(10);
  const [round, setRound] = useState<QuizQuestion[]>([]);
  const [roundKey, setRoundKey] = useState(0);
  const [score, setScore] = useState<QuizScore | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/quiz/${documentId}`, { signal: controller.signal }),
      fetch(`/api/quiz/${documentId}/attempts`, { signal: controller.signal }),
    ])
      .then(async ([questions, attempts]) => {
        const data = await questions.json();
        if (!questions.ok) throw new Error();
        setPool(Array.isArray(data) ? data : []);
        if (attempts.ok) setLast(await attempts.json());
      })
      .catch((err) => {
        if (err.name !== 'AbortError')
          setError('Could not load your questions. Reload to try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPhase('setup');
      });
    return () => controller.abort();
  }, [documentId]);

  const counts = useMemo(() => {
    const c = new Map<QuestionType, number>();
    for (const q of pool)
      c.set(
        q.question_type || 'mcq',
        (c.get(q.question_type || 'mcq') ?? 0) + 1,
      );
    return c;
  }, [pool]);
  const chosen = types ?? new Set(counts.keys());
  const eligible = pool.filter((q) => chosen.has(q.question_type || 'mcq'));
  const missedQuestions = pool.filter((q) => last?.missed.includes(q.id));

  function play(questions: QuizQuestion[]) {
    setRound(questions);
    setRoundKey((k) => k + 1);
    setScore(null);
    setPhase('quiz');
    window.scrollTo({ top: 0 });
  }
  async function generateMore() {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/quiz/${documentId}/more`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingQuestions: pool.map((q) => q.question),
          questionCount: 10,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || 'Could not generate questions.');
      if (data.exhausted || data.limitReached || !data.questions?.length)
        setExhausted(true);
      else setPool((p) => [...p, ...data.questions]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (phase === 'loading')
    return <PageLoading label="Drawing your questions" />;
  return (
    <main className="page is-reading">
      <BackLink href={`/documents/${documentId}`}>Study plan</BackLink>
      {phase === 'quiz' && (
        <QuizPlayer
          key={roundKey}
          questions={round}
          documentId={documentId}
          onQuit={() => setPhase('setup')}
          onComplete={(result) => {
            setScore(result);
            setLast({
              score: Math.round(result.score_percentage),
              missed: result.answers
                .filter((a) => !a.is_correct)
                .map((a) => a.question_id),
            });
            setPhase('results');
            window.scrollTo({ top: 0 });
          }}
        />
      )}
      {phase === 'results' && score && (
        <ScoreDisplay
          score={score}
          questions={round}
          flashcardsHref={`/flashcards/${documentId}`}
          onNewQuiz={() => setPhase('setup')}
          onRetryMissed={() =>
            play(
              shuffle(
                round.filter((q) =>
                  score.answers.some(
                    (a) => a.question_id === q.id && !a.is_correct,
                  ),
                ),
              ),
            )
          }
        />
      )}
      {phase === 'setup' && (
        <>
          <header className="page-head">
            <div>
              <span className="eyebrow">
                <b>03</b> Quiz
              </span>
              <h1>
                Find out what <em>stuck.</em>
              </h1>
              <p className="lede">
                Pulling an answer out of memory is what makes it last. Every
                question comes with an explanation.
              </p>
            </div>
          </header>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {!pool.length ? (
            <div className="empty-state">
              <h2>No questions yet.</h2>
              <p>Generate a set from the deck to get started.</p>
              <button
                className="primary-button"
                disabled={generating}
                onClick={generateMore}
              >
                {generating ? 'Generating…' : 'Generate 10 questions'}
              </button>
            </div>
          ) : (
            <div className="quiz-setup">
              {missedQuestions.length > 0 && (
                <button
                  className="quiz-retry card"
                  onClick={() => play(shuffle(missedQuestions))}
                >
                  <span className="eyebrow">
                    <b>●</b> From your last quiz · {last!.score}%
                  </span>
                  <strong>
                    Retry the {missedQuestions.length} question
                    {missedQuestions.length === 1 ? '' : 's'} you missed
                  </strong>
                  <span className="arrow" aria-hidden>
                    →
                  </span>
                </button>
              )}
              <section className="quiz-builder card">
                <div className="quiz-builder-row">
                  <h2>Question types</h2>
                  <div className="quiz-types">
                    {[...counts].map(([type, n]) => (
                      <label key={type} className="quiz-type">
                        <input
                          type="checkbox"
                          checked={chosen.has(type)}
                          onChange={() => {
                            const next = new Set(chosen);
                            if (next.has(type) && next.size > 1)
                              next.delete(type);
                            else next.add(type);
                            setTypes(next);
                          }}
                        />
                        <Icon name="check" size={14} />
                        {TYPE_LABELS[type]}
                        <span className="mono">{n}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="quiz-builder-row">
                  <h2>Length</h2>
                  <div className="segmented">
                    {LENGTHS.filter(
                      (n, i) => n <= eligible.length || i === 0,
                    ).map((n) => (
                      <button
                        key={n}
                        aria-pressed={
                          Math.min(length, eligible.length) ===
                          Math.min(n, eligible.length)
                        }
                        onClick={() => setLength(n)}
                      >
                        {Math.min(n, eligible.length)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="quiz-builder-foot">
                  <button
                    className="primary-button is-large"
                    disabled={!eligible.length}
                    onClick={() => play(shuffle(eligible).slice(0, length))}
                  >
                    Start {Math.min(length, eligible.length)} questions{' '}
                    <span className="arrow">→</span>
                  </button>
                  <span className="muted">
                    {pool.length} in the pool
                    {pool.length < LIMIT && !exhausted && (
                      <>
                        {' · '}
                        <button
                          className="text-button"
                          disabled={generating}
                          onClick={generateMore}
                        >
                          {generating
                            ? 'Generating 10 more…'
                            : 'Generate 10 more'}
                        </button>
                      </>
                    )}
                    {exhausted && ' · no new questions left to generate'}
                  </span>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
