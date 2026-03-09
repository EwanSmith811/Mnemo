import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    console.log("[graph] Fetching graph for document:", documentId);

    const { data, error, status, statusText } = await supabase
      .from("concept_graphs")
      .select("*")
      .eq("document_id", documentId)
      .maybeSingle();

    console.log("[graph] Supabase response — status:", status, statusText, "| data:", data ? `${(data.nodes as unknown[])?.length ?? 0} nodes` : "null", "| error:", error);

    if (error) {
      console.error("[graph] Supabase error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      // Double-check: count rows to see if the table has any data at all
      const { count } = await supabase
        .from("concept_graphs")
        .select("id", { count: "exact", head: true });
      console.log("[graph] No graph found. Total rows in concept_graphs table:", count);

      return NextResponse.json(
        { error: `No concept graph found for document ${documentId}. Table has ${count ?? 0} total rows.` },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[graph] Route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
