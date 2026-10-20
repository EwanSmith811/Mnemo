import type { CSSProperties } from 'react';

const COLORS = [1, 2, 3, 4, 5, 6].map((n) => `var(--topic-${n})`);

/**
 * A short burst of paper confetti for finishing a deck. Positions come from
 * a golden-ratio sequence, so the spread looks random but renders the same
 * every time. Hidden entirely for reduced motion.
 */
export default function Confetti({ pieces = 70 }: { pieces?: number }) {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: pieces }, (_, i) => {
        const r = (i * 0.618034) % 1;
        const s = (i * 0.414214) % 1;
        return (
          <i
            key={i}
            style={
              {
                '--x': `${r * 100}vw`,
                '--drift': `${(s - 0.5) * 220}px`,
                '--spin': `${(r - 0.5) * 1440}deg`,
                '--delay': `${s * 0.6}s`,
                '--dur': `${2.2 + r * 1.6}s`,
                '--w': `${6 + s * 6}px`,
                background: COLORS[i % COLORS.length],
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
