import 'server-only';
import postgres from 'postgres';
import { UploadRegistry, type UploadClaim } from './upload-registry';
import type {
  Document,
  Flashcard,
  QuizQuestion,
  QuizAttempt,
  TopicSummary,
  ConceptGraphRow,
  WorkbenchContent,
  WorkbenchMastery,
} from '@/types';

interface Tables {
  documents: Document & { content: string };
  flashcards: Flashcard;
  quiz_questions: QuizQuestion;
  quiz_attempts: QuizAttempt;
  topic_summaries: TopicSummary;
  concept_graphs: ConceptGraphRow;
  workbench_content: WorkbenchContent;
  workbench_mastery: WorkbenchMastery;
  workbench_sessions: import('./workbench-learning').LearningSession;
  chat_conversations: {
    id: string;
    document_id: string;
    title: string;
    messages: unknown[];
    updated_at: string;
  };
}
const tables = new Set([
  'documents',
  'flashcards',
  'quiz_questions',
  'quiz_attempts',
  'topic_summaries',
  'concept_graphs',
  'workbench_content',
  'workbench_mastery',
  'workbench_sessions',
  'chat_conversations',
]);
let connection: ReturnType<typeof postgres> | undefined;
function connect() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      'Database is not configured. Set DATABASE_URL and run npm run db:migrate.',
    );
  return (connection ??= postgres(process.env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}
const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name))
    throw new Error('Invalid database identifier');
  return `"${name}"`;
};
interface Result<R> {
  data: R;
  error: { message: string; code?: string } | null;
  count: number | null;
}

// A small parameterized repository builder shared by the API routes. Only the
// explicitly listed Mnemo tables can be addressed; mutations require filters.
export class Query<T, R = T[]> implements PromiseLike<Result<R>> {
  private operation = 'select';
  private returning = false;
  private columns = '*';
  private values: Record<string, unknown>[] = [];
  private filters: { column: string; values: unknown[]; many: boolean }[] = [];
  private sort = '';
  private rowLimit?: number;
  private cardinality = 'many';
  private wantsCount = false;
  private head = false;
  private conflict?: string;
  constructor(
    private table: string,
    private runSQL: (
      sql: string,
      values: unknown[],
    ) => Promise<Record<string, unknown>[]> = async (sql, values) =>
      connect().unsafe(sql, values as postgres.ParameterOrJSON<never>[]),
  ) {
    if (!tables.has(table))
      throw new Error('Table is outside the Mnemo namespace');
  }
  select(columns = '*', options?: { count?: string; head?: boolean }) {
    this.returning = true;
    this.columns = columns;
    this.wantsCount = !!options?.count;
    this.head = !!options?.head;
    return this;
  }
  insert(values: object | object[]) {
    this.operation = 'insert';
    this.values = (Array.isArray(values) ? values : [values]) as Record<
      string,
      unknown
    >[];
    return this;
  }
  update(values: object) {
    this.operation = 'update';
    this.values = [values as Record<string, unknown>];
    return this;
  }
  upsert(values: object, options: { onConflict: string }) {
    this.insert(values);
    this.conflict = options.onConflict;
    return this;
  }
  delete() {
    this.operation = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, values: [value], many: false });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ column, values, many: true });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.sort = `${identifier(column)} ${options?.ascending === false ? 'DESC' : 'ASC'}`;
    return this;
  }
  limit(value: number) {
    this.rowLimit = Math.max(0, Math.floor(value));
    return this;
  }
  single() {
    this.cardinality = 'one';
    return this as unknown as Query<T, T>;
  }
  maybeSingle() {
    this.cardinality = 'optional';
    return this as unknown as Query<T, T | null>;
  }
  then<A = Result<R>, B = never>(
    resolve?: ((value: Result<R>) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.execute().then(resolve, reject);
  }
  private async execute(): Promise<Result<R>> {
    try {
      const params: unknown[] = [];
      const parameter = (value: unknown) => {
        // The driver serializes JSONB parameters using the column's type.
        // Pre-stringifying here stores a JSON string instead of an array/object.
        params.push(value);
        return `$${params.length}`;
      };
      const table = `public."mnemo-${this.table}"`;
      const columns =
        this.columns === '*'
          ? '*'
          : this.columns
              .split(',')
              .map((c) => identifier(c.trim()))
              .join(', ');
      const where = this.filters
        .map((f) =>
          f.many
            ? f.values.length
              ? `${identifier(f.column)} IN (${f.values.map(parameter).join(',')})`
              : 'FALSE'
            : `${identifier(f.column)} = ${parameter(f.values[0])}`,
        )
        .join(' AND ');
      let statement: string;
      if (this.operation === 'select') {
        statement = `SELECT ${this.head ? 'count(*)::int AS count' : columns + (this.wantsCount ? ', count(*) OVER()::int AS __count' : '')} FROM ${table}`;
      } else if (this.operation === 'insert') {
        if (!this.values.length)
          return { data: [] as R, error: null, count: 0 };
        const keys = Object.keys(this.values[0]).filter(
          (k) => this.values[0][k] !== undefined,
        );
        statement = `INSERT INTO ${table} (${keys.map(identifier).join(',')}) VALUES ${this.values.map((row) => `(${keys.map((k) => parameter(row[k] ?? null)).join(',')})`).join(',')}`;
        if (this.conflict)
          statement += ` ON CONFLICT (${this.conflict.split(',').map(identifier).join(',')}) DO UPDATE SET ${keys
            .filter((k) => !this.conflict!.split(',').includes(k))
            .map((k) => `${identifier(k)} = EXCLUDED.${identifier(k)}`)
            .join(',')}`;
      } else {
        if (!this.filters.length)
          throw new Error('Unfiltered mutations are forbidden');
        statement =
          this.operation === 'delete'
            ? `DELETE FROM ${table}`
            : `UPDATE ${table} SET ${Object.entries(this.values[0])
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => `${identifier(k)} = ${parameter(v)}`)
                .join(',')}`;
      }
      if (where && this.operation !== 'insert') statement += ` WHERE ${where}`;
      if (this.operation === 'select') {
        if (this.sort && !this.head) statement += ` ORDER BY ${this.sort}`;
        if (this.rowLimit !== undefined && !this.head)
          statement += ` LIMIT ${this.rowLimit}`;
      } else if (this.returning) statement += ` RETURNING ${columns}`;
      const rows = await this.runSQL(statement, params);
      const count = this.head
        ? Number(rows[0]?.count ?? 0)
        : this.wantsCount
          ? Number(rows[0]?.__count ?? 0)
          : null;
      const clean = rows.map((row) => {
        const copy = { ...row };
        delete copy.__count;
        return copy;
      });
      if (this.cardinality === 'one' && clean.length !== 1)
        throw new Error('Record not found');
      if (this.cardinality === 'optional' && clean.length > 1)
        throw new Error('Expected at most one record');
      return {
        data: (this.head
          ? null
          : this.cardinality === 'many'
            ? clean
            : (clean[0] ?? null)) as R,
        count,
        error: null,
      };
    } catch (error) {
      console.error('Mnemo database query failed:', error);
      return {
        data: null as R,
        count: null,
        error: {
          message:
            error instanceof Error ? error.message : 'Database request failed',
          code: (error as { code?: string }).code,
        },
      };
    }
  }
}
function repository(
  runSQL?: (
    sql: string,
    values: unknown[],
  ) => Promise<Record<string, unknown>[]>,
) {
  return {
    from<K extends keyof Tables>(table: K) {
      if (!tables.has(table))
        throw new Error('Table is outside the Mnemo namespace');
      return new Query<Tables[K]>(table, runSQL);
    },
  };
}

const runSQL = async (sql: string, values: unknown[]) =>
  connect().unsafe(sql, values as postgres.ParameterOrJSON<never>[]);

export const database = {
  uploads: new UploadRegistry(runSQL),
  ...repository(),
  async transaction<T>(
    work: (db: ReturnType<typeof repository>) => Promise<T>,
    claim?: UploadClaim,
  ): Promise<T> {
    return (await connect().begin(async (tx) => {
      const run = async (sql: string, values: unknown[]) =>
        tx.unsafe(sql, values as postgres.ParameterOrJSON<never>[]);
      const uploads = new UploadRegistry(run);
      if (claim) await uploads.assertOwned(claim);
      const result = await work(repository(run));
      if (claim) await uploads.release(claim);
      return result;
    })) as T;
  },
};
