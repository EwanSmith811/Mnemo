import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { groq } from "@/lib/groq";

export const maxDuration = 30;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const { messages, mode } = (await request.json()) as {
      messages: Message[];
      mode: "user_explains" | "ai_quizzes";
    };

    // Fetch document context
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("filename, content")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const documentContext = doc.content ? doc.content.slice(0, 50000) : "";

    // Fetch summaries + flashcards for richer context
    const [summariesRes, flashcardsRes] = await Promise.all([
      supabase
        .from("topic_summaries")
        .select("topic_name, summary")
        .eq("document_id", documentId),
      supabase
        .from("flashcards")
        .select("term, definition")
        .eq("document_id", documentId)
        .limit(40),
    ]);

    const summaryContext =
      summariesRes.data
        ?.map((s) => `## ${s.topic_name}\n${s.summary}`)
        .join("\n\n") || "";

    const flashcardContext =
      flashcardsRes.data
        ?.map((f) => `- ${f.term}: ${f.definition}`)
        .join("\n") || "";

    const systemPrompt =
      mode === "user_explains"
        ? `You are a Socratic tutor evaluating a student's verbal explanation of material from "${doc.filename}".

DOCUMENT CONTENT:
${documentContext}

${summaryContext ? `\nTOPIC SUMMARIES:\n${summaryContext}` : ""}
${flashcardContext ? `\nKEY TERMS:\n${flashcardContext}` : ""}

ROLE & RULES:
- The student will verbally explain concepts from their study material.
- Listen carefully to what they say. Evaluate accuracy and completeness.
- If they are correct, acknowledge it briefly and ask a probing follow-up to go deeper.
- If they have misconceptions, gently correct them with a clear explanation, then ask them to try re-explaining.
- If their explanation is vague or incomplete, ask targeted questions to push them toward the missing pieces.
- Keep responses conversational and VERY brief (1-2 sentences max), and spoken-word friendly (no markdown, no bullet lists, no headers).
- Sound like a warm but rigorous tutor — encouraging but not hand-holding.
- NEVER dump large blocks of text. This is a voice conversation — keep it extremely tight.
- Respond in 1-2 short sentences. Do NOT ramble or over-explain.
- On the very first message, greet them in one sentence and invite them to start explaining.`
        : `You are a verbal quiz master testing a student on material from "${doc.filename}".

DOCUMENT CONTENT:
${documentContext}

${summaryContext ? `\nTOPIC SUMMARIES:\n${summaryContext}` : ""}
${flashcardContext ? `\nKEY TERMS:\n${flashcardContext}` : ""}

ROLE & RULES:
- YOU pick a topic/concept from the document and ask the student a question about it.
- Ask ONE clear question at a time. Wait for their answer before continuing.
- When they answer, evaluate it: if correct, confirm briefly and move to a new question on a DIFFERENT topic. If wrong or incomplete, give a short correction and follow up.
- Vary difficulty — mix recall questions ("What is...?") with application questions ("Why would you...?", "What happens if...?").
- Keep responses conversational and VERY brief (1-2 sentences max). No markdown formatting.
- Sound like an engaging quiz show host — energetic but educational.
- NEVER dump large blocks of text. This is a voice conversation — keep it extremely tight.
- Respond in 1-2 short sentences. Get straight to the point.
- On the very first message, skip any long introduction and immediately ask the first question in one sentence.`;

    const llmMessages: Message[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Stream the response
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: llmMessages,
      temperature: 0.7,
      max_tokens: 200,
      stream: true,
    });

    // Create a ReadableStream that sends SSE events
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream failed" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Verbal quiz error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Verbal quiz failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
