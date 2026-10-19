import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const { data, error } = await database
    .from('concept_graphs')
    .select('*')
    .eq('document_id', documentId)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      {
        error:
          'Could not load the concept map. Check the database connection and try again.',
      },
      { status: 503 },
    );
  if (!data)
    return NextResponse.json(
      { error: 'No concept map is available for this document.' },
      { status: 404 },
    );
  return NextResponse.json(data);
}
