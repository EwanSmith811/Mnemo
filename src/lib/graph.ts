import type { ConceptGraph, ConceptNode } from '@/types';

/** Validate model output before it reaches storage or layout. Never invent links. */
export function normalizeGraph(value: unknown): ConceptGraph {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid concept graph');
  const input = value as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges))
    throw new Error('Invalid concept graph structure');
  const ids = new Set<string>();
  const nodes: ConceptNode[] = [];
  for (const raw of input.nodes.slice(0, 60)) {
    if (!raw || typeof raw !== 'object') continue;
    const { id, label, definition, group } = raw;
    if (
      [id, label, definition, group].some(
        (v) => typeof v !== 'string' || !v.trim(),
      ) ||
      ids.has(id.trim())
    )
      continue;
    ids.add(id.trim());
    nodes.push({
      id: id.trim(),
      label: label.trim().slice(0, 120),
      definition: definition.trim().slice(0, 2000),
      group: group.trim().slice(0, 80),
    });
  }
  if (!nodes.length)
    throw new Error(
      'The document did not produce any valid concepts. Try a more detailed document.',
    );
  const seen = new Set<string>();
  const edges: ConceptGraph['edges'] = [];
  for (const raw of input.edges.slice(0, 180)) {
    if (!raw || typeof raw !== 'object') continue;
    const { source, target, relationship } = raw;
    if (
      typeof source !== 'string' ||
      typeof target !== 'string' ||
      typeof relationship !== 'string'
    )
      continue;
    const from = source.trim(),
      to = target.trim();
    const key = [from, to].sort().join('\0');
    if (
      from === to ||
      !ids.has(from) ||
      !ids.has(to) ||
      seen.has(key) ||
      !relationship.trim()
    )
      continue;
    seen.add(key);
    edges.push({
      source: from,
      target: to,
      relationship: relationship.trim().slice(0, 400),
    });
  }
  return { nodes, edges };
}

export const NODE_WIDTH = 224;
export const NODE_HEIGHT = 100;
export interface PositionedNode extends ConceptNode {
  x: number;
  y: number;
}

/** A stable, topology-driven constellation. Springs vary by edge identity,
 * topics exert only a soft attraction, and a final rectangle pass guarantees
 * readable node separation. No animation loop or random layout on rerender. */
export function layoutGraph(graph: ConceptGraph) {
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const root = nodes.find((n) => n.id === 'central') ?? nodes[0];
  if (!root)
    return {
      nodes: [] as PositionedNode[],
      edges: [],
      regions: [],
      width: 320,
      height: 200,
    };
  const edges = [...graph.edges].sort(
    (a, b) =>
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
  );
  const hash = (text: string) => {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++)
      value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0) / 4294967296;
  };
  const topics = [
    ...new Set(nodes.filter((n) => n.id !== root.id).map((n) => n.group)),
  ].sort();
  const members = new Map(
    topics.map((t) => [
      t,
      nodes.filter((n) => n.id !== root.id && n.group === t),
    ]),
  );
  const anchors = new Map(
    topics.map((topic, i) => {
      const angle = (i * Math.PI * 2) / Math.max(1, topics.length) - 0.8;
      const radius = 300 + Math.sqrt(members.get(topic)!.length) * 40;
      return [
        topic,
        {
          x: Math.cos(angle) * radius * 1.45,
          y: Math.sin(angle) * radius * 0.66,
        },
      ];
    }),
  );
  const centers = nodes.map((n) => {
    if (n.id === root.id) return { x: 0, y: 0 };
    const anchor = anchors.get(n.group)!;
    const index = members.get(n.group)!.findIndex((m) => m.id === n.id);
    const angle = index * 2.3999632297 + hash(n.id) * 1.5;
    const radius = 75 + Math.sqrt(index) * 105 + hash(n.id + 'radius') * 55;
    return {
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.y + Math.sin(angle) * radius,
    };
  });
  const indices = new Map(nodes.map((n, i) => [n.id, i]));
  const rootIndex = indices.get(root.id)!;
  for (let iteration = 0; iteration < 200; iteration++) {
    const forces = centers.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = centers[j].x - centers[i].x || 0.01;
        const dy = centers[j].y - centers[i].y || 0.01;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const repel = 800 / distance;
        const fx = (dx / distance) * repel,
          fy = (dy / distance) * repel;
        forces[i].x -= fx;
        forces[i].y -= fy;
        forces[j].x += fx;
        forces[j].y += fy;
        const ox = NODE_WIDTH + 38 - Math.abs(dx),
          oy = NODE_HEIGHT + 48 - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox / NODE_WIDTH < oy / NODE_HEIGHT) {
            const push = Math.sign(dx) * ox * 0.2;
            forces[i].x -= push;
            forces[j].x += push;
          } else {
            const push = Math.sign(dy) * oy * 0.2;
            forces[i].y -= push;
            forces[j].y += push;
          }
        }
      }
    for (const edge of edges) {
      const a = indices.get(edge.source),
        b = indices.get(edge.target);
      if (a === undefined || b === undefined) continue;
      const dx = centers[b].x - centers[a].x,
        dy = centers[b].y - centers[a].y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const desired =
        285 + hash([edge.source, edge.target].sort().join(':')) * 155;
      const pull = (distance - desired) * 0.038;
      forces[a].x += (dx / distance) * pull;
      forces[a].y += (dy / distance) * pull;
      forces[b].x -= (dx / distance) * pull;
      forces[b].y -= (dy / distance) * pull;
    }
    const cap = 22 * (1 - iteration / 220);
    centers.forEach((point, i) => {
      if (i === rootIndex) return;
      const anchor = anchors.get(nodes[i].group)!;
      forces[i].x += (anchor.x - point.x) * 0.035 - point.x * 0.006;
      forces[i].y += (anchor.y - point.y) * 0.035 - point.y * 0.012;
      const speed = Math.max(1, Math.hypot(forces[i].x, forces[i].y) / cap);
      point.x += forces[i].x / speed;
      point.y += forces[i].y / speed;
    });
  }
  // A broad field uses a laptop viewport more effectively than a tall tree.
  centers.forEach((point) => {
    point.y *= 0.65;
  });
  const placed: { node: ConceptNode; x: number; y: number }[] = [];
  // Prefer simulated positions; repair only remaining collisions, at the
  // nearest free point on a fine spiral. Bound work even for dense graphs.
  for (const node of [root, ...nodes.filter((n) => n.id !== root.id)]) {
    const original = centers[indices.get(node.id)!];
    let x = original.x,
      y = original.y;
    const collides = () =>
      placed.some(
        (p) =>
          Math.abs(p.x - x) < NODE_WIDTH + 28 &&
          Math.abs(p.y - y) < NODE_HEIGHT + 32,
      );
    let step = 0;
    while (collides() && step < 6000) {
      step++;
      const angle = step * 2.3999632297 + hash(node.id) * Math.PI * 2;
      const radius = 12 * Math.sqrt(step);
      x = original.x + Math.cos(angle) * radius;
      y = original.y + Math.sin(angle) * radius;
    }
    if (collides()) {
      x = Math.max(...placed.map((p) => p.x)) + NODE_WIDTH + 48;
      y = original.y;
    }
    placed.push({ node, x, y });
  }
  const padding = 72;
  const minX = Math.min(...placed.map((p) => p.x - NODE_WIDTH / 2)) - padding;
  const minY = Math.min(...placed.map((p) => p.y - NODE_HEIGHT / 2)) - padding;
  const positioned = placed.map((p) => ({
    ...p.node,
    x: p.x - NODE_WIDTH / 2 - minX,
    y: p.y - NODE_HEIGHT / 2 - minY,
  }));
  const regions = [...new Set(nodes.map((n) => n.group))]
    .sort()
    .map((group) => {
      const members = positioned.filter((n) => n.group === group);
      const x = Math.min(...members.map((n) => n.x)) - 24,
        y = Math.min(...members.map((n) => n.y)) - 24;
      return {
        group,
        x,
        y,
        width: Math.max(...members.map((n) => n.x + NODE_WIDTH)) - x + 24,
        height: Math.max(...members.map((n) => n.y + NODE_HEIGHT)) - y + 24,
      };
    });
  const tree = new Set<string>(),
    visited = new Set<string>();
  for (const start of [root, ...nodes]) {
    if (visited.has(start.id)) continue;
    const queue = [start.id];
    visited.add(start.id);
    for (let i = 0; i < queue.length; i++)
      for (const edge of edges) {
        const next =
          edge.source === queue[i]
            ? edge.target
            : edge.target === queue[i]
              ? edge.source
              : null;
        if (next && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
          tree.add([queue[i], next].sort().join('\0'));
        }
      }
  }
  return {
    nodes: positioned,
    edges: edges.map((e) => ({
      ...e,
      isTree: tree.has([e.source, e.target].sort().join('\0')),
    })),
    regions,
    width: Math.max(...positioned.map((p) => p.x + NODE_WIDTH)) + padding,
    height: Math.max(...positioned.map((p) => p.y + NODE_HEIGHT)) + padding,
  };
}
