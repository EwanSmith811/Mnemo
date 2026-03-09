import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  const { data, error } = await supabase
    .from("flashcards")
    .select("*")
    .eq("document_id", documentId)
    .order("next_review_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  const body = await request.json();
  const { term, definition } = body as { term: string; definition: string };

  if (!term?.trim() || !definition?.trim()) {
    return NextResponse.json(
      { error: "Term and definition are required" },
      { status: 400 }
    );
  }

  const { data: card, error: insertError } = await supabase
    .from("flashcards")
    .insert({
      document_id: documentId,
      term: term.trim(),
      definition: definition.trim(),
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Increment the document's flashcard_count
  const { data: doc } = await supabase
    .from("documents")
    .select("flashcard_count")
    .eq("id", documentId)
    .single();

  if (doc) {
    await supabase
      .from("documents")
      .update({ flashcard_count: (doc.flashcard_count || 0) + 1 })
      .eq("id", documentId);
  }

  return NextResponse.json(card, { status: 201 });
}
