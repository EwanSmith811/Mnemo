'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '@/lib/use-modal-focus';
import type { Flashcard } from '@/types';

interface AddFlashcardDialogProps {
  documentId: string;
  isDisabled?: boolean;
  onAdd: (card: Flashcard) => void;
}

export default function AddFlashcardDialog({
  documentId,
  isDisabled = false,
  onAdd,
}: AddFlashcardDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useModalFocus(isOpen, () => {
    if (!isSubmitting) setIsOpen(false);
  });
  // SSR-safe: only portal after mount

  const openDialog = () => {
    if (isDisabled) return;
    setTerm('');
    setDefinition('');
    setError('');
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !definition.trim()) {
      setError('Both fields are required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/flashcards/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: term.trim(),
          definition: definition.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create flashcard');
      }

      const card: Flashcard = await res.json();
      onAdd(card);
      closeDialog();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create flashcard',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const modal = isOpen ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
      }}
      onClick={closeDialog}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add flashcard"
        tabIndex={-1}
        style={{
          margin: 16,
          width: '100%',
          maxWidth: 448,
          borderRadius: 16,
          padding: 24,

          background: 'var(--surface)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Add Flashcard</h2>
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
              htmlFor="term"
              className="mb-1 block text-sm font-medium text-zinc-400"
            >
              Term
            </label>
            <input
              id="term"
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Enter the term or concept"
              className="w-full rounded-xl glass px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-blue-500/40"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="definition"
              className="mb-1 block text-sm font-medium text-zinc-400"
            >
              Definition
            </label>
            <textarea
              id="definition"
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder="Enter the definition or explanation"
              rows={3}
              className="w-full rounded-xl glass px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-blue-500/40"
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
              {isSubmitting ? 'Adding...' : 'Add Card'}
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
        className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm font-medium transition-all glass-hover hover-glow-blue disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          className="h-4 w-4 text-blue-400"
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
        <span className="text-zinc-300">Add Flashcard</span>
      </button>

      {isOpen && createPortal(modal, document.body)}
    </>
  );
}
