import 'server-only';
import { database } from './database';
import {
  heuristicRelevance,
  recoverStoredSlides,
  type DocumentSlide,
  type ExtractedSlide,
} from './document-slides';
import { classifySlides } from './slide-tutor-server';

const checking = new Map<string, Promise<DocumentSlide[]>>();
/**
 * Fill in which slides are worth studying, once per deck. Before migration 007
 * adds the columns, a heuristic result is computed in memory instead.
 */
async function withRelevance(
  documentId: string,
  rows: DocumentSlide[],
): Promise<DocumentSlide[]> {
  if (rows.every((r) => r.relevance)) return rows;
  if (rows.some((r) => r.relevance === undefined))
    return rows.map((r) => {
      const h = heuristicRelevance(r);
      return { ...r, relevance: h.relevance, relevance_reason: h.reason };
    });
  let work = checking.get(documentId);
  if (!work) {
    work = (async () => {
      const doc = await database
        .from('documents')
        .select('filename')
        .eq('id', documentId)
        .single();
      const result = await classifySlides(
        rows,
        doc.error ? 'lecture' : doc.data.filename,
      );
      return Promise.all(
        rows.map(async (row) => {
          if (row.relevance) return row;
          const r = result.get(row.position) ?? heuristicRelevance(row);
          const saved = await database
            .from('document_slides')
            .update({ relevance: r.relevance, relevance_reason: r.reason })
            .eq('id', row.id);
          if (saved.error) console.error('Could not save slide relevance');
          return { ...row, relevance: r.relevance, relevance_reason: r.reason };
        }),
      );
    })();
    checking.set(documentId, work);
    void work.finally(() => checking.delete(documentId)).catch(() => {});
  }
  return work;
}
export async function storeDocumentSlides(
  documentId: string,
  slides: ExtractedSlide[],
) {
  if (!slides.length) return;
  const existing = await database
    .from('document_slides')
    .select('id')
    .eq('document_id', documentId)
    .limit(1);
  if (existing.error) throw new Error('Could not check saved slides.');
  if (existing.data.length) return;
  const inserted = await database
    .from('document_slides')
    .insert(slides.map((s) => ({ ...s, document_id: documentId })));
  if (inserted.error && inserted.error.code !== '23505')
    throw new Error('Could not save slide boundaries.');
}
export async function loadDocumentSlides(documentId: string) {
  const doc = await database
    .from('documents')
    .select('content,file_type')
    .eq('id', documentId)
    .maybeSingle();
  if (doc.error) throw new Error('Could not load this document.');
  if (!doc.data) return null;
  let rows = await database
    .from('document_slides')
    .select()
    .eq('document_id', documentId)
    .order('position');
  if (rows.error) throw new Error('Could not load slides.');
  if (!rows.data.length && doc.data.content) {
    await storeDocumentSlides(
      documentId,
      recoverStoredSlides(doc.data.content),
    );
    rows = await database
      .from('document_slides')
      .select()
      .eq('document_id', documentId)
      .order('position');
    if (rows.error) throw new Error('Could not recover slides.');
  }
  return withRelevance(documentId, rows.data);
}
