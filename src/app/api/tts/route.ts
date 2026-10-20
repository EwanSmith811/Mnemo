import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/lib/ai';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const { text, voiceId, style } = await request.json();
    if (typeof text !== 'string' || !text.trim() || text.length > 4096)
      return NextResponse.json(
        { error: 'Speech requires between 1 and 4,096 characters.' },
        { status: 400 },
      );
    const voice =
      voiceId === 'woman' ? 'coral' : voiceId === 'male' ? 'onyx' : 'alloy';
    const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
    const response = await ai.audio.speech.create({
      model,
      voice,
      input: text,
      response_format: 'mp3',
      // Only gpt-4o-* speech models accept delivery instructions.
      ...(style === 'story' && model.startsWith('gpt-4o')
        ? {
            instructions:
              'Deliver like a deadpan stand-up comic reading a set list of absurd one-liners. Dry, confident, quick. A tiny pause before each punchline; never laugh at your own jokes.',
          }
        : {}),
    });
    return new NextResponse(response.body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Speech generation failed:', error);
    return NextResponse.json(
      { error: 'Could not generate speech. Please try again.' },
      { status: 502 },
    );
  }
}
