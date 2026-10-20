import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { loadDocumentSlides } from '@/lib/slide-store';
import type { SlideSummary } from '@/lib/document-slides';
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    const slides = await loadDocumentSlides(documentId);
    if (!slides)
      return NextResponse.json(
        { error: 'Document not found.' },
        { status: 404 },
      );
    const progress = await database
      .from('slide_progress')
      .select('slide_id,status')
      .eq('document_id', documentId);
    // Before migration 007 is applied, progress simply starts empty.
    if (progress.error && progress.error.code !== '42P01')
      throw new Error('Slide progress unavailable');
    const status = new Map(
      (progress.data ?? []).map((p) => [p.slide_id, p.status]),
    );
    return NextResponse.json({
      slides: slides.map(
        ({
          id,
          position,
          source_number,
          kind,
          title,
          text_truncated,
          relevance,
          relevance_reason,
        }): SlideSummary => ({
          id,
          position,
          source_number,
          kind,
          title,
          text_truncated,
          relevance,
          relevance_reason,
          status: status.get(id) ?? null,
        }),
      ),
      notice: slides.length
        ? 'Explanations use extracted text and speaker notes. Keep the source beside your explanation. Older PowerPoint decks may need a PDF export for visual preview.'
        : 'Slide/page boundaries were not saved for this older upload. Upload the original again to enable the guided walkthrough.',
    });
  } catch (error) {
    console.error('Slide list failed:', error);
    return NextResponse.json(
      { error: 'Could not load slides. Please try again.' },
      { status: 503 },
    );
  }
}
