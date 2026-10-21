import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/database';
import { convertPresentation, isStalePreview } from '@/lib/source-preview';
export const maxDuration = 60;
type Context = { params: Promise<{ documentId: string }> };
/** Which deck of a study set; single-deck documents only have part 0. */
const partOf = (request: NextRequest) => {
  const part = Number(request.nextUrl.searchParams.get('part') ?? 0);
  return Number.isInteger(part) && part >= 0 && part < 10 ? part : 0;
};
export async function GET(request: NextRequest, context: Context) {
  try {
    const { documentId } = await context.params;
    const row = await database
      .from('document_sources')
      .select()
      .eq('document_id', documentId)
      .eq('part', partOf(request))
      .maybeSingle();
    if (row.error) throw new Error('Source lookup failed');
    if (!row.data)
      return NextResponse.json(
        {
          error:
            'The original file was not saved with this older upload. Reupload it, or attach its PDF export below.',
        },
        { status: 404 },
      );
    const source = row.data;
    if (request.nextUrl.searchParams.has('download'))
      return new Response(Buffer.from(source.data_base64, 'base64'), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="source.${source.file_type}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    if (
      ['pptx', 'ppsx'].includes(source.file_type) &&
      !source.preview_pdf_base64
    )
      return new Response(
        new Uint8Array(Buffer.from(source.data_base64, 'base64')),
        {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      );
    let pdf: Buffer | null = source.preview_pdf_base64
      ? Buffer.from(source.preview_pdf_base64, 'base64')
      : source.file_type === 'pdf'
        ? Buffer.from(source.data_base64, 'base64')
        : null;
    if (pdf && source.file_type !== 'pdf' && isStalePreview(pdf)) pdf = null;
    if (!pdf) {
      pdf = await convertPresentation(
        Buffer.from(source.data_base64, 'base64'),
        source.file_type,
      );
      if (pdf) {
        const saved = await database
          .from('document_sources')
          .update({ preview_pdf_base64: pdf.toString('base64') })
          .eq('id', source.id);
        if (saved.error) throw new Error('Could not save preview');
      }
    }
    if (!pdf)
      return NextResponse.json(
        {
          error:
            'Attach a PDF export of this PowerPoint to see the original slides beside your explanations. Export every slide, including hidden slides, in the original order.',
        },
        { status: 422 },
      );
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="slides.pdf"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          'Could not render the source. You can attach a PDF export instead.',
      },
      { status: 503 },
    );
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { documentId } = await context.params;
    const doc = await database
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .maybeSingle();
    if (doc.error) throw new Error('Document lookup failed');
    if (!doc.data)
      return NextResponse.json(
        { error: 'Document not found.' },
        { status: 404 },
      );
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024)
      return NextResponse.json(
        { error: 'Choose a PDF export up to 4 MB.' },
        { status: 400 },
      );
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
      return NextResponse.json(
        { error: 'Choose a valid PDF export.' },
        { status: 400 },
      );
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let total: number;
    try {
      total = (await parser.getInfo()).total;
    } finally {
      await parser.destroy();
    }
    const part = partOf(request);
    const slides = await database
      .from('document_slides')
      .select('source_number')
      .eq('document_id', documentId)
      .eq('part', part);
    if (slides.error) throw new Error('Slide lookup failed');
    const last = Math.max(0, ...slides.data.map((s) => s.source_number));
    if (total < last)
      return NextResponse.json(
        {
          error: `The PDF has ${total} pages, but this deck references slide ${last}. Export all slides in their original order.`,
        },
        { status: 400 },
      );
    const existing = await database
      .from('document_sources')
      .select('id')
      .eq('document_id', documentId)
      .eq('part', part)
      .maybeSingle();
    if (existing.error) throw new Error('Source lookup failed');
    const saved = existing.data
      ? await database
          .from('document_sources')
          .update({ preview_pdf_base64: buffer.toString('base64') })
          .eq('id', existing.data.id)
      : await database.from('document_sources').insert({
          document_id: documentId,
          file_type: 'pdf',
          data_base64: buffer.toString('base64'),
          part,
        });
    if (saved.error) throw new Error('Source save failed');
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json(
      {
        error:
          'Could not save this PDF preview. Check that it is unencrypted and retry.',
      },
      { status: 503 },
    );
  }
}
