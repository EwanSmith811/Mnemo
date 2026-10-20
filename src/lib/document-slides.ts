export interface ExtractedSlide {
  position: number;
  source_number: number;
  kind: 'slide' | 'page';
  title: string;
  text: string;
  notes: string;
  text_truncated: boolean;
}
export type SlideRelevance = 'core' | 'skip';
export interface DocumentSlide extends ExtractedSlide {
  id: string;
  document_id: string;
  /** Null until checked; 'skip' marks slides with nothing to learn. */
  relevance: SlideRelevance | null;
  relevance_reason: string;
}
export type SlideSummary = Pick<
  DocumentSlide,
  | 'id'
  | 'position'
  | 'source_number'
  | 'kind'
  | 'title'
  | 'text_truncated'
  | 'relevance'
  | 'relevance_reason'
> & { status: import('./slide-tutor').SlideStatus | null };

const SKIP_TITLE =
  /^(agenda|outline|roadmap|overview|contents|table of contents|today'?s (plan|agenda)|questions\??|any questions\??|q\s*&\s*a|thank you|thanks|the end|references|bibliography|sources|works cited|acknowledge?ments?|announcements?|reminders?|housekeeping|logistics)\b/i;
const words = (text: string) =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * Conservative rules for slides with nothing to learn. Used when the model
 * check is unavailable, and to catch obvious cases. When unsure, keep it.
 */
export function heuristicRelevance(
  slide: Pick<ExtractedSlide, 'title' | 'text' | 'notes' | 'position'>,
): { relevance: SlideRelevance; reason: string } {
  const parts = slide.title.split(/[:\u2013\u2014|-]/).map((p) => p.trim());
  const body = words(slide.text) - words(slide.title);
  if (parts.some((p) => SKIP_TITLE.test(p)) && body < 60)
    return { relevance: 'skip', reason: 'Agenda or closing slide' };
  if (slide.position === 1 && body < 25)
    return { relevance: 'skip', reason: 'Title slide' };
  if (words(slide.text + ' ' + slide.notes) < 6)
    return { relevance: 'skip', reason: 'Almost no text' };
  return { relevance: 'core', reason: '' };
}
export function makeSlide(
  text: string,
  number: number,
  kind: 'slide' | 'page',
  notes = '',
): ExtractedSlide {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  const title =
    clean
      .split('\n')
      .map((s) => s.trim())
      .find((line) => /[\p{L}\p{N}]/u.test(line))
      ?.slice(0, 140) || `${kind === 'page' ? 'Page' : 'Slide'} ${number}`;
  return {
    position: number,
    source_number: number,
    kind,
    title,
    text: clean.slice(0, 40000),
    notes: notes.slice(0, 12000),
    text_truncated: clean.length > 40000 || notes.length > 12000,
  };
}
/** Only recover explicit slide boundaries. Never invent slides by splitting paragraphs. */
export function recoverStoredSlides(text: string): ExtractedSlide[] {
  const markers = [...text.matchAll(/^Slide (\d+)[ \t]*\r?$/gm)];
  if (!markers.length || text.slice(0, markers[0].index).trim()) return [];
  const numbers = markers.map((m) => Number(m[1]));
  if (
    numbers.some(
      (n, i) =>
        !Number.isSafeInteger(n) || n < 1 || (i > 0 && n <= numbers[i - 1]),
    )
  )
    return [];
  return markers.map((marker, i) => {
    const body = text
      .slice(
        marker.index! + marker[0].length,
        markers[i + 1]?.index ?? text.length,
      )
      .trim();
    const note = body.indexOf('Speaker notes:');
    const slide = makeSlide(
      note < 0 ? body : body.slice(0, note),
      numbers[i],
      'slide',
      note < 0 ? '' : body.slice(note + 14).trim(),
    );
    return { ...slide, position: i + 1 };
  });
}
