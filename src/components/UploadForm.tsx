'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import GenerationScreen from './GenerationScreen';
import { readUploadProgress, type UploadStage } from '@/lib/upload-progress';
import type { StudyMode } from '@/types';
import { DOCUMENT_ACCEPT, getDocumentFileType } from '@/lib/document-formats';
const MAX_SIZE = 4 * 1024 * 1024;
export default function UploadForm({
  onUploadComplete,
}: {
  onUploadComplete: () => void;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState(false);
  const [stage, setStage] = useState<UploadStage>('uploading');
  const [ready, setReady] = useState({ graph: false, materials: false });
  const [complete, setComplete] = useState(false);
  const inFlight = useRef(false);
  const [mode, setMode] = useState<StudyMode>('engineers');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'processing'>('idle');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function choose(next?: File) {
    if (!next) return;
    setError('');
    if (!getDocumentFileType(next.name)) {
      setFile(null);
      setError('Choose a PDF or PowerPoint file (.pptx, .ppt, .pps, .ppsx).');
      return;
    }
    if (!next.size || next.size > MAX_SIZE) {
      setError(
        'Choose a file between 1 byte and 4 MB. Split larger documents before uploading.',
      );
      return;
    }
    setFile(next);
  }
  async function upload() {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setScreen(true);
    setStage('uploading');
    setReady({ graph: false, materials: false });
    setComplete(false);
    setPhase('processing');
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
      const data = await readUploadProgress(res, (event) => {
        setStage(event.stage);
        if (event.ready)
          setReady((previous) => ({ ...previous, [event.ready!]: true }));
      });
      setComplete(true);
      onUploadComplete();
      router.replace(`/documents/${data.document_id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Upload failed. Check your connection and retry.',
      );
      inFlight.current = false;
      setPhase('idle');
    }
  }
  const busy = phase !== 'idle';
  return (
    <div className="upload-form" aria-busy={busy}>
      {screen && file && (
        <GenerationScreen
          filename={file.name}
          stage={stage}
          ready={ready}
          error={error}
          complete={complete}
          onRetry={upload}
          onBack={() => {
            setScreen(false);
            setError('');
          }}
        />
      )}
      <fieldset disabled={busy} className="study-mode">
        <legend>Study focus</legend>
        <div>
          {(
            [
              ['engineers', 'Engineering', 'Calculations & problem solving'],
              ['nursing', 'Nursing', 'Clinical reasoning & NCLEX'],
            ] as const
          ).map(([value, name, description]) => (
            <label key={value}>
              <input
                type="radio"
                name="studyMode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>
                <strong>{name}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div
        className={`file-drop ${dragging ? 'is-dragging' : ''}`}
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
          onChange={(e) => choose(e.target.files?.[0])}
          className="sr-only"
        />
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" />
        </svg>
        <label htmlFor="document-file">
          {file ? file.name : 'Drop your document here'}
          <span>
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Choose a different file`
              : 'or browse files · PDF / PPTX / PPT / PPS / PPSX · Up to 4 MB'}
          </span>
        </label>
      </div>
      <button
        className="primary-button upload-button"
        disabled={!file || busy}
        onClick={upload}
      >
        {busy ? (
          <>
            <span className="loading-spinner" />
            Preparing study material…
          </>
        ) : (
          <>
            Generate study material <span aria-hidden>↗</span>
          </>
        )}
      </button>
      {busy && (
        <p className="upload-help" role="status">
          Reading your document and generating your study tools. This may take a
          few minutes. Keep this page open.
        </p>
      )}
      {error && !screen && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
