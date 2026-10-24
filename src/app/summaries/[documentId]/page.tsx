'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AddDialog, GenerateDialog } from '@/components/StudyDialogs';
import { BackLink, PageLoading } from '@/components/ui';
import type { TopicSummary } from '@/types';

const LIMIT = 30;
const ordered = (items: TopicSummary[]) =>
  [...items].sort((a, b) => a.display_order - b.display_order);

export default function SummariesPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [summaries, setSummaries] = useState<TopicSummary[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/summaries/${documentId}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error();
        setSummaries(Array.isArray(data) ? ordered(data) : []);
      })
      .catch((err) => {
        if (err.name !== 'AbortError')
          setError('Could not load topic summaries. Reload to try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [role="dialog"]'))
        return;
      if (e.key === 'ArrowRight')
        setSelected((i) => Math.min(summaries.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setSelected((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [summaries.length]);

  const slots = Math.max(0, LIMIT - summaries.length);
  async function generate(count: number) {
    const res = await fetch(`/api/summaries/${documentId}/more`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not generate summaries.');
    const added: TopicSummary[] = Array.isArray(data.summaries)
      ? data.summaries
      : [];
    if (!added.length)
      throw new Error('No new, distinct topics were found in this deck.');
    setSummaries((list) => ordered([...list, ...added]));
  }

  if (loading) return <PageLoading label="Gathering the topics" />;
  const index = Math.min(selected, Math.max(0, summaries.length - 1));
  const topic = summaries[index];
  const choose = (i: number) => {
    setSelected(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <main className="page">
      <BackLink href={`/documents/${documentId}`}>Study plan</BackLink>
      <header className="page-head">
        <div>
          <h1>Topic summaries</h1>
        </div>
        <div className="page-head-actions">
          <GenerateDialog
            label="More topics"
            noun="topics"
            description="Mnemo will summarise parts of the deck that aren’t covered yet."
            max={Math.min(10, slots)}
            onGenerate={generate}
          />
          <AddDialog<TopicSummary>
            label="Add note"
            title="Add your own summary"
            description="Summarising in your own words is one of the best ways to learn."
            endpoint={`/api/summaries/${documentId}`}
            disabled={!slots}
            fields={[
              {
                name: 'topic_name',
                label: 'Topic',
                placeholder: 'e.g. Frank–Starling law',
                maxLength: 500,
              },
              {
                name: 'summary',
                label: 'Summary',
                placeholder: 'Explain it as if to a classmate…',
                multiline: true,
                maxLength: 20000,
              },
            ]}
            onAdd={(s) => {
              setSummaries((list) => ordered([...list, s]));
              setSelected(summaries.length);
            }}
          />
        </div>
      </header>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!topic ? (
        <div className="empty-state">
          <h2>No summaries yet.</h2>
          <p>Generate a few from the deck, or write your own.</p>
        </div>
      ) : (
        <div className="reader">
          <nav className="reader-toc" aria-label="Topics">
            <ol>
              {summaries.map((s, i) => (
                <li key={s.id}>
                  <button
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => choose(i)}
                  >
                    <span className="mono">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.topic_name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <article className="reader-article" key={topic.id}>
            <span className="eyebrow">
              Topic {index + 1} of {summaries.length}
            </span>
            <h2>{topic.topic_name}</h2>
            <div className="reader-body">
              {topic.summary.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="reader-pager">
              <button
                className="ghost-button"
                disabled={!index}
                onClick={() => choose(index - 1)}
              >
                ← Previous
              </button>
              {index < summaries.length - 1 ? (
                <button
                  className="secondary-button"
                  onClick={() => choose(index + 1)}
                >
                  {summaries[index + 1].topic_name} →
                </button>
              ) : (
                <Link className="primary-button" href={`/quiz/${documentId}`}>
                  Take the quiz
                </Link>
              )}
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
