'use client';

import { useState } from 'react';
import { Icon, Modal } from './ui';

/** Ask the model for a batch of 1–max more items. */
export function GenerateDialog({
  label,
  noun,
  description,
  max,
  disabled,
  onGenerate,
}: {
  label: string;
  noun: string;
  description: string;
  max: number;
  disabled?: boolean;
  onGenerate: (count: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = Math.max(1, Math.min(count, max));
  return (
    <>
      <button
        className="secondary-button is-small"
        disabled={disabled || max <= 0}
        onClick={() => {
          setError('');
          setCount(Math.min(5, max));
          setOpen(true);
        }}
      >
        <Icon name="sparkle" size={15} /> {label}
      </button>
      {open && (
        <Modal
          title={label}
          description={description}
          onClose={() => setOpen(false)}
          busy={busy}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await onGenerate(value);
                setOpen(false);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : 'Generation failed.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field">
              <span>How many {noun}?</span>
              <div className="stepper">
                <button
                  type="button"
                  aria-label="Fewer"
                  disabled={busy || value <= 1}
                  onClick={() => setCount(value - 1)}
                >
                  −
                </button>
                <output aria-live="polite">{value}</output>
                <button
                  type="button"
                  aria-label="More"
                  disabled={busy || value >= max}
                  onClick={() => setCount(value + 1)}
                >
                  +
                </button>
              </div>
              <small>Up to {max} at a time.</small>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? (
                  <>
                    <span className="loading-spinner" /> Generating…
                  </>
                ) : (
                  `Generate ${value}`
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

interface Field {
  name: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  maxLength: number;
}

/** A small form dialog that posts its fields and returns the created item. */
export function AddDialog<T>({
  label,
  title,
  description,
  fields,
  endpoint,
  disabled,
  onAdd,
}: {
  label: string;
  title: string;
  description: string;
  fields: Field[];
  endpoint: string;
  disabled?: boolean;
  onAdd: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button
        className="ghost-button is-small"
        disabled={disabled}
        onClick={() => {
          setValues({});
          setError('');
          setOpen(true);
        }}
      >
        <Icon name="plus" size={15} /> {label}
      </button>
      {open && (
        <Modal
          title={title}
          description={description}
          onClose={() => setOpen(false)}
          busy={busy}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (fields.some((f) => !values[f.name]?.trim())) {
                setError('Fill in every field.');
                return;
              }
              setBusy(true);
              setError('');
              try {
                const res = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(
                    Object.fromEntries(
                      fields.map((f) => [f.name, values[f.name].trim()]),
                    ),
                  ),
                });
                const data = await res.json();
                if (!res.ok)
                  throw new Error(data.error || 'Could not save it.');
                onAdd(data as T);
                setOpen(false);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : 'Could not save it.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {fields.map((f) => (
              <label key={f.name} className="field">
                <span>{f.label}</span>
                {f.multiline ? (
                  <textarea
                    className="textarea"
                    rows={5}
                    placeholder={f.placeholder}
                    maxLength={f.maxLength}
                    value={values[f.name] ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.name]: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    className="input"
                    placeholder={f.placeholder}
                    maxLength={f.maxLength}
                    value={values[f.name] ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.name]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
