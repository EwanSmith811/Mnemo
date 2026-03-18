import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { extractText } from "@/lib/document-parser";
import { prepareTextForLLM } from "@/lib/text-chunker";
import { generateFlashcardsAndQuiz } from "@/lib/generate-content";
import { generateConceptGraph } from "@/lib/generate-graph";
import type { StudyMode } from "@/types";

class UploadFailure extends Error {
  detail?: string;
  stage: string;
  status: number;

  constructor(message: string, options: { detail?: string; stage: string; status?: number }) {
    super(message);
    this.name = "UploadFailure";
    this.detail = options.detail;
    this.stage = options.stage;
    this.status = options.status ?? 500;
  }
}

function createUploadFailure(error: unknown) {
  if (error instanceof UploadFailure) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unknown upload error";
  const normalized = message.toLowerCase();

  if (normalized.includes("too little text")) {
    return new UploadFailure(
      "We could not find enough readable text in that file to build study materials.",
      {
        detail: "Try a text-heavy PDF or PPTX, or make sure the file is not just images or screenshots.",
        stage: "text_extraction",
        status: 400,
      }
    );
  }

  if (normalized.includes("missing groq_api_key")) {
    return new UploadFailure("AI generation is not configured on the server.", {
      detail: "The GROQ_API_KEY environment variable is missing, so the model cannot generate study materials.",
      stage: "configuration",
      status: 500,
    });
  }

  if (normalized.includes("pdf") || normalized.includes("pptx") || normalized.includes("unsupported file type")) {
    return new UploadFailure("We could not read that file successfully.", {
      detail: "The file may be corrupted, image-only, password-protected, or saved in an unsupported PDF/PPTX structure.",
      stage: "file_reading",
      status: 400,
    });
  }

  if (normalized.includes("failed to create document")) {
    return new UploadFailure("We could not create the document record for this upload.", {
      detail: message,
      stage: "database_setup",
      status: 500,
    });
  }

  if (normalized.includes("failed to insert")) {
    return new UploadFailure("We generated the content, but saving it failed.", {
      detail: message,
      stage: "database_write",
      status: 500,
    });
  }

  if (normalized.includes("concept graph")) {
    return new UploadFailure("The study materials were generated, but concept graph creation failed.", {
      detail: message,
      stage: "concept_graph",
      status: 500,
    });
  }

  return new UploadFailure("Upload processing failed.", {
    detail: message,
    stage: "processing",
    status: 500,
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const studyModeValue = formData.get("studyMode");
    const studyMode =
      studyModeValue === "nursing" || studyModeValue === "engineers"
        ? (studyModeValue as StudyMode)
        : null;

    if (!file || !studyMode) {
      return NextResponse.json(
        {
          error: "File and study mode are required.",
          detail: "Select a PDF or PPTX file and choose a study mode before uploading.",
          stage: "validation",
        },
        { status: 400 }
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "pptx") {
      return NextResponse.json(
        {
          error: "Only PDF and PPTX files are supported.",
          detail: `The file "${file.name}" does not end in .pdf or .pptx.`,
          stage: "validation",
        },
        { status: 400 }
      );
    }
    const fileType = extension as "pdf" | "pptx";

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        filename: file.name,
        file_type: fileType,
        study_mode: studyMode,
        file_size_bytes: file.size,
        status: "processing",
      })
      .select()
      .single();

    if (docError || !doc) {
      throw new UploadFailure("We could not create the document record for this upload.", {
        detail: docError?.message,
        stage: "database_setup",
      });
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const rawText = await extractText(buffer, fileType);

      if (rawText.trim().length < 100) {
        throw new UploadFailure(
          "We could not find enough readable text in that file to build study materials.",
          {
            detail: "Try a text-heavy PDF or PPTX, or make sure the file is not just images or screenshots.",
            stage: "text_extraction",
            status: 400,
          }
        );
      }

      const { text: preparedText } = prepareTextForLLM(rawText);
      const content = await generateFlashcardsAndQuiz(preparedText, file.name, studyMode);

      const flashcardRows = content.flashcards.map((flashcard) => ({
        document_id: doc.id,
        term: flashcard.term,
        definition: flashcard.definition,
      }));

      const { error: flashcardError } = await supabase.from("flashcards").insert(flashcardRows);
      if (flashcardError) {
        throw new UploadFailure("We generated the flashcards, but saving them failed.", {
          detail: flashcardError.message,
          stage: "database_write",
        });
      }

      const questionRows = content.quiz_questions.map((question) => ({
        document_id: doc.id,
        question: question.question,
        question_type: question.question_type,
        choices: question.choices,
        correct_answer: question.correct_answer,
        correct_answers: question.correct_answers.length > 0 ? question.correct_answers : null,
        correct_answer_text: question.correct_answer_text || null,
        numeric_answer: question.numeric_answer ?? null,
        answer_tolerance: question.answer_tolerance ?? null,
        answer_unit: question.answer_unit ?? null,
        explanation: question.explanation,
      }));

      const { error: quizError } = await supabase.from("quiz_questions").insert(questionRows);
      if (quizError) {
        throw new UploadFailure("We generated the quiz, but saving the questions failed.", {
          detail: quizError.message,
          stage: "database_write",
        });
      }

      const summaryRows = content.topic_summaries.map((summary) => ({
        document_id: doc.id,
        topic_name: summary.topic_name,
        summary: summary.summary,
        display_order: summary.display_order,
      }));

      const { error: summaryError } = await supabase.from("topic_summaries").insert(summaryRows);
      if (summaryError) {
        throw new UploadFailure("We generated the topic summaries, but saving them failed.", {
          detail: summaryError.message,
          stage: "database_write",
        });
      }

      const graphData = await generateConceptGraph(preparedText, file.name);

      const { error: graphError } = await supabase.from("concept_graphs").insert({
        document_id: doc.id,
        nodes: graphData.nodes,
        edges: graphData.edges,
      });

      if (graphError) {
        throw new UploadFailure("We generated the study materials, but saving the concept graph failed.", {
          detail: graphError.message,
          stage: "concept_graph",
        });
      }

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
        study_mode: studyMode,
        flashcard_count: content.flashcards.length,
        quiz_question_count: content.quiz_questions.length,
        topic_summary_count: content.topic_summaries.length,
        concept_node_count: graphData.nodes.length,
      });
    } catch (processingError) {
      const { error: cleanupError } = await supabase.from("documents").delete().eq("id", doc.id);

      if (cleanupError) {
        console.error("Upload cleanup error:", cleanupError);
      }

      throw processingError;
    }
  } catch (error) {
    const failure = createUploadFailure(error);
    console.error("Upload error:", failure);
    return NextResponse.json(
      {
        error: failure.message,
        detail: failure.detail,
        stage: failure.stage,
      },
      { status: failure.status }
    );
  }
}
