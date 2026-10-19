'use client';

import { useState } from 'react';
import type { Flashcard, ReviewRating } from '@/types';

interface FlashcardViewerProps {
  cards: Flashcard[];
  onReview: (cardId: string, rating: ReviewRating) => Promise<void>;
}

export default function FlashcardViewer({
  cards,
  onReview,
}: FlashcardViewerProps) {
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (cards.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <svg
            className="h-8 w-8 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-200">All caught up!</h2>
        <p className="mt-2 text-zinc-500">
          No cards due for review. Come back later.
        </p>
      </div>
    );
  }

  const card = cards[currentIndex];
  const isComplete = currentIndex >= cards.length;

  if (isComplete) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <svg
            className="h-8 w-8 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-zinc-200">
          Review complete!
        </h2>
        <p className="mt-2 text-zinc-500">
          You reviewed {cards.length} card{cards.length !== 1 ? 's' : ''}.
        </p>
      </div>
    );
  }

  const handleRate = async (rating: ReviewRating) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      await onReview(card.id, rating);
      setIsFlipped(false);
      setCurrentIndex((i) => i + 1);
    } catch {
      setError(
        'Could not save this review. Your place is saved here; try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="mb-6 text-center text-sm text-zinc-500">
        Card {currentIndex + 1} of {cards.length}
      </div>

      {/* Card with 3D flip */}
      <div
        className="mx-auto mb-8 w-full max-w-lg cursor-pointer"
        style={{ perspective: '1000px' }}
        role="button"
        tabIndex={0}
        aria-label={isFlipped ? 'Show term' : 'Show definition'}
        aria-pressed={isFlipped}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsFlipped((v) => !v);
          }
        }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div
          className="relative transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            minHeight: '280px',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-2xl p-8"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(0deg)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-blue-400">
                Term
              </p>
              <p className="text-xl font-semibold text-zinc-100">{card.term}</p>
              <p className="mt-6 text-xs text-zinc-600">Click to flip</p>
            </div>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex items-center justify-center rounded-2xl p-8"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-purple-400">
                Definition
              </p>
              <p className="text-lg leading-relaxed text-zinc-200">
                {card.definition}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      {isFlipped && (
        <div className="flex flex-wrap justify-center gap-3">
          {(
            [
              {
                rating: 'again' as ReviewRating,
                label: 'Again',
                gradient: 'from-red-500 to-red-600',
                glow: '',
              },
              {
                rating: 'hard' as ReviewRating,
                label: 'Hard',
                gradient: 'from-orange-500 to-amber-600',
                glow: '',
              },
              {
                rating: 'good' as ReviewRating,
                label: 'Good',
                gradient: 'from-blue-500 to-indigo-600',
                glow: '',
              },
              {
                rating: 'easy' as ReviewRating,
                label: 'Easy',
                gradient: 'from-emerald-500 to-green-600',
                glow: '',
              },
            ] as const
          ).map(({ rating, label, gradient, glow }) => (
            <button
              key={rating}
              onClick={(e) => {
                e.stopPropagation();
                handleRate(rating);
              }}
              disabled={isSubmitting}
              className={`rounded-xl bg-gradient-to-r ${gradient} px-6 py-3 text-sm font-medium text-white transition-all ${glow} disabled:opacity-50`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
