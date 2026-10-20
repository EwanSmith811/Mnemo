'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import GenerationScreen, { type GenerationState } from './GenerationScreen';
import { Icon } from './ui';
import { readUploadProgress } from '@/lib/upload-progress';
import type { StudyMode } from '@/types';
import { DOCUMENT_ACCEPT, getDocumentFileType } from '@/lib/document-formats';

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
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState(false);
  const [progress, setProgress] = useState<GenerationState>(INITIAL);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  function choose(next?: File) {
    if (!next) return;
    setError('');
    if (!getDocumentFileType(next.name)) {
      setError('Choose a PDF or PowerPoint file (.pptx, .ppt, .pps, .ppsx).');
      return;
    }
    if (!next.size || next.size > MAX_SIZE) {
      setError(
        'That file is over 4 MB. Split the deck or export a lighter PDF, then try again.',
      );
      return;
    }
    setFile(next);
  }

  async function upload() {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setScreen(true);
    setProgress(INITIAL);
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append('studyMode', mode);
    try {
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
      setError(
        err instanceof Error
          ? err.message
          : 'Upload failed. Check your connection and retry.',
      );
      inFlight.current = false;
      setBusy(false);
    }
  }

  const type = file ? getDocumentFileType(file.name) : null;
  return (
    <div className="upload-form card" aria-busy={busy}>
      {screen && file && (
        <GenerationScreen
          filename={file.name}
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
        <legend>
          <span className="mono">A</span> What are you studying?
        </legend>
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
        <p className="upload-step-label">
          <span className="mono">B</span> Add your deck
        </p>
        <div
          className={`file-drop ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) choose(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={input}
            id="document-file"
            type="file"
            accept={DOCUMENT_ACCEPT}
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
            className="sr-only"
          />
          {file ? (
            <div className="file-ticket">
              <span className="file-ticket-type mono">{type}</span>
              <div>
                <strong title={file.name}>{file.name}</strong>
                <small className="mono">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · ready
                </small>
              </div>
              <label htmlFor="document-file" className="text-button">
                Replace
              </label>
            </div>
          ) : (
            <label htmlFor="document-file" className="file-drop-empty">
              <span className="file-drop-icon">
                <Icon name="upload" size={22} />
              </span>
              <strong>
                {dragging ? 'Release to add it' : 'Drop your slides here'}
              </strong>
              <small>
                or <u>browse files</u> · PDF, PPTX, PPT, PPS, PPSX · up to 4 MB
              </small>
            </label>
          )}
        </div>
      </div>

      {error && !screen && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-button is-large is-block"
        disabled={!file || busy}
        onClick={upload}
      >
        {busy ? (
          <>
            <span className="loading-spinner" /> Building your study set…
          </>
        ) : (
          <>
            Build my study set <span className="arrow">↗</span>
          </>
        )}
      </button>
      <p className="upload-footnote">
        Takes a minute or two. Text-based files only; scanned images can’t be
        read.
      </p>
    </div>
  );
}
