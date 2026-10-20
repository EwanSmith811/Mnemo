'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui';
import type { DocumentSlide } from '@/lib/document-slides';

/** Lay out extracted text as a slide: the title, then up to ten lines. */
function TextSlide({ title, text }: { title: string; text: string }) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[\s•▪◦*·-]+/, '').trim())
    .filter((l) => l && l !== title.trim());
  const shown = lines.slice(0, 10);
  return (
    <div className="text-slide">
      <h3>{title}</h3>
      {shown.length ? (
        <ul>
          {shown.map((line, i) => (
            <li key={i} style={{ animationDelay: `${i * 40}ms` }}>
              {line.length > 160 ? `${line.slice(0, 157)}…` : line}
            </li>
          ))}
        </ul>
      ) : (
        <p>No other text on this slide.</p>
      )}
      {lines.length > shown.length && (
        <small>
          + {lines.length - shown.length} more lines in the slide text below
        </small>
      )}
    </div>
  );
}

/**
 * The original slide or page, beside its explanation. PDFs use the browser
 * viewer; PPTX decks render in a sandboxed, network-restricted frame.
 */
export default function SlideSource({
  documentId,
  number,
  kind,
  fallback,
}: {
  documentId: string;
  number: number;
  kind: 'slide' | 'page';
  /** The extracted slide, shown as a text version when no preview exists. */
  fallback: Pick<DocumentSlide, 'title' | 'text'> | null;
}) {
  const [url, setUrl] = useState('');
  const [deck, setDeck] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [zoom, setZoom] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const endpoint = `/api/learn/${documentId}/source`;

  useEffect(() => {
    const abort = new AbortController();
    let objectUrl = '';
    fetch(endpoint, { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error);
        if (r.headers.get('Content-Type')?.includes('presentation')) {
          setDeck(await r.arrayBuffer());
          return;
        }
        objectUrl = URL.createObjectURL(await r.blob());
        setDeck(null);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint, version]);

  const send = () =>
    deck &&
    frame.current?.contentWindow?.postMessage(
      { type: 'mnemo-source', buffer: deck, slide: number - 1 },
      '*',
    );
  useEffect(() => {
    if (deck)
      frame.current?.contentWindow?.postMessage(
        { type: 'mnemo-source', buffer: deck, slide: number - 1 },
        '*',
      );
  }, [deck, number]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { type: 'mnemo-zoom', value: zoom },
      '*',
    );
  }, [zoom]);

  async function attach(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not attach the PDF.');
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = kind === 'page' ? 'Page' : 'Slide';
  return (
    <div className="source" ref={root}>
      <div className="source-bar">
        <span className="eyebrow">
          <b>{String(number).padStart(2, '0')}</b> Original{' '}
          {label.toLowerCase()}
        </span>
        <div className="source-tools">
          {deck && (
            <>
              <button
                className="icon-button"
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
              >
                −
              </button>
              <button
                className="source-zoom mono"
                onClick={() => setZoom(1)}
                aria-label="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                className="icon-button"
                aria-label="Zoom in"
                disabled={zoom >= 3}
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              >
                +
              </button>
              <button
                className="icon-button"
                aria-label="Full screen"
                onClick={() => {
                  void (
                    document.fullscreenElement
                      ? document.exitFullscreen()
                      : root.current?.requestFullscreen()
                  )?.catch(() =>
                    setError('Full screen is unavailable in this browser.'),
                  );
                }}
              >
                <Icon name="expand" size={16} />
              </button>
            </>
          )}
          {url && (
            <a
              className="icon-button"
              href={`${url}#page=${number}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open full size in a new tab"
            >
              <Icon name="arrow" size={16} />
            </a>
          )}
        </div>
      </div>
      <div className="source-stage">
        {url ? (
          <iframe
            key={`${url}-${number}`}
            title={`Original ${label.toLowerCase()} ${number}`}
            src={`${url}#page=${number}&view=FitH&toolbar=0&navpanes=0`}
          />
        ) : deck ? (
          <iframe
            ref={frame}
            title={`Original slide ${number}`}
            sandbox="allow-scripts"
            src="/mnemo-slide-viewer.html"
            onLoad={send}
          />
        ) : (
          <div className="source-empty">
            {error && fallback ? (
              <TextSlide title={fallback.title} text={fallback.text} />
            ) : error ? (
              <>
                <strong>The original isn’t available</strong>
                <p role="status">{error}</p>
              </>
            ) : (
              <span className="skeleton" />
            )}
          </div>
        )}
      </div>
      {(url || deck) && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {error && !url && !deck && fallback && (
        <p className="source-note">
          <span className="chip">Text version</span> The original slide can’t be
          shown for this file, so this is its extracted text. Attach a PDF
          export to see the real slides.
        </p>
      )}
      <details className="source-attach" open={!!error && !url && !deck}>
        <summary>
          {error && !url && !deck
            ? 'Attach a PDF export of the deck'
            : 'Preview looks off? Attach a PDF export'}
        </summary>
        <p>
          Export every slide, in order, to PDF. It replaces the preview only; no
          new study material is created.
        </p>
        <label className="secondary-button is-small">
          {busy ? 'Saving PDF…' : 'Choose PDF'}
          <input
            type="file"
            className="sr-only"
            accept=".pdf,application/pdf"
            disabled={busy}
            onChange={(e) => {
              void attach(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </details>
    </div>
  );
}
