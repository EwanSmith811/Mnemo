import { PDFParse } from "pdf-parse";
import { OfficeParser } from "officeparser";

export async function extractText(
  buffer: Buffer,
  fileType: "pdf" | "pptx"
): Promise<string> {
  if (fileType === "pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text;
  }

  if (fileType === "pptx") {
    const ast = await OfficeParser.parseOffice(buffer);
    return ast.toText();
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}
