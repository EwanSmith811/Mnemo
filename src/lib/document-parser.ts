export async function extractText(
  buffer: Buffer,
  fileType: "pdf" | "pptx"
): Promise<string> {
  if (fileType === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text;
  }

  if (fileType === "pptx") {
    const { OfficeParser } = await import("officeparser");
    const ast = await OfficeParser.parseOffice(buffer);
    return ast.toText();
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}
