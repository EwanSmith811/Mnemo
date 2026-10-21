'use client';
import { useEffect, useRef, useState } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import { Icon } from '../ui';
import type { DocumentSlide } from '@/lib/document-slides';
import { drawPage, loadPdf, loadSource } from './source-cache';

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

/** One PDF page drawn to fit the stage width, redrawn on resize or zoom. */
function PdfPage({
  documentId,
  version,
  part,
  number,
  zoom,
  onError,
}: {
  documentId: string;
  version: number;
  part: number;
  number: number;
  zoom: number;
  onError: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !canvas.current) return;
    let task: RenderTask | null = null;
    let live = true;
    loadPdf(documentId, version, part)
      .then((pdf) => {
        if (!live || !canvas.current) return;
        if (number > pdf.numPages)
          throw new Error(`This file has no ${number}th page.`);
        return drawPage(pdf, number, canvas.current, width * zoom, (t) => {
          task = t;
        });
      })
      .then(() => {
        if (live) setReady(true);
      })
      .catch((e: Error) => {
        if (live && e.name !== 'RenderingCancelledException')
          onError(e.message || 'The slide couldn’t be drawn.');
      });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [documentId, version, part, number, width, zoom, onError]);

  return (
    <div ref={box} className={`pdf-page ${ready ? 'is-ready' : ''}`}>
      <canvas
        ref={canvas}
        style={{ width: `${zoom * 100}%` }}
        aria-label={`Original slide ${number}`}
        role="img"
      />
    </div>
  );
}

/**
 * The original slide or page, beside its explanation. PDFs (and legacy decks
 * the server converts) are drawn with pdf.js; PPTX decks render in a
 * sandboxed, network-restricted frame.
 */
export default function SlideSource({
  documentId,
  part = 0,
  number,
  kind,
  fallback,
  version,
  onAttached,
}: {
  documentId: string;
  /** The deck, in a study set built from several decks. */
  part?: number;
  number: number;
  kind: 'slide' | 'page';
  /** The extracted slide, shown as a text version when no preview exists. */
  fallback: Pick<DocumentSlide, 'title' | 'text'> | null;
  /** Bumped after a PDF export is attached, so every view refetches. */
  version: number;
  onAttached: () => void;
}) {
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [deck, setDeck] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const frame = useRef<HTMLIFrameElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const endpoint = `/api/learn/${documentId}/source?part=${part}`;

  useEffect(() => {
    let live = true;
    loadSource(documentId, version, part)
      .then((source) => {
        if (!live) return;
        setError('');
        setPdf(source.kind === 'pdf' ? source.data : null);
        setDeck(source.kind === 'deck' ? source.data : null);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [documentId, version, part]);

  function openFull() {
    if (!pdf) return;
    const url = URL.createObjectURL(
      new Blob([pdf], { type: 'application/pdf' }),
    );
    window.open(`${url}#page=${number}`, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

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
      onAttached();
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
          {(deck || pdf) && (
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
          {pdf && (
            <button
              className="icon-button"
              onClick={openFull}
              aria-label="Open full size in a new tab"
            >
              <Icon name="arrow" size={16} />
            </button>
          )}
        </div>
      </div>
      <div
        className={`source-stage ${pdf ? 'is-pdf' : ''} ${!pdf && !deck && error && fallback ? 'is-text' : ''}`}
      >
        {pdf ? (
          <PdfPage
            documentId={documentId}
            version={version}
            part={part}
            number={number}
            zoom={zoom}
            onError={setError}
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
      {(pdf || deck) && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {error && !pdf && !deck && fallback && (
        <p className="source-note">
          <span className="chip">Text version</span> The original slide can’t be
          shown for this file, so this is its extracted text. Attach a PDF
          export to see the real slides.
        </p>
      )}
      <details className="source-attach" open={!!error && !pdf && !deck}>
        <summary>
          {error && !pdf && !deck
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
