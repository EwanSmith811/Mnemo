'use client';

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type CSSProperties,
} from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  layoutGraph,
  normalizeGraph,
  NODE_WIDTH as W,
  NODE_HEIGHT as H,
} from '@/lib/graph';
import type { ConceptGraph } from '@/types';
import { MAX_STORY_CONCEPTS } from '@/lib/memory-story';
import StoryTheater, { type TheaterConcept } from './map/StoryTheater';
import StoryTray from './map/StoryTray';
import { Icon } from './ui';

// Topic hues are theme tokens so the map follows light and dark mode.
const COLORS = [1, 2, 3, 4, 5, 6].map((n) => `var(--topic-${n})`);
const INITIAL_VIEW = { x: 0, y: 0, width: 1200, height: 800 };
export default function GraphClient() {
  const { documentId } = useParams<{ documentId: string }>();
  const [graph, setGraph] = useState<ConceptGraph | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All topics');
  const [selected, setSelected] = useState<string | null>(null);
  const [crossLinks, setCrossLinks] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [motion, setMotion] = useState(true);
  const [hidden, setHidden] = useState(false);
  const page = useRef<HTMLElement>(null);
  const [listView, setListView] = useState(false);
  // Memory story: pick concepts on the map, then open the story theater.
  const [storyMode, setStoryMode] = useState(false);
  const [storyNodes, setStoryNodes] = useState<string[]>([]);
  const [theater, setTheater] = useState(false);
  const [view, setView] = useState(INITIAL_VIEW);
  const [hovered, setHovered] = useState<string | null>(null);
  const viewRef = useRef(view);
  const flight = useRef(0);
  const placed = useRef(false);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  /** Ease the camera to a target view instead of jumping. */
  const flyTo = useCallback((target: typeof view, instant = false) => {
    cancelAnimationFrame(flight.current);
    const from = viewRef.current;
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setView(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 750);
      const e = 1 - (1 - k) ** 4;
      setView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        width: from.width + (target.width - from.width) * e,
        height: from.height + (target.height - from.height) * e,
      });
      if (k < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  }, []);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    view: typeof view;
    moved: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    distance: number;
    x: number;
    y: number;
    view: typeof view;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/graph/${documentId}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || 'Could not load the concept map.');
        const next = normalizeGraph(data);
        setGraph(next);
        setSelected(null);
        setStoryNodes([]);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId, retry]);
  const layout = useMemo(() => (graph ? layoutGraph(graph) : null), [graph]);
  const groups = useMemo(
    () => [...new Set(graph?.nodes.map((n) => n.group))].sort(),
    [graph],
  );
  const positions = useMemo(
    () => new Map(layout?.nodes.map((n) => [n.id, n])),
    [layout],
  );
  // Distance from the core concept drives the ripple-out entrance.
  const depth = useMemo(() => {
    const result = new Map<string, number>();
    if (!layout?.nodes.length) return result;
    const start =
      layout.nodes.find((n) => n.id === 'central') ?? layout.nodes[0];
    const queue = [start.id];
    result.set(start.id, 0);
    while (queue.length) {
      const id = queue.shift()!;
      for (const e of layout.edges) {
        const next =
          e.source === id ? e.target : e.target === id ? e.source : null;
        if (next && !result.has(next)) {
          result.set(next, result.get(id)! + 1);
          queue.push(next);
        }
      }
    }
    return result;
  }, [layout]);
  const color = (name: string) =>
    COLORS[Math.max(0, groups.indexOf(name)) % COLORS.length];
  const matches = useMemo(
    () =>
      new Set(
        graph?.nodes
          .filter(
            (n) =>
              (group === 'All topics' || n.group === group) &&
              `${n.label} ${n.definition}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((n) => n.id),
      ),
    [graph, group, query],
  );
  const current = graph?.nodes.find((n) => n.id === selected);
  const connections =
    graph?.edges.filter(
      (e) => e.source === selected || e.target === selected,
    ) ?? [];
  // Selection wins; otherwise hovering previews a concept's neighborhood.
  const focus = selected ?? hovered;
  const neighbors = new Set(
    (graph?.edges ?? [])
      .filter((e) => e.source === focus || e.target === focus)
      .flatMap((e) => [e.source, e.target]),
  );
  const fit = useCallback(() => {
    if (!layout) return;
    const box = svg.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return;
    const top = box.width < 1100 ? 150 : 105,
      bottom = 100;
    const scale = Math.min(
      1.15,
      Math.max(120, box.width - 64) / layout.width,
      Math.max(100, box.height - top - bottom) / layout.height,
    );
    const width =
        box.width < 700 ? Math.min(layout.width, 850) : box.width / scale,
      height = (width * box.height) / box.width;
    const root =
      layout.nodes.find((n) => n.id === 'central') ?? layout.nodes[0];
    const centerX = box.width < 700 ? root.x + W / 2 : layout.width / 2;
    const centerY = box.width < 700 ? root.y + H / 2 : layout.height / 2;
    flyTo(
      {
        x: centerX - width / 2,
        y:
          centerY -
          height * ((top + (box.height - top - bottom) / 2) / box.height),
        width,
        height,
      },
      !placed.current,
    );
    placed.current = true;
  }, [layout, flyTo]);
  useEffect(() => {
    const update = () => {
      if (page.current)
        page.current.style.setProperty(
          '--map-top',
          `${Math.max(0, page.current.getBoundingClientRect().top)}px`,
        );
    };
    const visibility = () => setHidden(document.hidden);
    update();
    window.addEventListener('resize', update);
    document.addEventListener('visibilitychange', visibility);
    const observer = new ResizeObserver(update);
    document
      .querySelectorAll('.site-navigation,.study-navigation')
      .forEach((n) => observer.observe(n));
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('visibilitychange', visibility);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(flight.current);
      const box = element.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width,
        py = (event.clientY - box.top) / box.height;
      setView((v) => {
        const factor = Math.exp(
          Math.max(
            -200,
            Math.min(
              200,
              event.deltaY *
                (event.deltaMode === 1
                  ? 16
                  : event.deltaMode === 2
                    ? box.height
                    : 1),
            ),
          ) * 0.0025,
        );
        const width = Math.max(350, Math.min(16000, v.width * factor)),
          height = (v.height * width) / v.width;
        return {
          x: v.x + (v.width - width) * px,
          y: v.y + (v.height - height) * py,
          width,
          height,
        };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [loading, listView]);
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(fit);
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [fit, loading, listView]);
  function zoom(factor: number) {
    const v = viewRef.current;
    const width = Math.max(300, Math.min(12000, v.width * factor));
    const height = (v.height * width) / v.width;
    flyTo({
      x: v.x + (v.width - width) / 2,
      y: v.y + (v.height - height) / 2,
      width,
      height,
    });
  }
  // The view before a concept was opened, restored when it's closed again.
  const beforeFocus = useRef<typeof view | null>(null);
  function deselect() {
    setSelected(null);
    setInspectorOpen(false);
    if (beforeFocus.current) flyTo(beforeFocus.current);
    beforeFocus.current = null;
  }
  function focusNode(id: string) {
    // Hopping between concepts keeps the original view to return to.
    beforeFocus.current ??= viewRef.current;
    setSelected(id);
    setInspectorOpen(true);
    const node = positions.get(id),
      box = svg.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (node)
      flyTo(
        (() => {
          const width = Math.min(v.width, box && box.width <= 760 ? 800 : 1400),
            height = (width * v.height) / v.width;
          const targetX =
            box && box.width > 760
              ? Math.max(0.28, (box.width - 380) / box.width / 2)
              : 0.5;
          return {
            x: node.x + W / 2 - width * targetX,
            y:
              node.y + H / 2 - height * (box && box.width <= 760 ? 0.32 : 0.52),
            width,
            height,
          };
        })(),
      );
  }
  function focusTopic(topic: string) {
    setGroup(topic);
    beforeFocus.current = null;
    setSelected(null);
    setInspectorOpen(false);
    const region = layout?.regions.find((r) => r.group === topic);
    if (!region) {
      fit();
      return;
    }
    const v = viewRef.current;
    const ratio = v.width / v.height;
    const width = Math.max(region.width + 80, (region.height + 80) * ratio);
    flyTo({
      x: region.x + region.width / 2 - width / 2,
      y: region.y + region.height / 2 - width / ratio / 2,
      width,
      height: width / ratio,
    });
  }
  function toggleStoryNode(id: string) {
    setStoryNodes((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length >= MAX_STORY_CONCEPTS
          ? ids
          : [...ids, id],
    );
  }
  const storyConcepts = useMemo<TheaterConcept[]>(
    () =>
      storyNodes
        .map((id) => graph?.nodes.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => !!n)
        .map((n) => ({
          id: n.id,
          label: n.label,
          color: COLORS[Math.max(0, groups.indexOf(n.group)) % COLORS.length],
        })),
    [storyNodes, graph, groups],
  );
  const paused = !motion || hidden;
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    if (paused || matchMedia('(prefers-reduced-motion: reduce)').matches)
      element.pauseAnimations();
    else element.unpauseAnimations();
  }, [paused, loading, listView]);
  const root =
    layout?.nodes.find((n) => n.id === 'central') ?? layout?.nodes[0];
  const showInspector = inspectorOpen && !!current && !storyMode;
  return (
    <main
      ref={page}
      className={`map-page map-immersive ${showInspector ? 'has-inspector' : ''} ${storyMode ? 'is-story-mode' : ''} ${!motion || hidden ? 'motion-paused' : ''}`}
    >
      <header className="map-header">
        <div className="map-identity">
          <Link
            className="map-back"
            aria-label="Back to document"
            href={`/documents/${documentId}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="m14 6-6 6 6 6M8 12h12" />
            </svg>
          </Link>
          <div>
            <h1>Concept map</h1>
            <span className="map-count" role="status">
              {loading
                ? 'Finding the connections…'
                : `${matches.size} / ${graph?.nodes.length ?? 0} concepts`}
            </span>
          </div>
        </div>
        <div className="map-header-actions">
          <button
            className={`map-story-toggle ${storyMode ? 'is-on' : ''}`}
            aria-pressed={storyMode}
            disabled={loading || !!error}
            onClick={() => {
              setStoryMode((on) => !on);
              deselect();
            }}
          >
            <Icon name={storyMode ? 'check' : 'sparkle'} size={16} />
            <span>{storyMode ? 'Done' : 'Memory story'}</span>
          </button>
          <Link
            className="map-workbench-link"
            href={`/workbench/${documentId}`}
          >
            <span>Workbench</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M6 18 18 6M6 6h12v12" />
            </svg>
          </Link>
        </div>
      </header>
      {loading ? (
        <div className="map-status" role="status">
          <span className="loading-spinner" />
          Opening your concept map…
        </div>
      ) : error ? (
        <div className="map-status" role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            onClick={() => {
              setLoading(true);
              setError('');
              setRetry((r) => r + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="map-toolbar">
            <label className="search-field">
              <span className="sr-only">Search concepts</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a concept…"
                type="search"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches.size)
                    focusNode([...matches][0]);
                }}
              />
            </label>
            <label>
              <span className="sr-only">Filter by topic</span>
              <select
                value={group}
                onChange={(e) => focusTopic(e.target.value)}
              >
                {['All topics', ...groups].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <button
              className="map-view-toggle"
              aria-pressed={listView}
              onClick={() => setListView((v) => !v)}
              title={listView ? 'Switch to map' : 'Switch to list'}
            >
              {listView ? 'Map' : 'List'}
            </button>
          </div>
          <div className="map-workspace">
            <section className="map-canvas" aria-label="Concept map">
              {listView ? (
                <div className="concept-list">
                  {layout?.nodes
                    .filter((n) => matches.has(n.id))
                    .map((n) => (
                      <button
                        key={n.id}
                        aria-pressed={
                          storyMode
                            ? storyNodes.includes(n.id)
                            : selected === n.id
                        }
                        className={storyNodes.includes(n.id) ? 'is-picked' : ''}
                        onClick={() =>
                          storyMode ? toggleStoryNode(n.id) : focusNode(n.id)
                        }
                      >
                        <span style={{ color: color(n.group) }}>{n.group}</span>
                        <strong>{n.label}</strong>
                        <p>{n.definition}</p>
                      </button>
                    ))}
                </div>
              ) : (
                <>
                  <svg
                    ref={svg}
                    className="graph-svg"
                    tabIndex={0}
                    aria-label="Interactive concept map. Drag to pan, scroll to zoom, or use arrow keys and plus or minus. Select a concept to explore its connections."
                    viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        deselect();
                        return;
                      }
                      if (e.target !== e.currentTarget) return;
                      const shift = view.width * 0.08;
                      if (
                        [
                          'ArrowLeft',
                          'ArrowRight',
                          'ArrowUp',
                          'ArrowDown',
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        setView((v) => ({
                          ...v,
                          x:
                            v.x +
                            (e.key === 'ArrowRight'
                              ? shift
                              : e.key === 'ArrowLeft'
                                ? -shift
                                : 0),
                          y:
                            v.y +
                            (e.key === 'ArrowDown'
                              ? shift
                              : e.key === 'ArrowUp'
                                ? -shift
                                : 0),
                        }));
                      }
                      if (e.key === '+' || e.key === '=') {
                        e.preventDefault();
                        zoom(0.8);
                      }
                      if (e.key === '-') {
                        e.preventDefault();
                        zoom(1.25);
                      }
                      if (e.key === '0') fit();
                    }}
                    onPointerDown={(e) => {
                      cancelAnimationFrame(flight.current);
                      if (
                        (e.target as Element).closest('[data-node]') &&
                        !pointers.current.size
                      )
                        return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      pointers.current.set(e.pointerId, {
                        x: e.clientX,
                        y: e.clientY,
                      });
                      if (pointers.current.size === 2) {
                        const [a, b] = [...pointers.current.values()];
                        pinch.current = {
                          distance: Math.max(
                            1,
                            Math.hypot(a.x - b.x, a.y - b.y),
                          ),
                          x: (a.x + b.x) / 2,
                          y: (a.y + b.y) / 2,
                          view,
                        };
                        drag.current = null;
                      } else
                        drag.current = {
                          x: e.clientX,
                          y: e.clientY,
                          view,
                          moved: false,
                        };
                    }}
                    onPointerMove={(e) => {
                      if (!pointers.current.has(e.pointerId)) return;
                      pointers.current.set(e.pointerId, {
                        x: e.clientX,
                        y: e.clientY,
                      });
                      const box = e.currentTarget.getBoundingClientRect();
                      if (pinch.current && pointers.current.size === 2) {
                        const [a, b] = [...pointers.current.values()],
                          start = pinch.current;
                        const distance = Math.max(
                          1,
                          Math.hypot(a.x - b.x, a.y - b.y),
                        );
                        const width = Math.max(
                            350,
                            Math.min(
                              16000,
                              (start.view.width * start.distance) / distance,
                            ),
                          ),
                          height =
                            (start.view.height * width) / start.view.width;
                        const worldX =
                            start.view.x +
                            ((start.x - box.left) * start.view.width) /
                              box.width,
                          worldY =
                            start.view.y +
                            ((start.y - box.top) * start.view.height) /
                              box.height;
                        setView({
                          x:
                            worldX -
                            (((a.x + b.x) / 2 - box.left) * width) / box.width,
                          y:
                            worldY -
                            (((a.y + b.y) / 2 - box.top) * height) / box.height,
                          width,
                          height,
                        });
                        return;
                      }
                      const start = drag.current;
                      if (!start) return;
                      const dx = e.clientX - start.x,
                        dy = e.clientY - start.y;
                      start.moved ||= Math.abs(dx) + Math.abs(dy) > 4;
                      setView({
                        ...start.view,
                        x: start.view.x - (dx * start.view.width) / box.width,
                        y: start.view.y - (dy * start.view.height) / box.height,
                      });
                    }}
                    onPointerUp={(e) => {
                      if (drag.current && !drag.current.moved && selected)
                        deselect();
                      pointers.current.delete(e.pointerId);
                      pinch.current = null;
                      drag.current = null;
                    }}
                    onPointerCancel={(e) => {
                      pointers.current.delete(e.pointerId);
                      pinch.current = null;
                      drag.current = null;
                    }}
                  >
                    <defs>
                      <pattern
                        id="graph-stars"
                        width="96"
                        height="96"
                        patternUnits="userSpaceOnUse"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r=".9"
                          style={{ fill: 'var(--ink-3)' }}
                        />
                        <circle
                          cx="58"
                          cy="70"
                          r=".55"
                          style={{ fill: 'var(--ink-3)' }}
                        />
                      </pattern>
                      <radialGradient id="graph-root-light">
                        <stop
                          offset="0"
                          style={{
                            stopColor: 'var(--accent)',
                            stopOpacity: 0.12,
                          }}
                        />
                        <stop
                          offset="1"
                          style={{ stopColor: 'var(--accent)', stopOpacity: 0 }}
                        />
                      </radialGradient>
                      {groups.map((g, i) => (
                        <radialGradient key={g} id={`graph-nebula-${i}`}>
                          <stop
                            offset="0"
                            style={{ stopColor: color(g), stopOpacity: 0.55 }}
                          />
                          <stop
                            offset=".55"
                            style={{ stopColor: color(g), stopOpacity: 0.16 }}
                          />
                          <stop
                            offset="1"
                            style={{ stopColor: color(g), stopOpacity: 0 }}
                          />
                        </radialGradient>
                      ))}
                      <filter
                        id="graph-glow"
                        x="-50%"
                        y="-50%"
                        width="200%"
                        height="200%"
                      >
                        <feGaussianBlur stdDeviation="3" />
                      </filter>
                      <marker
                        id="graph-arrow"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path
                          d="m2 2 6 3-6 3"
                          fill="none"
                          style={{ stroke: 'var(--accent)' }}
                          strokeWidth="1.2"
                        />
                      </marker>
                    </defs>
                    <rect
                      x={view.x}
                      y={view.y}
                      width={view.width}
                      height={view.height}
                      fill="url(#graph-stars)"
                      opacity=".32"
                    />
                    <g className="graph-nebulae" aria-hidden="true">
                      {layout?.regions.map((r) => {
                        const i = groups.indexOf(r.group);
                        const dim =
                          (group !== 'All topics' && group !== r.group) ||
                          (!!focus && positions.get(focus)?.group !== r.group);
                        return (
                          <ellipse
                            key={r.group}
                            cx={r.x + r.width / 2}
                            cy={r.y + r.height / 2}
                            rx={r.width / 2 + 170}
                            ry={r.height / 2 + 140}
                            fill={`url(#graph-nebula-${i})`}
                            className={dim ? 'is-dim' : ''}
                            style={{ '--i': i } as CSSProperties}
                          />
                        );
                      })}
                    </g>
                    {root && (
                      <g className="graph-root-field" aria-hidden="true">
                        <circle
                          cx={root.x + W / 2}
                          cy={root.y + H / 2}
                          r="230"
                          fill="url(#graph-root-light)"
                        />
                        <g
                          className="graph-root-orbit"
                          style={{
                            transformOrigin: `${root.x + W / 2}px ${root.y + H / 2}px`,
                          }}
                        >
                          <ellipse
                            cx={root.x + W / 2}
                            cy={root.y + H / 2}
                            rx="157"
                            ry="110"
                            fill="none"
                            style={{ stroke: 'var(--accent)' }}
                            strokeOpacity=".3"
                            strokeDasharray="120 30 2 30"
                            strokeWidth=".8"
                          />
                          <circle
                            cx={root.x + W / 2 + 157}
                            cy={root.y + H / 2}
                            r="3"
                            style={{ fill: 'var(--accent)' }}
                          />
                        </g>
                      </g>
                    )}
                    {layout?.edges
                      .filter(
                        (e) =>
                          e.isTree ||
                          crossLinks ||
                          e.source === selected ||
                          e.target === selected,
                      )
                      .map((e, index) => {
                        const from = positions.get(e.source),
                          to = positions.get(e.target);
                        if (!from || !to) return null;
                        const active = e.source === focus || e.target === focus;
                        const gradient = `graph-edge-${index}`;
                        const delay =
                          Math.min(
                            depth.get(e.source) ?? 0,
                            depth.get(e.target) ?? 0,
                          ) *
                            120 +
                          250;
                        const dx = to.x - from.x,
                          dy = to.y - from.y;
                        const distance = Math.max(1, Math.hypot(dx, dy));
                        const reach = Math.min(
                          W / 2 / Math.max(0.001, Math.abs(dx)),
                          H / 2 / Math.max(0.001, Math.abs(dy)),
                        );
                        const x1 = from.x + W / 2 + dx * reach,
                          y1 = from.y + H / 2 + dy * reach,
                          x2 = to.x + W / 2 - dx * reach,
                          y2 = to.y + H / 2 - dy * reach;
                        const curve =
                          Math.min(65, distance * 0.1) *
                          (e.source.localeCompare(e.target) > 0 ? -1 : 1);
                        const path = `M${x1} ${y1} Q${(x1 + x2) / 2 - (dy / distance) * curve} ${(y1 + y2) / 2 + (dx / distance) * curve} ${x2} ${y2}`;
                        return (
                          <g
                            key={`${e.source}-${e.target}`}
                            className={
                              active ? 'graph-edge is-active' : 'graph-edge'
                            }
                            opacity={
                              focus && !active
                                ? 0.13
                                : !matches.has(e.source) ||
                                    !matches.has(e.target)
                                  ? 0.12
                                  : active
                                    ? 1
                                    : e.isTree
                                      ? 0.65
                                      : 0.3
                            }
                          >
                            <linearGradient
                              id={gradient}
                              gradientUnits="userSpaceOnUse"
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                            >
                              <stop
                                offset="0"
                                style={{ stopColor: color(from.group) }}
                              />
                              <stop
                                offset="1"
                                style={{ stopColor: color(to.group) }}
                              />
                            </linearGradient>
                            {active && (
                              <path
                                d={path}
                                fill="none"
                                className="graph-edge-glow"
                                style={{ stroke: 'var(--accent)' }}
                                strokeWidth="6"
                                filter="url(#graph-glow)"
                              />
                            )}
                            <path
                              d={path}
                              fill="none"
                              pathLength="1"
                              className={`graph-edge-line ${e.isTree || active ? 'draws' : 'is-cross'}`}
                              style={{
                                stroke: active
                                  ? 'var(--accent)'
                                  : `url(#${gradient})`,
                                animationDelay: `${delay}ms`,
                              }}
                              strokeWidth={active ? 2 : e.isTree ? 1.4 : 1}
                              strokeDasharray={
                                e.isTree || active ? undefined : '.008 .012'
                              }
                              markerEnd={
                                active ? 'url(#graph-arrow)' : undefined
                              }
                            >
                              <title>{e.relationship}</title>
                            </path>
                            {e.isTree && (
                              <circle
                                r={active ? 3 : 2.2}
                                className="graph-signal"
                                style={{
                                  fill: active
                                    ? 'var(--accent)'
                                    : color(to.group),
                                }}
                              >
                                <animateMotion
                                  dur={`${3.2 + (index % 5) * 0.7}s`}
                                  begin={`${-((index * 0.83) % 4)}s`}
                                  repeatCount="indefinite"
                                  path={path}
                                />
                              </circle>
                            )}
                            {active && (
                              <path
                                className="graph-edge-flow"
                                d={path}
                                pathLength="1"
                                fill="none"
                                style={{ stroke: 'var(--accent-strong)' }}
                                strokeWidth="3"
                                strokeDasharray=".018 .982"
                              />
                            )}
                          </g>
                        );
                      })}
                    {layout?.nodes.map((n) => (
                      <foreignObject
                        key={n.id}
                        x={n.x}
                        y={n.y}
                        width={W}
                        height={H}
                        style={{
                          overflow: 'visible',
                          opacity:
                            !matches.has(n.id) ||
                            (focus && !neighbors.has(n.id) && focus !== n.id)
                              ? selected
                                ? 0.18
                                : 0.35
                              : 1,
                          transition: 'opacity .3s',
                        }}
                      >
                        <button
                          data-node={n.id}
                          aria-label={`${n.label}: ${n.definition}`}
                          title={n.label}
                          className={`graph-node ${selected === n.id ? 'is-selected' : ''} ${n.id === root?.id ? 'is-root' : ''} ${storyNodes.includes(n.id) ? 'is-picked' : ''}`}
                          style={
                            {
                              '--node-color': color(n.group),
                              '--depth': depth.get(n.id) ?? 0,
                            } as CSSProperties
                          }
                          onClick={() =>
                            storyMode
                              ? toggleStoryNode(n.id)
                              : selected === n.id
                                ? deselect()
                                : focusNode(n.id)
                          }
                          aria-pressed={
                            storyMode
                              ? storyNodes.includes(n.id)
                              : selected === n.id
                          }
                          onPointerEnter={(e) =>
                            e.pointerType === 'mouse' && setHovered(n.id)
                          }
                          onPointerLeave={() => setHovered(null)}
                        >
                          <span>{n.group}</span>
                          <strong>{n.label}</strong>
                          <i className="graph-node-port" aria-hidden />
                          {storyNodes.includes(n.id) && (
                            <b className="graph-node-pick mono" aria-hidden>
                              {storyNodes.indexOf(n.id) + 1}
                            </b>
                          )}
                        </button>
                      </foreignObject>
                    ))}
                  </svg>
                  <div className="map-navigation" aria-label="Map zoom">
                    <button aria-label="Zoom in" onClick={() => zoom(0.75)}>
                      +
                    </button>
                    <button aria-label="Zoom out" onClick={() => zoom(1.33)}>
                      −
                    </button>
                    <button onClick={fit}>Recenter</button>
                  </div>
                </>
              )}
              {matches.size === 0 && (
                <p className="no-matches">
                  No matching concepts. Try another search or topic.
                </p>
              )}
            </section>
            {showInspector && (
              <aside className="concept-inspector" aria-label="Concept details">
                <button
                  className="map-close-inspector"
                  aria-label="Close concept details"
                  onClick={deselect}
                >
                  ×
                </button>
                {current && (
                  <>
                    <div
                      className="inspector-topic"
                      style={{ color: color(current.group) }}
                    >
                      {current.group}
                    </div>
                    <h2>{current.label}</h2>
                    <p className="concept-definition">{current.definition}</p>
                    <Link
                      className="secondary-button"
                      href={
                        current.id === root?.id
                          ? `/workbench/${documentId}`
                          : `/workbench/${documentId}/${encodeURIComponent(current.group)}`
                      }
                    >
                      Learn this topic ↗
                    </Link>
                    <h3>
                      Connected ideas <span>{connections.length}</span>
                    </h3>
                    <div className="connection-list">
                      {connections.map((e) => {
                        const node = positions.get(
                          e.source === selected ? e.target : e.source,
                        );
                        return node ? (
                          <button
                            key={`${e.source}-${e.target}`}
                            onClick={() => focusNode(node.id)}
                          >
                            <span>{e.relationship}</span>
                            <strong>
                              {node.label}
                              <span aria-hidden>↗</span>
                            </strong>
                          </button>
                        ) : null;
                      })}
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        toggleStoryNode(current.id);
                        setStoryMode(true);
                        setInspectorOpen(false);
                      }}
                    >
                      <Icon name="sparkle" size={15} />
                      {storyNodes.includes(current.id)
                        ? 'In your memory story'
                        : 'Add to a memory story'}
                    </button>
                  </>
                )}
              </aside>
            )}
          </div>
          {storyMode && (
            <StoryTray
              picked={storyConcepts}
              visible={(layout?.nodes ?? []).filter((n) => matches.has(n.id))}
              topic={group}
              onRemove={toggleStoryNode}
              onSelectAll={(ids) =>
                setStoryNodes((current) =>
                  [...new Set([...current, ...ids])].slice(
                    0,
                    MAX_STORY_CONCEPTS,
                  ),
                )
              }
              onClear={() => setStoryNodes([])}
              onWrite={() => setTheater(true)}
              onCancel={() => setStoryMode(false)}
            />
          )}
          {theater && storyConcepts.length >= 2 && (
            <StoryTheater
              documentId={documentId}
              concepts={storyConcepts}
              onClose={() => setTheater(false)}
            />
          )}
          {!showInspector && !storyMode && (
            <div className="map-topic-dock" aria-label="Topics">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => focusTopic(group === g ? 'All topics' : g)}
                  aria-pressed={group === g}
                >
                  <i style={{ background: color(g) }} />
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="map-options">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={crossLinks}
                onChange={(e) => setCrossLinks(e.target.checked)}
              />
              All links
            </label>
            <button onClick={() => setMotion((v) => !v)} aria-pressed={motion}>
              {motion ? 'Pause motion' : 'Resume motion'}
            </button>
          </div>
          <p className="map-hint">
            Drag to explore · Scroll to zoom · Select an idea
          </p>
        </>
      )}
    </main>
  );
}
