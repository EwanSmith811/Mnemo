import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStoryLine,
  speakable,
  splitForSpeech,
  storySegments,
} from '../src/lib/memory-story';

const concepts = [
  { id: 'a', label: 'Selective Repeat' },
  { id: 'b', label: 'Cumulative ACK' },
];

test('story lines parse into events and cast members map to concepts', () => {
  assert.deepEqual(
    parseStoryLine('TITLE: The Parrot Who Only Heard Half', concepts, 0),
    {
      type: 'title',
      text: 'The Parrot Who Only Heard Half',
    },
  );
  const cast = parseStoryLine(
    'CAST: Sally Lectiv | selective repeat | resends only missing packets',
    concepts,
    0,
  );
  assert.equal(cast?.type, 'cast');
  assert.equal(cast && 'conceptId' in cast && cast.conceptId, 'a');
  assert.equal(cast && 'concept' in cast && cast.concept, 'Selective Repeat');
  assert.deepEqual(
    parseStoryLine('**SCENE:** It began   with a sneeze.', concepts, 2),
    {
      type: 'scene',
      index: 2,
      text: 'It began with a sneeze.',
    },
  );
  assert.equal(parseStoryLine('Here is your story!', concepts, 0), null);
  assert.equal(parseStoryLine('SCENE:   ', concepts, 0), null);
});

test('character marks render as highlights and are stripped for speech', () => {
  const text = 'Then [[Sally Lectiv]] sneezed on [[Kumu]].';
  assert.deepEqual(
    storySegments(text)
      .filter((p) => p.character)
      .map((p) => p.text),
    ['Sally Lectiv', 'Kumu'],
  );
  assert.equal(speakable(text), 'Then Sally Lectiv sneezed on Kumu.');
});

test('speech chunks break at sentences, start short, and never exceed the limit', () => {
  const scene =
    'The router sneezed. ' +
    'Packets flew everywhere, shrieking about sequence numbers and demanding lawyers. '.repeat(
      8,
    ) +
    'Silence.';
  const chunks = splitForSpeech(scene, true);
  assert.ok(chunks[0].length <= 160);
  assert.ok(chunks.every((c) => c.length <= 600));
  assert.equal(
    chunks.join(' ').replace(/\s+/g, ' '),
    scene.replace(/\s+/g, ' ').trim(),
  );
  assert.ok(chunks.every((c) => /[.!?…]$/.test(c)));
});
