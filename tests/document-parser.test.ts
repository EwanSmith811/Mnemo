import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractText } from '../src/lib/document-parser';
for (const type of ['pdf', 'pptx'] as const)
  test(`extracts study material from a real ${type.toUpperCase()} file`, async () => {
    const buffer = await readFile(
      new URL(`./fixtures/lecture.${type}`, import.meta.url),
    );
    const text = await extractText(buffer, type);
    assert.match(text, /Thermodynamics study notes/);
    assert.match(text, /Energy is conserved/);
  });

for (const type of ['ppt', 'pps'] as const)
  test(`extracts legacy binary ${type.toUpperCase()} content and speaker notes`, async () => {
    const buffer = await readFile(
      new URL('./fixtures/lecture.pps', import.meta.url),
    );
    const text = await extractText(buffer, type);
    assert.match(text, /Thermodynamics study notes/);
    assert.match(text, /Energy is conserved/);
    assert.match(text, /Review the first law/);
    assert.ok(text.includes('\n'));
    assert.ok(!text.includes('\\n'));
  });

test('extracts a modern PowerPoint slideshow', async () => {
  const buffer = await readFile(
    new URL('./fixtures/lecture.ppsx', import.meta.url),
  );
  assert.match(await extractText(buffer, 'ppsx'), /Energy is conserved/);
});

test('rejects invalid legacy PowerPoint bytes instead of hanging', async () => {
  await assert.rejects(
    extractText(Buffer.from('not a PowerPoint'), 'pps'),
    /Invalid binary PowerPoint/,
  );
  const malformed = Buffer.alloc(512);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(malformed);
  await assert.rejects(extractText(malformed, 'pps'), /Could not read/);
});

test('upload format validation accepts supported PowerPoint extensions consistently', async () => {
  const { getDocumentFileType, DOCUMENT_ACCEPT } =
    await import('../src/lib/document-formats');
  for (const type of ['pdf', 'pptx', 'ppt', 'pps', 'ppsx']) {
    assert.equal(getDocumentFileType(`lecture.${type.toUpperCase()}`), type);
    assert.ok(DOCUMENT_ACCEPT.includes(`.${type}`));
  }
  assert.equal(getDocumentFileType('lecture.pps.exe'), null);
  assert.equal(getDocumentFileType('lecture'), null);
});
