import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { DOCUMENT_FIELDS } from '@/lib/document-fields';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  const { error } = await database
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (error)
    return NextResponse.json(
      { error: 'Could not delete the document. Please retry.' },
      { status: 500 },
    );

  return NextResponse.json({ success: true });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const { data, error } = await database
    .from('documents')
    .select(DOCUMENT_FIELDS)
    .eq('id', documentId)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: 'Could not load the document. Try again.' },
      { status: 503 },
    );
  if (!data)
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  return NextResponse.json(data);
}
