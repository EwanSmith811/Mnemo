import type { SlideStatus } from './slide-tutor';

export interface StudyProgress {
  slides: {
    total: number;
    seen: number;
    shaky: number;
    understood: number;
    /** Zero-based position in the full deck to resume, or null when all are rated. */
    resume: number | null;
  };
  cards: { total: number; reviewed: number; due: number };
  quiz: {
    questions: number;
    attempts: number;
    lastScore: number | null;
    bestScore: number | null;
    lastMissed: number;
  };
  workbench: { topics: number; started: number; due: number };
}

export type StepId = 'learn' | 'flashcards' | 'quiz' | 'workbench';
export interface StudyStep {
  id: StepId;
  title: string;
  detail: string;
  /** 0–1 completion for the progress meter. */
  progress: number;
  done: boolean;
}
export interface NextAction {
  step: StepId | 'verbal';
  href: string;
  title: string;
  detail: string;
  cta: string;
}

const PASSING_SCORE = 80;
const ratio = (part: number, whole: number) =>
  whole ? Math.min(1, part / whole) : 0;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** First slide not yet rated, falling back to the first slide marked shaky. */
export function resumeIndex(statuses: (SlideStatus | null)[]) {
  const unrated = statuses.findIndex(
    (s) => s !== 'understood' && s !== 'shaky',
  );
  if (unrated >= 0) return unrated;
  const shaky = statuses.indexOf('shaky');
  return shaky >= 0 ? shaky : null;
}

export function studySteps(p: StudyProgress): StudyStep[] {
  const rated = p.slides.understood + p.slides.shaky;
  return [
    {
      id: 'learn',
      title: 'Walk through the deck',
      detail: p.slides.total
        ? `${rated} of ${plural(p.slides.total, 'slide')} checked · ${p.slides.understood} understood`
        : 'Read each topic summary to build the big picture.',
      progress: ratio(rated, p.slides.total),
      done: p.slides.total > 0 && rated === p.slides.total,
    },
    {
      id: 'flashcards',
      title: 'Lock in the vocabulary',
      detail: p.cards.total
        ? `${p.cards.reviewed} of ${plural(p.cards.total, 'card')} practised · ${p.cards.due} due`
        : 'No flashcards yet.',
      progress: ratio(p.cards.reviewed, p.cards.total),
      done: p.cards.total > 0 && p.cards.reviewed > 0 && p.cards.due === 0,
    },
    {
      id: 'quiz',
      title: 'Test yourself',
      detail:
        p.quiz.bestScore === null
          ? `${plural(p.quiz.questions, 'question')} ready`
          : `Best score ${p.quiz.bestScore}% · aim for ${PASSING_SCORE}%`,
      progress: ratio(p.quiz.bestScore ?? 0, PASSING_SCORE),
      done: (p.quiz.bestScore ?? 0) >= PASSING_SCORE,
    },
    {
      id: 'workbench',
      title: 'Apply it to new problems',
      detail: p.workbench.topics
        ? `${p.workbench.started} of ${plural(p.workbench.topics, 'topic')} practised${p.workbench.due ? ` · ${p.workbench.due} due` : ''}`
        : 'Topics appear once the concept map is ready.',
      progress: ratio(p.workbench.started, p.workbench.topics),
      done:
        p.workbench.topics > 0 &&
        p.workbench.started === p.workbench.topics &&
        p.workbench.due === 0,
    },
  ];
}

/** One clear recommendation: finish the walkthrough, clear reviews, then test and apply. */
export function nextAction(documentId: string, p: StudyProgress): NextAction {
  const steps = studySteps(p);
  const done = (id: StepId) => steps.find((s) => s.id === id)!.done;
  const backlog = p.cards.reviewed > 0 && p.cards.due >= 10;
  if (!done('learn') && !backlog) {
    if (!p.slides.total)
      return {
        step: 'learn',
        href: `/summaries/${documentId}`,
        title: 'Start with the big picture',
        detail: 'Read the topic summaries, then move on to flashcards.',
        cta: 'Read summaries',
      };
    const started = p.slides.seen + p.slides.shaky + p.slides.understood > 0;
    return {
      step: 'learn',
      href: `/learn/${documentId}${p.slides.resume !== null ? `?slide=${p.slides.resume + 1}` : ''}`,
      title: started ? 'Pick up the walkthrough' : 'Walk through the deck',
      detail: started
        ? `${plural(p.slides.total - p.slides.understood - p.slides.shaky, 'slide')} left to check. Each one ends with a quick self-check.`
        : `Go slide by slide: a plain-language explanation, a visual, and a quick self-check for each of ${plural(p.slides.total, 'slide')} worth studying.`,
      cta: started ? 'Continue walkthrough' : 'Start walkthrough',
    };
  }
  if (p.cards.due > 0)
    return {
      step: 'flashcards',
      href: `/flashcards/${documentId}`,
      title: backlog ? 'Clear your review backlog' : 'Lock in the vocabulary',
      detail: `${plural(p.cards.due, 'card')} ${p.cards.due === 1 ? 'is' : 'are'} ready. Recall each one before you flip it.`,
      cta: 'Review flashcards',
    };
  if (!done('quiz') && p.quiz.questions)
    return {
      step: 'quiz',
      href: `/quiz/${documentId}`,
      title: p.quiz.attempts ? 'Close the gaps' : 'Test yourself',
      detail: p.quiz.attempts
        ? `Your best is ${p.quiz.bestScore}%. ${p.quiz.lastMissed ? `Revisit the ${plural(p.quiz.lastMissed, 'question')} you missed last time, then try a fresh set.` : 'Try a fresh set of questions.'}`
        : 'Retrieval practice shows what actually stuck. Each answer comes with an explanation.',
      cta: p.quiz.attempts ? 'Take another quiz' : 'Start a quiz',
    };
  if (!done('workbench') && p.workbench.topics)
    return {
      step: 'workbench',
      href: `/workbench/${documentId}`,
      title: p.workbench.due ? 'Revisit a topic' : 'Apply it to new problems',
      detail: p.workbench.due
        ? `${plural(p.workbench.due, 'topic')} ${p.workbench.due === 1 ? 'is' : 'are'} due for practice from memory.`
        : 'Work through each topic: understand, recall, then apply to unfamiliar scenarios.',
      cta: p.workbench.due ? 'Review topic' : 'Open workbench',
    };
  return {
    step: 'verbal',
    href: `/verbal/${documentId}`,
    title: 'You’re caught up',
    detail:
      'Explain the material out loud to find anything you can’t put into words yet.',
    cta: 'Start voice practice',
  };
}
