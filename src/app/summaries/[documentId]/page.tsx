'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AddTopicSummaryDialog from '@/components/AddTopicSummaryDialog';
import GenerateCountDialog from '@/components/GenerateCountDialog';
import type { TopicSummary } from '@/types';

function sortSummaries(items: TopicSummary[]) {
  return [...items].sort((a, b) => a.display_order - b.display_order);
}

export default function SummariesPage() {
  const params = useParams();
  const documentId = params.documentId as string;

  const [summaries, setSummaries] = useState<TopicSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const remainingSlots = Math.max(0, 30 - summaries.length);
  const maxRequest = Math.min(10, remainingSlots);

  const selectedSummary = useMemo(
    () =>
      summaries[Math.min(selectedIndex, Math.max(0, summaries.length - 1))] ??
      null,
    [selectedIndex, summaries],
  );

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/summaries/${documentId}`);
        const data = await res.json();
        if (!res.ok)
          throw new Error('Could not load study material. Try again.');
        setSummaries(Array.isArray(data) ? sortSummaries(data) : []);
      } catch (err) {
        console.error('Failed to load summaries:', err);
        setSummaries([]);
        setError('Unable to load topic summaries right now.');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [documentId]);

  const handleGenerateMore = async (count: number) => {
    if (maxRequest === 0) return;

    setError(null);

    const res = await fetch(`/api/summaries/${documentId}/more`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to generate topic summaries');
    }

    const newSummaries: TopicSummary[] = Array.isArray(data.summaries)
      ? data.summaries
      : [];
    if (newSummaries.length === 0) {
      throw new Error(
        'The model could not find more distinct topics to add from this document.',
      );
    }

    setSummaries((prev) => sortSummaries([...prev, ...newSummaries]));
  };

  const handleAddSummary = (summary: TopicSummary) => {
    setError(null);
    setSummaries((prev) => sortSummaries([...prev, summary]));
    setSelectedIndex(summaries.length);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-emerald-400" />
          </div>
          <p className="text-zinc-500">Loading topic summaries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/documents/${documentId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to document
        </Link>

        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="animate-fade-in-up">
            <h1 className="text-2xl font-bold gradient-text-emerald">
              Topic Summaries
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Study the document by topic, then expand the deck with more
              AI-generated summaries or add your own notes.
            </p>
            <div className="mt-3 glow-line-emerald w-16" />
          </div>

          <div className="w-full max-w-xl rounded-2xl glass-emerald p-5 animate-fade-in-up delay-100">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {summaries.length} topic{summaries.length !== 1 ? 's' : ''}{' '}
                    saved
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Up to 30 topics per document. Generate 1-10 at a time.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <GenerateCountDialog
                    accent="emerald"
                    buttonLabel="Generate More"
                    confirmLabel="Generate Topics"
                    countLabel="How many topic summaries should we add?"
                    description="Generate another batch of topic summaries from the document without leaving this page."
                    heading="Generate More Topics"
                    isDisabled={remainingSlots === 0}
                    maxCount={maxRequest}
                    onGenerate={handleGenerateMore}
                  />
                  <AddTopicSummaryDialog
                    documentId={documentId}
                    isDisabled={remainingSlots === 0}
                    onAdd={handleAddSummary}
                  />
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                {remainingSlots > 0
                  ? `${remainingSlots} slot${remainingSlots !== 1 ? 's' : ''} remaining`
                  : 'Topic limit reached'}
              </p>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          </div>
        </div>

        {summaries.length === 0 ? (
          <div className="rounded-2xl glass py-16 text-center">
            <p className="text-zinc-300">No topic summaries available yet.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Generate a few from the document or add your own summary to get
              started.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in-up delay-150">
            {selectedSummary && (
              <div className="rounded-2xl glass-emerald px-6 py-6">
                <div className="mb-5">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-400/80">
                    Topic {selectedSummary.display_order}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-zinc-100">
                    {selectedSummary.topic_name}
                  </h2>
                </div>
                <div className="space-y-4 text-sm leading-7 text-zinc-300">
                  {selectedSummary.summary
                    .split('\n\n')
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl glass-emerald">
              <div className="border-b border-white/5 px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Topics
                </p>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {summaries.map((summary, index) => (
                  <button
                    key={summary.id}
                    onClick={() => setSelectedIndex(index)}
                    className={`block w-full border-b border-white/5 px-5 py-4 text-left text-sm transition-all ${
                      index === selectedIndex
                        ? 'border-l-2 border-emerald-400 bg-emerald-500/10 font-medium text-emerald-400'
                        : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                    }`}
                  >
                    <span className="block text-[11px] uppercase tracking-wide text-zinc-600">
                      Topic {summary.display_order}
                    </span>
                    <span className="mt-1 block">{summary.topic_name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
