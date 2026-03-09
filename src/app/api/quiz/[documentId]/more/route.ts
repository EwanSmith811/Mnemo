import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { groq } from "@/lib/groq";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const { existingQuestions, questionCount = 10 } = await request.json();

    // Hard limit: 100 questions per document
    const { data: existingQs, error: countError } = await supabase
      .from("quiz_questions")
      .select("id", { count: "exact" })
      .eq("document_id", documentId);

    if (countError) throw countError;

    const currentCount = existingQs?.length ?? 0;
    const HARD_LIMIT = 100;

    if (currentCount >= HARD_LIMIT) {
      return NextResponse.json(
        { error: `Question limit reached (${HARD_LIMIT} max)`, limitReached: true, questions: [] },
        { status: 400 }
      );
    }

    // Fetch the document content for context
    const { data: doc } = await supabase
      .from("documents")
      .select("content, filename")
      .eq("id", documentId)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const docContext = doc.content ? doc.content.slice(0, 8000) : "";
    const alreadyAsked = (existingQuestions as string[])
      .map((q, i) => `${i + 1}. ${q}`)
      .join("\n");

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are an expert educator generating additional quiz questions for a student who has already completed a quiz round.

You MUST respond with valid JSON in exactly this format:
{
  "questions": [
    {
      "question": "Question text",
      "question_type": "mcq",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 2,
      "correct_answers": [],
      "correct_answer_text": "",
      "explanation": "Why this is correct"
    }
  ],
  "exhausted": false
}

Rules:
- Generate ${questionCount} NEW questions that are MEANINGFULLY DIFFERENT from the ones already asked.
- Mix question types: roughly half mcq, some multiple_select, some short_answer.
- Do NOT repeat questions or ask essentially the same thing with different wording.
- If you genuinely cannot generate ${questionCount} distinct questions, set "exhausted": true and return "questions": [].
- CRITICAL — correct_answer position: Distribute the correct answer across all 4 positions. Do NOT always use index 0. For the ${questionCount} MCQ questions, spread answers across A(0), B(1), C(2), D(3) roughly equally.
- mcq: 4 choices, correct_answer is 0-3 index.
- multiple_select: 4 choices, correct_answers is array of at least 2 indices. correct_answer = 0.
- short_answer: choices = [], correct_answer_text = short phrase 1-5 words, correct_answer = 0.
- Every distractor should be plausible — no obviously wrong answers.
- Respond ONLY with the JSON object.`,
        },
        {
          role: "user",
          content: `Document: "${doc.filename}"

Content:
${docContext}

Questions already asked (do NOT repeat these ideas):
${alreadyAsked}

Generate ${questionCount} new distinct questions from different angles of the material.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 6000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No content from Groq API");

    const parsed = JSON.parse(content);

    if (parsed.exhausted || !parsed.questions?.length) {
      return NextResponse.json({ exhausted: true, questions: [] });
    }

    // Validate and normalise
    const rows = (parsed.questions as {
      question: string;
      question_type: string;
      choices: string[];
      correct_answer: number;
      correct_answers: number[];
      correct_answer_text: string;
      explanation: string;
    }[])
      .filter((q) => ["mcq", "multiple_select", "short_answer"].includes(q.question_type))
      .map((q) => ({
        document_id: documentId,
        question: q.question,
        question_type: q.question_type,
        choices: q.choices ?? [],
        correct_answer: q.correct_answer ?? 0,
        correct_answers: q.correct_answers ?? [],
        correct_answer_text: q.correct_answer_text ?? "",
        explanation: q.explanation ?? "",
      }));

    // Cap at hard limit: only insert what fits before hitting 100
    const allowedToInsert = Math.max(0, HARD_LIMIT - currentCount);
    const rowsToInsert = rows.slice(0, allowedToInsert);

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        { error: "Question limit reached (100 max)", limitReached: true, questions: [] },
        { status: 400 }
      );
    }

    // Persist to DB so they join the permanent question pool
    const { data: inserted, error: insertError } = await supabase
      .from("quiz_questions")
      .insert(rowsToInsert)
      .select("id, document_id, question, question_type, choices, correct_answer, correct_answers, correct_answer_text, explanation");

    if (insertError) throw insertError;

    const isNowAtLimit = (currentCount + (inserted?.length ?? 0)) >= HARD_LIMIT;

    return NextResponse.json({
      exhausted: false,
      limitReached: isNowAtLimit,
      questions: inserted ?? [],
    });
  } catch (error) {
    console.error("Quiz more questions error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate questions" },
      { status: 500 }
    );
  }
}
