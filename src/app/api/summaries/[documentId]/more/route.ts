import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import {
  generateAdditionalTopicSummaries,
  MAX_GENERATED_TOPIC_SUMMARIES,
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

    const [{ data: doc }, { data: existingSummaries, count, error: summariesError }] = await Promise.all([
      supabase
        .from("documents")
        .select("content, filename")
        .eq("id", documentId)
        .maybeSingle(),
      supabase
        .from("topic_summaries")
        .select("topic_name, summary, display_order", { count: "exact" })
        .eq("document_id", documentId)
        .order("display_order", { ascending: true }),
    ]);

    if (summariesError) throw summariesError;

    if (!doc?.content) {
      return NextResponse.json({ error: "Document content not found" }, { status: 404 });
    }

    const currentCount = count ?? existingSummaries?.length ?? 0;
    if (currentCount >= MAX_GENERATED_TOPIC_SUMMARIES) {
      return NextResponse.json(
        {
          error: `Topic summary limit reached (${MAX_GENERATED_TOPIC_SUMMARIES} max)`,
          limitReached: true,
          summaries: [],
        },
        { status: 400 }
      );
    }

    const allowedCount = Math.min(requestedCount, MAX_GENERATED_TOPIC_SUMMARIES - currentCount);
    const generatedSummaries = await generateAdditionalTopicSummaries(
      doc.content,
      doc.filename,
      allowedCount,
      existingSummaries ?? []
    );

    if (generatedSummaries.length === 0) {
      return NextResponse.json({ exhausted: true, limitReached: false, summaries: [] });
    }

    const rowsToInsert = generatedSummaries.slice(0, allowedCount).map((summary, index) => ({
      document_id: documentId,
      topic_name: summary.topic_name,
      summary: summary.summary,
      display_order: currentCount + index + 1,
    }));

    const { data: insertedSummaries, error: insertError } = await supabase
      .from("topic_summaries")
      .insert(rowsToInsert)
      .select();

    if (insertError) throw insertError;

    const newCount = currentCount + (insertedSummaries?.length ?? 0);
    await supabase
      .from("documents")
      .update({
        topic_summary_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return NextResponse.json({
      exhausted: false,
      limitReached: newCount >= MAX_GENERATED_TOPIC_SUMMARIES,
      summaries: insertedSummaries ?? [],
    });
  } catch (error) {
    console.error("Topic summary generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate topic summaries" },
      { status: 500 }
    );
  }
}
