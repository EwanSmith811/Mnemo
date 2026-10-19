'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import UploadForm from '@/components/UploadForm';
import DocumentList from '@/components/DocumentList';
import type { Document } from '@/types';

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load documents.');
      setDocuments(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load documents.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/documents', { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load documents.');
        setDocuments(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);
  const filtered = useMemo(
    () =>
      documents.filter((d) =>
        d.filename.toLowerCase().includes(search.toLowerCase()),
      ),
    [documents, search],
  );
  return (
    <main className="library-page">
      <section className="library-intro">
        <div>
          <h1>
            Learn the pieces.
            <br />
            <span>See the connections.</span>
          </h1>
          <p>
            Turn your course material into a study system. Map the concepts,
            practice recall, and work through what you don’t know yet.
          </p>
          <a className="intro-link" href="#upload">
            Start with a document <span aria-hidden>↗</span>
          </a>
        </div>
        <div className="connection-art" aria-hidden="true">
          <svg viewBox="0 0 500 300">
            <path
              d="M75 150H180M180 150C235 150 200 65 280 65H380M180 150H335M180 150C235 150 220 235 300 235H410M335 150C380 150 335 65 380 65M335 150C380 150 365 235 410 235"
              fill="none"
              stroke="#3c6c61"
              strokeWidth="1.5"
            />
            <circle cx="75" cy="150" r="32" fill="#153b32" stroke="#72e3ca" />
            <path
              d="M62 160V140L75 154L88 140V160"
              fill="none"
              stroke="#72e3ca"
              strokeWidth="2"
            />
            {[
              [180, 150],
              [280, 65],
              [335, 150],
              [300, 235],
              [380, 65],
              [410, 235],
            ].map(([x, y], i) => (
              <g key={i}>
                <rect
                  x={x - 9}
                  y={y - 9}
                  width="18"
                  height="18"
                  rx="3"
                  fill="#10251f"
                  stroke={i % 2 ? '#73a596' : '#72e3ca'}
                />
                <circle cx={x} cy={y} r="2" fill="#a6e7d8" />
              </g>
            ))}
          </svg>
          <span>One source. A connected understanding.</span>
        </div>
      </section>
      <section className="upload-section" id="upload">
        <div className="section-intro">
          <h2>Build your study material</h2>
          <p>
            Add your lecture notes, slides, or reading. Choose a focus and Mnemo
            will prepare your study tools.
          </p>
          <div className="supported-tools">
            Concept maps <span>·</span> Flashcards <span>·</span> Quizzes{' '}
            <span>·</span> Summaries
          </div>
        </div>
        <UploadForm onUploadComplete={fetchDocuments} />
      </section>
      <section className="library-section">
        <div className="section-heading">
          <h2>
            Your documents <span>{documents.length}</span>
          </h2>
          <label className="search-field">
            <span className="sr-only">Search documents</span>
            <input
              type="search"
              placeholder="Find a document…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {error ? (
          <div className="inline-error" role="alert">
            <p>{error}</p>
            <button className="secondary-button" onClick={fetchDocuments}>
              Retry connection
            </button>
          </div>
        ) : search && !filtered.length ? (
          <p className="empty-state">No documents match “{search}”.</p>
        ) : (
          <DocumentList documents={filtered} isLoading={isLoading} />
        )}
      </section>
      <footer className="library-footer">
        <span>Mnemo</span>
        <p>
          AI can make mistakes. Check generated material against your source.
        </p>
      </footer>
    </main>
  );
}
