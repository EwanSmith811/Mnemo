import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanInterests,
  jargon,
  MAX_INTERESTS_LENGTH,
  parseStoryLine,
  splitForSpeech,
  storyRequest,
  termSegments,
} from '../src/lib/memory-story';

const concepts = [
  { id: 'a', label: 'Selective Repeat' },
  { id: 'b', label: 'Cumulative ACK' },
];

test('riff lines parse into events and bits map to concepts', () => {
  assert.deepEqual(
    parseStoryLine('TITLE: Shrek Owns a Fax Machine', concepts),
    { type: 'title', text: 'Shrek Owns a Fax Machine' },
  );
  assert.deepEqual(
    parseStoryLine(
      '**BIT:** selective repeat | resends only the lost packets | Gordon Ramsay re-cooks only the one   burnt scallop.',
      concepts,
    ),
    {
      type: 'bit',
      conceptId: 'a',
      concept: 'Selective Repeat',
      line: 'Gordon Ramsay re-cooks only the one burnt scallop.',
      meaning: 'resends only the lost packets',
    },
  );
  assert.equal(
    parseStoryLine('ENCORE: The scallop got a fax.', concepts)?.type,
    'encore',
  );
  // Unknown concepts and empty lines are dropped rather than guessed.
  assert.equal(parseStoryLine('BIT: Go-Back-N | x | y', concepts), null);
  assert.equal(parseStoryLine('BIT: Cumulative ACK | y |  ', concepts), null);
  assert.equal(parseStoryLine('Here are your riffs!', concepts), null);
});

test('terms in a line are found case-insensitively for highlighting', () => {
  const parts = termSegments(
    'Beyoncé sends one cumulative ack for the whole Cumulative ACK tour.',
    'Cumulative ACK',
  );
  assert.deepEqual(
    parts.filter((p) => p.term).map((p) => p.text),
    ['cumulative ack', 'Cumulative ACK'],
  );
  assert.equal(
    parts.map((p) => p.text).join(''),
    'Beyoncé sends one cumulative ack for the whole Cumulative ACK tour.',
  );
  assert.deepEqual(termSegments('No (term) here.', 'a+b'), [
    { text: 'No (term) here.', term: false },
  ]);
});

test('interests are trimmed, flattened and capped before reaching the prompt', () => {
  assert.equal(cleanInterests('  F1,\n\nZelda  '), 'F1, Zelda');
  assert.equal(cleanInterests(42), '');
  assert.equal(cleanInterests('x'.repeat(500)).length, MAX_INTERESTS_LENGTH);
  const request = storyRequest(
    [{ id: 'a', label: 'Selective Repeat', definition: 'd', group: 'g' }],
    'Networking',
    'F1',
  );
  assert.match(
    request,
    /interests \(use only where they fit, in at most 1 lines\): F1/,
  );
  assert.match(storyRequest([], 'Networking', ''), /interests: none given/);
});

test('jargon covers term words and vocabulary the definitions share', () => {
  const banned = jargon([
    { label: 'Selective Repeat', definition: 'The sender resends a packet.' },
    { label: 'Go-Back-N', definition: 'The sender resends every packet.' },
  ]);
  for (const word of ['selective', 'repeat', 'go-back-n', 'sender', 'packet'])
    assert.ok(banned.includes(word), word);
  assert.ok(!banned.includes('every'));
});

test('speech chunks break at sentences, start short, and never exceed the limit', () => {
  const line =
    'The router sneezed. ' +
    'Packets flew everywhere, shrieking about sequence numbers and demanding lawyers. '.repeat(
      8,
    ) +
    'Silence.';
  const chunks = splitForSpeech(line, true);
  assert.ok(chunks[0].length <= 160);
  assert.ok(chunks.every((c) => c.length <= 600));
  assert.equal(
    chunks.join(' ').replace(/\s+/g, ' '),
    line.replace(/\s+/g, ' ').trim(),
  );
  assert.ok(chunks.every((c) => /[.!?…]$/.test(c)));
});
