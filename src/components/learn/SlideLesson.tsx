'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DocumentSlide } from '@/lib/document-slides';
import type {
  SlideExplanation,
  SlideStatus,
  SlideThread,
} from '@/lib/slide-tutor';
import TutorExplanation from './TutorExplanation';
import { Icon } from '../ui';

interface Lesson {
  slide: DocumentSlide;
  explanation: SlideExplanation | null;
  thread: SlideThread | null;
}
const SUGGESTIONS = [
  'Explain it more simply',
  'Give me a different example',
  'Why does this matter?',
  'How does this connect to the previous slide?',
];

async function json(response: Response) {
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || 'Something went wrong. Please retry.'),
      { status: response.status, data },
    );
  return data;
}

/** Attempt the self-check from memory, reveal, then rate honestly. */
function SelfCheck({
  check,
  status,
  onRate,
}: {
  check: SlideExplanation['check'];
  status: SlideStatus | null;
  onRate: (status: SlideStatus) => void;
}) {
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  // Counts fresh "Got it" taps so each one replays the burst.
  const [cheers, setCheers] = useState(0);
  const rated = status === 'understood' || status === 'shaky';
  return (
    <section className={`self-check ${revealed || !check ? 'is-open' : ''}`}>
      <span className="eyebrow">
        {check ? 'Check yourself' : 'How did this slide land?'}
      </span>
      {check && (
        <>
          <h3>{check.question}</h3>
          {!revealed ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setRevealed(true);
              }}
            >
              <label className="sr-only" htmlFor="self-check-answer">
                Your answer
              </label>
              <textarea
                id="self-check-answer"
                className="textarea"
                rows={3}
                placeholder="Answer from memory first. Even a rough guess helps it stick."
                value={attempt}
                onChange={(e) => setAttempt(e.target.value)}
              />
              <button className="secondary-button" type="submit">
                {attempt.trim()
                  ? 'Compare with the answer'
                  : 'Reveal the answer'}
              </button>
            </form>
          ) : (
            <div className="self-check-reveal">
              {attempt.trim() && (
                <div>
                  <span className="eyebrow">You said</span>
                  <p>{attempt}</p>
                </div>
              )}
              <div>
                <span className="eyebrow">Answer</span>
                <p>{check.answer}</p>
              </div>
            </div>
          )}
        </>
      )}
      {(revealed || !check) && (
        <div className="self-check-rate">
          <p>
            {check ? 'Be honest: did you have it?' : 'Rate your understanding.'}
          </p>
          <div>
            <button
              className={`rate-button is-good ${status === 'understood' ? 'is-chosen' : ''}`}
              aria-pressed={status === 'understood'}
              onClick={() => {
                if (status !== 'understood') setCheers((c) => c + 1);
                onRate('understood');
              }}
            >
              <Icon name="check" size={16} /> Got it
              {cheers > 0 && status === 'understood' && (
                <span key={cheers} className="rate-burst" aria-hidden>
                  {Array.from({ length: 10 }, (_, i) => (
                    <i
                      key={i}
                      style={{ '--a': `${i * 36}deg` } as CSSProperties}
                    />
                  ))}
                </span>
              )}
            </button>
            <button
              className={`rate-button is-shaky ${status === 'shaky' ? 'is-chosen' : ''}`}
              aria-pressed={status === 'shaky'}
              onClick={() => onRate('shaky')}
            >
              ~ Still shaky
            </button>
          </div>
          {rated && (
            <small>
              {status === 'understood'
                ? 'Marked as understood. Shaky slides stay flagged so you can return to them.'
                : 'Flagged for another look. Try a follow-up question below.'}
            </small>
          )}
        </div>
      )}
    </section>
  );
}

export default function SlideLesson({
  documentId,
  slideId,
  status,
  onRate,
  onNext,
  isLast,
  onReady,
  onLoaded,
  skipped,
  onInclude,
}: {
  documentId: string;
  slideId: string;
  status: SlideStatus | null;
  onRate: (status: SlideStatus) => void;
  onNext: () => void;
  isLast: boolean;
  onReady: () => void;
  onLoaded: (slide: DocumentSlide) => void;
  /** Why the slide was skipped; skipped slides aren't explained automatically. */
  skipped: string | null;
  onInclude: () => void;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'loading' | 'explaining' | 'ready'>(
    'loading',
  );
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const [retry, setRetry] = useState(0);
  const requestId = useRef<{ text: string; id: string } | null>(null);
  const alive = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  const loaded = useRef(onLoaded);
  const endpoint = `/api/learn/${documentId}/slides/${slideId}`;
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
    loaded.current = onLoaded;
  }, [onReady, onLoaded]);
  const isSkipped = !!skipped;

  // Load, and explain automatically the first time a slide is opened.
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    (async () => {
      const data: Lesson = await json(
        await fetch(endpoint, { signal: abort.signal }),
      );
      if (abort.signal.aborted) return;
      setLesson(data);
      loaded.current(data.slide);
      if (data.explanation || isSkipped) {
        setPhase('ready');
        ready.current();
        return;
      }
      setPhase('explaining');
      const result = await json(
        await fetch(endpoint, {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'explain' }),
        }),
      );
      if (abort.signal.aborted) return;
      setLesson((l) => l && { ...l, explanation: result.explanation });
      setPhase('ready');
      ready.current();
    })().catch((e) => {
      if (abort.signal.aborted) return;
      setError(e.message);
      setPhase('ready');
    });
    return () => {
      alive.current = false;
      abort.abort();
    };
  }, [endpoint, retry, isSkipped]);

  // Follow new replies, but always open a slide at the top.
  useEffect(() => {
    if (asked.current)
      bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lesson?.thread?.revision]);

  async function ask(text = draft) {
    const message = text.trim();
    if (asking || !lesson?.explanation || !message) return;
    setAsking(true);
    asked.current = true;
    setError('');
    setDraft(message);
    if (requestId.current?.text !== message)
      requestId.current = { text: message, id: crypto.randomUUID() };
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ask',
          message,
          requestId: requestId.current.id,
          revision: lesson.thread?.revision ?? 0,
        }),
      });
      const result = await res.json();
      if (!alive.current) return;
      if (result.thread) setLesson((l) => l && { ...l, thread: result.thread });
      if (!res.ok) throw new Error(result.error || 'Could not answer that.');
      setDraft('');
      requestId.current = null;
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setAsking(false);
    }
  }

  if (phase === 'loading')
    return (
      <div className="slide-pane">
        <div
          className="slide-skeleton"
          role="status"
          aria-label="Loading slide"
        >
          <span className="skeleton" style={{ width: '40%', height: 14 }} />
          <span className="skeleton" style={{ width: '85%', height: 40 }} />
          <span className="skeleton" style={{ width: '100%', height: 120 }} />
        </div>
      </div>
    );
  if (!lesson)
    return (
      <div className="slide-pane">
        <div className="empty-state">
          <h3>This slide didn’t load.</h3>
          <p role="alert">{error}</p>
          <button
            className="secondary-button"
            onClick={() => {
              setError('');
              setPhase('loading');
              setRetry((r) => r + 1);
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );

  const { slide, explanation, thread } = lesson;
  return (
    <div className="slide-pane">
      <div className="slide-scroll">
        {phase === 'explaining' ? (
          <div className="slide-writing" role="status">
            <span className="eyebrow">
              <b className="dot is-live" /> Writing a plain-language explanation
            </span>
            <h2 className="display">{slide.title}</h2>
            <div className="slide-writing-lines" aria-hidden>
              {[92, 78, 85, 60, 88, 70].map((w, i) => (
                <span
                  key={i}
                  className="skeleton"
                  style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
            <p className="muted">
              Usually 10–20 seconds. The next slide is prepared while you read
              this one.
            </p>
          </div>
        ) : explanation ? (
          <>
            {skipped && (
              <p className="notice slide-skip-note">
                <span>
                  Skipped: {skipped.toLowerCase()}. It doesn’t count toward your
                  progress.
                </span>
                <button className="text-button" onClick={onInclude}>
                  Count it anyway
                </button>
              </p>
            )}
            <TutorExplanation value={explanation} />
          </>
        ) : (
          <div className="slide-intro">
            <h2 className="display">{slide.title}</h2>
            {skipped ? (
              <>
                <p className="notice">
                  Mnemo skipped this slide ({skipped.toLowerCase()}), so it
                  doesn’t count toward your progress. If it does have something
                  worth learning, add it back.
                </p>
                <div className="page-head-actions">
                  <button className="primary-button" onClick={onInclude}>
                    Study this slide anyway
                  </button>
                  <button className="ghost-button" onClick={onNext}>
                    {isLast ? 'Finish the deck' : 'Skip to the next slide'} →
                  </button>
                </div>
              </>
            ) : (
              <>
                {error && (
                  <p className="notice" role="status">
                    {error}
                  </p>
                )}
                {!error && (
                  <p className="muted">
                    There’s no explanation for this slide yet.
                  </p>
                )}
                <button
                  className="secondary-button"
                  onClick={() => {
                    setError('');
                    setPhase('loading');
                    setRetry((r) => r + 1);
                  }}
                >
                  <Icon name="refresh" size={15} /> Try explaining again
                </button>
              </>
            )}
          </div>
        )}

        {phase === 'ready' && !skipped && (
          <SelfCheck
            key={slideId}
            check={explanation?.check ?? null}
            status={status}
            onRate={onRate}
          />
        )}

        {thread?.messages.map((m) =>
          m.role === 'user' ? (
            <div className="slide-question" key={m.id}>
              <span className="eyebrow">You asked</span>
              <p>{m.content}</p>
            </div>
          ) : (
            <div className="slide-reply" key={m.id}>
              {m.reply ? (
                <TutorExplanation value={m.reply} compact />
              ) : (
                <p>{m.content}</p>
              )}
            </div>
          ),
        )}
        {asking && (
          <div className="slide-reply is-pending" role="status">
            <span className="dot is-live" /> Thinking it through…
          </div>
        )}
        {error && explanation && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}

        <details className="slide-transcript">
          <summary>Slide text and speaker notes</summary>
          <p>{slide.text || 'No readable text on this slide.'}</p>
          {slide.notes && (
            <>
              <span className="eyebrow">Speaker notes</span>
              <p>{slide.notes}</p>
            </>
          )}
          {slide.text_truncated && (
            <p className="muted">
              Long source text was shortened for the explanation.
            </p>
          )}
        </details>

        <div className="slide-next">
          <button
            className={
              status === 'understood' || status === 'shaky'
                ? 'primary-button is-large'
                : 'secondary-button is-large'
            }
            onClick={onNext}
          >
            {isLast ? 'Finish the deck' : 'Next slide'}{' '}
            <span className="arrow">→</span>
          </button>
          <span className="muted">
            or press <kbd className="kbd">→</kbd>
          </span>
        </div>
        <div ref={bottom} />
      </div>

      <form
        className="slide-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        {explanation && !thread?.messages.length && !asking && (
          <div className="slide-suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => void ask(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="slide-composer-box">
          <label htmlFor="slide-question" className="sr-only">
            Ask about this slide
          </label>
          <textarea
            id="slide-question"
            value={draft}
            maxLength={4000}
            rows={1}
            disabled={!explanation || asking}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            placeholder={
              explanation
                ? 'Ask anything about this slide…'
                : 'Questions open once the slide is explained.'
            }
          />
          <button
            className="icon-button slide-send"
            type="submit"
            aria-label="Ask"
            disabled={!explanation || !draft.trim() || asking}
          >
            <Icon name="send" />
          </button>
        </div>
      </form>
    </div>
  );
}
