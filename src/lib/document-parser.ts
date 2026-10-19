import type { DocumentFileType } from './document-formats';
export async function extractText(
  buffer: Buffer,
  fileType: DocumentFileType,
): Promise<string> {
  if (fileType === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (fileType === 'pptx' || fileType === 'ppsx') {
    const { OfficeParser } = await import('officeparser');
    const ast = await OfficeParser.parseOffice(buffer, { fileType: 'pptx' });
    return String((await ast.to('text')).value);
  }

  if (fileType === 'ppt' || fileType === 'pps') {
    const { extractLegacyPowerPoint } = await import('./legacy-powerpoint');
    return extractLegacyPowerPoint(buffer);
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}
