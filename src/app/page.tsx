'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import UploadForm from '@/components/UploadForm';
import DocumentList from '@/components/DocumentList';
import { Icon } from '@/components/ui';
import { Wordmark } from '@/components/Logo';
import HeroMap from '@/components/HeroMap';
import type { Document } from '@/types';

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
        <div className="hero-top">
          <h1>Learn a lecture deck, slide by slide.</h1>
          <div className="hero-aside">
            <p>
              Mnemo explains every slide in plain language, maps how the ideas
              connect, and turns the deck into flashcards, quizzes and practice
              problems.
            </p>
            <div className="hero-actions">
              <a className="primary-button is-large" href="#upload">
                Upload a deck
              </a>
              {documents.length > 0 && (
                <a className="text-button" href="#library">
                  Open your library
                </a>
              )}
            </div>
          </div>
        </div>
        <figure className="hero-figure">
          <HeroMap />
          <figcaption>
            Sample concept map for a Signals and Systems lecture. Hover a
            concept to trace its links.
          </figcaption>
        </figure>
      </section>

      <section className="intake" id="upload">
        <div className="intake-copy">
          <h2>Add a deck</h2>
          <p>
            PDF or PowerPoint, up to 4&nbsp;MB per file. The original slide
            stays next to every explanation so you can check the source.
          </p>
        </div>
        <UploadForm onUploadComplete={() => void refresh()} />
      </section>

      <section className="library-section" id="library">
        <div className="library-head">
          <h2>
            Your decks <span className="library-count">{documents.length}</span>
          </h2>
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
