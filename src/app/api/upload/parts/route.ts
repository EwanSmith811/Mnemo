import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { readDeck } from '@/lib/read-deck';
import { deckPreview } from '@/lib/upload-parts';
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;

/** Files left behind by abandoned uploads are cleared after a day. */
async function clearAbandoned() {
  const old = await database
    .from('upload_parts')
    .select('id,created_at')
    .order('created_at')
    .limit(50);
  if (old.error) return;
  const ids = old.data
    .filter((p) => Date.now() - new Date(p.created_at).getTime() > DAY)
    .map((p) => p.id);
  if (ids.length) await database.from('upload_parts').delete().in('id', ids);
}

/**
 * Reads one deck of a multi-deck study set. Each file gets its own request so
 * none exceeds the hosting body limit; /api/upload then builds the set.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL)
      return NextResponse.json(
        {
          error: 'Study generation is not configured.',
          detail:
            'Set OPENAI_API_KEY and DATABASE_URL on the server, then run the Mnemo migration.',
        },
        { status: 503 },
      );
    const form = await request.formData();
    const deck = await readDeck(form.get('file'), true);
    if (deck instanceof NextResponse) return deck;
    if (deck.text.trim().length < 20)
      return NextResponse.json(
        {
          error: `${deck.filename} contains too little readable text.`,
          detail: 'Use a text-based document instead of scanned images.',
        },
        { status: 400 },
      );
    const saved = await database
      .from('upload_parts')
      .insert({
        filename: deck.filename,
        file_type: deck.fileType,
        file_size_bytes: deck.size,
        data_base64: deck.buffer.toString('base64'),
        text: deck.text,
        slides: deck.slides,
      })
      .select('id')
      .single();
    if (saved.error) throw new Error('Could not keep the uploaded file');
    void clearAbandoned().catch(() => {});
    return NextResponse.json({
      part_id: saved.data.id,
      preview: deckPreview(deck.text, deck.slides),
    });
  } catch (error) {
    console.error('Upload part failed:', error);
    return NextResponse.json(
      {
        error: 'Could not keep this file for the study set.',
        detail:
          'Check that the database migration has been applied, then retry.',
      },
      { status: 503 },
    );
  }
}
