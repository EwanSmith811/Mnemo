import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { extractDocument } from '../src/lib/document-parser';
import { recoverStoredSlides } from '../src/lib/document-slides';
import { parseSlideExplanation } from '../src/lib/slide-tutor';

test('explicit slide recovery preserves original numbering and separates notes without inventing boundaries', () => {
  const rows = recoverStoredSlides(
    'Slide 1\nFirst idea\nSpeaker notes: Explain why\n\nSlide 4\nFourth idea',
  );
  assert.deepEqual(
    rows.map((r) => [r.position, r.source_number, r.text, r.notes]),
    [
      [1, 1, 'First idea', 'Explain why'],
      [2, 4, 'Fourth idea', ''],
    ],
  );
  assert.deepEqual(
    recoverStoredSlides('Ordinary text\n\nAnother paragraph'),
    [],
  );
  assert.deepEqual(recoverStoredSlides('Slide 4\nIdea\nSlide 2\nIdea'), []);
});
test('all supported formats retain exact page or slide boundaries', async () => {
  for (const extension of ['pdf', 'pptx', 'ppsx', 'pps'] as const) {
    const bytes = await readFile(
      new URL(`./fixtures/lecture.${extension}`, import.meta.url),
    );
    const parsed = await extractDocument(bytes, extension);
    assert.ok(parsed.slides.length > 0, extension);
    assert.ok(
      parsed.slides.every(
        (s, i) => s.position === i + 1 && s.source_number >= 1,
      ),
    );
    assert.ok(
      parsed.slides.some((s) => s.text.includes('Thermodynamics')),
      extension,
    );
  }
});
test('visual explanations reject executable block types and broken graph references', () => {
  const base = {
    title: 'Simple explanation',
    blocks: [{ type: 'text', heading: '', text: 'Plain text only' }],
    takeaway: 'Remember this.',
    check: null,
  };
  assert.equal(parseSlideExplanation(base).blocks.length, 1);
  assert.throws(() =>
    parseSlideExplanation({
      ...base,
      blocks: [{ type: 'html', html: '<script>alert(1)</script>' }],
    }),
  );
  assert.throws(() =>
    parseSlideExplanation({
      ...base,
      blocks: [
        {
          type: 'diagram',
          title: 'Invalid',
          nodes: [
            { id: 'a', label: 'A', detail: 'A' },
            { id: 'b', label: 'B', detail: 'B' },
          ],
          edges: [{ from: 'a', to: 'missing', label: '' }],
        },
      ],
    }),
  );
  assert.throws(() =>
    parseSlideExplanation({
      ...base,
      blocks: [
        {
          type: 'table',
          title: 'Invalid',
          columns: ['A', 'B'],
          rows: [['one']],
        },
      ],
    }),
  );
});
test('slide storage migration enforces per-document positions, slide scoping, source limits and cascades', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'CREATE TABLE public."mnemo-documents" (id uuid PRIMARY KEY DEFAULT gen_random_uuid());',
    );
    await db.exec(
      await readFile(
        new URL('../db/006_slide_tutor.sql', import.meta.url),
        'utf8',
      ),
    );
    const doc = (
      await db.query<{ id: string }>(
        'INSERT INTO "mnemo-documents" DEFAULT VALUES RETURNING id',
      )
    ).rows[0].id;
    const slide = (
      await db.query<{ id: string }>(
        "INSERT INTO \"mnemo-document_slides\" (document_id,position,source_number,kind,title,text) VALUES ($1,1,3,'slide','Title','Text') RETURNING id",
        [doc],
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        "INSERT INTO \"mnemo-document_slides\" (document_id,position,source_number,kind,title,text) VALUES ($1,1,4,'slide','Title','Text')",
        [doc],
      ),
    );
    await db.query(
      'INSERT INTO "mnemo-slide_threads" (slide_id,messages) VALUES ($1,\'[]\')',
      [slide],
    );
    await assert.rejects(
      db.query(
        'UPDATE "mnemo-slide_threads" SET messages=\'{}\' WHERE slide_id=$1',
        [slide],
      ),
    );
    await db.query(
      "INSERT INTO \"mnemo-document_sources\" (document_id,file_type,data_base64) VALUES ($1,'pdf','JVBERg==')",
      [doc],
    );
    await db.query('DELETE FROM "mnemo-documents" WHERE id=$1', [doc]);
    assert.equal(
      (await db.query('SELECT * FROM "mnemo-slide_threads"')).rows.length,
      0,
    );
    assert.equal(
      (await db.query('SELECT * FROM "mnemo-document_sources"')).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
