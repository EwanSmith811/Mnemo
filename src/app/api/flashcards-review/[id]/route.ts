import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { calculateSM2, ratingToQuality } from '@/lib/spaced-repetition';
import type { ReviewRating } from '@/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { rating } = body as { rating: ReviewRating };

  if (!['again', 'hard', 'good', 'easy'].includes(rating)) {
    return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
  }

  // Fetch current flashcard state
  const { data: card, error: fetchError } = await database
    .from('flashcards')
    .select('ease_factor, interval, repetitions')
    .eq('id', id)
    .single();

  if (fetchError || !card) {
    return NextResponse.json({ error: 'Flashcard not found' }, { status: 404 });
  }

  // Calculate new SM-2 values
  const quality = ratingToQuality(rating);
  const result = calculateSM2(
    quality,
    card.ease_factor,
    card.interval,
    card.repetitions,
  );

  // Update in database
  const { data: updated, error: updateError } = await database
    .from('flashcards')
    .update({
      ease_factor: result.ease_factor,
      interval: result.interval,
      repetitions: result.repetitions,
      next_review_date: result.next_review_date,
      last_reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
