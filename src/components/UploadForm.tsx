'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import GenerationScreen, { type GenerationState } from './GenerationScreen';
import { Icon } from './ui';
import { readUploadProgress } from '@/lib/upload-progress';
import type { StudyMode } from '@/types';
import { DOCUMENT_ACCEPT, getDocumentFileType } from '@/lib/document-formats';
import { defaultSetName, MAX_DECKS } from '@/lib/upload-parts';
import type { UploadPreview } from '@/lib/upload-progress';

const MAX_SIZE = 4 * 1024 * 1024;
const MODES = [
  ['engineers', 'Engineering', 'Calculations, derivations and problem solving'],
  ['nursing', 'Nursing', 'Clinical reasoning and NCLEX-style questions'],
] as const;
const INITIAL: GenerationState = {
  stage: 'uploading',
  ready: { graph: false, materials: false },
  preview: null,
  concepts: [],
  result: null,
};

export default function UploadForm({
  onUploadComplete,
}: {
  onUploadComplete: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<StudyMode>('engineers');
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState(false);
  const [progress, setProgress] = useState<GenerationState>(INITIAL);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  // Decks already read by the server, so a retry doesn't send them again.
  const sent = useRef(new Map<File, string>());

  function choose(list?: FileList | null) {
    if (!list?.length) return;
    setError('');
    const next = [...files];
    for (const file of list) {
      if (!getDocumentFileType(file.name)) {
        setError(
          `${file.name} isn’t a PDF or PowerPoint file (.pptx, .ppt, .pps, .ppsx).`,
        );
        return;
      }
      if (!file.size || file.size > MAX_SIZE) {
        setError(
          `${file.name} is over 4 MB. Split the deck or export a lighter PDF, then try again.`,
        );
        return;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size))
        continue;
      if (next.length === MAX_DECKS) {
        setError(`A study set can hold up to ${MAX_DECKS} decks.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
  }

  function move(i: number, by: -1 | 1) {
    setFiles((list) => {
      const next = [...list];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  }

  /** Sends each deck on its own, so no request exceeds the size limit. */
  async function sendParts(
    onPreview: (preview: UploadPreview) => void,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const file of files) {
      let id = sent.current.get(file);
      if (!id) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/upload/parts', {
          method: 'POST',
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            [data.error || `Could not send ${file.name}.`, data.detail]
              .filter(Boolean)
              .join(' '),
          );
        id = data.part_id as string;
        sent.current.set(file, id);
        onPreview(data.preview);
      }
      ids.push(id);
    }
    return ids;
  }

  async function upload() {
    if (!files.length || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setScreen(true);
    setProgress(INITIAL);
    setError('');
    const form = new FormData();
    form.append('studyMode', mode);
    try {
      if (files.length === 1) form.append('file', files[0]);
      else {
        // Each deck's titles appear on the screen as soon as it is read.
        const seen: UploadPreview = { slides: 0, words: 0, titles: [] };
        const ids = await sendParts((preview) => {
          seen.slides += preview.slides;
          seen.words += preview.words;
          seen.titles = [...seen.titles, ...preview.titles].slice(0, 40);
          setProgress((p) => ({
            ...p,
            stage: 'reading',
            preview: { ...seen },
          }));
        });
        form.append('parts', JSON.stringify(ids));
        form.append('name', name.trim());
      }
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/x-ndjson' },
      });
      const data = await readUploadProgress(res, (event) =>
        setProgress((p) => ({
          ...p,
          stage: event.stage,
          ready: event.ready ? { ...p.ready, [event.ready]: true } : p.ready,
          preview: event.preview ?? p.preview,
          concepts: event.concepts ?? p.concepts,
        })),
      );
      setProgress((p) => ({ ...p, stage: 'saving', result: data }));
      onUploadComplete();
      // Let the completion moment land before leaving the screen.
      setTimeout(() => router.replace(`/documents/${data.document_id}`), 1600);
    } catch (err) {
      // Parts expire after a day; a retry then sends every deck again.
      if (err instanceof Error && /expired/.test(err.message))
        sent.current.clear();
      setError(
        err instanceof Error
          ? err.message
          : 'Upload failed. Check your connection and retry.',
      );
      inFlight.current = false;
      setBusy(false);
    }
  }

  const multi = files.length > 1;
  const title = multi
    ? name.trim() || defaultSetName(files.map((f) => f.name))
    : (files[0]?.name ?? '');
  return (
    <div className="upload-form card" aria-busy={busy}>
      {screen && files.length > 0 && (
        <GenerationScreen
          filename={title}
          state={progress}
          error={error}
          onRetry={upload}
          onBack={() => {
            setScreen(false);
            setError('');
          }}
        />
      )}
      <fieldset disabled={busy} className="upload-step">
        <legend>What are you studying?</legend>
        <div className="mode-options">
          {MODES.map(([value, name, description]) => (
            <label key={value} className="mode-option">
              <input
                type="radio"
                name="studyMode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span className="mode-radio" aria-hidden />
              <strong>{name}</strong>
              <small>{description}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="upload-step">
        <p className="upload-step-label">Add your decks</p>
        <div
          className={`file-drop ${dragging ? 'is-dragging' : ''} ${files.length ? 'has-file' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) choose(e.dataTransfer.files);
          }}
        >
          <input
            ref={input}
            id="document-file"
            type="file"
            accept={DOCUMENT_ACCEPT}
            multiple
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files);
              e.target.value = '';
            }}
            className="sr-only"
          />
          {files.length ? (
            <ol className="file-tickets">
              {files.map((file, i) => (
                <li key={`${file.name}:${file.size}`} className="file-ticket">
                  <span className="file-ticket-type mono">
                    {getDocumentFileType(file.name)}
                  </span>
                  <div>
                    <strong title={file.name}>{file.name}</strong>
                    <small className="mono">
                      {multi && `Deck ${i + 1} · `}
                      {(file.size / 1024 / 1024).toFixed(2)} MB · ready
                    </small>
                  </div>
                  <div className="file-ticket-actions">
                    {multi && (
                      <>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Move ${file.name} earlier`}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Move ${file.name} later`}
                          disabled={i === files.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setFiles((list) => list.filter((f) => f !== file))
                      }
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                </li>
              ))}
              {files.length < MAX_DECKS && (
                <li className="file-tickets-add">
                  <label htmlFor="document-file" className="text-button">
                    <Icon name="plus" size={14} />{' '}
                    {multi
                      ? `Add another deck (${files.length} of ${MAX_DECKS})`
                      : `Add more decks to study together (up to ${MAX_DECKS})`}
                  </label>
                </li>
              )}
            </ol>
          ) : (
            <label htmlFor="document-file" className="file-drop-empty">
              <span className="file-drop-icon">
                <Icon name="upload" size={22} />
              </span>
              <strong>
                {dragging ? 'Release to add them' : 'Drop your slides here'}
              </strong>
              <small>
                or <u>browse your files</u>. PDF, PPTX, PPT, PPS or PPSX, up to{' '}
                {MAX_DECKS} decks at 4 MB each.
              </small>
            </label>
          )}
        </div>
      </div>

      {multi && (
        <div className="upload-step">
          <label className="upload-step-label" htmlFor="set-name">
            Name this study set <small>(optional)</small>
          </label>
          <input
            id="set-name"
            className="input"
            value={name}
            maxLength={200}
            disabled={busy}
            placeholder={defaultSetName(files.map((f) => f.name))}
            onChange={(e) => setName(e.target.value)}
          />
          <small className="upload-hint">
            All {files.length} decks become one study set: one walkthrough in
            this order, plus flashcards, quizzes and a concept map across all of
            them.
          </small>
        </div>
      )}

      {error && !screen && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-button is-large is-block"
        disabled={!files.length || busy}
        onClick={upload}
      >
        {busy ? (
          <>
            <span className="loading-spinner" /> Building your study set…
          </>
        ) : (
          <>
            {multi
              ? `Build one study set from ${files.length} decks`
              : 'Build my study set'}
          </>
        )}
      </button>
      <p className="upload-footnote">
        {multi
          ? 'Several decks take a few minutes. Keep this tab open.'
          : 'Takes a minute or two.'}{' '}
        Text-based files only; scanned images can’t be read.
      </p>
    </div>
  );
}
