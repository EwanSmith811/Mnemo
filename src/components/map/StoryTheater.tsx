'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '@/lib/use-modal-focus';
import {
  splitForSpeech,
  speakable,
  storySegments,
  type CastMember,
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
const TITLE_SCENE = -2;
const CAST_SCENE = -1;
const MORAL_SCENE = 1000;

function Ornament({ seed }: { seed: number }) {
  // A small hand-drawn divider; the shape varies so scenes don't feel stamped.
  const paths = [
    'M4 12c8-8 16 8 24 0s16 8 24 0 16 8 24 0',
    'M4 12h22m8 0h0m8 0h22',
    'M4 14c10-10 20-10 30 0s20 10 38-2',
  ];
  return (
    <svg className="story-ornament" viewBox="0 0 80 24" aria-hidden>
      <path d={paths[seed % paths.length]} />
      <circle cx="40" cy="12" r="3" />
    </svg>
  );
}

export default function StoryTheater({
  documentId,
  concepts,
  onClose,
}: {
  documentId: string;
  concepts: TheaterConcept[];
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState('');
  const [cast, setCast] = useState<CastMember[]>([]);
  const [scenes, setScenes] = useState<string[]>([]);
  const [moral, setMoral] = useState('');
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
  // Narrator chunk index -> cast member announced in the roll call.
  const rollCall = useRef(new Map<number, number>());
  const [announced, setAnnounced] = useState<number | null>(null);
  const panel = useModalFocus(true, onClose);

  // Write (or rewrite) the story, feeding the narrator as each piece lands.
  useEffect(() => {
    const abort = new AbortController();
    const n = new Narrator(
      voiceRef.current,
      setNarration,
      (scene, chunk) => {
        setActiveScene(scene);
        setAnnounced(rollCall.current.get(chunk) ?? null);
      },
      setNotice,
    );
    narrator.current = n;
    rollCall.current = new Map();
    let sceneCount = 0;
    let billed = 0;
    const handle = (event: StoryEvent) => {
      if (event.type === 'title') {
        setTitle(event.text);
        n.append(TITLE_SCENE, [event.text + '.']);
      } else if (event.type === 'cast') {
        setCast((c) => [...c, event]);
        // A roll call fills the wait for scene one and pairs each name with
        // its concept, which is the whole point of the story.
        const member = billed++;
        rollCall.current.set(
          n.append(CAST_SCENE, [
            `${member === 0 ? 'Starring ' : ''}${event.name}, as ${event.concept}.`,
          ]),
          member,
        );
      } else if (event.type === 'scene') {
        setScenes((s) => [...s, event.text]);
        n.append(event.index, splitForSpeech(event.text, sceneCount++ === 0));
      } else if (event.type === 'moral') {
        setMoral(event.text);
        n.append(MORAL_SCENE, splitForSpeech(event.text));
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
        body: JSON.stringify({ conceptIds: concepts.map((c) => c.id) }),
      });
      if (!res.ok || !res.body)
        throw new Error(
          (await res.json().catch(() => null))?.error ||
            'Could not write the story.',
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
  }, [documentId, concepts, attempt]);

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

  // Character names → cast number and topic color.
  const characters = useMemo(() => {
    const map = new Map<
      string,
      { n: number; color: string; concept: string }
    >();
    cast.forEach((c, i) =>
      map.set(c.name.toLowerCase(), {
        n: i + 1,
        concept: c.concept,
        color:
          concepts.find((x) => x.id === c.conceptId)?.color ?? 'var(--accent)',
      }),
    );
    return map;
  }, [cast, concepts]);

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
    ...scenes.map(speakable),
    moral,
    '',
    ...cast.map((c) => `${c.name} = ${c.concept}: ${c.meaning}`),
  ].join('\n\n');

  return createPortal(
    <div
      ref={panel}
      className="story-theater"
      role="dialog"
      aria-modal="true"
      aria-label="Memory story"
      tabIndex={-1}
    >
      <header className="story-bar">
        <span className="eyebrow">
          <b>●</b> Memory story · {concepts.length} concepts
        </span>
        <div className="story-bar-tools">
          <button
            className={`primary-button story-play ${narration === 'playing' ? 'is-playing' : ''}`}
            disabled={!scenes.length && !title}
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
            aria-label="Close story"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>

      <div className="story-stage">
        <aside className="story-cast" aria-label="Cast">
          <div className="story-cast-head">
            <span className="eyebrow">The cast</span>
            {cast.length > 0 && (
              <button
                className="text-button"
                aria-pressed={quiz}
                onClick={() => {
                  setQuiz((q) => !q);
                  setRevealed(new Set());
                }}
              >
                {quiz ? 'Show all answers' : 'Quiz me on the cast'}
              </button>
            )}
          </div>
          <ol>
            {cast.map((c, i) => {
              const hidden = quiz && !revealed.has(i);
              const color = characters.get(c.name.toLowerCase())?.color;
              return (
                <li
                  key={i}
                  className={`story-cast-card ${narrating && activeScene === CAST_SCENE && announced === i ? 'is-announced' : ''}`}
                  ref={(el) => {
                    if (
                      el &&
                      narrating &&
                      activeScene === CAST_SCENE &&
                      announced === i
                    )
                      el.scrollIntoView({
                        block: 'nearest',
                        behavior: 'smooth',
                      });
                  }}
                  style={{ '--c': color, '--i': i } as CSSProperties}
                >
                  <span className="story-cast-n mono">{i + 1}</span>
                  <strong>{c.name}</strong>
                  {hidden ? (
                    <button
                      className="story-cast-reveal"
                      onClick={() => setRevealed((r) => new Set(r).add(i))}
                    >
                      Who is this really? Tap to check
                    </button>
                  ) : (
                    <span className="story-cast-term">
                      <em>is</em> {c.concept}
                      {c.meaning && <small>{c.meaning}</small>}
                    </span>
                  )}
                </li>
              );
            })}
            {status === 'writing' &&
              concepts
                .filter((c) => !cast.some((m) => m.conceptId === c.id))
                .map((c) => (
                  <li
                    key={c.id}
                    className="story-cast-card is-pending"
                    style={{ '--c': c.color } as CSSProperties}
                  >
                    <span className="story-cast-n mono">?</span>
                    <strong>Auditioning…</strong>
                    <span className="story-cast-term">{c.label}</span>
                  </li>
                ))}
          </ol>
        </aside>

        <article className="story-page">
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
                <span className="dot is-live" /> Casting {concepts.length} very
                strange characters…
              </div>
            )
          )}
          {scenes.map((text, i) => (
            <section
              key={i}
              ref={(el) => {
                if (el) sceneRefs.current.set(i, el);
              }}
              className={`story-scene ${narrating ? (activeScene === i ? 'is-active' : 'is-dim') : ''}`}
            >
              <button
                className="story-scene-n mono"
                onClick={() => narrator.current?.seekScene(i)}
                aria-label={`Read scene ${i + 1} aloud`}
                title="Read from here"
              >
                Scene {String(i + 1).padStart(2, '0')}
              </button>
              <p className={i === 0 ? 'has-dropcap' : ''}>
                {storySegments(text).map((part, j) => {
                  if (!part.character) return part.text;
                  const who = characters.get(part.text.toLowerCase());
                  return (
                    <mark
                      key={j}
                      style={
                        {
                          '--c': who?.color ?? 'var(--accent)',
                        } as CSSProperties
                      }
                      title={who ? `${part.text} = ${who.concept}` : undefined}
                    >
                      {part.text}
                      {who && <sup className="mono">{who.n}</sup>}
                    </mark>
                  );
                })}
              </p>
              {i < scenes.length - 1 && <Ornament seed={i} />}
            </section>
          ))}
          {status === 'writing' && title && (
            <div className="story-writing" role="status">
              <span className="dot is-live" /> Writing scene {scenes.length + 1}
              …
            </div>
          )}
          {moral && (
            <blockquote
              ref={(el) => {
                if (el) sceneRefs.current.set(MORAL_SCENE, el);
              }}
              className={`story-moral ${narrating && activeScene === MORAL_SCENE ? 'is-active' : ''}`}
            >
              {moral}
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
                  setCast([]);
                  setScenes([]);
                  setMoral('');
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
                      .then(() => setNotice('Story copied.'));
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
      </div>
    </div>,
    document.body,
  );
}
