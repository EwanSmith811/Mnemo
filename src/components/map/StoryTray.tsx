'use client';
import type { CSSProperties } from 'react';
import { MAX_STORY_CONCEPTS, MIN_STORY_CONCEPTS } from '@/lib/memory-story';
import type { TheaterConcept } from './StoryTheater';
import { Icon } from '../ui';

/** The picking tray shown while choosing concepts for a memory story. */
export default function StoryTray({
  picked,
  visible,
  topic,
  onRemove,
  onSelectAll,
  onClear,
  onWrite,
  onCancel,
}: {
  picked: TheaterConcept[];
  visible: { id: string }[];
  topic: string;
  onRemove: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClear: () => void;
  onWrite: () => void;
  onCancel: () => void;
}) {
  const allPicked = visible.every((n) => picked.some((p) => p.id === n.id));
  const full = picked.length >= MAX_STORY_CONCEPTS;
  return (
    <section className="story-tray" aria-label="Memory story selection">
      <div className="story-tray-head">
        <div>
          <span className="eyebrow">
            <b>●</b> Memory story
          </span>
          <p>
            {picked.length
              ? `${picked.length} of up to ${MAX_STORY_CONCEPTS} concepts cast`
              : 'Tap concepts to cast them in a ridiculous story.'}
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
            : 'Write the story'}
        </button>
      </div>
      {full && (
        <small className="muted">
          That’s the maximum cast. Remove one to add another.
        </small>
      )}
    </section>
  );
}
