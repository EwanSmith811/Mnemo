'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * A small, live concept map for the landing page: the same visual language
 * as the real map (dark core, topic clusters, curved links, travelling
 * signals), drifting slowly so it reads as alive rather than as a diagram.
 */
const NODES = [
  { id: 'core', label: 'Cardiac output', x: 50, y: 47, topic: 0, depth: 0 },
  { id: 'hr', label: 'Heart rate', x: 23, y: 27, topic: 1, depth: 1 },
  { id: 'sa', label: 'SA node', x: 15, y: 8, topic: 1, depth: 2 },
  { id: 'ans', label: 'Autonomic tone', x: 12, y: 47, topic: 1, depth: 2 },
  { id: 'sv', label: 'Stroke volume', x: 77, y: 27, topic: 3, depth: 1 },
  { id: 'pre', label: 'Preload', x: 88, y: 8, topic: 3, depth: 2 },
  { id: 'con', label: 'Contractility', x: 60, y: 10, topic: 3, depth: 2 },
  { id: 'aft', label: 'Afterload', x: 90, y: 47, topic: 3, depth: 2 },
  { id: 'bp', label: 'Blood pressure', x: 30, y: 72, topic: 2, depth: 1 },
  { id: 'shock', label: 'Shock', x: 14, y: 91, topic: 2, depth: 2 },
  { id: 'hf', label: 'Heart failure', x: 68, y: 74, topic: 4, depth: 1 },
  { id: 'fs', label: 'Frank–Starling', x: 82, y: 93, topic: 4, depth: 2 },
] as const;
const EDGES = [
  ['core', 'hr'],
  ['hr', 'sa'],
  ['hr', 'ans'],
  ['core', 'sv'],
  ['sv', 'pre'],
  ['sv', 'con'],
  ['sv', 'aft'],
  ['core', 'bp'],
  ['bp', 'shock'],
  ['core', 'hf'],
  ['hf', 'fs'],
  ['pre', 'fs'],
  ['ans', 'bp'],
] as const;
const CLUSTERS = [
  { topic: 1, x: 18, y: 28 },
  { topic: 3, x: 80, y: 24 },
  { topic: 2, x: 24, y: 80 },
  { topic: 4, x: 74, y: 82 },
];
const color = (topic: number) =>
  topic ? `var(--topic-${topic})` : 'var(--accent)';
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));
const index = (id: string) => NODES.findIndex((n) => n.id === id);

export default function HeroMap() {
  const root = useRef<HTMLDivElement>(null);
  const pills = useRef<(HTMLSpanElement | null)[]>([]);
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el || !size.w) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phase = NODES.map((_, i) => i * 1.7);
    const widths = pills.current.map((p) => p?.offsetWidth ?? 0);
    const heights = pills.current.map((p) => p?.offsetHeight ?? 0);
    // Leaves are hidden on narrow screens, so signals skip their links.
    const narrow = matchMedia('(max-width: 560px)').matches;
    const usable = EDGES.map((_, e) => e).filter(
      (e) => !narrow || EDGES[e].every((id) => NODES[index(id)].depth < 2),
    );
    const signals = [0, 1, 2].map((i) => ({
      edge: usable[(i * 5) % usable.length],
      start: -i * 900,
    }));
    let frame = 0;
    let visible = true;
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    seen.observe(el);

    const draw = (time: number) => {
      const t = still ? 0 : time / 1000;
      // Keep every pill fully inside the frame, whatever its label length.
      const points = NODES.map((n, i) => {
        const w = widths[i] / 2 + 10;
        const h = heights[i] / 2 + 10;
        return {
          x: clamp(
            (n.x / 100) * size.w + Math.sin(t * 0.5 + phase[i]) * 7,
            w,
            size.w - w,
          ),
          y: clamp(
            (n.y / 100) * size.h + Math.cos(t * 0.42 + phase[i] * 1.3) * 6,
            h,
            size.h - h,
          ),
        };
      });
      points.forEach((p, i) => {
        const pill = pills.current[i];
        if (pill)
          pill.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      });
      const curve = (e: number) => {
        const a = points[index(EDGES[e][0])];
        const b = points[index(EDGES[e][1])];
        // Bow each link a little to one side, like the real map.
        const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.18;
        const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.18;
        return { a, b, mx, my };
      };
      EDGES.forEach((_, e) => {
        const { a, b, mx, my } = curve(e);
        paths.current[e]?.setAttribute(
          'd',
          `M${a.x} ${a.y}Q${mx} ${my} ${b.x} ${b.y}`,
        );
      });
      signals.forEach((s, i) => {
        const dot = dots.current[i];
        if (!dot) return;
        let k = (time - s.start) / 2200;
        if (k > 1) {
          s.edge = usable[(usable.indexOf(s.edge) + 4 + i) % usable.length];
          s.start = time;
          k = 0;
        }
        const { a, b, mx, my } = curve(s.edge);
        const u = Math.max(0, k);
        const x = (1 - u) ** 2 * a.x + 2 * (1 - u) * u * mx + u * u * b.x;
        const y = (1 - u) ** 2 * a.y + 2 * (1 - u) * u * my + u * u * b.y;
        dot.setAttribute('cx', String(x));
        dot.setAttribute('cy', String(y));
        dot.style.opacity =
          still || k < 0 ? '0' : String(Math.sin(u * Math.PI));
        dot.style.fill = color(NODES[index(EDGES[s.edge][1])].topic);
      });
    };
    const loop = (time: number) => {
      if (visible) draw(time);
      frame = requestAnimationFrame(loop);
    };
    draw(0);
    if (!still) frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
    };
  }, [size]);

  const near = (id: string) =>
    !hovered ||
    id === hovered ||
    EDGES.some(
      ([a, b]) => (a === hovered && b === id) || (b === hovered && a === id),
    );

  return (
    <div
      ref={root}
      className={`hero-map ${hovered ? 'is-focused' : ''}`}
      aria-hidden="true"
    >
      {CLUSTERS.map((c) => (
        <i
          key={c.topic}
          className="hero-map-nebula"
          style={
            {
              left: `${c.x}%`,
              top: `${c.y}%`,
              '--c': color(c.topic),
            } as CSSProperties
          }
        />
      ))}
      <svg width={size.w} height={size.h}>
        {EDGES.map(([a, b], e) => (
          <path
            key={e}
            ref={(el) => {
              paths.current[e] = el;
            }}
            className={`${hovered && (a === hovered || b === hovered) ? 'is-lit' : ''} ${NODES[index(a)].depth === 2 || NODES[index(b)].depth === 2 ? 'is-leaf' : ''}`}
            style={
              {
                '--c': color(NODES[index(b)].topic),
                '--d': NODES[index(b)].depth,
              } as CSSProperties
            }
            pathLength={1}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            r={3.2}
            ref={(el) => {
              dots.current[i] = el;
            }}
          />
        ))}
      </svg>
      {NODES.map((n, i) => (
        <span
          key={n.id}
          ref={(el) => {
            pills.current[i] = el;
          }}
          className={`hero-map-node ${n.depth === 0 ? 'is-core' : ''} ${n.depth === 2 ? 'is-leaf' : ''} ${near(n.id) ? '' : 'is-faded'}`}
          style={{ '--c': color(n.topic), '--d': n.depth } as CSSProperties}
          onPointerEnter={() => setHovered(n.id)}
          onPointerLeave={() => setHovered(null)}
        >
          <b>{n.label}</b>
        </span>
      ))}
    </div>
  );
}
