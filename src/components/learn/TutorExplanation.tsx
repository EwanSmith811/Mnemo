'use client';
import { useId, useState, type CSSProperties } from 'react';
import type { SlideExplanation, TutorBlock } from '@/lib/slide-tutor';

function Flow({ block }: { block: Extract<TutorBlock, { type: 'flow' }> }) {
  const [step, setStep] = useState(0);
  const last = block.steps.length - 1;
  return (
    <figure className="tutor-visual">
      <figcaption>{block.title}</figcaption>
      <ol
        className="tutor-flow"
        style={{ '--progress': last ? step / last : 1 } as CSSProperties}
      >
        {block.steps.map((s, i) => (
          <li
            key={i}
            className={i < step ? 'is-past' : i === step ? 'is-current' : ''}
          >
            <button aria-pressed={i === step} onClick={() => setStep(i)}>
              <span className="tutor-flow-num mono">{i + 1}</span>
              <strong>{s.label}</strong>
            </button>
            {i === step && (
              <p className="tutor-flow-detail" aria-live="polite">
                {s.detail}
              </p>
            )}
            {i < last && s.connector && (
              <small className="tutor-flow-connector">{s.connector}</small>
            )}
          </li>
        ))}
      </ol>
      <div className="tutor-step-controls">
        <button
          className="ghost-button is-small"
          disabled={!step}
          onClick={() => setStep(step - 1)}
        >
          ← Back
        </button>
        <span className="mono">
          {step + 1} / {block.steps.length}
        </span>
        <button
          className="secondary-button is-small"
          disabled={step === last}
          onClick={() => setStep(step + 1)}
        >
          Next step
        </button>
      </div>
    </figure>
  );
}

const BOX = { w: 200, h: 52 };
function Diagram({
  block,
}: {
  block: Extract<TutorBlock, { type: 'diagram' }>;
}) {
  const id = useId().replaceAll(':', '');
  const [selected, setSelected] = useState(0);
  const columns = block.nodes.length <= 4 ? 2 : 3;
  const gapX = columns === 2 ? 280 : 240;
  const width = (columns - 1) * gapX + BOX.w + 40;
  const top = 30;
  const rows = Math.ceil(block.nodes.length / columns);
  const point = (i: number) => ({
    x: 20 + BOX.w / 2 + (i % columns) * gapX,
    y: 40 + Math.floor(i / columns) * 110,
  });
  const edge = (from: number, to: number) => {
    const a = point(from);
    const b = point(to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Skip over a box in between by arcing above the row.
    if (!dy && Math.abs(dx) > gapX * 1.5)
      return `M${a.x} ${a.y - BOX.h / 2 - 4} Q${(a.x + b.x) / 2} ${a.y - 62} ${b.x} ${b.y - BOX.h / 2 - 6}`;
    const reach = Math.min(
      (BOX.w / 2 + 6) / Math.max(0.001, Math.abs(dx)),
      (BOX.h / 2 + 6) / Math.max(0.001, Math.abs(dy)),
    );
    return `M${a.x + dx * reach} ${a.y + dy * reach} L${b.x - dx * reach} ${b.y - dy * reach}`;
  };
  const current = block.nodes[selected];
  return (
    <figure className="tutor-visual">
      <figcaption>{block.title}</figcaption>
      <div className="tutor-diagram-scroll">
        <svg
          className="tutor-diagram"
          viewBox={`0 -${top} ${width} ${rows * 110 - 30 + top}`}
          role="img"
          aria-label={`${block.title}. Connections are listed below.`}
        >
          <defs>
            <marker
              id={id}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0L8 4L0 8" fill="currentColor" />
            </marker>
          </defs>
          {block.edges.map((e, i) => {
            const from = block.nodes.findIndex((n) => n.id === e.from);
            const to = block.nodes.findIndex((n) => n.id === e.to);
            const active = from === selected || to === selected;
            return (
              <path
                key={i}
                className={active ? 'is-active' : ''}
                d={edge(from, to)}
                markerEnd={`url(#${id})`}
              />
            );
          })}
          {block.nodes.map((n, i) => {
            const p = point(i);
            return (
              <foreignObject
                key={n.id}
                x={p.x - BOX.w / 2}
                y={p.y - BOX.h / 2}
                width={BOX.w}
                height={BOX.h}
              >
                <button
                  className="tutor-diagram-node"
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                >
                  {n.label}
                </button>
              </foreignObject>
            );
          })}
        </svg>
      </div>
      <p className="tutor-diagram-detail" aria-live="polite">
        <strong>{current.label}</strong>
        {current.detail}
      </p>
      <details className="tutor-diagram-list">
        <summary>Read the connections as text</summary>
        <ul>
          {block.edges.map((e, i) => (
            <li key={i}>
              {block.nodes.find((n) => n.id === e.from)?.label} →{' '}
              {block.nodes.find((n) => n.id === e.to)?.label}
              {e.label && `: ${e.label}`}
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}

export default function TutorExplanation({
  value,
  compact = false,
}: {
  value: SlideExplanation;
  /** Follow-up replies render without the large heading and takeaway card. */
  compact?: boolean;
}) {
  return (
    <article className={`tutor-explanation ${compact ? 'is-compact' : ''}`}>
      {!compact && <h2>{value.title}</h2>}
      {value.blocks.map((block, i) => {
        const style = { '--i': i } as CSSProperties;
        if (block.type === 'flow')
          return (
            <div key={i} className="rise" style={style}>
              <Flow block={block} />
            </div>
          );
        if (block.type === 'diagram')
          return (
            <div key={i} className="rise" style={style}>
              <Diagram block={block} />
            </div>
          );
        if (block.type === 'table')
          return (
            <figure key={i} className="tutor-visual rise" style={style}>
              <figcaption>{block.title}</figcaption>
              <div className="tutor-table-scroll" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      {block.columns.map((c, j) => (
                        <th key={j} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((v, k) => (
                          <td key={k}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </figure>
          );
        if (block.type === 'analogy')
          return (
            <aside key={i} className="tutor-analogy rise" style={style}>
              <span className="eyebrow">Analogy</span>
              <h3>{block.title}</h3>
              <p>{block.text}</p>
            </aside>
          );
        return (
          <section key={i} className="tutor-text rise" style={style}>
            {block.heading && <h3>{block.heading}</h3>}
            <p>{block.text}</p>
          </section>
        );
      })}
      {compact ? (
        value.takeaway && (
          <p className="tutor-takeaway-inline">{value.takeaway}</p>
        )
      ) : (
        <p
          className="tutor-takeaway rise"
          style={{ '--i': value.blocks.length } as CSSProperties}
        >
          <span className="eyebrow">Keep this</span>
          {value.takeaway}
        </p>
      )}
    </article>
  );
}
