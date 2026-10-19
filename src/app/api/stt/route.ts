import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/lib/ai';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File) || !audio.size)
      return NextResponse.json(
        { error: 'Choose an audio recording.' },
        { status: 400 },
      );
    if (audio.size > 25 * 1024 * 1024)
      return NextResponse.json(
        { error: 'Audio must be smaller than 25 MB.' },
        { status: 413 },
      );
    const result = await ai.audio.transcriptions.create({
      file: audio,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
    });
    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error('Transcription failed:', error);
    return NextResponse.json(
      {
        error:
          'Could not transcribe the recording. Check the server configuration and try again.',
      },
      { status: 502 },
    );
  }
}
