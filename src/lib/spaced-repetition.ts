import type { ReviewQuality, ReviewRating } from '@/types';

interface SM2Result {
  ease_factor: number;
  interval: number;
  repetitions: number;
  next_review_date: string;
}

export function calculateSM2(
  quality: ReviewQuality,
  currentEaseFactor: number,
  currentInterval: number,
  currentRepetitions: number,
): SM2Result {
  let newEaseFactor = currentEaseFactor;
  let newInterval: number;
  let newRepetitions: number;

  if (quality < 3) {
    // Failed: reset repetitions and interval
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Successful recall: update ease factor
    newEaseFactor =
      currentEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    newEaseFactor = Math.max(1.3, newEaseFactor);
    newRepetitions = currentRepetitions + 1;

    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(currentInterval * newEaseFactor);
    }
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return {
    ease_factor: Math.round(newEaseFactor * 100) / 100,
    interval: newInterval,
    repetitions: newRepetitions,
    next_review_date: nextReview.toISOString(),
  };
}

export function ratingToQuality(rating: ReviewRating): ReviewQuality {
  const mapping: Record<ReviewRating, ReviewQuality> = {
    again: 1,
    hard: 3,
    good: 4,
    easy: 5,
  };
  return mapping[rating];
}
