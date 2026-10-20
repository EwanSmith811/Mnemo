export type TutorBlock =
  | { type: 'text'; heading: string; text: string }
  | { type: 'analogy'; title: string; text: string }
  | {
      type: 'flow';
      title: string;
      steps: { label: string; detail: string; connector: string }[];
    }
  | {
      type: 'diagram';
      title: string;
      nodes: { id: string; label: string; detail: string }[];
      edges: { from: string; to: string; label: string }[];
    }
  | { type: 'table'; title: string; columns: string[]; rows: string[][] };
export type SlideStatus = 'seen' | 'shaky' | 'understood';
export const SLIDE_STATUSES: readonly SlideStatus[] = [
  'seen',
  'shaky',
  'understood',
];
export interface SlideExplanation {
  title: string;
  blocks: TutorBlock[];
  takeaway: string;
  check: { question: string; answer: string } | null;
}
export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reply?: SlideExplanation;
}
export interface SlideThread {
  id: string;
  slide_id: string;
  messages: TutorMessage[];
  revision: number;
  updated_at: string;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid visual explanation.');
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number, empty = false) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new Error('Invalid explanation text.');
  return value.trim();
};
const list = (value: unknown, max: number, min = 1): unknown[] => {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new Error('Invalid explanation items.');
  return value;
};
/** A closed set of native renderers. Model output never becomes HTML or code. */
export function parseSlideExplanation(value: unknown): SlideExplanation {
  const input = object(value);
  const blocks = list(input.blocks, 8).map((value): TutorBlock => {
    const block = object(value);
    switch (block.type) {
      case 'text':
        return {
          type: 'text',
          heading: text(block.heading, 160, true),
          text: text(block.text, 1800),
        };
      case 'analogy':
        return {
          type: 'analogy',
          title: text(block.title, 160),
          text: text(block.text, 1400),
        };
      case 'flow':
        return {
          type: 'flow',
          title: text(block.title, 160),
          steps: list(block.steps, 7, 2).map((value) => {
            const step = object(value);
            return {
              label: text(step.label, 100),
              detail: text(step.detail, 350),
              connector: text(step.connector, 90, true),
            };
          }),
        };
      case 'table': {
        const columns = list(block.columns, 4, 2).map((c) => text(c, 100));
        const rows = list(block.rows, 10).map((row) =>
          list(row, columns.length, columns.length).map((c) =>
            text(c, 450, true),
          ),
        );
        return { type: 'table', title: text(block.title, 160), columns, rows };
      }
      case 'diagram': {
        const nodes = list(block.nodes, 8, 2).map((value) => {
          const n = object(value);
          return {
            id: text(n.id, 40),
            label: text(n.label, 100),
            detail: text(n.detail, 350),
          };
        });
        const ids = new Set(nodes.map((n) => n.id));
        if (ids.size !== nodes.length)
          throw new Error('Duplicate diagram nodes.');
        const edges = list(block.edges, 12).map((value) => {
          const e = object(value);
          const from = text(e.from, 40),
            to = text(e.to, 40);
          if (!ids.has(from) || !ids.has(to) || from === to)
            throw new Error('Invalid diagram connection.');
          return { from, to, label: text(e.label, 100, true) };
        });
        return { type: 'diagram', title: text(block.title, 160), nodes, edges };
      }
      default:
        throw new Error('Unsupported visual explanation block.');
    }
  });
  const check = input.check == null ? null : object(input.check);
  return {
    title: text(input.title, 180),
    blocks,
    takeaway: text(input.takeaway, 600),
    check: check
      ? {
          question: text(check.question, 600),
          answer: text(check.answer, 1400),
        }
      : null,
  };
}
export function explanationText(reply: SlideExplanation) {
  return [
    reply.title,
    ...reply.blocks.map((b) =>
      b.type === 'text'
        ? `${b.heading}\n${b.text}`
        : b.type === 'analogy'
          ? `${b.title}\n${b.text}`
          : b.type === 'flow'
            ? `${b.title}\n${b.steps.map((s) => `${s.label}: ${s.detail} ${s.connector}`).join('\n')}`
            : b.type === 'table'
              ? `${b.title}\n${b.columns.join(' | ')}\n${b.rows.map((r) => r.join(' | ')).join('\n')}`
              : `${b.title}\n${b.nodes.map((n) => `${n.label}: ${n.detail}`).join('\n')}\n${b.edges.map((e) => `${e.from} -> ${e.to}: ${e.label}`).join('\n')}`,
    ),
    reply.takeaway,
  ].join('\n\n');
}
