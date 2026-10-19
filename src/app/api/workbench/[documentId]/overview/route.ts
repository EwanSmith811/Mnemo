import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { orderedTopicNames, workbenchGroups } from '@/lib/workbench-learning';
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const graph = await database
      .from('concept_graphs')
      .select('nodes,edges')
      .eq('document_id', documentId)
      .maybeSingle();
    if (graph.error) throw new Error('Graph unavailable');
    if (!graph.data)
      return NextResponse.json(
        { error: 'This document has no concept map yet.' },
        { status: 404 },
      );
    const { graph: normalized, groups } = workbenchGroups(graph.data);
    const [sessions, content, legacy] = await Promise.all([
      database
        .from('workbench_sessions')
        .select()
        .eq('document_id', documentId),
      database
        .from('workbench_content')
        .select('group_name,required_node_ids')
        .eq('document_id', documentId),
      database
        .from('workbench_mastery')
        .select('group_name,stage_completed')
        .eq('document_id', documentId),
    ]);
    if (sessions.error || content.error || legacy.error)
      throw new Error('Progress unavailable');
    return NextResponse.json(
      orderedTopicNames(normalized, groups).map((group) => {
        const nodes = groups.get(group)!;
        const lesson = content.data.find((c) => c.group_name === group);
        return {
          group,
          nodeIds: nodes.map((n) => n.id),
          nodeLabels: nodes.map((n) => n.label),
          requiredNodeIds: lesson?.required_node_ids ?? [],
          hasContent: !!lesson,
          stageCompleted:
            legacy.data.find((m) => m.group_name === group)?.stage_completed ??
            0,
          session: sessions.data.find((s) => s.group_name === group) ?? null,
        };
      }),
    );
  } catch (error) {
    console.error('Workbench overview failed:', error);
    return NextResponse.json(
      { error: 'Could not load your topics and progress. Please retry.' },
      { status: 503 },
    );
  }
}
