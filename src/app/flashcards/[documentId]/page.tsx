'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import FlashcardViewer from '@/components/FlashcardViewer';
import AddFlashcardDialog from '@/components/AddFlashcardDialog';
import GenerateCountDialog from '@/components/GenerateCountDialog';
import type { Flashcard, ReviewRating } from '@/types';

function sortCards(cards: Flashcard[]) {
  return [...cards].sort(
    (a, b) =>
      new Date(a.next_review_date).getTime() -
      new Date(b.next_review_date).getTime(),
  );
}

function useCountdown(targetDate: Date | null) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!targetDate) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!targetDate) return null;

  const diff = targetDate.getTime() - now.getTime();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, total: diff };
}

function formatCountdown(c: {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}) {
  if (c.days > 0) return `${c.days}d ${c.hours}h ${c.minutes}m`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}m`;
  if (c.minutes > 0) return `${c.minutes}m ${c.seconds}s`;
  return `${c.seconds}s`;
}

export default function FlashcardReviewPage() {
  const params = useParams();
  const documentId = params.documentId as string;

  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [forceReview, setForceReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/flashcards/${documentId}`);
        const data: Flashcard[] = await res.json();
        if (!res.ok) throw new Error('Unable to load flashcards.');
        setAllCards(sortCards(Array.isArray(data) ? data : []));
      } catch (err) {
        console.error('Failed to load flashcards:', err);
        setError('Unable to load flashcards right now.');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [documentId]);

  const remainingSlots = Math.max(0, 100 - allCards.length);
  const maxRequest = Math.min(10, remainingSlots);

  const now = new Date();
  const dueCards = allCards.filter(
    (card) => new Date(card.next_review_date) <= now,
  );
  const notDueCards = allCards.filter(
    (card) => new Date(card.next_review_date) > now,
  );
  const nextDueDate =
    notDueCards.length > 0
      ? new Date(
          Math.min(
            ...notDueCards.map((card) =>
              new Date(card.next_review_date).getTime(),
            ),
          ),
        )
      : null;

  const countdown = useCountdown(nextDueDate);
  const cardsToReview = forceReview ? allCards : dueCards;

  const handleReview = async (cardId: string, rating: ReviewRating) => {
    const res = await fetch(`/api/flashcards-review/${cardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    });
    if (!res.ok) throw new Error('Could not save this review. Try again.');
  };

  const handleAddCard = (card: Flashcard) => {
    setError(null);
    setAllCards((prev) => sortCards([...prev, card]));
  };

  const handleGenerateMore = async (count: number) => {
    if (maxRequest === 0) return;

    setError(null);

    const res = await fetch(`/api/flashcards/${documentId}/more`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to generate flashcards');
    }

    const newCards: Flashcard[] = Array.isArray(data.flashcards)
      ? data.flashcards
      : [];
    if (newCards.length === 0) {
      throw new Error(
        'The model could not find more distinct flashcards to add from this document.',
      );
    }

    setAllCards((prev) => sortCards([...prev, ...newCards]));
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-blue-400" />
          </div>
          <p className="text-zinc-500">Loading flashcards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/documents/${documentId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to document
        </Link>

        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="animate-fade-in-up">
            <h1 className="text-2xl font-bold gradient-text-blue">
              Flashcard Review
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {dueCards.length} due now, {allCards.length} total saved
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Review what is due, add your own cards, or ask the model for 1-10
              more cards at a time.
            </p>
            <div className="mt-3 glow-line-blue w-16" />
          </div>

          <div className="w-full max-w-xl rounded-2xl glass-blue p-5 animate-fade-in-up delay-100">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    Flashcard pool
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Up to 100 flashcards per document. Generate 1-10 at a time.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <GenerateCountDialog
                    accent="blue"
                    buttonLabel="Generate More"
                    confirmLabel="Generate Flashcards"
                    countLabel="How many flashcards should we add?"
                    description="Ask the model for a fresh batch of additional study cards from this document."
                    heading="Generate More Flashcards"
                    isDisabled={remainingSlots === 0}
                    maxCount={maxRequest}
                    onGenerate={handleGenerateMore}
                  />
                  <AddFlashcardDialog
                    documentId={documentId}
                    isDisabled={remainingSlots === 0}
                    onAdd={handleAddCard}
                  />
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                {remainingSlots > 0
                  ? `${remainingSlots} slot${remainingSlots !== 1 ? 's' : ''} remaining`
                  : 'Flashcard limit reached'}
              </p>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          </div>
        </div>

        {dueCards.length === 0 &&
          nextDueDate &&
          countdown &&
          countdown.total > 0 &&
          !forceReview && (
            <div className="mb-8 rounded-2xl glass-blue p-6 animate-fade-in-up glow-blue">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <svg
                    className="h-5 w-5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-300">
                      Optimal return in
                    </span>
                    <span className="rounded-lg bg-blue-500/10 px-3 py-1 font-mono text-sm font-semibold text-blue-400">
                      {formatCountdown(countdown)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Spaced repetition works best right before a memory fades.
                    Reviewing too early feels productive, but it gives you less
                    recall training than coming back at the edge of forgetting.
                  </p>
                </div>
              </div>
            </div>
          )}

        {dueCards.length === 0 && allCards.length > 0 && !forceReview && (
          <div className="mb-8 text-center animate-fade-in-up delay-100">
            <button
              onClick={() => setForceReview(true)}
              className="rounded-xl glass-purple px-5 py-3 text-sm text-zinc-400 transition-all glass-hover hover-glow-purple"
            >
              Review all {allCards.length} cards anyway
            </button>
          </div>
        )}

        {forceReview && (
          <div className="mb-6 flex items-center justify-between rounded-xl bg-purple-500/10 px-4 py-3 animate-fade-in">
            <span className="text-sm text-purple-300">
              Reviewing all cards, including cards that are not due yet
            </span>
            <button
              onClick={() => setForceReview(false)}
              className="text-sm text-purple-400 underline underline-offset-2 transition-colors hover:text-purple-300"
            >
              Show only due
            </button>
          </div>
        )}

        {dueCards.length > 0 && notDueCards.length > 0 && !forceReview && (
          <div className="mb-6 text-center">
            <button
              onClick={() => setForceReview(true)}
              className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              Or review all {allCards.length} cards, including{' '}
              {notDueCards.length} not yet due
            </button>
          </div>
        )}

        <div className="animate-fade-in-up delay-100">
          <FlashcardViewer cards={cardsToReview} onReview={handleReview} />
        </div>
      </div>
    </div>
  );
}
