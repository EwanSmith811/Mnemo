import 'server-only';
import { database } from './database';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DocumentFileType } from './document-formats';

export async function storeDocumentSource(
  documentId: string,
  fileType: DocumentFileType,
  buffer: Buffer,
) {
  const existing = await database
    .from('document_sources')
    .select('id')
    .eq('document_id', documentId)
    .maybeSingle();
  if (existing.error) throw new Error('Could not check source file.');
  if (existing.data) return;
  const saved = await database.from('document_sources').insert({
    document_id: documentId,
    file_type: fileType,
    data_base64: buffer.toString('base64'),
  });
  if (saved.error && saved.error.code !== '23505')
    throw new Error('Could not save source file.');
}
// Stamped into converted previews. Bump it when conversion changes so stale
// cached previews are redrawn; PDFs people attach never carry it.
const PREVIEW_VERSION = 'mnemo-preview-2';
const pdfText = (text: string) =>
  'FEFF' +
  [...text]
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
    .toUpperCase();
const REAM_PRODUCER = `/Producer <${pdfText('Ream')}>`;

/** A preview this app converted earlier, with an older converter. */
export function isStalePreview(pdf: Buffer) {
  const text = pdf.toString('latin1');
  return (
    text.includes(REAM_PRODUCER) &&
    !text.includes(`<${pdfText(PREVIEW_VERSION)}>`)
  );
}

const isPdf = (pdf: Uint8Array) =>
  pdf.length <= 16 * 1024 * 1024 &&
  Buffer.from(pdf.subarray(0, 5)).equals(Buffer.from('%PDF-'));

/**
 * Render a presentation to PDF so its original slides can sit beside the
 * explanations. LibreOffice wins when the host has it; otherwise legacy
 * .ppt/.pps decks are drawn in-process. Only public font files are fetched;
 * the deck itself never leaves this host.
 */
export async function convertPresentation(
  buffer: Buffer,
  extension: string,
): Promise<Buffer | null> {
  if (process.env.LIBREOFFICE_PATH)
    return convertWithLibreOffice(
      process.env.LIBREOFFICE_PATH,
      buffer,
      extension,
    );
  if (extension !== 'ppt' && extension !== 'pps') return null;
  const { Ream } = await import('reamkit');
  const deck = Ream.parse(new Uint8Array(buffer));
  // Reamkit paints by kind (pictures, then shapes), which lets template
  // shapes cover pictures. Slide items sit at fixed positions, so painting
  // them all as one ordered layer keeps PowerPoint's stacking order.
  const body = deck.flow.body.map((block) => {
    if (block.kind === 'shape' && block.shape.float)
      return {
        ...block,
        shape: {
          ...block.shape,
          float: { ...block.shape.float, behind: true },
        },
      };
    if (block.kind === 'image' && block.image.float)
      return {
        ...block,
        image: {
          ...block.image,
          float: { ...block.image.float, behind: true },
        },
      };
    return block;
  });
  // `flow` is the document convert() renders; it is typed read-only.
  (deck as { flow: typeof deck.flow }).flow = { ...deck.flow, body };
  const pdf = await deck.convert('pdf', {
    info: { keywords: PREVIEW_VERSION },
  });
  if (!isPdf(pdf)) throw new Error('Invalid converted PDF');
  return Buffer.from(pdf);
}

async function convertWithLibreOffice(
  executable: string,
  buffer: Buffer,
  extension: string,
) {
  const dir = await mkdtemp(join(tmpdir(), 'mnemo-preview-'));
  try {
    const input = join(dir, `source.${extension}`);
    await writeFile(input, buffer);
    await promisify(execFile)(
      executable,
      [
        `-env:UserInstallation=${pathToFileURL(join(dir, 'profile')).href}`,
        '--headless',
        '--convert-to',
        'pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}',
        '--outdir',
        dir,
        input,
      ],
      { timeout: 45000, maxBuffer: 1024 * 1024 },
    );
    const pdf = await readFile(join(dir, 'source.pdf'));
    if (!isPdf(pdf)) throw new Error('Invalid converted PDF');
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
