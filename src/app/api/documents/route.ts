import { NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { DOCUMENT_FIELDS } from '@/lib/document-fields';
export async function GET() {
  const { data, error } = await database
    .from('documents')
    .select(DOCUMENT_FIELDS)
    .eq('is_duplicate', false)
    .order('created_at', { ascending: false });
  if (error)
    return NextResponse.json(
      {
        error:
          'Could not load your library. Set DATABASE_URL and run the Mnemo database migration, then retry.',
      },
      { status: 503 },
    );
  return NextResponse.json(data);
}
