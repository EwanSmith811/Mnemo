import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { database, Query } from '../src/lib/database';
import { PATCH } from '../src/app/api/learn/[documentId]/slides/[slideId]/route';
import {
  nextAction,
  resumeIndex,
  studySteps,
  type StudyProgress,
} from '../src/lib/study-plan';
import { heuristicRelevance } from '../src/lib/document-slides';

const base: StudyProgress = {
  slides: { total: 10, seen: 0, shaky: 0, understood: 0, resume: 0 },
  cards: { total: 20, reviewed: 0, due: 20 },
  quiz: {
    questions: 15,
    attempts: 0,
    lastScore: null,
    bestScore: null,
    lastMissed: 0,
  },
  workbench: { topics: 4, started: 0, due: 0 },
};

test('resume points at the first unrated slide, then the first shaky one', () => {
  assert.equal(resumeIndex(['understood', 'seen', null]), 1);
  assert.equal(resumeIndex(['understood', 'shaky', 'understood']), 1);
  assert.equal(resumeIndex(['understood', 'understood']), null);
  assert.equal(resumeIndex([]), null);
});

test('the plan walks the deck first, then reviews, tests and applies', () => {
  assert.equal(nextAction('d', base).step, 'learn');
  assert.equal(nextAction('d', base).href, '/learn/d?slide=1');
  const walked = {
    ...base,
    slides: { ...base.slides, understood: 8, shaky: 2, resume: 8 },
  };
  assert.equal(studySteps(walked)[0].done, true);
  assert.equal(nextAction('d', walked).step, 'flashcards');
  const reviewed = { ...walked, cards: { total: 20, reviewed: 20, due: 0 } };
  assert.equal(nextAction('d', reviewed).step, 'quiz');
  const passed = {
    ...reviewed,
    quiz: { ...base.quiz, attempts: 2, lastScore: 85, bestScore: 85 },
  };
  assert.equal(nextAction('d', passed).step, 'workbench');
  const applied = { ...passed, workbench: { topics: 4, started: 4, due: 0 } };
  assert.equal(nextAction('d', applied).step, 'verbal');
});

test('a large review backlog interrupts the walkthrough; older uploads read summaries', () => {
  const backlog = {
    ...base,
    slides: { ...base.slides, seen: 3, resume: 3 },
    cards: { total: 20, reviewed: 12, due: 12 },
  };
  assert.equal(nextAction('d', backlog).step, 'flashcards');
  const legacy = {
    ...base,
    slides: { total: 0, seen: 0, shaky: 0, understood: 0, resume: null },
  };
  assert.equal(nextAction('d', legacy).href, '/summaries/d');
});

test('slide progress never downgrades a rating and stays scoped to its document', async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  for (const file of [
    '001_mnemo.sql',
    '002_powerpoint_formats.sql',
    '006_slide_tutor.sql',
    '007_slide_progress.sql',
  ])
    await pg.exec(
      await readFile(new URL('../db/' + file, import.meta.url), 'utf8'),
    );
  const run = async (sql: string, values: unknown[]) =>
    (await pg.query<Record<string, unknown>>(sql, values)).rows;
  t.mock.method(database, 'from', (table: string) => new Query(table, run));
  const doc = await database
    .from('documents')
    .insert({ filename: 'deck.pptx', file_type: 'pptx', study_mode: 'nursing' })
    .select()
    .single();
  const slide = await database
    .from('document_slides')
    .insert({
      document_id: doc.data.id,
      position: 1,
      source_number: 1,
      kind: 'slide',
      title: 'Perfusion',
      text: 'Perfusion delivers oxygen to tissues.',
    })
    .select()
    .single();
  const context = {
    params: Promise.resolve({
      documentId: doc.data.id,
      slideId: slide.data.id,
    }),
  };
  const patch = async (status: string, ctx = context) => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/learn/test', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
      ctx,
    );
    return { status: res.status, body: await res.json() };
  };
  assert.deepEqual(await patch('seen'), {
    status: 200,
    body: { status: 'seen' },
  });
  assert.equal((await patch('understood')).body.status, 'understood');
  assert.equal((await patch('seen')).body.status, 'understood');
  assert.equal((await patch('shaky')).body.status, 'shaky');
  assert.equal((await patch('mastered')).status, 400);
  const other = await patch('seen', {
    params: Promise.resolve({
      documentId: '00000000-0000-4000-8000-000000000000',
      slideId: slide.data.id,
    }),
  });
  assert.equal(other.status, 404);
  await database
    .from('document_slides')
    .update({ relevance: 'skip', relevance_reason: 'Title slide' })
    .eq('id', slide.data.id);
  await assert.rejects(
    pg.query(`UPDATE "mnemo-document_slides" SET relevance='maybe'`),
  );
  await pg.query('DELETE FROM "mnemo-documents" WHERE id=$1', [doc.data.id]);
  assert.equal(
    (await pg.query('SELECT * FROM "mnemo-slide_progress"')).rows.length,
    0,
  );
});

test('title, roadmap and closing slides are skipped; content slides are kept', () => {
  const slide = (position: number, title: string, text: string) => ({
    position,
    title,
    text,
    notes: '',
  });
  assert.equal(
    heuristicRelevance(
      slide(
        1,
        'CSCE 463/612',
        'CSCE 463/612\nNetworks and Distributed Processing\nFall 2026',
      ),
    ).relevance,
    'skip',
  );
  assert.equal(
    heuristicRelevance(
      slide(
        2,
        'Chapter 3: Roadmap',
        'Chapter 3: Roadmap\nPipelining\nGo-Back-N\nSelective Repeat',
      ),
    ).reason,
    'Agenda or closing slide',
  );
  assert.equal(
    heuristicRelevance(slide(13, 'Questions?', 'Questions?')).relevance,
    'skip',
  );
  assert.equal(
    heuristicRelevance(
      slide(
        4,
        'Go-Back-N (GBN)',
        'Go-Back-N (GBN)\nThe sender may have up to N unacknowledged packets in the pipeline; the receiver sends cumulative ACKs.',
      ),
    ).relevance,
    'core',
  );
  // An overview with real explanation is not an agenda.
  assert.equal(
    heuristicRelevance(
      slide(
        3,
        'Overview',
        'Overview ' +
          'Pipelining lets the sender transmit several packets before waiting. '.repeat(
            8,
          ),
      ),
    ).relevance,
    'core',
  );
});
