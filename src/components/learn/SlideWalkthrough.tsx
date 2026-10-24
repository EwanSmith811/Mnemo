'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { DocumentSlide, SlideSummary } from '@/lib/document-slides';
import type { SlideStatus } from '@/lib/slide-tutor';
import { resumeIndex } from '@/lib/study-plan';
import SlideSource from './SlideSource';
import SlideLesson from './SlideLesson';
import ProgressRing from './ProgressRing';
import Confetti from './Confetti';
import { drawPage, loadPdf } from './source-cache';
import { Icon, PageLoading } from '../ui';

const THUMB_WIDTH = 116;

const thumbKey = (part: number, page: number) => `${part}:${page}`;

/**
 * Small images of each page, drawn once the current slide has had a head
 * start. Keyed by deck and page, since a study set has several decks.
 */
function useThumbnails(
  documentId: string,
  version: number,
  pages: { part: number; number: number }[],
) {
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const key = pages.map((p) => thumbKey(p.part, p.number)).join(',');
  useEffect(() => {
    if (!key) return;
    let live = true;
    const timer = setTimeout(async () => {
      const canvas = document.createElement('canvas');
      const made = new Map<string, string>();
      const wanted = key.split(',').map((k) => k.split(':').map(Number));
      for (const part of [...new Set(wanted.map(([p]) => p))]) {
        try {
          const pdf = await loadPdf(documentId, version, part);
          for (const [, page] of wanted.filter(([p]) => p === part)) {
            if (!live) return;
            const id = thumbKey(part, page);
            if (page > pdf.numPages || made.has(id)) continue;
            await drawPage(pdf, page, canvas, THUMB_WIDTH);
            made.set(id, canvas.toDataURL('image/jpeg', 0.82));
            // Publish in small batches so the rail fills in as it goes.
            if (made.size % 4 === 0) setThumbs(new Map(made));
          }
        } catch {
          // No PDF to draw from (PPTX or a missing file): titles stand in.
        }
      }
      if (live) setThumbs(new Map(made));
    }, 700);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [documentId, version, key]);
  return thumbs;
}

const STATUS_LABEL: Record<SlideStatus, string> = {
  seen: 'Opened',
  shaky: 'Shaky',
  understood: 'Got it',
};

export default function SlideWalkthrough({
  documentId,
  initialSlide,
}: {
  documentId: string;
  initialSlide: number | null;
}) {
  const [slides, setSlides] = useState<SlideSummary[]>([]);
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [railOpen, setRailOpen] = useState(false);
  const [onlyShaky, setOnlyShaky] = useState(false);
  const [finished, setFinished] = useState(false);
  const [detail, setDetail] = useState<DocumentSlide | null>(null);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [decks, setDecks] = useState<{ part: number; filename: string }[]>([]);
  const prefetched = useRef(new Set<string>());
  const thumbs = useThumbnails(
    documentId,
    sourceVersion,
    slides.map((s) => ({ part: s.part, number: s.source_number })),
  );

  const save = useCallback(
    (id: string, status: SlideStatus) =>
      fetch(`/api/learn/${documentId}/slides/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then((res) => {
        if (!res.ok) throw new Error('Not saved');
      }),
    [documentId],
  );
  const markSeen = useCallback(
    async (id: string) => {
      setSlides((list) =>
        list.map((s) =>
          s.id === id && !s.status ? { ...s, status: 'seen' } : s,
        ),
      );
      await save(id, 'seen').catch(() => {});
    },
    [save],
  );

  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/learn/${documentId}/slides`, { signal: abort.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Could not load slides.');
        const list: SlideSummary[] = data.slides;
        setSlides(list);
        setDecks(data.decks ?? []);
        setNotice(data.notice);
        const requested =
          initialSlide && initialSlide <= list.length ? initialSlide - 1 : null;
        const core = list.filter((s) => s.relevance !== 'skip');
        const resume = resumeIndex(core.map((s) => s.status));
        const start =
          requested ??
          (resume !== null ? list.indexOf(core[resume]) : null) ??
          Math.max(0, list.indexOf(core[0]));
        setIndex(start);
        const first = list[start];
        if (first && !first.status && first.relevance !== 'skip')
          void markSeen(first.id);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [documentId, retry, initialSlide, markSeen]);

  const slide = slides[index];
  // Title, agenda and closing slides stay visible but out of the way.
  const core = useMemo(
    () => slides.filter((s) => s.relevance !== 'skip'),
    [slides],
  );
  const skipped = slides.length - core.length;
  const counts = useMemo(() => {
    const c = { understood: 0, shaky: 0, seen: 0 };
    for (const s of core) if (s.status) c[s.status]++;
    return c;
  }, [core]);
  const nextCore = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < slides.length; i += dir)
      if (slides[i].relevance !== 'skip') return i;
    return -1;
  };
  const rated = counts.understood + counts.shaky;

  const rate = useCallback(
    async (id: string, status: SlideStatus) => {
      setSlides((list) =>
        list.map((s) => (s.id === id ? { ...s, status } : s)),
      );
      try {
        await save(id, status);
      } catch {
        setError(
          'Your rating wasn’t saved. Check your connection and rate again.',
        );
      }
    },
    [save],
  );

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= slides.length) return;
      setIndex(next);
      const target = slides[next];
      if (!target.status && target.relevance !== 'skip')
        void markSeen(target.id);
      setRailOpen(false);
      setFinished(false);
      setError('');
      window.scrollTo({ top: 0 });
    },
    [slides, markSeen],
  );

  // Keep the URL shareable, so a reload or link returns to this slide.
  useEffect(() => {
    if (slides.length)
      window.history.replaceState(null, '', `?slide=${index + 1}`);
  }, [index, slides.length]);

  const forward = nextCore(index, 1);
  const backward = nextCore(index, -1);
  const advance = useCallback(() => {
    if (forward < 0) setFinished(true);
    else go(forward);
  }, [go, forward]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target.closest('input, textarea, select, [contenteditable]')
      )
        return;
      if (e.key === 'ArrowRight' || e.key === 'j') {
        e.preventDefault();
        advance();
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        e.preventDefault();
        if (backward >= 0) go(backward);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [advance, go, backward]);

  // Prepare the next explanation in the background while this one is read.
  const prefetchNext = useCallback(() => {
    const next = slides[forward];
    if (!next || prefetched.current.has(next.id)) return;
    prefetched.current.add(next.id);
    void fetch(`/api/learn/${documentId}/slides/${next.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'explain' }),
    }).catch(() => prefetched.current.delete(next.id));
  }, [documentId, forward, slides]);

  async function include(id: string) {
    setSlides((list) =>
      list.map((s) =>
        s.id === id
          ? { ...s, relevance: 'core', relevance_reason: 'Included by you' }
          : s,
      ),
    );
    void markSeen(id);
    await fetch(`/api/learn/${documentId}/slides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ include: true }),
    }).catch(() => {});
  }

  if (loading) return <PageLoading label="Opening the deck" />;
  if (!slides.length)
    return (
      <main className="page is-narrow">
        <div className="empty-state">
          <h2>No slides to walk through.</h2>
          <p role="status">{error || notice}</p>
          <div className="page-head-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setLoading(true);
                setError('');
                setRetry((r) => r + 1);
              }}
            >
              Retry
            </button>
            <Link className="primary-button" href={`/summaries/${documentId}`}>
              Read topic summaries instead
            </Link>
          </div>
        </div>
      </main>
    );

  const visible = slides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !onlyShaky || s.status === 'shaky');
  const label = slide.kind === 'page' ? 'Page' : 'Slide';
  // A study set built from several decks groups the rail by deck.
  const multiDeck = decks.length > 1;
  const deckName = (part: number) =>
    (
      decks.find((d) => d.part === part)?.filename || `Deck ${part + 1}`
    ).replace(/\.[^.]+$/, '');
  return (
    <div className={`walkthrough ${railOpen ? 'rail-open' : ''}`}>
      <aside className="walk-rail" aria-label="Slides">
        <div className="walk-rail-head">
          <div className="walk-rail-progress">
            <ProgressRing
              understood={counts.understood}
              shaky={counts.shaky}
              total={core.length}
            />
            <div>
              <strong>
                {rated === core.length && core.length
                  ? 'Deck complete'
                  : rated
                    ? `${core.length - rated} to go`
                    : 'Let’s begin'}
              </strong>
              <p className="walk-rail-counts">
                <span className="is-good">{counts.understood} got it</span>
                <span className="is-shaky">{counts.shaky} shaky</span>
              </p>
            </div>
          </div>
          {skipped > 0 && (
            <p className="walk-rail-skipped">
              {skipped} {skipped === 1 ? 'slide' : 'slides'} skipped: nothing to
              study on {skipped === 1 ? 'it' : 'them'}.
            </p>
          )}
          {counts.shaky > 0 && (
            <div className="segmented">
              <button
                aria-pressed={!onlyShaky}
                onClick={() => setOnlyShaky(false)}
              >
                All
              </button>
              <button
                aria-pressed={onlyShaky}
                onClick={() => setOnlyShaky(true)}
              >
                Shaky only
              </button>
            </div>
          )}
        </div>
        <ol className="walk-rail-list">
          {visible.map(({ s, i }, n) => (
            <li key={s.id}>
              {multiDeck && visible[n - 1]?.s.part !== s.part && (
                <p className="walk-deck mono">
                  <span>{String(s.part + 1).padStart(2, '0')}</span>
                  {deckName(s.part)}
                </p>
              )}
              <button
                aria-current={i === index ? 'true' : undefined}
                className={
                  s.relevance === 'skip'
                    ? 'is-skipped'
                    : s.status
                      ? `is-${s.status}`
                      : ''
                }
                title={
                  s.relevance === 'skip'
                    ? `Skipped: ${s.relevance_reason}`
                    : undefined
                }
                onClick={() => go(i)}
              >
                <span className="walk-thumb">
                  {thumbs.get(thumbKey(s.part, s.source_number)) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimize
                    <img
                      src={thumbs.get(thumbKey(s.part, s.source_number))}
                      alt=""
                    />
                  ) : (
                    <span className="walk-thumb-text">{s.title}</span>
                  )}
                  <span className="walk-num mono">
                    {String(s.source_number).padStart(2, '0')}
                  </span>
                  <span
                    className="walk-status"
                    title={s.status ? STATUS_LABEL[s.status] : 'Not opened'}
                  >
                    {s.status === 'understood' ? (
                      <Icon name="check" size={11} />
                    ) : s.status === 'shaky' ? (
                      '~'
                    ) : null}
                  </span>
                </span>
                <span className="walk-title">
                  {s.title}
                  {s.relevance === 'skip' && (
                    <small>{s.relevance_reason || 'Skipped'}</small>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
      <button
        className="walk-rail-scrim"
        aria-label="Close slide list"
        tabIndex={railOpen ? 0 : -1}
        onClick={() => setRailOpen(false)}
      />

      <div className="walk-main">
        <div className="walk-top">
          <button
            className="secondary-button is-small walk-rail-toggle"
            onClick={() => setRailOpen(true)}
          >
            <Icon name="menu" size={15} /> Slides
          </button>
          <button
            className="icon-button"
            aria-label={`Previous ${label.toLowerCase()}`}
            disabled={backward < 0}
            onClick={() => go(backward)}
          >
            <Icon name="back" />
          </button>
          <div className="walk-top-title">
            <span>
              {slide.relevance === 'skip'
                ? `${label} ${slide.source_number} · skipped`
                : `${label} ${core.indexOf(slide) + 1} of ${core.length}`}
              {multiDeck &&
                ` · ${deckName(slide.part)}, ${label.toLowerCase()} ${slide.source_number}`}
            </span>
            <strong>{slide.title}</strong>
          </div>
          <button
            className="icon-button"
            aria-label={`Next ${label.toLowerCase()}`}
            disabled={forward < 0}
            onClick={() => go(forward)}
          >
            <Icon name="next" />
          </button>
          <span className="walk-keys muted" aria-hidden>
            <kbd className="kbd">←</kbd>
            <kbd className="kbd">→</kbd>
          </span>
        </div>

        {finished ? (
          <section className="walk-finished">
            {rated === core.length && core.length > 0 && <Confetti />}
            <ProgressRing
              understood={counts.understood}
              shaky={counts.shaky}
              total={core.length}
              size={120}
            />
            <h2 className="display">
              {rated === core.length
                ? 'You rated every slide'
                : 'You reached the last slide'}
            </h2>
            <dl>
              <div>
                <dt>Got it</dt>
                <dd>{counts.understood}</dd>
              </div>
              <div>
                <dt>Shaky</dt>
                <dd>{counts.shaky}</dd>
              </div>
              <div>
                <dt>Not rated</dt>
                <dd>{core.length - rated}</dd>
              </div>
            </dl>
            <p className="lede">
              Understanding fades fast without retrieval. Lock it in with
              flashcards now, then test yourself.
            </p>
            <div className="page-head-actions">
              <Link
                className="primary-button is-large"
                href={`/flashcards/${documentId}`}
              >
                Review flashcards
              </Link>
              {counts.shaky > 0 && (
                <button
                  className="secondary-button is-large"
                  onClick={() => {
                    setOnlyShaky(true);
                    go(slides.findIndex((s) => s.status === 'shaky'));
                  }}
                >
                  Revisit {counts.shaky} shaky{' '}
                  {counts.shaky === 1 ? 'slide' : 'slides'}
                </button>
              )}
              <Link
                className="ghost-button is-large"
                href={`/quiz/${documentId}`}
              >
                Take a quiz
              </Link>
            </div>
          </section>
        ) : (
          <div className="walk-body">
            <div className="walk-source">
              <SlideSource
                documentId={documentId}
                part={slide.part}
                number={slide.source_number}
                kind={slide.kind}
                fallback={detail?.id === slide.id ? detail : null}
                version={sourceVersion}
                onAttached={() => setSourceVersion((v) => v + 1)}
              />
            </div>
            <div className="walk-lesson">
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <SlideLesson
                key={slide.id}
                documentId={documentId}
                slideId={slide.id}
                status={slide.status}
                onRate={(status) => void rate(slide.id, status)}
                onNext={advance}
                isLast={forward < 0}
                onReady={prefetchNext}
                onLoaded={setDetail}
                skipped={
                  slide.relevance === 'skip' ? slide.relevance_reason : null
                }
                onInclude={() => void include(slide.id)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
