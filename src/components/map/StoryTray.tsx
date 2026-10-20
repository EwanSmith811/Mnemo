'use client';
import type { CSSProperties } from 'react';
import {
  MAX_INTERESTS_LENGTH,
  MAX_STORY_CONCEPTS,
  MIN_STORY_CONCEPTS,
} from '@/lib/memory-story';
import type { TheaterConcept } from './StoryTheater';
import { Icon } from '../ui';

/** The picking tray shown while choosing concepts for memory riffs. */
export default function StoryTray({
  picked,
  visible,
  topic,
  interests,
  onInterests,
  onRemove,
  onSelectAll,
  onClear,
  onWrite,
  onCancel,
}: {
  picked: TheaterConcept[];
  visible: { id: string }[];
  topic: string;
  interests: string;
  onInterests: (value: string) => void;
  onRemove: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClear: () => void;
  onWrite: () => void;
  onCancel: () => void;
}) {
  const allPicked = visible.every((n) => picked.some((p) => p.id === n.id));
  const full = picked.length >= MAX_STORY_CONCEPTS;
  return (
    <section className="story-tray" aria-label="Memory riff selection">
      <div className="story-tray-head">
        <div>
          <span className="eyebrow">Memory riffs</span>
          <p>
            {picked.length
              ? `${picked.length} of up to ${MAX_STORY_CONCEPTS} concepts picked`
              : 'Tap concepts to turn them into ridiculous one-liners.'}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Stop picking concepts"
          onClick={onCancel}
        >
          <Icon name="close" />
        </button>
      </div>
      {picked.length > 0 && (
        <ol className="story-tray-chips">
          {picked.map((c, i) => (
            <li key={c.id} style={{ '--c': c.color } as CSSProperties}>
              <span className="mono">{i + 1}</span>
              {c.label}
              <button
                aria-label={`Remove ${c.label}`}
                onClick={() => onRemove(c.id)}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <label className="story-tray-interests">
        <span>Into anything?</span>
        <input
          type="text"
          value={interests}
          maxLength={MAX_INTERESTS_LENGTH}
          placeholder="Optional: Taylor Swift, F1, Zelda, baking…"
          onChange={(e) => onInterests(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && picked.length >= MIN_STORY_CONCEPTS)
              onWrite();
          }}
        />
      </label>
      <div className="story-tray-actions">
        <button
          className="ghost-button is-small"
          disabled={allPicked || full || !visible.length}
          onClick={() => onSelectAll(visible.map((n) => n.id))}
        >
          {topic === 'All topics' ? 'Select all' : `Select all in ${topic}`}
        </button>
        {picked.length > 0 && (
          <button className="ghost-button is-small" onClick={onClear}>
            Clear
          </button>
        )}
        <button
          className="primary-button"
          disabled={picked.length < MIN_STORY_CONCEPTS}
          onClick={onWrite}
        >
          <Icon name="sparkle" size={15} />
          {picked.length < MIN_STORY_CONCEPTS
            ? `Pick ${MIN_STORY_CONCEPTS - picked.length} more`
            : 'Write the riffs'}
        </button>
      </div>
      {full && (
        <small className="muted">
          That’s the maximum. Remove one to add another.
        </small>
      )}
    </section>
  );
}
