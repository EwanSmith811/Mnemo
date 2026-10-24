'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useModalFocus } from '@/lib/use-modal-focus';
import type {
  UploadPreview,
  UploadResult,
  UploadStage,
} from '@/lib/upload-progress';
import { Constellation, type Phase } from './generation/constellation';
import { LogoMark } from './Logo';

export interface GenerationState {
  stage: UploadStage;
  ready: { graph: boolean; materials: boolean };
  preview: UploadPreview | null;
  concepts: string[];
  result: UploadResult | null;
}

const STAGES = [
  {
    id: 'uploading',
    label: 'Upload',
    title: ['Uploading', 'your', 'deck'],
    detail: 'Sending your file to Mnemo.',
  },
  {
    id: 'reading',
    label: 'Read',
    title: ['Reading', 'the', 'slides'],
    detail: 'Extracting text, titles and speaker notes, page by page.',
  },
  {
    id: 'generating',
    label: 'Build',
    title: ['Building', 'your', 'study', 'set'],
    detail:
      'Mapping concepts and writing flashcards, practice questions and topic summaries.',
  },
  {
    id: 'saving',
    label: 'Save',
    title: ['Saving', 'your', 'study', 'set'],
    detail: 'Saving everything and preparing the slide-by-slide walkthrough.',
  },
] as const;
const WORK = [
  'Pulling out the key terms worth a flashcard',
  'Writing practice questions with explanations',
  'Summarising each topic in plain language',
  'Mapping which ideas depend on which',
  'Checking the output before anything is saved',
];
const pad = (n: number) => String(n).padStart(2, '0');

export default function GenerationScreen({
  filename,
  state,
  error,
  onRetry,
  onBack,
}: {
  filename: string;
  state: GenerationState;
  error: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { stage, ready, preview, concepts, result } = state;
  const complete = !!result;
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [log, setLog] = useState<{ id: number; text: string; tone?: string }[]>(
    [],
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Constellation | null>(null);
  const logId = useRef(0);
  const panel = useModalFocus(true, () => {});
  // Focus the dialog itself rather than its first button.
  useEffect(() => panel.current?.focus(), [panel]);
  const phase: Phase = error ? 'error' : complete ? 'complete' : stage;
  const index = STAGES.findIndex((s) => s.id === stage);
  const current = STAGES[index];

  const push = useCallback(
    (text: string, tone?: string) =>
      setLog((l) => [{ id: ++logId.current, text, tone }, ...l].slice(0, 7)),
    [],
  );

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  // Engine lifecycle.
  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const instance = new Constellation(canvas.current!, still);
    engine.current = instance;
    const resize = () => instance.resize();
    const move = (e: PointerEvent) => instance.point(e.clientX, e.clientY);
    const visibility = () => instance.setPaused(document.hidden);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      instance.destroy();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => engine.current?.setPhase(phase), [phase]);
  useEffect(() => engine.current?.setPaused(paused), [paused]);
  useEffect(() => {
    engine.current?.setLabels(
      concepts.length ? concepts : (preview?.titles ?? []),
    );
  }, [concepts, preview]);

  // Narrate real progress: slide titles while reading, concepts once mapped.
  useEffect(() => {
    const titles = preview?.titles ?? [];
    const instance = engine.current;
    if (!instance) return;
    instance.onSlide = (i) => {
      if (stage !== 'reading' || !titles.length) return;
      push(
        `Slide ${pad((i % titles.length) + 1)} — ${titles[i % titles.length]}`,
      );
    };
    return () => {
      instance.onSlide = undefined;
    };
  }, [preview, stage, push]);
  useEffect(() => {
    if (error) return;
    const opening: Record<UploadStage, string> = {
      uploading: `Sending ${filename}`,
      reading: 'Opening the deck',
      generating: 'Handing the material to the model',
      saving: 'Writing your study set to the library',
    };
    push(opening[stage], 'accent');
    if (stage !== 'generating') return;
    let i = 0;
    const timer = setInterval(() => push(WORK[i++ % WORK.length]), 3200);
    return () => clearInterval(timer);
  }, [stage, filename, error, push]);
  useEffect(() => {
    if (preview)
      push(
        `Found ${preview.slides ? `${preview.slides} slides · ` : ''}${preview.words.toLocaleString()} words`,
        'accent',
      );
  }, [preview, push]);
  useEffect(() => {
    if (!concepts.length) return;
    push(`Concept map ready · ${concepts.length} concepts`, 'good');
    let i = 0;
    const timer = setInterval(() => {
      if (i >= Math.min(concepts.length, 12)) return clearInterval(timer);
      push(`+ ${concepts[i++]}`);
    }, 260);
    return () => clearInterval(timer);
  }, [concepts, push]);
  useEffect(() => {
    if (ready.materials)
      push('Flashcards, questions and summaries ready', 'good');
  }, [ready.materials, push]);
  useEffect(() => {
    if (complete) push('Study set saved', 'good');
  }, [complete, push]);

  const title = error
    ? ['Upload', 'stopped']
    : complete
      ? ['Study', 'set', 'ready']
      : current.title;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-title"
      tabIndex={-1}
      className={`generation-screen phase-${phase} ${paused ? 'is-paused' : ''}`}
    >
      <canvas ref={canvas} className="generation-canvas" aria-hidden />

      <header className="generation-top">
        <span className="generation-brand">
          <LogoMark size={26} />
          Mnemo
        </span>
        <span className="generation-file mono" title={filename}>
          {filename}
        </span>
        <span className="generation-clock mono" aria-hidden>
          {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
        </span>
        <button
          className="generation-motion"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
        >
          {paused ? 'Resume motion' : 'Pause motion'}
        </button>
      </header>

      <section className="generation-main">
        <div className="generation-copy">
          <span className="generation-stage-index mono" aria-hidden>
            {complete
              ? '✓'
              : error
                ? '!'
                : `Step ${index + 1} of ${STAGES.length}`}
          </span>
          <div role="status" aria-live="polite" aria-atomic="true">
            <h1
              id="generation-title"
              key={title.join(' ')}
              className="generation-title"
            >
              {title.join(' ')}
            </h1>
            <p className="generation-detail">
              {error ||
                (complete
                  ? 'Your study set is saved. Opening your study plan…'
                  : current.detail)}
            </p>
          </div>
          {error ? (
            <div className="generation-recovery">
              <button className="primary-button" onClick={onRetry}>
                Try again
              </button>
              <button className="secondary-button" onClick={onBack}>
                Back to upload
              </button>
              <Link className="text-button" href="/#library" onClick={onBack}>
                Check the library
              </Link>
            </div>
          ) : (
            <ol className="generation-log" aria-hidden>
              {log.map((line) => (
                <li
                  key={line.id}
                  className={line.tone ? `is-${line.tone}` : ''}
                >
                  {line.text}
                </li>
              ))}
            </ol>
          )}
        </div>

        <dl className="generation-stats" aria-label="What Mnemo found">
          <div>
            <dt>Slides</dt>
            <dd>{preview ? preview.slides.toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt>Words read</dt>
            <dd>{preview ? preview.words.toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt>Concepts</dt>
            <dd>
              {result
                ? result.concept_node_count
                : concepts.length
                  ? concepts.length
                  : '—'}
            </dd>
          </div>
          <div>
            <dt>Flashcards</dt>
            <dd>{result ? result.flashcard_count : '—'}</dd>
          </div>
          <div>
            <dt>Questions</dt>
            <dd>{result ? result.quiz_question_count : '—'}</dd>
          </div>
        </dl>
      </section>

      <footer className="generation-rail">
        <ol>
          {STAGES.map((s, i) => (
            <li
              key={s.id}
              className={
                complete || i < index
                  ? 'is-done'
                  : i === index
                    ? 'is-active'
                    : ''
              }
              aria-current={!complete && i === index ? 'step' : undefined}
            >
              <span className="generation-rail-bar">
                <i />
              </span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
        <p className="generation-hint">
          {complete
            ? 'Saved to your library.'
            : seconds >= 90
              ? 'Long decks take a few minutes. Keep this tab open; your study plan opens automatically.'
              : 'Keep this tab open. Your study plan opens automatically.'}
        </p>
      </footer>
    </div>,
    document.body,
  );
}
