import type { ConceptGraph, ConceptNode, WorkbenchContent } from '@/types';
import { normalizeGraph } from './graph';
export type Confidence = 'unsure' | 'fairly-sure' | 'certain';
export interface PracticeItem {
  id: string;
  phase: 'recall' | 'apply';
  kind: 'explain' | 'blank' | 'numeric' | 'choice';
  prompt: string;
  ideal: string;
  hints: string[];
  choices?: string[];
  correctIndex?: number;
  numericAnswer?: number;
  tolerance?: number;
  unit?: string;
}
export interface PracticeAttempt {
  answer: string;
  correct: boolean;
  confidence: Confidence;
  assisted: boolean;
  feedback: string;
}
export interface LearningState {
  phase: 'learn' | 'practice' | 'complete';
  queue: string[];
  cursor: number;
  attempts: Record<string, PracticeAttempt[]>;
  feedback: PracticeAttempt | null;
  supportUsed?: boolean;
}
export interface LearningSession {
  id: string;
  document_id: string;
  group_name: string;
  content_id: string;
  revision: number;
  state: LearningState;
  next_review_at: string | null;
  interval_days: number;
  completed_at: string | null;
}

export function workbenchGroups(value: unknown) {
  const graph = normalizeGraph(value);
  const groups = new Map<string, ConceptNode[]>();
  const nodes =
    graph.nodes.length > 1
      ? graph.nodes.filter((n) => n.id !== 'central')
      : graph.nodes;
  for (const node of nodes)
    groups.set(node.group, [...(groups.get(node.group) ?? []), node]);
  return { graph, groups };
}
export function validGroup(group: unknown): group is string {
  return (
    typeof group === 'string' &&
    !!group.trim() &&
    group.length <= 80 &&
    !['undefined', 'null'].includes(group)
  );
}
/** Match a real graph topic before decoding, preserving literal percent signs. */
export function resolveTopicParam(value: string, names: Iterable<string>) {
  const topics = new Set(names);
  if (topics.has(value)) return value;
  try {
    const decoded = decodeURIComponent(value);
    return topics.has(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
export function topicContext(source: string, nodes: ConceptNode[]) {
  const paragraphs = source.split(/\n\s*\n|(?=Slide \d+\n)/);
  const terms = nodes.map((n) => n.label.toLowerCase());
  const ranked = paragraphs.map((text, index) => ({
    text,
    index,
    score: terms.reduce(
      (sum, term) => sum + (text.toLowerCase().includes(term) ? 1 : 0),
      0,
    ),
  }));
  const selected = ranked
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 12)
    .sort((a, b) => a.index - b.index);
  return (
    selected.length ? selected.map((p) => p.text).join('\n\n') : source
  ).slice(0, 14000);
}
export function practiceItems(content: WorkbenchContent): PracticeItem[] {
  const explain = (
    q: WorkbenchContent['inquiry_questions'][number],
    i: number,
    phase: 'recall' | 'apply',
  ): PracticeItem => ({
    id: `${phase}-${i}`,
    phase,
    kind: 'explain',
    prompt: q.question,
    ideal: q.idealAnswer,
    hints: q.hints ?? [],
  });
  const recall = content.inquiry_questions
    .slice(0, 4)
    .map((q, i) => explain(q, i, 'recall'));
  const transfer = (content.application_questions ?? [])
    .slice(0, 2)
    .map((q, i) => explain(q, i, 'apply'));
  const numeric: PracticeItem[] =
    content.study_mode === 'engineers'
      ? content.engineering_problems.slice(1, 3).map((p, i) => ({
          id: `numeric-${i}`,
          phase: 'apply',
          kind: 'numeric',
          prompt: p.problem,
          ideal: `${p.answer} ${p.unit}\n${p.solutionSteps.join('\n')}`,
          hints: p.givenData,
          numericAnswer: p.answer,
          tolerance: p.tolerance,
          unit: p.unit,
        }))
      : [];
  const clinical: PracticeItem[] =
    content.study_mode === 'nursing'
      ? content.nclex_questions.slice(0, 3).map((q, i) => ({
          id: `clinical-${i}`,
          phase: 'apply',
          kind: 'choice',
          prompt: `${q.scenario}\n\n${q.question}`,
          ideal: q.rationale,
          hints: [],
          choices: q.choices,
          correctIndex: q.correct_answer,
        }))
      : [];
  const blanks: PracticeItem[] =
    transfer.length || numeric.length || clinical.length
      ? []
      : content.faded_blanks.slice(0, 2).map((b, i) => ({
          id: `blank-${i}`,
          phase: 'apply',
          kind: 'blank',
          prompt: `${b.textBefore} _____ ${b.textAfter}`,
          ideal: b.answer,
          hints: [],
        }));
  return [...recall, ...transfer, ...numeric, ...clinical, ...blanks];
}
export function newLearningState(items: PracticeItem[]): LearningState {
  return {
    phase: 'learn',
    queue: items.map((i) => i.id),
    cursor: 0,
    attempts: {},
    feedback: null,
  };
}
export function recordAttempt(
  state: LearningState,
  item: PracticeItem,
  attempt: PracticeAttempt,
): LearningState {
  if (
    state.phase !== 'practice' ||
    state.queue[state.cursor] !== item.id ||
    state.feedback
  )
    throw new Error('This question is not ready for an answer.');
  const attempts = [...(state.attempts[item.id] ?? []), attempt];
  const queue = [...state.queue];
  if ((!attempt.correct || attempt.assisted) && attempts.length < 2)
    queue.splice(Math.min(state.cursor + 3, queue.length), 0, item.id);
  return {
    ...state,
    queue,
    attempts: { ...state.attempts, [item.id]: attempts },
    feedback: attempt,
  };
}
export function learningSummary(state: LearningState) {
  const entries = Object.values(state.attempts);
  const independent = entries.filter(
    (a) => a[0]?.correct && !a[0].assisted,
  ).length;
  const needsReview = Object.entries(state.attempts)
    .filter(([, a]) => !a.at(-1)?.correct || a.at(-1)?.assisted)
    .map(([id]) => id);
  const overconfident = entries.filter(
    (a) => a[0]?.confidence === 'certain' && !a[0].correct,
  ).length;
  return { independent, total: entries.length, needsReview, overconfident };
}
export function reviewSchedule(
  state: LearningState,
  previousDays: number,
  now = new Date(),
) {
  const summary = learningSummary(state);
  const strong =
    summary.total > 0 &&
    !summary.needsReview.length &&
    summary.independent / summary.total >= 0.8;
  const days = strong
    ? Math.min(30, previousDays ? Math.max(1, previousDays * 2) : 1)
    : 0;
  return {
    interval_days: days,
    next_review_at: new Date(
      now.getTime() + (days ? days * 86400000 : 10 * 60000),
    ).toISOString(),
  };
}
export function localGrade(item: PracticeItem, answer: string): boolean | null {
  if (item.kind === 'choice')
    return /^\d+$/.test(answer) && Number(answer) === item.correctIndex;
  if (item.kind === 'numeric') {
    // Units are shown beside the input; accept a signed decimal/scientific value.
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(answer.trim()))
      return false;
    return (
      Number.isFinite(Number(answer)) &&
      Math.abs(Number(answer) - item.numericAnswer!) <=
        Math.max(0, item.tolerance ?? 0)
    );
  }
  if (
    item.kind === 'blank' &&
    answer.trim().toLowerCase() === item.ideal.trim().toLowerCase()
  )
    return true;
  // Keyword overlap cannot distinguish a correct explanation from its negation.
  return null;
}
export function orderedTopicNames(
  graph: ConceptGraph,
  groups: Map<string, ConceptNode[]>,
) {
  const root = graph.nodes.find((n) => n.id === 'central') ?? graph.nodes[0];
  const seen = new Set<string>(),
    queue = [root.id],
    names: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (seen.has(id)) continue;
    seen.add(id);
    const node = graph.nodes.find((n) => n.id === id);
    if (node && groups.has(node.group) && !names.includes(node.group))
      names.push(node.group);
    for (const e of graph.edges) {
      if (e.source === id) queue.push(e.target);
      else if (e.target === id) queue.push(e.source);
    }
  }
  return [
    ...names,
    ...[...groups.keys()].filter((n) => !names.includes(n)).sort(),
  ];
}
