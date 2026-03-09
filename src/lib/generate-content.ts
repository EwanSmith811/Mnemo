import { groq } from "./groq";
import type { GeneratedContent } from "@/types";

export async function generateFlashcardsAndQuiz(
  documentText: string,
  filename: string
): Promise<GeneratedContent> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are an expert educator that creates study materials from documents.
You will be given the text content of a document and must generate flashcards, quiz questions of multiple types, and topic summaries.

You MUST respond with valid JSON in exactly this format:
{
  "flashcards": [
    {
      "term": "The key term or concept",
      "definition": "A clear, concise definition or explanation"
    }
  ],
  "quiz_questions": [
    {
      "question": "The question text",
      "question_type": "mcq",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 2,
      "correct_answers": [],
      "correct_answer_text": "",
      "explanation": "Brief explanation of why this is correct"
    },
    {
      "question": "Select all that apply: ...",
      "question_type": "multiple_select",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0,
      "correct_answers": [1, 3],
      "correct_answer_text": "",
      "explanation": "Brief explanation"
    },
    {
      "question": "What is ...?",
      "question_type": "short_answer",
      "choices": [],
      "correct_answer": 0,
      "correct_answers": [],
      "correct_answer_text": "The expected answer text",
      "explanation": "Brief explanation"
    }
  ],
  "topic_summaries": [
    {
      "topic_name": "Name of the topic",
      "summary": "A teaching-focused summary in simple language.",
      "display_order": 1
    }
  ]
}

Rules for flashcards:
- Generate 10-20 flashcards covering the most important concepts
- Make definitions concise but complete (1-3 sentences)

Rules for quiz questions:
- Generate 50 quiz questions total with a MIX of types:
  - Exactly 20 "mcq" (multiple choice, single correct, exactly 4 choices, correct_answer is 0-3 index)
  - Exactly 15 "multiple_select" (multiple correct answers, exactly 4 choices, correct_answers is array of correct indices, at least 2 correct)
  - Exactly 15 "short_answer" (type the answer, choices array is empty, correct_answer_text is the expected answer as a short phrase of 1-5 words)
- Quiz questions should test understanding, not just memorization
- Vary question difficulty from basic recall to application
- Every choice should be plausible; avoid obviously wrong answers
- CRITICAL — correct_answer position: Distribute correct answers across ALL 4 positions. Across the 20 MCQ questions, roughly 5 should have correct_answer=0, 5 should have correct_answer=1, 5 should have correct_answer=2, and 5 should have correct_answer=3. Do NOT cluster correct answers at position 0.
- Do not include question numbers in the question text
- For multiple_select, the question text should hint that multiple answers are expected (e.g. "Select all that apply:")
- For short_answer, the question should have a clear, specific, short answer

Rules for topic summaries:
- Identify 3-6 main topics from the document
- Write each summary in simple, accessible language (explain like I'm 5 style)
- Use analogies, real-world examples, and step-by-step explanations
- Each summary should be 2-4 paragraphs, maximizing for teaching effectiveness
- display_order should start at 1 and increment sequentially
- Summaries should help someone who is struggling to understand the material

Respond ONLY with the JSON object, no additional text.`,
      },
      {
        role: "user",
        content: `Generate flashcards, quiz questions, and topic summaries from this document titled "${filename}":\n\n${documentText}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 16384,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No content returned from Groq API");
  }

  const parsed: GeneratedContent = JSON.parse(content);

  if (
    !Array.isArray(parsed.flashcards) ||
    !Array.isArray(parsed.quiz_questions) ||
    !Array.isArray(parsed.topic_summaries)
  ) {
    throw new Error("Invalid response structure from Groq API");
  }

  for (const q of parsed.quiz_questions) {
    if (!["mcq", "multiple_select", "short_answer"].includes(q.question_type)) {
      throw new Error(`Invalid question_type: ${q.question_type}`);
    }
    if (q.question_type === "mcq") {
      if (q.choices.length !== 4) {
        throw new Error(
          `MCQ question has ${q.choices.length} choices, expected 4`
        );
      }
      if (q.correct_answer < 0 || q.correct_answer > 3) {
        throw new Error(`Invalid correct_answer index: ${q.correct_answer}`);
      }
    }
    if (q.question_type === "multiple_select") {
      if (q.choices.length !== 4) {
        throw new Error(
          `Multiple select question has ${q.choices.length} choices, expected 4`
        );
      }
      if (!Array.isArray(q.correct_answers) || q.correct_answers.length < 2) {
        throw new Error(
          "Multiple select must have at least 2 correct answers"
        );
      }
    }
    if (q.question_type === "short_answer") {
      if (!q.correct_answer_text || q.correct_answer_text.trim() === "") {
        throw new Error("Short answer question missing correct_answer_text");
      }
    }
  }

  return parsed;
}
