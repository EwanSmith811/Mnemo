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
      .select("content, filename, study_mode")
      .eq("id", documentId)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const docContext = doc.content ? doc.content.slice(0, 8000) : "";
    const studyMode = doc.study_mode ?? "engineers";
    const alreadyAsked = (existingQuestions as string[])
      .map((q, i) => `${i + 1}. ${q}`)
      .join("\n");

    const specializedRules =
      studyMode === "nursing"
        ? `- Include some "nclex" questions when they fit the material. NCLEX questions must be single-best-answer with 4 choices and a clinical rationale.
- For non-NCLEX questions, set numeric_answer to null, answer_tolerance to null, and answer_unit to "".
- For NCLEX questions, set correct_answer_text to "".`
        : `- Include some "engineering" questions when they fit the material. Engineering questions must be numeric free-response with numeric_answer, answer_tolerance, and answer_unit filled in.
- For non-engineering questions, set numeric_answer to null, answer_tolerance to null, and answer_unit to "".
- For engineering questions, set choices to [] and correct_answer_text to "".`;

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
      "numeric_answer": null,
      "answer_tolerance": null,
      "answer_unit": "",
      "explanation": "Why this is correct"
    }
  ],
  "exhausted": false
}

Rules:
- Generate ${questionCount} NEW questions that are MEANINGFULLY DIFFERENT from the ones already asked.
- Mix question types: roughly half mcq, some multiple_select, some short_answer.
- You may also use the specialized question type for this document's mode: ${studyMode}.
- Do NOT repeat questions or ask essentially the same thing with different wording.
- If you genuinely cannot generate ${questionCount} distinct questions, set "exhausted": true and return "questions": [].
- CRITICAL — correct_answer position: Distribute the correct answer across all 4 positions. Do NOT always use index 0. For the ${questionCount} MCQ questions, spread answers across A(0), B(1), C(2), D(3) roughly equally.
- mcq: 4 choices, correct_answer is 0-3 index.
- multiple_select: 4 choices, correct_answers is array of at least 2 indices. correct_answer = 0.
- short_answer: choices = [], correct_answer_text = short phrase 1-5 words, correct_answer = 0.
- nclex: 4 choices, correct_answer is 0-3 index, correct_answers = [], correct_answer_text = "".
- engineering: choices = [], correct_answer = 0, correct_answers = [], correct_answer_text = "", numeric_answer must be a number, answer_tolerance must be a number, answer_unit must be filled in.
- ${specializedRules}
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
      numeric_answer?: number | null;
      answer_tolerance?: number | null;
      answer_unit?: string | null;
      explanation: string;
    }[])
      .filter((q) => ["mcq", "multiple_select", "short_answer", "nclex", "engineering"].includes(q.question_type))
      .map((q) => ({
        document_id: documentId,
        question: q.question,
        question_type: q.question_type,
        choices: q.choices ?? [],
        correct_answer: q.correct_answer ?? 0,
        correct_answers: q.correct_answers ?? [],
        correct_answer_text: q.correct_answer_text ?? "",
        numeric_answer: q.numeric_answer ?? null,
        answer_tolerance: q.answer_tolerance ?? null,
        answer_unit: q.answer_unit ?? null,
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
      .select("id, document_id, question, question_type, choices, correct_answer, correct_answers, correct_answer_text, numeric_answer, answer_tolerance, answer_unit, explanation");

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
