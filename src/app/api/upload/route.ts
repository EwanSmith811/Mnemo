import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { extractText } from "@/lib/document-parser";
import { prepareTextForLLM } from "@/lib/text-chunker";
import { generateFlashcardsAndQuiz } from "@/lib/generate-content";
import { generateConceptGraph } from "@/lib/generate-graph";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "pptx") {
      return NextResponse.json(
        { error: "Only PDF and PPTX files are supported" },
        { status: 400 }
      );
    }
    const fileType = extension as "pdf" | "pptx";

    // Create document record with "processing" status
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        filename: file.name,
        file_type: fileType,
        file_size_bytes: file.size,
        status: "processing",
      })
      .select()
      .single();

    if (docError || !doc) {
      throw new Error(`Failed to create document: ${docError?.message}`);
    }

    try {
      // Extract text from file
      const buffer = Buffer.from(await file.arrayBuffer());
      const rawText = await extractText(buffer, fileType);

      if (rawText.trim().length < 100) {
        throw new Error(
          "This document contains too little text to generate study materials. Try a text-heavy document."
        );
      }

      // Prepare text (clean and truncate if needed)
      const { text: preparedText } = prepareTextForLLM(rawText);

      // Call Groq API to generate flashcards + quiz questions
      const content = await generateFlashcardsAndQuiz(preparedText, file.name);

      // Store flashcards
      const flashcardRows = content.flashcards.map((fc) => ({
        document_id: doc.id,
        term: fc.term,
        definition: fc.definition,
      }));

      const { error: fcError } = await supabase
        .from("flashcards")
        .insert(flashcardRows);

      if (fcError) throw new Error(`Failed to insert flashcards: ${fcError.message}`);

      // Store quiz questions
      const questionRows = content.quiz_questions.map((q) => ({
        document_id: doc.id,
        question: q.question,
        question_type: q.question_type,
        choices: q.choices,
        correct_answer: q.correct_answer,
        correct_answers:
          q.correct_answers.length > 0 ? q.correct_answers : null,
        correct_answer_text: q.correct_answer_text || null,
        explanation: q.explanation,
      }));

      const { error: quizError } = await supabase
        .from("quiz_questions")
        .insert(questionRows);

      if (quizError) throw new Error(`Failed to insert quiz questions: ${quizError.message}`);

      // Store topic summaries
      const summaryRows = content.topic_summaries.map((s) => ({
        document_id: doc.id,
        topic_name: s.topic_name,
        summary: s.summary,
        display_order: s.display_order,
      }));

      const { error: summaryError } = await supabase
        .from("topic_summaries")
        .insert(summaryRows);

      if (summaryError)
        throw new Error(`Failed to insert topic summaries: ${summaryError.message}`);

      // Generate concept graph (separate LLM call)
      const graphData = await generateConceptGraph(preparedText, file.name);

      // Store concept graph
      const { error: graphError } = await supabase
        .from("concept_graphs")
        .insert({
          document_id: doc.id,
          nodes: graphData.nodes,
          edges: graphData.edges,
        });

      if (graphError)
        throw new Error(`Failed to insert concept graph: ${graphError.message}`);

      // Update document status to completed
      await supabase
        .from("documents")
        .update({
          status: "completed",
          content: preparedText,
          extracted_text_length: rawText.length,
          flashcard_count: content.flashcards.length,
          quiz_question_count: content.quiz_questions.length,
          topic_summary_count: content.topic_summaries.length,
          concept_node_count: graphData.nodes.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      return NextResponse.json({
        document_id: doc.id,
        flashcard_count: content.flashcards.length,
        quiz_question_count: content.quiz_questions.length,
        topic_summary_count: content.topic_summaries.length,
        concept_node_count: graphData.nodes.length,
      });
    } catch (processingError) {
      await supabase
        .from("documents")
        .update({
          status: "failed",
          error_message:
            processingError instanceof Error
              ? processingError.message
              : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      throw processingError;
    }
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
