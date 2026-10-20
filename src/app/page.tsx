'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import UploadForm from '@/components/UploadForm';
import DocumentList from '@/components/DocumentList';
import { Icon, stagger } from '@/components/ui';
import HeroMap from '@/components/HeroMap';
import { Wordmark } from '@/components/Logo';
import type { Document } from '@/types';

const METHOD = [
  [
    'Walk through',
    'A plain-language explanation and a visual for every slide.',
  ],
  ['Recall', 'Flashcards on a spaced schedule, before memories fade.'],
  ['Test', 'Quizzes with explanations, and a retry for what you missed.'],
  ['Apply', 'New problems that check you can use it, not just repeat it.'],
] as const;

async function loadDocuments(signal?: AbortSignal) {
  const res = await fetch('/api/documents', { signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load documents.');
  return Array.isArray(data) ? (data as Document[]) : [];
}

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const refresh = useCallback(async () => {
    try {
      setDocuments(await loadDocuments());
      setError('');
    } catch (err) {
      setError((err as Error).message || 'Could not load documents.');
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadDocuments(controller.signal)
      .then(setDocuments)
      .catch((err) => {
        if (err.name !== 'AbortError')
          setError(err.message || 'Could not load documents.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);
  const filtered = useMemo(
    () =>
      documents.filter((d) =>
        d.filename.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [documents, search],
  );
  return (
    <main className="library-page">
      <section className="hero">
        <div className="hero-copy">
          <h1 className="display rise" style={stagger(1)}>
            Every slide,
            <br />
            <em>understood.</em>
          </h1>
          <p className="lede rise" style={stagger(2)}>
            Drop in a lecture deck. Mnemo walks you through it one slide at a
            time, then turns it into flashcards, quizzes and practice that show
            you what actually stuck.
          </p>
          <div className="hero-actions rise" style={stagger(3)}>
            <a className="primary-button is-large" href="#upload">
              Upload a deck <span className="arrow">↗</span>
            </a>
            {documents.length > 0 && (
              <a className="ghost-button is-large" href="#library">
                Open your library
              </a>
            )}
          </div>
        </div>
        <figure className="hero-visual">
          <HeroMap />
          <figcaption>
            Every deck becomes a map of how its ideas connect.
          </figcaption>
        </figure>
      </section>

      <ol className="method">
        {METHOD.map(([title, text], i) => (
          <li key={title} className="rise" style={stagger(i + 4)}>
            <span className="mono">0{i + 1}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </li>
        ))}
      </ol>

      <section className="upload-section" id="upload">
        <div className="upload-intro">
          <h2 className="display">
            Start with
            <br />
            <em>your deck.</em>
          </h2>
          <p>
            PDF or PowerPoint, up to 4&nbsp;MB. Mnemo keeps the original slides
            beside every explanation, so you can always check the source.
          </p>
        </div>
        <UploadForm onUploadComplete={() => void refresh()} />
      </section>

      <section className="library-section" id="library">
        <div className="library-head">
          <div>
            <h2 className="display">
              Your decks{' '}
              <span className="library-count mono">{documents.length}</span>
            </h2>
          </div>
          {documents.length > 3 && (
            <label className="search-field">
              <span className="sr-only">Search documents</span>
              <Icon name="search" />
              <input
                type="search"
                placeholder="Search your decks"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
        </div>
        {error ? (
          <div className="inline-error" role="alert">
            <p>{error}</p>
            <button
              className="secondary-button is-small"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </div>
        ) : search && !filtered.length ? (
          <p className="empty-state">Nothing matches “{search}”.</p>
        ) : (
          <DocumentList documents={filtered} isLoading={isLoading} />
        )}
      </section>

      <footer className="library-footer">
        <Wordmark />
        <p>
          AI can make mistakes. Check generated material against your slides.
        </p>
      </footer>
    </main>
  );
}
