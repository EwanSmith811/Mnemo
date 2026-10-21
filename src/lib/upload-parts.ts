import type { DocumentFileType } from './document-formats';
import type { ExtractedSlide } from './document-slides';
import type { UploadPreview } from './upload-progress';

/** The most decks one study set can be built from. */
export const MAX_DECKS = 10;

/** One file of a multi-deck upload, read and parked until the set is built. */
export interface UploadPart {
  id: string;
  filename: string;
  file_type: DocumentFileType;
  file_size_bytes: number;
  data_base64: string;
  text: string;
  slides: ExtractedSlide[];
  created_at: string;
}
export interface Deck {
  filename: string;
  fileType: DocumentFileType;
  size: number;
  text: string;
  slides: ExtractedSlide[];
  buffer: Buffer;
}

const stem = (name: string) => name.replace(/\.[^.]+$/, '');

/** "10-1-26, 10-6-26 + 2 more" when the learner doesn't name the set. */
export function defaultSetName(filenames: string[]) {
  const shown = filenames.slice(0, 3).map(stem).join(', ');
  const rest = filenames.length - 3;
  return (rest > 0 ? `${shown} + ${rest} more` : shown).slice(0, 200);
}

/**
 * One study document from one or more decks. A single deck is passed through
 * unchanged, so its text (and upload deduplication) matches earlier uploads.
 * Slides keep their page number within their own deck and are numbered
 * across the whole set by position.
 */
export function combineDecks(decks: Deck[], name?: string) {
  const multi = decks.length > 1;
  let position = 0;
  return {
    filename: multi
      ? name?.trim().slice(0, 200) ||
        defaultSetName(decks.map((d) => d.filename))
      : decks[0].filename,
    fileType: decks[0].fileType,
    size: decks.reduce((sum, d) => sum + d.size, 0),
    rawText: multi
      ? decks
          .map((d, i) => `Deck ${i + 1}: ${stem(d.filename)}\n\n${d.text}`)
          .join('\n\n')
      : decks[0].text,
    slides: decks.flatMap((d, part) =>
      d.slides.map((s) => ({ ...s, part, position: ++position })),
    ),
    sources: decks.map((d, part) => ({
      part,
      filename: d.filename,
      fileType: d.fileType,
      buffer: d.buffer,
    })),
  };
}

/** Real excerpts from the deck, streamed so the loading screen shows actual content. */
export function deckPreview(
  text: string,
  slides: Pick<ExtractedSlide, 'title'>[],
): UploadPreview {
  return {
    slides: slides.length,
    words: text.split(/\s+/).filter(Boolean).length,
    titles: [...new Set(slides.map((s) => s.title.trim()))]
      .filter((t) => t && !/^(slide|page) \d+$/i.test(t))
      .slice(0, 40)
      .map((t) => t.slice(0, 80)),
  };
}
