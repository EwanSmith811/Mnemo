'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Flashcard, ReviewRating } from '@/types';
import { calculateSM2, ratingToQuality } from '@/lib/spaced-repetition';

const RATINGS: { rating: ReviewRating; label: string; key: string }[] = [
  { rating: 'again', label: 'Again', key: '1' },
  { rating: 'hard', label: 'Hard', key: '2' },
  { rating: 'good', label: 'Good', key: '3' },
  { rating: 'easy', label: 'Easy', key: '4' },
];
/** Missed cards come back after a few others, while the gap still helps. */
const RELEARN_GAP = 3;

function interval(card: Flashcard, rating: ReviewRating) {
  if (rating === 'again') return 'this session';
  const days = calculateSM2(
    ratingToQuality(rating),
    card.ease_factor,
    card.interval,
    card.repetitions,
  ).interval;
  return days >= 30 ? `${Math.round(days / 30)}mo` : `${days}d`;
}

export default function FlashcardViewer({
  cards,
  onReview,
  onDone,
}: {
  cards: Flashcard[];
  onReview: (cardId: string, rating: ReviewRating) => Promise<Flashcard>;
  onDone: () => void;
}) {
  const [queue, setQueue] = useState(cards);
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tally, setTally] = useState<Record<ReviewRating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });
  const [direction, setDirection] = useState(0);
  const card = queue[position];
  const done = position >= queue.length;

  const rate = useCallback(
    async (rating: ReviewRating) => {
      if (busy || !card || !flipped) return;
      setBusy(true);
      setError('');
      try {
        const updated = await onReview(card.id, rating);
        setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
        if (rating === 'again')
          setQueue((q) => {
            const next = [...q];
            next.splice(Math.min(q.length, position + 1 + RELEARN_GAP), 0, {
              ...card,
              ...updated,
            });
            return next;
          });
        setDirection(rating === 'again' ? -1 : 1);
        setFlipped(false);
        setPosition((p) => p + 1);
      } catch {
        setError('That rating wasn’t saved. Try again; your place is kept.');
      } finally {
        setBusy(false);
      }
    },
    [busy, card, flipped, onReview, position],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [role="dialog"]'))
        return;
      if (e.key === ' ' || e.key === 'Enter') {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        setFlipped((f) => !f);
      }
      const choice = RATINGS.find((r) => r.key === e.key);
      if (choice) void rate(choice.rating);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [rate]);

  if (done) {
    const reviewed = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <section className="cards-done">
        <h2 className="display">
          {reviewed} {reviewed === 1 ? 'review' : 'reviews'}, <em>done.</em>
        </h2>
        <div className="cards-done-bars">
          {RATINGS.map(({ rating, label }) => (
            <div key={rating} className={`is-${rating}`}>
              <span
                style={{
                  height: `${reviewed ? Math.max(4, (tally[rating] / reviewed) * 100) : 4}%`,
                }}
              />
              <strong className="mono">{tally[rating]}</strong>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <p className="lede">
          {tally.again
            ? `You relearned ${tally.again} ${tally.again === 1 ? 'card' : 'cards'} in this session. They’ll come back tomorrow to check they stuck.`
            : 'Clean run. Each card is now scheduled for just before you’d forget it.'}
        </p>
        <button className="primary-button is-large" onClick={onDone}>
          Back to the deck
        </button>
      </section>
    );
  }

  return (
    <div className="cards-session">
      <div className="cards-progress">
        <span className="mono">
          {position + 1} / {queue.length}
        </span>
        <div className="cards-progress-track">
          {queue.map((c, i) => (
            <i
              key={`${c.id}-${i}`}
              className={
                i < position ? 'is-done' : i === position ? 'is-current' : ''
              }
            />
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="card-stage">
        <button
          key={`${card.id}-${position}`}
          className={`flashcard ${flipped ? 'is-flipped' : ''} ${direction < 0 ? 'enter-again' : ''}`}
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Show the term' : 'Reveal the definition'}
          aria-pressed={flipped}
        >
          <span className="flashcard-inner">
            <span className="flashcard-face flashcard-front">
              <span className="eyebrow">Term</span>
              <strong>{card.term}</strong>
              <small>
                Recall the meaning first, then flip{' '}
                <kbd className="kbd">Space</kbd>
              </small>
            </span>
            <span className="flashcard-face flashcard-back">
              <span className="eyebrow">
                <b>Definition</b>
              </span>
              <span className="flashcard-term">{card.term}</span>
              <p>{card.definition}</p>
            </span>
          </span>
        </button>
      </div>
      <div
        className={`rating-row ${flipped ? 'is-visible' : ''}`}
        aria-hidden={!flipped}
      >
        <p>How well did you recall it?</p>
        <div>
          {RATINGS.map(({ rating, label, key }) => (
            <button
              key={rating}
              className={`rating is-${rating}`}
              disabled={!flipped || busy}
              tabIndex={flipped ? 0 : -1}
              onClick={() => void rate(rating)}
            >
              <span>{label}</span>
              <small className="mono">{interval(card, rating)}</small>
              <kbd className="kbd">{key}</kbd>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
