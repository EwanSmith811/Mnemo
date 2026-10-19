'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useModalFocus } from '@/lib/use-modal-focus';
import type { UploadStage } from '@/lib/upload-progress';

const stages = [
  {
    id: 'uploading',
    label: 'Upload document',
    title: 'Knowledge, incoming.',
    detail: 'Sending your source material to Mnemo.',
  },
  {
    id: 'reading',
    label: 'Read the source',
    title: 'Finding the signal.',
    detail: 'Extracting the words, ideas, and context from your document.',
  },
  {
    id: 'generating',
    label: 'Build study tools',
    title: 'Making connections.',
    detail:
      'Turning your source into concepts, flashcards, practice questions, and summaries.',
  },
  {
    id: 'saving',
    label: 'Save your material',
    title: 'Everything in place.',
    detail: 'Saving your study tools and getting your dashboard ready.',
  },
] as const;
const points = Array.from({ length: 18 }, (_, i) => {
  const angle = ((i % 6) * Math.PI) / 3 + Math.floor(i / 6) * 0.29;
  const radius = 105 + Math.floor(i / 6) * 62;
  return {
    x: 300 + Math.cos(angle) * radius,
    y: 300 + Math.sin(angle) * radius,
  };
});

export default function GenerationScreen({
  filename,
  stage,
  ready,
  error,
  complete,
  onRetry,
  onBack,
}: {
  filename: string;
  stage: UploadStage;
  ready: { graph: boolean; materials: boolean };
  error: string;
  complete: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const panel = useModalFocus(true, () => {});
  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  const index = stages.findIndex((s) => s.id === stage);
  const current = stages[index];
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-title"
      tabIndex={-1}
      className={`generation-screen ${paused || hidden || error ? 'motion-paused' : ''} ${complete ? 'is-complete' : ''} ${error ? 'has-error' : ''}`}
    >
      <header className="generation-header">
        <span className="generation-brand">
          mnemo<span>.</span>
        </span>
        <span className="generation-filename" title={filename}>
          {filename}
        </span>
        <button
          className="generation-motion"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
        >
          {paused ? 'Resume animation' : 'Pause animation'}
        </button>
      </header>
      <div className="generation-body">
        <div className="generation-reactor" aria-hidden="true">
          <div className="reactor-disc reactor-disc-outer" />
          <div className="reactor-disc reactor-disc-inner" />
          <svg className="reactor-network" viewBox="0 0 600 600" fill="none">
            <circle
              cx="300"
              cy="300"
              r="272"
              stroke="currentColor"
              strokeDasharray="1 13"
              className="reactor-ticks"
            />
            <g className="reactor-orbit">
              <circle
                cx="300"
                cy="300"
                r="246"
                stroke="currentColor"
                strokeDasharray="90 18 2 18"
              />
            </g>
            <g className="reactor-orbit reactor-orbit-reverse">
              <circle
                cx="300"
                cy="300"
                r="163"
                stroke="currentColor"
                strokeDasharray="170 80"
              />
            </g>
            {points.map((point, i) => (
              <g
                key={i}
                style={{ '--node-delay': `${i * -0.37}s` } as CSSProperties}
              >
                <path
                  className="reactor-link"
                  d={`M300 300 L${point.x} ${point.y}`}
                />
                <path
                  className="reactor-signal"
                  d={`M300 300 L${point.x} ${point.y}`}
                  pathLength="1"
                />
                {i >= 6 && (
                  <path
                    className="reactor-link"
                    d={`M${points[i - 6].x} ${points[i - 6].y} L${point.x} ${point.y}`}
                  />
                )}
                <rect
                  className="reactor-node"
                  x={point.x - 5}
                  y={point.y - 5}
                  width="10"
                  height="10"
                  rx="2"
                />
              </g>
            ))}
            <circle className="reactor-wave" cx="300" cy="300" r="46" />
            <circle
              className="reactor-wave reactor-wave-late"
              cx="300"
              cy="300"
              r="46"
            />
          </svg>
          <div className="reactor-source">
            <svg
              viewBox="0 0 48 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              {complete ? (
                <path d="m12 24 8 8 16-17" />
              ) : (
                <>
                  <path d="M14 7h13l9 9v25H14zM27 7v10h9M20 24h10M20 30h10M20 36h6" />
                  <path className="reactor-scan" d="M8 24h32" />
                </>
              )}
            </svg>
          </div>
          <span className="reactor-caption">
            One source. A whole new understanding.
          </span>
        </div>
        <div className="generation-copy">
          <div role="status" aria-live="polite" aria-atomic="true">
            <h1 id="generation-title">
              {error
                ? 'A connection interrupted.'
                : complete
                  ? 'Ready when you are.'
                  : current.title}
            </h1>
            <p className="generation-description">
              {error ||
                (complete
                  ? 'Your study material is saved. Opening your dashboard…'
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
              <Link href="/" onClick={onBack}>
                Check document library
              </Link>
            </div>
          ) : (
            <>
              <div className="generation-activity">
                <span className="generation-beacon" />
                <span>
                  {complete
                    ? 'Opening dashboard'
                    : stage === 'generating'
                      ? 'Study generation in progress'
                      : current.label}
                </span>
                <span className="generation-elapsed" aria-hidden="true">
                  {Math.floor(seconds / 60)}:
                  {String(seconds % 60).padStart(2, '0')}
                </span>
              </div>
              {stage === 'generating' && (
                <ul className="generation-results">
                  <li className={ready.graph ? 'is-ready' : ''}>
                    <span />
                    {ready.graph ? 'Concept map ready' : 'Connecting concepts'}
                  </li>
                  <li className={ready.materials ? 'is-ready' : ''}>
                    <span />
                    {ready.materials
                      ? 'Practice material ready'
                      : 'Building practice material'}
                  </li>
                </ul>
              )}
              <p className="generation-note">
                {seconds >= 90
                  ? 'Still working. Longer documents can take a few minutes. Keep this tab open; your dashboard will open automatically.'
                  : 'Keep this tab open. We’ll take you to your dashboard automatically.'}
              </p>
            </>
          )}
        </div>
      </div>
      <footer className="generation-footer" aria-label="Generation progress">
        <ol>
          {stages.map((s, i) => (
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
              <span className="generation-step-number">
                {complete || i < index ? (
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="m3 8 3 3 7-7" />
                  </svg>
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
        <span className="generation-footer-note">
          From information to understanding.
        </span>
      </footer>
    </div>,
    document.body,
  );
}
