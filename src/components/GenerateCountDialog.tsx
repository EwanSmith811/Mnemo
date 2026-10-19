'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '@/lib/use-modal-focus';

interface GenerateCountDialogProps {
  accent: 'blue' | 'emerald';
  buttonLabel: string;
  confirmLabel: string;
  countLabel: string;
  description: string;
  heading: string;
  isDisabled?: boolean;
  maxCount: number;
  onGenerate: (count: number) => Promise<void>;
}

const accentStyles = {
  blue: {
    buttonGlow: 'hover-glow-blue',
    buttonIcon: 'text-blue-400',
    confirmButton: 'from-blue-500 to-indigo-500 ',
    panelBorder: 'border-blue-500/20',
    panelBg: 'bg-blue-500/10',
    titleText: 'text-blue-300',
    focusBorder: 'focus:border-blue-500/40',
  },
  emerald: {
    buttonGlow: 'hover-glow-emerald',
    buttonIcon: 'text-emerald-400',
    confirmButton: 'from-emerald-500 to-green-500 ',
    panelBorder: 'border-emerald-500/20',
    panelBg: 'bg-emerald-500/10',
    titleText: 'text-emerald-300',
    focusBorder: 'focus:border-emerald-500/40',
  },
} as const;

export default function GenerateCountDialog({
  accent,
  buttonLabel,
  confirmLabel,
  countLabel,
  description,
  heading,
  isDisabled = false,
  maxCount,
  onGenerate,
}: GenerateCountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(Math.min(5, maxCount || 1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useModalFocus(isOpen, () => {
    if (!isSubmitting) setIsOpen(false);
  });

  const styles = accentStyles[accent];

  const openDialog = () => {
    if (isDisabled || maxCount <= 0) return;
    setError('');
    setCount(Math.max(1, Math.min(5, maxCount)));
    setIsOpen(true);
  };

  const closeDialog = () => {
    if (isSubmitting) return;
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      await onGenerate(Math.max(1, Math.min(count, maxCount)));
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
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
        aria-label="Generate study material"
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
          <div>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100">
              {heading}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">{description}</p>
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
          <div
            className={`mb-4 rounded-2xl border px-4 py-4 ${styles.panelBorder} ${styles.panelBg}`}
          >
            <label
              htmlFor={`${accent}-generate-count`}
              className="block text-sm font-medium text-zinc-200"
            >
              {countLabel}
            </label>
            <div className="mt-3 flex items-center gap-3">
              <input
                id={`${accent}-generate-count`}
                type="number"
                min={1}
                max={maxCount}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.max(
                      1,
                      Math.min(Number(e.target.value) || 1, maxCount),
                    ),
                  )
                }
                disabled={isSubmitting}
                className={`w-28 rounded-xl glass px-3 py-2 text-sm text-zinc-100 outline-none transition-all disabled:opacity-50 ${styles.focusBorder}`}
              />
              <p className={`text-sm ${styles.titleText}`}>
                Choose between 1 and {maxCount}.
              </p>
            </div>
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
              className={`rounded-xl bg-gradient-to-r px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50 ${styles.confirmButton}`}
            >
              {isSubmitting ? 'Generating...' : confirmLabel}
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
        disabled={isDisabled || maxCount === 0}
        className={`inline-flex items-center gap-2 rounded-xl glass px-4 py-2 text-sm font-medium transition-all glass-hover disabled:cursor-not-allowed disabled:opacity-50 ${styles.buttonGlow}`}
      >
        <svg
          className={`h-4 w-4 ${styles.buttonIcon}`}
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
        <span className="text-zinc-300">{buttonLabel}</span>
      </button>

      {isOpen && createPortal(modal, document.body)}
    </>
  );
}
