import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { MAX_GENERATED_TOPIC_SUMMARIES } from "@/lib/generate-content";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  const { data, error } = await supabase
    .from("topic_summaries")
    .select("*")
    .eq("document_id", documentId)
    .order("display_order", { ascending: true });

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
  const { topic_name, summary } = body as { topic_name: string; summary: string };

  if (!topic_name?.trim() || !summary?.trim()) {
    return NextResponse.json(
      { error: "Topic name and summary are required" },
      { status: 400 }
    );
  }

  const [{ count, error: countError }, { data: lastSummary, error: lastSummaryError }] = await Promise.all([
    supabase
      .from("topic_summaries")
      .select("*", { count: "exact", head: true })
      .eq("document_id", documentId),
    supabase
      .from("topic_summaries")
      .select("display_order")
      .eq("document_id", documentId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (countError || lastSummaryError) {
    return NextResponse.json(
      { error: countError?.message || lastSummaryError?.message || "Failed to fetch topic summaries" },
      { status: 500 }
    );
  }

  const currentCount = count ?? 0;
  if (currentCount >= MAX_GENERATED_TOPIC_SUMMARIES) {
    return NextResponse.json(
      { error: `Topic summary limit reached (${MAX_GENERATED_TOPIC_SUMMARIES} max)` },
      { status: 400 }
    );
  }

  const nextDisplayOrder = (lastSummary?.display_order ?? 0) + 1;

  const { data: insertedSummary, error: insertError } = await supabase
    .from("topic_summaries")
    .insert({
      document_id: documentId,
      topic_name: topic_name.trim(),
      summary: summary.trim(),
      display_order: nextDisplayOrder,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase
    .from("documents")
    .update({
      topic_summary_count: currentCount + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return NextResponse.json(insertedSummary, { status: 201 });
}
