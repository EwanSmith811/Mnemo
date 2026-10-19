export const DOCUMENT_EXTENSIONS = [
  'pdf',
  'pptx',
  'ppt',
  'pps',
  'ppsx',
] as const;
export type DocumentFileType = (typeof DOCUMENT_EXTENSIONS)[number];
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map(
  (type) => `.${type}`,
).join(',');
export function getDocumentFileType(filename: string): DocumentFileType | null {
  const extension = filename.split('.').pop()?.toLowerCase();
  return DOCUMENT_EXTENSIONS.find((type) => type === extension) ?? null;
}
