'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '@/lib/use-modal-focus';
import type { TopicSummary } from '@/types';

interface AddTopicSummaryDialogProps {
  documentId: string;
  isDisabled?: boolean;
  onAdd: (summary: TopicSummary) => void;
}

export default function AddTopicSummaryDialog({
  documentId,
  isDisabled = false,
  onAdd,
}: AddTopicSummaryDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [summary, setSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useModalFocus(isOpen, () => {
    if (!isSubmitting) setIsOpen(false);
  });

  const openDialog = () => {
    if (isDisabled) return;
    setTopicName('');
    setSummary('');
    setError('');
    setIsOpen(true);
  };

  const closeDialog = () => {
    if (isSubmitting) return;
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!topicName.trim() || !summary.trim()) {
      setError('Both fields are required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/summaries/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_name: topicName.trim(),
          summary: summary.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create topic summary');
      }

      const createdSummary: TopicSummary = await res.json();
      onAdd(createdSummary);
      setIsOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create topic summary',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const modal = isOpen ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-4 backdrop-blur-[8px]"
      onClick={closeDialog}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add topic summary"
        tabIndex={-1}
        className="w-full max-w-2xl rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Add Topic Summary
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Write your own explanation and keep it in this document&apos;s
              topic list.
            </p>
          </div>
          <button
            onClick={closeDialog}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="topic-name"
              className="mb-1 block text-sm font-medium text-zinc-400"
            >
              Topic name
            </label>
            <input
              id="topic-name"
              type="text"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="Example: Acid-base balance"
              className="w-full rounded-xl glass px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-emerald-500/40"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="topic-summary"
              className="mb-1 block text-sm font-medium text-zinc-400"
            >
              Summary
            </label>
            <textarea
              id="topic-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Add a clear explanation, examples, memory hooks, or anything you want to remember."
              rows={7}
              className="w-full rounded-xl glass px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-emerald-500/40"
            />
          </div>

          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-xl glass px-4 py-2 text-sm text-zinc-400 transition-all glass-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-medium text-white transition-all  disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={openDialog}
        disabled={isDisabled}
        className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm font-medium transition-all glass-hover hover-glow-emerald disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          className="h-4 w-4 text-emerald-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span className="text-zinc-300">Add Your Own Topic</span>
      </button>

      {isOpen && createPortal(modal, document.body)}
    </>
  );
}
