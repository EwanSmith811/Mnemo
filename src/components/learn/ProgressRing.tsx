import type { CSSProperties } from 'react';

/**
 * Deck progress as a ring: green for slides you've got, amber for shaky
 * ones. Both arcs animate as you rate, and the ring glows when it closes.
 */
export default function ProgressRing({
  understood,
  shaky,
  total,
  size = 64,
}: {
  understood: number;
  shaky: number;
  total: number;
  size?: number;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const good = total ? (understood / total) * c : 0;
  const warn = total ? (shaky / total) * c : 0;
  const done = total > 0 && understood + shaky >= total;
  return (
    <div
      className={`progress-ring ${done ? 'is-done' : ''}`}
      style={{ '--size': `${size}px` } as CSSProperties}
      role="img"
      aria-label={`${understood + shaky} of ${total} slides rated: ${understood} got it, ${shaky} shaky`}
    >
      <svg viewBox="0 0 64 64">
        <circle className="progress-ring-track" cx="32" cy="32" r={r} />
        <circle
          className="progress-ring-arc is-shaky"
          cx="32"
          cy="32"
          r={r}
          strokeDasharray={`${warn} ${c}`}
          strokeDashoffset={-good}
        />
        <circle
          className="progress-ring-arc is-good"
          cx="32"
          cy="32"
          r={r}
          strokeDasharray={`${good} ${c}`}
        />
      </svg>
      <span className="progress-ring-label">
        <strong key={understood + shaky}>{understood + shaky}</strong>
        <small>of {total}</small>
      </span>
    </div>
  );
}
