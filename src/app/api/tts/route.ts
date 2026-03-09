import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const VOICE_IDS: Record<string, string> = {
  hudson_williams: process.env.HUDSON_WILLIAMS!,

  male: process.env.MALE!,
  woman: process.env.WOMAN!,
};

export async function POST(request: NextRequest) {
  try {
    const { text, voiceId } = (await request.json()) as {
      text: string;
      voiceId?: string;
    };

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Minimize ElevenLabs token usage: strip filler, collapse whitespace, remove non-spoken chars
    const cleanedText = text
      .replace(/[\*\_\#\~\`\[\]\(\)\{\}]/g, "")       // strip markdown
      .replace(/—/g, ", ")                              // em-dash to pause
      .replace(/\.{3,}/g, ".")                           // ellipsis to period
      .replace(/[\u201c\u201d]/g, '"')                   // smart quotes to plain
      .replace(/[\u2018\u2019]/g, "'")                   // smart apostrophes
      .replace(/\n{2,}/g, " ")                           // paragraph breaks to space
      .replace(/\n/g, " ")                               // newlines to space
      .replace(/\s{2,}/g, " ")                           // collapse whitespace
      .trim();

    // Resolve voice ID — accept key name or raw ID
    const resolvedVoiceId =
      (voiceId && VOICE_IDS[voiceId]) || voiceId || VOICE_IDS.hudson_williams;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs TTS error:", response.status, errorText);
      return NextResponse.json(
        { error: "TTS generation failed" },
        { status: response.status }
      );
    }

    // Stream the audio back to the client
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });

    return new NextResponse(response.body, { status: 200, headers });
  } catch (error) {
    console.error("TTS route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS failed" },
      { status: 500 }
    );
  }
}
