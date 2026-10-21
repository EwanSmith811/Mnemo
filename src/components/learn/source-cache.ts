'use client';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/**
 * The deck's original file, fetched once per page view and shared by the
 * slide preview and the thumbnail rail. PDFs (and legacy decks converted to
 * PDF on the server) are drawn with pdf.js; PPTX decks go to the isolated
 * viewer frame.
 */
export type Source =
  { kind: 'pdf'; data: ArrayBuffer } | { kind: 'deck'; data: ArrayBuffer };

const sources = new Map<string, Promise<Source>>();
const pdfs = new Map<string, Promise<PDFDocumentProxy>>();

/** `part` picks the deck in a study set built from several decks. */
export function loadSource(documentId: string, version: number, part = 0) {
  const key = `${documentId}:${version}:${part}`;
  let source = sources.get(key);
  if (!source) {
    source = fetch(`/api/learn/${documentId}/source?part=${part}`).then(
      async (r) => {
        if (!r.ok)
          throw new Error(
            (await r.json().catch(() => null))?.error ||
              'The original file couldn’t be loaded.',
          );
        const kind = r.headers.get('Content-Type')?.includes('presentation')
          ? ('deck' as const)
          : ('pdf' as const);
        return { kind, data: await r.arrayBuffer() };
      },
    );
    // A failure is not cached, so a retry fetches again.
    source.catch(() => sources.delete(key));
    sources.set(key, source);
  }
  return source;
}

export function loadPdf(documentId: string, version: number, part = 0) {
  const key = `${documentId}:${version}:${part}`;
  let pdf = pdfs.get(key);
  if (!pdf) {
    pdf = loadSource(documentId, version, part).then(async (source) => {
      if (source.kind !== 'pdf') throw new Error('Not a PDF');
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      // pdf.js takes ownership of the bytes, so it gets its own copy.
      return pdfjs.getDocument({ data: new Uint8Array(source.data.slice(0)) })
        .promise;
    });
    pdf.catch(() => pdfs.delete(key));
    pdfs.set(key, pdf);
  }
  return pdf;
}

/** Draw one page into a canvas at the given CSS width. */
export async function drawPage(
  pdf: PDFDocumentProxy,
  number: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  onTask?: (task: RenderTask) => void,
) {
  const page = await pdf.getPage(number);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({
    scale: (cssWidth / base.width) * ratio,
  });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  canvas.style.aspectRatio = `${base.width} / ${base.height}`;
  const task = page.render({ canvas, viewport });
  onTask?.(task);
  await task.promise;
}
