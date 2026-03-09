import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    await params; // consume params to avoid Next.js warning

    const { question, userAnswer, idealAnswer } = await request.json();

    if (!question || !userAnswer || !idealAnswer) {
      return NextResponse.json(
        { error: "question, userAnswer, and idealAnswer required" },
        { status: 400 }
      );
    }

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a study tutor evaluating a student's answer. Be encouraging but accurate.

You MUST respond with valid JSON in exactly this format:
{
  "correct": true or false,
  "feedback": "Brief explanation of why their answer is correct or what they missed. 1-3 sentences."
}

Evaluation rules:
- Mark as correct if the student demonstrates understanding of the core concept, even if wording differs
- Mark as incorrect only if they have a fundamental misunderstanding or are mostly wrong
- Be generous with partially correct answers — if they got the main idea, mark correct and note what could be added
- Respond ONLY with the JSON object, no additional text.`,
        },
        {
          role: "user",
          content: `Question: ${question}
Expected answer: ${idealAnswer}
Student's answer: ${userAnswer}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 256,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content from Groq API");
    }

    const parsed = JSON.parse(content);
    return NextResponse.json({
      correct: Boolean(parsed.correct),
      feedback: parsed.feedback || "Unable to evaluate your answer.",
    });
  } catch (error) {
    console.error("Workbench validate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Validation failed" },
      { status: 500 }
    );
  }
}
