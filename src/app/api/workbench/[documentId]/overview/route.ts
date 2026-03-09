import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import type { ConceptNode } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;

    // Fetch concept graph nodes
    const { data: graph, error: graphError } = await supabase
      .from("concept_graphs")
      .select("nodes")
      .eq("document_id", documentId)
      .single();

    if (graphError || !graph) {
      return NextResponse.json(
        { error: "Concept graph not found" },
        { status: 404 }
      );
    }

    const nodes = graph.nodes as ConceptNode[];

    // Group nodes by their group field
    const groupMap = new Map<string, ConceptNode[]>();
    for (const n of nodes) {
      if (n.id === "central") continue; // skip central hub node
      const arr = groupMap.get(n.group) ?? [];
      arr.push(n);
      groupMap.set(n.group, arr);
    }

    // Fetch mastery data (now keyed by group_name)
    const { data: masteryRows } = await supabase
      .from("workbench_mastery")
      .select("group_name, stage_completed")
      .eq("document_id", documentId);

    const masteryMap = new Map(
      (masteryRows ?? []).map((m: { group_name: string; stage_completed: number }) => [m.group_name, m.stage_completed])
    );

    // Fetch which groups already have content
    const { data: contentRows } = await supabase
      .from("workbench_content")
      .select("group_name, required_node_ids")
      .eq("document_id", documentId);

    const contentMap = new Map(
      (contentRows ?? []).map((c: { group_name: string; required_node_ids: string[] }) => [c.group_name, c.required_node_ids ?? []])
    );

    // Build group status array
    const overview = Array.from(groupMap.entries()).map(([groupName, groupNodes]) => ({
      group: groupName,
      nodeIds: groupNodes.map((n) => n.id),
      nodeLabels: groupNodes.map((n) => n.label),
      requiredNodeIds: contentMap.get(groupName) ?? [],
      stageCompleted: masteryMap.get(groupName) ?? 0,
      hasContent: contentMap.has(groupName),
    }));

    return NextResponse.json(overview);
  } catch (error) {
    console.error("Workbench overview error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load overview" },
      { status: 500 }
    );
  }
}
