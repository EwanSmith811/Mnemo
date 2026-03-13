import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";

interface StoryRequestBody {
  concepts: { label: string; definition: string }[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    await params;

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
          content: `You are a deranged comedy writer who moonlights as a memory coach. Your mnemonic stories are legendary: short, punchy, and absurd enough to stick.

Rules:
- For each concept, invent a ridiculous sound-alike character or object.
- Smash all characters into one short, chaotic, hilariously visual scene in 2-3 punchy paragraphs max.
- Go full cartoon physics. The stranger the better.
- Every sentence should be vivid or funny. Cut filler.
- After the story, add a key mapping each wordplay to the real term and a five-word-max meaning.

Format:

STORY:
[2-3 short paragraphs]

KEY:
- "[wordplay]" -> [Term]: [5 words max]
...`,
        },
        {
          role: "user",
          content: `Mnemonic story for these ${concepts.length} concepts:\n\n${conceptList}`,
        },
      ],
      temperature: 1,
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
  } catch (error) {
    console.error("Graph story error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate story" },
      { status: 500 }
    );
  }
}
