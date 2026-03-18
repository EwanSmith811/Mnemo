import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { MAX_GENERATED_FLASHCARDS } from "@/lib/generate-content";

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

  const { count, error: countError } = await supabase
    .from("flashcards")
    .select("*", { count: "exact", head: true })
    .eq("document_id", documentId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) >= MAX_GENERATED_FLASHCARDS) {
    return NextResponse.json(
      { error: `Flashcard limit reached (${MAX_GENERATED_FLASHCARDS} max)` },
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

  await supabase
    .from("documents")
    .update({
      flashcard_count: (count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return NextResponse.json(card, { status: 201 });
}
