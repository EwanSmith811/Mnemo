import 'server-only';
import { NextResponse } from 'next/server';
import { extractDocument } from './document-parser';
import { getDocumentFileType } from './document-formats';
import type { Deck } from './upload-parts';

const MAX_SIZE = 4 * 1024 * 1024;
const unreadable = (filename?: string) =>
  NextResponse.json(
    {
      error: filename
        ? `Could not read ${filename}.`
        : 'Could not read this file.',
      detail:
        'Use an unencrypted, text-based PDF or PowerPoint file. If an older slideshow fails, export it as PPTX or PDF.',
    },
    { status: 400 },
  );

/**
 * Reads one deck. Shared by single uploads and each file of a study set,
 * where errors name the file.
 */
export async function readDeck(
  file: FormDataEntryValue | null,
  named = false,
): Promise<Deck | NextResponse> {
  if (!(file instanceof File))
    return NextResponse.json(
      { error: 'Choose a file and study focus.' },
      { status: 400 },
    );
  if (!file.size || file.size > MAX_SIZE)
    return NextResponse.json(
      { error: `Choose a file smaller than 4 MB (${file.name} is too large).` },
      { status: 413 },
    );
  const fileType = getDocumentFileType(file.name);
  if (!fileType)
    return NextResponse.json(
      {
        error: `Choose a PDF or PowerPoint file (.pptx, .ppt, .pps, .ppsx)${named ? `; ${file.name} isn’t one` : ''}.`,
      },
      { status: 400 },
    );
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const { text, slides } = await extractDocument(buffer, fileType);
    return {
      filename: file.name,
      fileType,
      size: file.size,
      text,
      slides,
      buffer,
    };
  } catch (error) {
    console.error('Document extraction failed:', error);
    return unreadable(named ? file.name : undefined);
  }
}
