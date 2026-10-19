import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizeGraph, layoutGraph } from '../src/lib/graph';

const columns: Record<string, string[]> = {
  concept_graphs: ['nodes', 'edges'],
  quiz_questions: ['choices', 'correct_answers'],
  quiz_attempts: ['answers'],
  chat_conversations: ['messages'],
  workbench_content: [
    'inquiry_questions',
    'faded_blanks',
    'engineering_problems',
    'nclex_questions',
    'glossary',
    'node_ids',
    'required_node_ids',
  ],
};

test('repair decodes legacy JSON strings, preserves study records, and rejects future malformed arrays', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `CREATE TABLE unrelated (value jsonb); INSERT INTO unrelated VALUES ('"keep as a string"');`,
    );
    for (const name of [
      '001_mnemo.sql',
      '002_powerpoint_formats.sql',
      '003_upload_deduplication.sql',
    ])
      await pg.exec(
        await readFile(new URL('../db/' + name, import.meta.url), 'utf8'),
      );
    const doc = await pg.query<{ id: string }>(
      `INSERT INTO public."mnemo-documents" (filename,file_type,study_mode,content,status) VALUES ('legacy.pps','pps','engineers','Retain this source','completed') RETURNING id`,
    );
    const id = doc.rows[0].id;
    await pg.query(
      `INSERT INTO public."mnemo-concept_graphs" (document_id,nodes,edges) VALUES ($1,'[]','[]')`,
      [id],
    );
    await pg.query(
      `INSERT INTO public."mnemo-quiz_questions" (document_id,question,correct_answers) VALUES ($1,'Keep this question','[0,2]')`,
      [id],
    );
    await pg.query(
      `INSERT INTO public."mnemo-quiz_attempts" (document_id,total_questions,correct_answers,score_percentage,answers) VALUES ($1,1,1,100,'[]')`,
      [id],
    );
    await pg.query(
      `INSERT INTO public."mnemo-chat_conversations" (document_id,title) VALUES ($1,'Keep this conversation')`,
      [id],
    );
    await pg.query(
      `INSERT INTO public."mnemo-workbench_content" (document_id,group_name,brief_html) VALUES ($1,'Topic','<p>Keep this explanation</p>')`,
      [id],
    );
    const expected = new Map<string, unknown[]>();
    const before = new Map<string, unknown>();
    for (const [table, fields] of Object.entries(columns)) {
      before.set(
        table,
        (
          await pg.query(
            `SELECT id,${table === 'quiz_attempts' ? 'completed_at' : 'created_at'} FROM public."mnemo-${table}"`,
          )
        ).rows,
      );
      for (const field of fields) {
        const value =
          field === 'nodes'
            ? [
                {
                  id: 'central',
                  label: 'Root',
                  definition: 'Definition',
                  group: 'Topic',
                },
              ]
            : field === 'edges'
              ? []
              : field === 'correct_answers'
                ? [0, 2]
                : [{ preserve: field }];
        expected.set(table + '.' + field, value);
        // Encode twice to reproduce the old postgres-driver storage bug.
        await pg.query(
          `UPDATE public."mnemo-${table}" SET "${field}"=$1 WHERE document_id=$2`,
          [JSON.stringify(JSON.stringify(value)), id],
        );
      }
    }
    // Include a second level of erroneous encoding from an older retry.
    await pg.query(
      `UPDATE public."mnemo-concept_graphs" SET edges=$1 WHERE document_id=$2`,
      [JSON.stringify(JSON.stringify(JSON.stringify([]))), id],
    );
    await pg.exec(
      await readFile(
        new URL('../db/004_repair_json_arrays.sql', import.meta.url),
        'utf8',
      ),
    );
    for (const [table, fields] of Object.entries(columns)) {
      const row = (
        await pg.query<Record<string, unknown>>(
          `SELECT * FROM public."mnemo-${table}"`,
        )
      ).rows[0];
      assert.deepEqual(
        (
          await pg.query(
            `SELECT id,${table === 'quiz_attempts' ? 'completed_at' : 'created_at'} FROM public."mnemo-${table}"`,
          )
        ).rows,
        before.get(table),
      );
      for (const field of fields) {
        assert.deepEqual(row[field], expected.get(table + '.' + field));
        await assert.rejects(
          pg.query(
            `UPDATE public."mnemo-${table}" SET "${field}"=$1 WHERE document_id=$2`,
            [JSON.stringify('[]'), id],
          ),
          /check constraint/,
        );
      }
    }
    const graph = (
      await pg.query<Record<string, unknown>>(
        'SELECT nodes,edges FROM public."mnemo-concept_graphs"',
      )
    ).rows[0];
    assert.equal(layoutGraph(normalizeGraph(graph)).nodes.length, 1);
    assert.deepEqual((await pg.query('SELECT * FROM unrelated')).rows, [
      { value: 'keep as a string' },
    ]);
    await pg.query(
      `UPDATE public."mnemo-quiz_questions" SET correct_answers=NULL WHERE document_id=$1`,
      [id],
    );
    assert.equal(
      (
        await pg.query<{ correct_answers: null }>(
          'SELECT correct_answers FROM public."mnemo-quiz_questions"',
        )
      ).rows[0].correct_answers,
      null,
    );
  } finally {
    await pg.close();
  }
});
