import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import {
  generateAdditionalFlashcards,
  MAX_GENERATED_FLASHCARDS,
  MAX_GENERATION_BATCH_SIZE,
} from "@/lib/generate-content";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const body = await request.json();
    const requestedCount = Number(body?.count);

    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > MAX_GENERATION_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Count must be an integer between 1 and ${MAX_GENERATION_BATCH_SIZE}` },
        { status: 400 }
      );
    }

    const [{ data: doc }, { data: existingFlashcards, count, error: flashcardsError }] = await Promise.all([
      supabase
        .from("documents")
        .select("content, filename")
        .eq("id", documentId)
        .maybeSingle(),
      supabase
        .from("flashcards")
        .select("term, definition", { count: "exact" })
        .eq("document_id", documentId)
        .order("created_at", { ascending: true }),
    ]);

    if (flashcardsError) throw flashcardsError;

    if (!doc?.content) {
      return NextResponse.json({ error: "Document content not found" }, { status: 404 });
    }

    const currentCount = count ?? existingFlashcards?.length ?? 0;
    if (currentCount >= MAX_GENERATED_FLASHCARDS) {
      return NextResponse.json(
        {
          error: `Flashcard limit reached (${MAX_GENERATED_FLASHCARDS} max)`,
          limitReached: true,
          flashcards: [],
        },
        { status: 400 }
      );
    }

    const allowedCount = Math.min(requestedCount, MAX_GENERATED_FLASHCARDS - currentCount);
    const generatedFlashcards = await generateAdditionalFlashcards(
      doc.content,
      doc.filename,
      allowedCount,
      existingFlashcards ?? []
    );

    if (generatedFlashcards.length === 0) {
      return NextResponse.json({ exhausted: true, limitReached: false, flashcards: [] });
    }

    const rowsToInsert = generatedFlashcards.slice(0, allowedCount).map((flashcard) => ({
      document_id: documentId,
      term: flashcard.term,
      definition: flashcard.definition,
    }));

    const { data: insertedFlashcards, error: insertError } = await supabase
      .from("flashcards")
      .insert(rowsToInsert)
      .select();

    if (insertError) throw insertError;

    const newCount = currentCount + (insertedFlashcards?.length ?? 0);
    await supabase
      .from("documents")
      .update({
        flashcard_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return NextResponse.json({
      exhausted: false,
      limitReached: newCount >= MAX_GENERATED_FLASHCARDS,
      flashcards: insertedFlashcards ?? [],
    });
  } catch (error) {
    console.error("Flashcard generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate flashcards" },
      { status: 500 }
    );
  }
}
