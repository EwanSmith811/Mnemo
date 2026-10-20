import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStalePreview } from '../src/lib/source-preview';

const hex = (text: string) =>
  'FEFF' +
  [...text]
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
    .toUpperCase();
const pdf = (info: string) => Buffer.from(`%PDF-1.7\n<<${info}>>\n%%EOF`);

test('only previews from an older converter are redrawn', () => {
  const producer = `/Producer <${hex('Ream')}>`;
  assert.equal(isStalePreview(pdf(producer)), true);
  assert.equal(
    isStalePreview(pdf(`${producer} /Keywords <${hex('mnemo-preview-2')}>`)),
    false,
  );
  // A PDF export someone attached is never thrown away.
  assert.equal(isStalePreview(pdf('/Producer (PowerPoint)')), false);
});
