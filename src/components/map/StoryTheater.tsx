'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '@/lib/use-modal-focus';
import {
  splitForSpeech,
  termSegments,
  type StoryBit,
  type StoryEvent,
} from '@/lib/memory-story';
import { Narrator, type NarratorState } from './narrator';
import { Icon } from '../ui';

export interface TheaterConcept {
  id: string;
  label: string;
  color: string;
}
const VOICES = [
  ['alloy', 'Alloy'],
  ['male', 'Onyx'],
  ['woman', 'Coral'],
] as const;
const TITLE_SCENE = -1;
const ENCORE_SCENE = 1000;

export default function StoryTheater({
  documentId,
  concepts,
  interests,
  onClose,
}: {
  documentId: string;
  concepts: TheaterConcept[];
  interests: string;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState('');
  const [bits, setBits] = useState<StoryBit[]>([]);
  const [encore, setEncore] = useState('');
  const [status, setStatus] = useState<'writing' | 'done' | 'error'>('writing');
  const [error, setError] = useState('');
  const [voice, setVoice] = useState<string>('alloy');
  const [narration, setNarration] = useState<NarratorState>('idle');
  const [activeScene, setActiveScene] = useState<number | null>(null);
  const [quiz, setQuiz] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState('');
  const narrator = useRef<Narrator | null>(null);
  const voiceRef = useRef(voice);
  const sceneRefs = useRef(new Map<number, HTMLElement>());
  const panel = useModalFocus(true, onClose);

  // Write (or rewrite) the riffs, feeding the narrator as each one lands.
  useEffect(() => {
    const abort = new AbortController();
    const n = new Narrator(
      voiceRef.current,
      setNarration,
      setActiveScene,
      setNotice,
    );
    narrator.current = n;
    let count = 0;
    const handle = (event: StoryEvent) => {
      if (event.type === 'title') {
        setTitle(event.text);
        n.append(TITLE_SCENE, [event.text + '.']);
      } else if (event.type === 'bit') {
        setBits((b) => [...b, event]);
        n.append(count, splitForSpeech(event.line, count++ === 0));
      } else if (event.type === 'encore') {
        setEncore(event.text);
        n.append(ENCORE_SCENE, splitForSpeech(event.text));
      } else if (event.type === 'done') {
        setStatus('done');
        n.finish();
      } else if (event.type === 'error') throw new Error(event.message);
    };
    (async () => {
      const res = await fetch(`/api/graph/${documentId}/story`, {
        method: 'POST',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptIds: concepts.map((c) => c.id),
          interests,
        }),
      });
      if (!res.ok || !res.body)
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            'Could not write the riffs.',
        );
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop()!;
        for (const line of lines) if (line.trim()) handle(JSON.parse(line));
        if (done) break;
      }
      if (pending.trim()) handle(JSON.parse(pending));
      n.finish();
    })().catch((e) => {
      if (abort.signal.aborted) return;
      setError(e.message);
      setStatus('error');
      n.finish();
    });
    return () => {
      abort.abort();
      n.destroy();
    };
  }, [documentId, concepts, interests, attempt]);

  // Voice changes go to the live narrator rather than rewriting the story.
  useEffect(() => {
    voiceRef.current = voice;
    narrator.current?.setVoice(voice);
  }, [voice]);
  useEffect(() => {
    if (activeScene === null || narration === 'idle') return;
    sceneRefs.current
      .get(activeScene)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeScene, narration]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== ' ' || (e.target as HTMLElement).closest('button, input'))
        return;
      e.preventDefault();
      if (narration === 'playing') narrator.current?.pause();
      else narrator.current?.play();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [narration]);

  const colorOf = (id: string) =>
    concepts.find((c) => c.id === id)?.color ?? 'var(--accent)';

  const narrating = narration !== 'idle' && narration !== 'done';
  const playLabel =
    narration === 'playing'
      ? 'Pause'
      : narration === 'loading'
        ? 'Starting…'
        : narration === 'waiting'
          ? 'Waiting for the next scene…'
          : narration === 'paused'
            ? 'Resume'
            : narration === 'done'
              ? 'Listen again'
              : 'Read it aloud';
  const fullText = [
    title,
    ...bits.map(
      (b, i) => `${i + 1}. ${b.line}\n   (${b.concept}: ${b.meaning})`,
    ),
    encore,
  ].join('\n\n');
  const pending = concepts.filter(
    (c) => !bits.some((b) => b.conceptId === c.id),
  );

  return createPortal(
    <div
      ref={panel}
      className="story-theater"
      role="dialog"
      aria-modal="true"
      aria-label="Memory riffs"
      tabIndex={-1}
    >
      <header className="story-bar">
        <span className="eyebrow">
          Memory riffs · {concepts.length} concepts
        </span>
        <div className="story-bar-tools">
          <button
            className={`primary-button story-play ${narration === 'playing' ? 'is-playing' : ''}`}
            disabled={!bits.length && !title}
            onClick={() =>
              narration === 'playing'
                ? narrator.current?.pause()
                : narrator.current?.play()
            }
          >
            <span className="story-play-icon" aria-hidden>
              {narration === 'playing' ? (
                <Icon name="stop" size={14} />
              ) : narration === 'loading' || narration === 'waiting' ? (
                <span className="loading-spinner" />
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
                </svg>
              )}
            </span>
            {playLabel}
            {narration === 'playing' && (
              <span className="story-eq" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            )}
          </button>
          <div className="segmented" aria-label="Narrator voice">
            {VOICES.map(([id, name]) => (
              <button
                key={id}
                aria-pressed={voice === id}
                onClick={() => setVoice(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            aria-label="Close memory riffs"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>

      <article className="story-page">
        <header className="riff-head">
          {title ? (
            <h1
              ref={(el) => {
                if (el) sceneRefs.current.set(TITLE_SCENE, el);
              }}
              className={`story-title ${narrating && activeScene === TITLE_SCENE ? 'is-active' : ''}`}
            >
              {title}
            </h1>
          ) : (
            status !== 'error' && (
              <div className="story-writing" role="status">
                <span className="dot is-live" /> Workshopping {concepts.length}{' '}
                terrible jokes…
              </div>
            )
          )}
          {bits.length > 0 && (
            <button
              className="secondary-button is-small"
              aria-pressed={quiz}
              onClick={() => {
                setQuiz((q) => !q);
                setRevealed(new Set());
              }}
            >
              {quiz ? 'Show every answer' : 'Quiz me: hide the terms'}
            </button>
          )}
        </header>

        <ol className="riff-list">
          {bits.map((bit, i) => {
            const hidden = quiz && !revealed.has(i);
            return (
              <li
                key={bit.conceptId}
                ref={(el) => {
                  if (el) sceneRefs.current.set(i, el);
                }}
                className={`riff ${narrating ? (activeScene === i ? 'is-active' : 'is-dim') : ''} ${hidden ? 'is-hidden' : ''}`}
                style={
                  { '--c': colorOf(bit.conceptId), '--i': i } as CSSProperties
                }
              >
                <button
                  className="riff-n mono"
                  onClick={() => narrator.current?.seekScene(i)}
                  aria-label={`Read line ${i + 1} aloud`}
                  title="Read from here"
                >
                  {String(i + 1).padStart(2, '0')}
                </button>
                <p className="riff-line">
                  {termSegments(bit.line, bit.concept).map((part, j) =>
                    !part.term ? (
                      part.text
                    ) : hidden ? (
                      <span
                        key={j}
                        className="riff-blank"
                        aria-label="hidden term"
                      >
                        {part.text}
                      </span>
                    ) : (
                      <mark key={j}>{part.text}</mark>
                    ),
                  )}
                </p>
                {hidden ? (
                  <button
                    className="riff-reveal"
                    onClick={() => setRevealed((r) => new Set(r).add(i))}
                  >
                    Which concept is this? Tap to check
                  </button>
                ) : (
                  <p className="riff-meaning">
                    <strong>{bit.concept}</strong>
                    {bit.meaning && <span>{bit.meaning}</span>}
                  </p>
                )}
              </li>
            );
          })}
          {status === 'writing' &&
            title &&
            pending.slice(0, 3).map((c, i) => (
              <li
                key={c.id}
                className="riff is-pending"
                style={{ '--c': c.color, '--i': i } as CSSProperties}
              >
                <span className="riff-n mono">··</span>
                <p className="riff-line">
                  <span className="riff-shimmer" />
                </p>
                <p className="riff-meaning">
                  <strong>{c.label}</strong>
                  {i === 0 && <span>Writing…</span>}
                </p>
              </li>
            ))}
        </ol>

        {encore && (
          <blockquote
            ref={(el) => {
              if (el) sceneRefs.current.set(ENCORE_SCENE, el);
            }}
            className={`story-moral ${narrating && activeScene === ENCORE_SCENE ? 'is-active' : ''}`}
          >
            <span className="eyebrow">Encore</span>
            {encore}
          </blockquote>
        )}
        {error && (
          <div className="inline-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {notice && <p className="muted story-notice">{notice}</p>}
        {status !== 'writing' && (
          <footer className="story-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setTitle('');
                setBits([]);
                setEncore('');
                setError('');
                setNotice('');
                setStatus('writing');
                setNarration('idle');
                setActiveScene(null);
                setAttempt((a) => a + 1);
              }}
            >
              <Icon name="refresh" size={15} /> Another take
            </button>
            {status === 'done' && (
              <button
                className="ghost-button"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(fullText)
                    .then(() => setNotice('Copied.'));
                }}
              >
                Copy the text
              </button>
            )}
            <small className="muted">
              Narration uses an AI-generated voice. Space plays and pauses.
            </small>
          </footer>
        )}
      </article>
    </div>,
    document.body,
  );
}
