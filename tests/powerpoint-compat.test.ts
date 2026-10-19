import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readCompoundFile, writeCompoundFile } from 'archive-codec';
import {
  readPptContent,
  readRecordSequence,
  childRecords,
  type PptRecord,
} from 'ppt-codec';
import { extractText } from '../src/lib/document-parser';

test('extracts text when a legacy drawing property overstates its complex data by one byte', async () => {
  const original = await readFile(
    new URL('./fixtures/lecture.pps', import.meta.url),
  );
  const streams = readCompoundFile(new Uint8Array(original));
  const document = streams.find(
    (stream) => stream.path === 'PowerPoint Document',
  )!;
  const stack: PptRecord[] = readRecordSequence(
    document.bytes,
    0,
    document.bytes.length,
  );
  let corrupted = false;
  while (stack.length) {
    const record = stack.pop()!;
    if (record.header.recType === 0xf00b && record.header.recInstance > 0) {
      const view = new DataView(
        record.data.buffer,
        record.data.byteOffset,
        record.data.byteLength,
      );
      view.setUint16(0, view.getUint16(0, true) | 0x4000, true);
      view.setInt32(2, 1, true);
      corrupted = true;
      break;
    }
    stack.push(...childRecords(record));
  }
  assert.ok(corrupted, 'fixture must contain a shape property table');
  const buffer = Buffer.from(writeCompoundFile(streams));
  assert.throws(() => readPptContent(new Uint8Array(buffer)), /complex data/);
  const text = await extractText(buffer, 'pps');
  assert.match(text, /Thermodynamics study notes/);
  assert.match(text, /Energy is conserved/);
  assert.match(text, /Review the first law/);
  assert.equal((text.match(/^Slide \d+/gm) || []).length, 1);
});
