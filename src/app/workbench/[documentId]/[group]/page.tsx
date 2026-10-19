import { redirect } from 'next/navigation';
import WorkbenchLesson from '@/components/WorkbenchLesson';
import {
  validGroup,
  resolveTopicParam,
  workbenchGroups,
} from '@/lib/workbench-learning';
import { database } from '@/lib/database';
export default async function Page({
  params,
}: {
  params: Promise<{ documentId: string; group: string }>;
}) {
  const { documentId, group } = await params;
  if (!validGroup(group)) redirect(`/workbench/${documentId}`);
  const { data, error } = await database
    .from('concept_graphs')
    .select('nodes,edges')
    .eq('document_id', documentId)
    .maybeSingle();
  if (error || !data) redirect(`/workbench/${documentId}`);
  let topic: string | null = null;
  try {
    topic = resolveTopicParam(group, workbenchGroups(data).groups.keys());
  } catch {
    redirect(`/workbench/${documentId}`);
  }
  if (!topic) redirect(`/workbench/${documentId}`);
  return (
    <WorkbenchLesson
      key={`${documentId}:${topic}`}
      documentId={documentId}
      group={topic}
    />
  );
}
