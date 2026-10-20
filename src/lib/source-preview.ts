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
// Optional on hosts with LibreOffice installed. No document leaves this host.
export async function convertPresentation(
  buffer: Buffer,
  extension: string,
): Promise<Buffer | null> {
  const executable = process.env.LIBREOFFICE_PATH;
  if (!executable) return null;
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
    if (
      pdf.length > 16 * 1024 * 1024 ||
      !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))
    )
      throw new Error('Invalid converted PDF');
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
