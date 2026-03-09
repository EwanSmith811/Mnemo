import { NextRequest, NextResponse } from "next/server";

// Allow up to 25MB audio uploads and longer processing
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server missing ELEVENLABS_API_KEY" },
        { status: 500 }
      );
    }

    // Forward to ElevenLabs STT
    const elevenLabsForm = new FormData();
    const uploadFileName =
      audioFile.name || (audioFile.type.includes("mp4") ? "recording.mp4" : "recording.webm");
    elevenLabsForm.append("file", audioFile, uploadFileName);
    elevenLabsForm.append("model_id", "scribe_v1");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
        body: elevenLabsForm,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs STT error:", response.status, errorText);
      return NextResponse.json(
        { error: "Speech-to-text failed" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json({ text: result.text || "" });
  } catch (error) {
    console.error("STT route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "STT failed" },
      { status: 500 }
    );
  }
}
