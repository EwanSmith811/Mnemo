"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import FlashcardViewer from "@/components/FlashcardViewer";
import AddFlashcardDialog from "@/components/AddFlashcardDialog";
import type { Flashcard, ReviewRating } from "@/types";

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

function formatCountdown(c: { days: number; hours: number; minutes: number; seconds: number }) {
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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/flashcards/${documentId}`);
        const data: Flashcard[] = await res.json();
        setAllCards(data);
      } catch (err) {
        console.error("Failed to load flashcards:", err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [documentId]);

  const now = new Date();
  const dueCards = allCards.filter((c) => new Date(c.next_review_date) <= now);
  const notDueCards = allCards.filter((c) => new Date(c.next_review_date) > now);
  const nextDueDate = notDueCards.length > 0
    ? new Date(Math.min(...notDueCards.map((c) => new Date(c.next_review_date).getTime())))
    : null;

  const countdown = useCountdown(nextDueDate);

  const cardsToReview = forceReview ? allCards : dueCards;

  const handleReview = async (cardId: string, rating: ReviewRating) => {
    await fetch(`/api/flashcards-review/${cardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
  };

  const handleAddCard = (card: Flashcard) => {
    setAllCards((prev) => [...prev, card]);
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
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/documents/${documentId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to document
        </Link>

        <div className="mb-8 flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl font-bold gradient-text-blue">Flashcard Review</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {dueCards.length} due now &middot; {allCards.length} total
            </p>
            <div className="mt-2 glow-line-blue w-16" />
          </div>
          <AddFlashcardDialog documentId={documentId} onAdd={handleAddCard} />
        </div>

        {/* Optimal return timer */}
        {dueCards.length === 0 && nextDueDate && countdown && countdown.total > 0 && !forceReview && (
          <div className="mb-8 rounded-2xl glass-blue p-6 animate-fade-in-up glow-blue">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-zinc-300">Optimal return in</span>
                  <span className="rounded-lg bg-blue-500/10 px-3 py-1 font-mono text-sm font-semibold text-blue-400">
                    {formatCountdown(countdown)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  Spaced repetition is most effective when you review cards just as you&apos;re about to forget them.
                  Reviewing too early weakens the memory-strengthening effect. The SM-2 algorithm schedules
                  each card at the optimal moment based on your past performance.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Force review option */}
        {dueCards.length === 0 && allCards.length > 0 && !forceReview && (
          <div className="mb-8 text-center animate-fade-in-up delay-100" style={{ opacity: 0 }}>
            <button
              onClick={() => setForceReview(true)}
              className="rounded-xl glass-purple px-5 py-3 text-sm text-zinc-400 transition-all glass-hover hover-glow-purple"
            >
              Review all {allCards.length} cards anyway
            </button>
          </div>
        )}

        {/* Force review banner when active */}
        {forceReview && (
          <div className="mb-6 flex items-center justify-between rounded-xl bg-purple-500/10 px-4 py-3 animate-fade-in">
            <span className="text-sm text-purple-300">
              Reviewing all cards (including those not yet due)
            </span>
            <button
              onClick={() => setForceReview(false)}
              className="text-sm text-purple-400 underline underline-offset-2 transition-colors hover:text-purple-300"
            >
              Show only due
            </button>
          </div>
        )}

        {/* Inline force review link when there are due cards but also non-due cards */}
        {dueCards.length > 0 && notDueCards.length > 0 && !forceReview && (
          <div className="mb-6 text-center">
            <button
              onClick={() => setForceReview(true)}
              className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              Or review all {allCards.length} cards including {notDueCards.length} not yet due
            </button>
          </div>
        )}

        <div className="animate-fade-in-up delay-100" style={{ opacity: 0 }}>
          <FlashcardViewer cards={cardsToReview} onReview={handleReview} />
        </div>
      </div>
    </div>
  );
}
