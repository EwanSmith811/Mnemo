import type { DocumentFileType } from './document-formats';
import {
  makeSlide,
  recoverStoredSlides,
  type ExtractedSlide,
} from './document-slides';
export interface ExtractedDocument {
  text: string;
  slides: ExtractedSlide[];
}
export async function extractDocument(
  buffer: Buffer,
  fileType: DocumentFileType,
): Promise<ExtractedDocument> {
  if (fileType === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return {
        text: result.text,
        slides: result.pages.map((page, i) => ({
          ...makeSlide(page.text, page.num, 'page'),
          position: i + 1,
        })),
      };
    } finally {
      await parser.destroy();
    }
  }
  if (fileType === 'pptx' || fileType === 'ppsx') {
    const { OfficeParser } = await import('officeparser');
    const ast = await OfficeParser.parseOffice(buffer, { fileType: 'pptx' });
    const plain = (node: (typeof ast.content)[number]): string => {
      if (node.text) return node.text;
      return (node.children ?? []).map(plain).filter(Boolean).join('\n');
    };
    const slides = ast.content
      .filter((n) => n.type === 'slide')
      .map((slide, i) => {
        const body = (slide.children ?? [])
          .filter((n) => n.type !== 'note')
          .map(plain)
          .join('\n');
        const notes = [
          ...(slide.notes ?? []),
          ...(slide.children ?? []).filter((n) => n.type === 'note'),
        ]
          .map(plain)
          .join('\n');
        return {
          ...makeSlide(
            body,
            slide.type === 'slide'
              ? (slide.metadata?.slideNumber ?? i + 1)
              : i + 1,
            'slide',
            notes,
          ),
          position: i + 1,
        };
      });
    return { text: String((await ast.to('text')).value), slides };
  }
  if (fileType === 'ppt' || fileType === 'pps') {
    const { extractLegacyPowerPoint } = await import('./legacy-powerpoint');
    const text = await extractLegacyPowerPoint(buffer);
    return { text, slides: recoverStoredSlides(text) };
  }
  throw new Error(`Unsupported file type: ${fileType}`);
}
export async function extractText(buffer: Buffer, fileType: DocumentFileType) {
  return (await extractDocument(buffer, fileType)).text;
}
