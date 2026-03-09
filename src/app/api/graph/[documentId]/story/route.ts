import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";

interface StoryRequestBody {
  concepts: { label: string; definition: string }[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  await params; // consume params even though unused, to satisfy Next.js

  const body: StoryRequestBody = await request.json();
  const { concepts } = body;

  if (!concepts || concepts.length < 2) {
    return NextResponse.json(
      { error: "Select at least 2 concepts" },
      { status: 400 }
    );
  }

  const conceptList = concepts
    .map((c, i) => `${i + 1}. ${c.label}: ${c.definition}`)
    .join("\n");

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a deranged comedy writer who moonlights as a memory coach. Your mnemonic stories are LEGENDARY — short, punchy, and so absurd people snort-laugh while studying.

Rules:
- For each concept, invent a ridiculous sound-alike character or object (e.g. "torso maid" for torsemide, "normal eyes" for normalization)
- Smash ALL characters into ONE short, chaotic, hilariously visual scene — 2-3 punchy paragraphs MAX, not a word more
- Go full cartoon physics: explosions, talking animals, celebrity cameos, slapstick disasters. The weirder the better.
- Every sentence should be funny or vivid. Cut ANY filler. No "once upon a time" or "one day" — drop us straight into chaos.
- Write like you're telling a drunk friend a story — short sentences, punchy rhythm, zero fluff
- After the story, add a KEY mapping each wordplay → real term + 5-word-max meaning

Format:

STORY:
[2-3 short paragraphs of pure chaos]

KEY:
- "[wordplay]" → [Term]: [5 word max meaning]
...`,
      },
      {
        role: "user",
        content: `Mnemonic story for these ${concepts.length} concepts:\n\n${conceptList}`,
      },
    ],
    temperature: 1.0,
    max_tokens: 1024,
  });

  const story = response.choices[0]?.message?.content;
  if (!story) {
    return NextResponse.json(
      { error: "Failed to generate story" },
      { status: 500 }
    );
  }

  return NextResponse.json({ story });
}
