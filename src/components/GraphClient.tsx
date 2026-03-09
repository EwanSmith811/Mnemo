"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ConceptNode, ConceptEdge, ConceptGraphRow } from "@/types";

// ── Color palette ────────────────────────────────────────────────
const GROUP_COLORS: Record<string, { bg: string; border: string; text: string }> = {};
const COLOR_PALETTE = [
  { bg: "#dbeafe", border: "#60a5fa", text: "#1e3a8a" },
  { bg: "#dcfce7", border: "#4ade80", text: "#166534" },
  { bg: "#fee2e2", border: "#f87171", text: "#991b1b" },
  { bg: "#fef9c3", border: "#facc15", text: "#854d0e" },
  { bg: "#ede9fe", border: "#a78bfa", text: "#5b21b6" },
  { bg: "#ffe4e6", border: "#fb7185", text: "#9f1239" },
  { bg: "#cffafe", border: "#22d3ee", text: "#155e75" },
  { bg: "#fed7aa", border: "#fb923c", text: "#9a3412" },
];

function getGroupColor(group: string) {
  if (!GROUP_COLORS[group]) {
    const idx = Object.keys(GROUP_COLORS).length % COLOR_PALETTE.length;
    GROUP_COLORS[group] = COLOR_PALETTE[idx];
  }
  return GROUP_COLORS[group];
}

// ── Layout constants ─────────────────────────────────────────────
const NODE_W = 200;
const NODE_H = 80;
const CENTRAL_SCALE = 2.0;
const FONT_SIZE = 20;
const PADDING = 60;
const MIN_LEGIBLE_PX = 90;

// ── Types ────────────────────────────────────────────────────────
interface LayoutNode {
  id: string;
  x: number;
  y: number;
  label: string;
  group: string;
  definition: string;
  colors: { bg: string; border: string; text: string };
}

interface LayoutEdge {
  source: string;
  target: string;
  relationship: string;
  isTreeEdge: boolean;
}

// ── Seeded random ────────────────────────────────────────────────
function seededRandom(seed: number) {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// ── Layout: Radial Tree with Cross-Links ─────────────────────────
// BFS from the root/central node builds a spanning tree.
// Children fan out at equal distances from their parent in a radial
// pattern. Non-tree edges become cross-link connections that create
// the fully interconnected graph appearance.
function computeLayout(
  nodes: ConceptNode[],
  edges: ConceptEdge[]
): { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[]; width: number; height: number } {
  if (nodes.length === 0) return { layoutNodes: [], layoutEdges: [], width: 0, height: 0 };

  // ── Adjacency & root ─────────────────────────────────────────
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const centralNode = nodes.find((n) => n.id === "central");
  const rootId = centralNode?.id ??
    nodes.reduce((best, n) =>
      (adj.get(n.id)?.size ?? 0) > (adj.get(best.id)?.size ?? 0) ? n : best
    ).id;

  // ── BFS spanning tree ─────────────────────────────────────────
  const parentOf = new Map<string, string | null>();
  const childrenOf = new Map<string, string[]>();
  const depthOf = new Map<string, number>();
  const visited = new Set<string>();
  const bfsQueue: string[] = [rootId];

  parentOf.set(rootId, null);
  depthOf.set(rootId, 0);
  visited.add(rootId);
  for (const n of nodes) childrenOf.set(n.id, []);

  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!;
    const neighbors = [...(adj.get(current) ?? [])];
    // Sort for deterministic layout
    neighbors.sort((a, b) => {
      // Prioritize nodes with more connections (hubs) first
      const da = adj.get(a)?.size ?? 0;
      const db = adj.get(b)?.size ?? 0;
      if (db !== da) return db - da;
      return a.localeCompare(b);
    });
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parentOf.set(neighbor, current);
        depthOf.set(neighbor, (depthOf.get(current) ?? 0) + 1);
        childrenOf.get(current)!.push(neighbor);
        bfsQueue.push(neighbor);
      }
    }
  }

  // Attach disconnected nodes to root
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      visited.add(n.id);
      parentOf.set(n.id, rootId);
      depthOf.set(n.id, 1);
      childrenOf.get(rootId)!.push(n.id);
    }
  }

  // ── Depth-balancing pass ──────────────────────────────────────
  // Re-parent nodes from overly deep branches to shallower neighbors
  // so no branch is significantly deeper than the rest.
  function maxSubtreeDepth(nodeId: string): number {
    const kids = childrenOf.get(nodeId) ?? [];
    if (kids.length === 0) return depthOf.get(nodeId) ?? 0;
    let mx = 0;
    for (const k of kids) mx = Math.max(mx, maxSubtreeDepth(k));
    return mx;
  }

  for (let pass = 0; pass < 5; pass++) {
    const globalMax = maxSubtreeDepth(rootId);
    if (globalMax <= 2) break; // already shallow

    // Compute per-branch max depth (each direct child of root)
    const branchDepths = new Map<string, number>();
    for (const branchRoot of (childrenOf.get(rootId) ?? [])) {
      branchDepths.set(branchRoot, maxSubtreeDepth(branchRoot));
    }
    const avgBranchDepth = branchDepths.size > 0
      ? [...branchDepths.values()].reduce((a, b) => a + b, 0) / branchDepths.size
      : 1;
    const targetMaxDepth = Math.ceil(avgBranchDepth + 1);

    let changed = false;
    // Process deepest nodes first
    const byDepth = [...depthOf.entries()]
      .filter(([id]) => id !== rootId)
      .sort((a, b) => b[1] - a[1]);

    for (const [nodeId, nodeDepth] of byDepth) {
      if (nodeDepth <= targetMaxDepth) continue;

      // Find the shallowest neighbor this node could re-parent to
      const neighbors = [...(adj.get(nodeId) ?? [])];
      let bestParent: string | null = null;
      let bestDepth = nodeDepth;

      for (const nid of neighbors) {
        const nd = depthOf.get(nid) ?? 0;
        // Must not create a cycle: candidate must not be a descendant
        if (nd < bestDepth - 1 && nd < targetMaxDepth) {
          // Quick ancestor check — walk up from nid to ensure nodeId isn't an ancestor
          let isDescendant = false;
          let walk: string | null | undefined = nid;
          while (walk && walk !== rootId) {
            if (walk === nodeId) { isDescendant = true; break; }
            walk = parentOf.get(walk);
          }
          if (!isDescendant) {
            bestParent = nid;
            bestDepth = nd;
          }
        }
      }

      if (bestParent !== null) {
        // Remove from old parent's children
        const oldParent = parentOf.get(nodeId);
        if (oldParent !== null && oldParent !== undefined) {
          const oldKids = childrenOf.get(oldParent)!;
          const idx = oldKids.indexOf(nodeId);
          if (idx >= 0) oldKids.splice(idx, 1);
        }
        // Attach to new parent
        parentOf.set(nodeId, bestParent);
        childrenOf.get(bestParent)!.push(nodeId);
        const newDepth = (depthOf.get(bestParent) ?? 0) + 1;
        // Update depths for this node and all descendants
        const stack = [nodeId];
        while (stack.length > 0) {
          const cur = stack.pop()!;
          const curParentDepth = depthOf.get(parentOf.get(cur)!) ?? 0;
          depthOf.set(cur, curParentDepth + 1);
          for (const kid of (childrenOf.get(cur) ?? [])) stack.push(kid);
        }
        changed = true;
      }
    }
    if (!changed) break;
  }

  // ── Classify edges as tree vs cross-link ──────────────────────
  const treeEdgeKeys = new Set<string>();
  for (const [childId, pid] of parentOf) {
    if (pid !== null) {
      treeEdgeKeys.add(`${pid}|${childId}`);
      treeEdgeKeys.add(`${childId}|${pid}`);
    }
  }

  // ── Count subtree sizes for proportional angle allocation ─────
  const subtreeSize = new Map<string, number>();
  function countSubtree(nodeId: string): number {
    const kids = childrenOf.get(nodeId) ?? [];
    let size = 1;
    for (const kid of kids) size += countSubtree(kid);
    subtreeSize.set(nodeId, size);
    return size;
  }
  countSubtree(rootId);

  // ── Compute max depth ─────────────────────────────────────────
  let maxDepth = 0;
  for (const d of depthOf.values()) maxDepth = Math.max(maxDepth, d);

  // ── Radial ring placement from origin ──────────────────────────
  // All nodes at the same BFS depth sit on a concentric ring centered
  // at the origin. This guarantees a symmetric radial structure
  // regardless of the number of nodes or edges.
  const RING_SPACING = 300; // px between rings
  const NODE_GAP = 30;      // minimum gap between node edges

  const positions = new Map<string, { x: number; y: number }>();
  positions.set(rootId, { x: 0, y: 0 });

  // Group nodes by depth (excluding root)
  const nodesByDepth = new Map<number, string[]>();
  for (const n of nodes) {
    if (n.id === rootId) continue;
    const d = depthOf.get(n.id) ?? 1;
    if (!nodesByDepth.has(d)) nodesByDepth.set(d, []);
    nodesByDepth.get(d)!.push(n.id);
  }

  // For each depth ring, distribute nodes evenly around the full circle.
  // Within each ring, order nodes so siblings (same parent) are adjacent,
  // and each parent's children cluster around the parent's angular position.
  for (let depth = 1; depth <= maxDepth; depth++) {
    const ring = nodesByDepth.get(depth) ?? [];
    if (ring.length === 0) continue;

    const r = depth * RING_SPACING;

    // Sort ring nodes by their parent's angle, then by subtree size (largest first)
    // This clusters siblings together in the correct angular sector
    const parentAngles = new Map<string, number>();
    for (const nid of ring) {
      const pid = parentOf.get(nid);
      if (pid && !parentAngles.has(pid)) {
        const pp = positions.get(pid);
        if (pp) {
          parentAngles.set(pid, Math.atan2(pp.y, pp.x));
        } else {
          parentAngles.set(pid, 0);
        }
      }
    }

    ring.sort((a, b) => {
      const pa = parentOf.get(a) ?? rootId;
      const pb = parentOf.get(b) ?? rootId;
      const angA = parentAngles.get(pa) ?? 0;
      const angB = parentAngles.get(pb) ?? 0;
      if (Math.abs(angA - angB) > 0.001) return angA - angB;
      // Same parent: larger subtrees first for visual balance
      return (subtreeSize.get(b) ?? 1) - (subtreeSize.get(a) ?? 1);
    });

    // Place evenly around the ring
    const n = ring.length;
    const startOffset = -Math.PI / 2; // start from top
    for (let i = 0; i < n; i++) {
      const angle = startOffset + (2 * Math.PI * i) / n;
      positions.set(ring[i], {
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
      });
    }
  }

  // ── Force-directed relaxation ─────────────────────────────────
  // Runs a simulation to fine-tune positions while maintaining the
  // radial structure. Forces: repulsion between all nodes, attraction
  // along tree edges, and a radial pull back to each node's depth ring.
  const allIds = nodes.map((n) => n.id);
  const getW = (id: string) => (id === rootId && centralNode ? NODE_W * CENTRAL_SCALE : NODE_W);
  const getH = (id: string) => (id === rootId && centralNode ? NODE_H * CENTRAL_SCALE : NODE_H);

  const REPULSION = -500;
  const RADIAL_STRENGTH = 0.4;
  const TREE_LINK_STRENGTH = 0.08;
  const COOLING = 0.97;
  const SIM_ITERS = 120;

  for (let iter = 0; iter < SIM_ITERS; iter++) {
    const temp = Math.pow(COOLING, iter);
    if (temp < 0.01) break;

    for (const id of allIds) {
      if (id === rootId) continue;
      const p = positions.get(id)!;
      let fx = 0, fy = 0;

      // 1) Repulsion from all other nodes (charge force)
      for (const otherId of allIds) {
        if (otherId === id) continue;
        const op = positions.get(otherId)!;
        const dx = p.x - op.x;
        const dy = p.y - op.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;
        const force = REPULSION / distSq;
        fx += (dx / dist) * force * -1; // repulsion pushes away
        fy += (dy / dist) * force * -1;
      }

      // 2) Radial force — pull toward the correct depth ring
      const targetR = (depthOf.get(id) ?? 1) * RING_SPACING;
      const currentR = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
      const radialDelta = targetR - currentR;
      const radialUx = p.x / currentR;
      const radialUy = p.y / currentR;
      fx += radialUx * radialDelta * RADIAL_STRENGTH;
      fy += radialUy * radialDelta * RADIAL_STRENGTH;

      // 3) Tree edge attraction — pull toward parent (and children)
      const pid = parentOf.get(id);
      if (pid !== null && pid !== undefined) {
        const pp = positions.get(pid)!;
        fx += (pp.x - p.x) * TREE_LINK_STRENGTH;
        fy += (pp.y - p.y) * TREE_LINK_STRENGTH;
      }
      for (const kid of (childrenOf.get(id) ?? [])) {
        const kp = positions.get(kid)!;
        fx += (kp.x - p.x) * TREE_LINK_STRENGTH * 0.5;
        fy += (kp.y - p.y) * TREE_LINK_STRENGTH * 0.5;
      }

      // Apply with temperature
      const mag = Math.sqrt(fx * fx + fy * fy) || 1;
      const maxStep = 30 * temp;
      const step = Math.min(mag, maxStep);
      positions.set(id, {
        x: p.x + (fx / mag) * step,
        y: p.y + (fy / mag) * step,
      });
    }
  }

  // ── Hard overlap resolution ───────────────────────────────────
  // Final pass to guarantee no two node rectangles touch
  for (let iter = 0; iter < 100; iter++) {
    let moved = false;
    for (let i = 0; i < allIds.length; i++) {
      for (let j = i + 1; j < allIds.length; j++) {
        const a = allIds[i]; const b = allIds[j];
        const pa = positions.get(a)!; const pb = positions.get(b)!;
        const dx = pb.x - pa.x; const dy = pb.y - pa.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const diagA = Math.sqrt(getW(a) ** 2 + getH(a) ** 2);
        const diagB = Math.sqrt(getW(b) ** 2 + getH(b) ** 2);
        const minD = (diagA + diagB) / 2 + NODE_GAP;
        if (dist < minD) {
          moved = true;
          const push = (minD - dist) / 2 + 2;
          const ux = dx / dist; const uy = dy / dist;
          if (a !== rootId) positions.set(a, { x: pa.x - ux * push, y: pa.y - uy * push });
          if (b !== rootId) positions.set(b, { x: pb.x + ux * push, y: pb.y + uy * push });
        }
      }
    }
    if (!moved) break;
  }

  // ── Bounds & return ───────────────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = positions.get(n.id)!;
    const hw = getW(n.id) / 2; const hh = getH(n.id) / 2;
    minX = Math.min(minX, p.x - hw); maxX = Math.max(maxX, p.x + hw);
    minY = Math.min(minY, p.y - hh); maxY = Math.max(maxY, p.y + hh);
  }
  const offsetX = -minX + PADDING;
  const offsetY = -minY + PADDING;
  const layoutNodes: LayoutNode[] = nodes.map((n) => {
    const p = positions.get(n.id) ?? { x: 0, y: 0 };
    return { id: n.id, x: p.x + offsetX - NODE_W / 2, y: p.y + offsetY - NODE_H / 2, label: n.label, group: n.group, definition: n.definition, colors: getGroupColor(n.group) };
  });
  return {
    layoutNodes,
    layoutEdges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      relationship: e.relationship,
      isTreeEdge: treeEdgeKeys.has(`${e.source}|${e.target}`),
    })),
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  };
}

// ── Legibility enforcement ──────────────────────────────────────
function ensureLegibility(
  layout: { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[]; width: number; height: number },
  viewportW: number,
  viewportH: number
): { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[]; width: number; height: number } {
  if (layout.layoutNodes.length === 0 || viewportW === 0 || viewportH === 0) return layout;

  const fitZoom = Math.min(viewportW / layout.width, viewportH / layout.height) * 0.92;
  const renderedNodeW = NODE_W * fitZoom;

  if (renderedNodeW >= MIN_LEGIBLE_PX) return layout;

  // Need to pack tighter — scale positions toward center
  const targetScale = MIN_LEGIBLE_PX / renderedNodeW;
  const centerX = layout.width / 2;
  const centerY = layout.height / 2;

  const scaledNodes = layout.layoutNodes.map((n) => ({
    ...n,
    x: centerX + (n.x - centerX) / targetScale,
    y: centerY + (n.y - centerY) / targetScale,
  }));

  // Recompute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of scaledNodes) {
    const isCentral = n.id === "central";
    const nw = isCentral ? NODE_W * CENTRAL_SCALE : NODE_W;
    const nh = isCentral ? NODE_H * CENTRAL_SCALE : NODE_H;
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + nw);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y + nh);
  }

  // Re-offset so all coords are positive
  const offsetX = -minX + PADDING;
  const offsetY = -minY + PADDING;
  const adjustedNodes = scaledNodes.map((n) => ({
    ...n,
    x: n.x + offsetX,
    y: n.y + offsetY,
  }));

  return {
    layoutNodes: adjustedNodes,
    layoutEdges: layout.layoutEdges,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  };
}

// ── Constellation generator ──────────────────────────────────────
function generateConstellation(width: number, height: number) {
  const rng = seededRandom(42);
  const area = width * height;
  const numStars = Math.min(200, Math.max(60, Math.floor(area / 30000)));

  const stars: { x: number; y: number; r: number; opacity: number }[] = [];
  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: rng() * width,
      y: rng() * height,
      r: 1.0 + rng() * 3.0,
      opacity: 0.25 + rng() * 0.35,
    });
  }

  const lines: { x1: number; y1: number; x2: number; y2: number; opacity: number }[] = [];
  const maxDist = Math.min(width, height) * 0.08;

  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const dx = stars[i].x - stars[j].x;
      const dy = stars[i].y - stars[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < maxDist && rng() > 0.7) {
        lines.push({
          x1: stars[i].x, y1: stars[i].y,
          x2: stars[j].x, y2: stars[j].y,
          opacity: 0.03 + rng() * 0.04,
        });
      }
    }
  }

  return { stars, lines };
}

// ── Story parser ──────────────────────────────────────────────────
function parseStory(text: string): { story: string; keys: { wordplay: string; term: string; meaning: string }[] } {
  const keyIdx = text.search(/\n\s*KEY\s*:/i);
  if (keyIdx === -1) return { story: text, keys: [] };
  const storyPart = text.slice(0, keyIdx).replace(/^\s*STORY\s*:\s*/i, "").trim();
  const keyPart = text.slice(keyIdx).replace(/^\s*KEY\s*:\s*/i, "").trim();
  const keys = keyPart
    .split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-"))
    .map((line) => {
      const m = line.match(/^-\s*"([^"]+)"\s*\u2192\s*([^:]+):\s*(.+)$/);
      return m ? { wordplay: m[1], term: m[2].trim(), meaning: m[3].trim() } : null;
    })
    .filter((k): k is { wordplay: string; term: string; meaning: string } => k !== null);
  return { story: storyPart, keys };
}

// ── Component ─────────────────────────────────────────────────────
export default function GraphClient() {
  const params = useParams();
  const documentId = params.documentId as string;

  const [graphData, setGraphData] = useState<ConceptGraphRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [detailNode, setDetailNode] = useState<ConceptNode | null>(null);
  const [storyText, setStoryText] = useState("");
  const [isStoryLoading, setIsStoryLoading] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [storyVoiceId, setStoryVoiceId] = useState("hudson_williams");
  const [isStoryPlaying, setIsStoryPlaying] = useState(false);
  const [isStoryTtsLoading, setIsStoryTtsLoading] = useState(false);
  const storyAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ label: "", definition: "", parentId: "", relationship: "" });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [effectsOn, setEffectsOn] = useState(true);

  // Mastery view
  const [masteryView, setMasteryView] = useState(false);
  const [masteryData, setMasteryData] = useState<Map<string, number>>(new Map());

  // Pan & zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const defaultViewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Node dragging (supports group drag of selected nodes)
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{
    nodeId: string;
    startScreenX: number;
    startScreenY: number;
    startPositions: Map<string, { x: number; y: number }>;
    hasMoved: boolean;
  } | null>(null);

  // Stable refs
  const graphDataRef = useRef(graphData);
  graphDataRef.current = graphData;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;

  // Story cache
  const storyCacheRef = useRef<Map<string, string>>(new Map());

  // Viewport size for legibility check
  const [viewportSize, setViewportSize] = useState({ w: 1200, h: 800 });

  // ── Fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/graph/${documentId}`);
        if (res.ok) {
          setGraphData(await res.json());
        } else {
          const data = await res.json().catch(() => null);
          setFetchError(data?.error || `Failed to load (${res.status})`);
          console.error("Graph fetch failed:", res.status, data);
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Network error");
        console.error("Graph fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [documentId]);

  // Fetch mastery data when mastery view is toggled on
  // The API now returns group-level mastery. We map it to individual nodes
  // so each node in a mastered group gets highlighted.
  useEffect(() => {
    if (!masteryView) return;
    async function loadMastery() {
      try {
        const res = await fetch(`/api/workbench/${documentId}/overview`);
        if (res.ok) {
          const data: { group: string; nodeIds: string[]; stageCompleted: number }[] = await res.json();
          const nodeMap = new Map<string, number>();
          for (const g of data) {
            for (const nodeId of g.nodeIds) {
              nodeMap.set(nodeId, g.stageCompleted);
            }
          }
          setMasteryData(nodeMap);
        }
      } catch { /* silently fail */ }
    }
    loadMastery();
  }, [masteryView, documentId]);

  // Track viewport size for legibility enforcement
  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setViewportSize({ w: rect.width, h: rect.height });
        }
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ── Layout ───────────────────────────────────────────────────
  const { layoutNodes, layoutEdges, width: canvasW, height: canvasH, layoutError } = useMemo(() => {
    if (!graphData) return { layoutNodes: [], layoutEdges: [], width: 0, height: 0, layoutError: null as string | null };
    try {
      const raw = computeLayout(graphData.nodes, graphData.edges);
      return { ...ensureLegibility(raw, viewportSize.w, viewportSize.h), layoutError: null as string | null };
    } catch (err) {
      console.error("Graph layout computation failed:", err);
      return { layoutNodes: [], layoutEdges: [], width: 0, height: 0, layoutError: err instanceof Error ? err.message : "Layout computation failed" };
    }
  }, [graphData, viewportSize]);

  // Merged positions: drag overrides take precedence
  const mergedPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of layoutNodes) map.set(n.id, nodeOverrides[n.id] ?? { x: n.x, y: n.y });
    return map;
  }, [layoutNodes, nodeOverrides]);

  const mergedPositionsRef = useRef(mergedPositions);
  mergedPositionsRef.current = mergedPositions;

  // Node centres for edge drawing
  const nodeCenters = useMemo(() => {
    const map = new Map<string, { cx: number; cy: number }>();
    for (const [id, p] of mergedPositions) map.set(id, { cx: p.x + NODE_W / 2, cy: p.y + NODE_H / 2 });
    return map;
  }, [mergedPositions]);

  // Adjacency data for detail modal
  const nodeEdgesMap = useMemo(() => {
    if (!graphData) return new Map<string, { label: string; relationship: string; direction: string }[]>();
    const map = new Map<string, { label: string; relationship: string; direction: string }[]>();
    const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));
    for (const e of graphData.edges) {
      const src = nodeMap.get(e.source);
      const tgt = nodeMap.get(e.target);
      if (tgt) {
        const arr = map.get(e.source) ?? [];
        arr.push({ label: tgt.label, relationship: e.relationship, direction: "outgoing" });
        map.set(e.source, arr);
      }
      if (src) {
        const arr = map.get(e.target) ?? [];
        arr.push({ label: src.label, relationship: e.relationship, direction: "incoming" });
        map.set(e.target, arr);
      }
    }
    return map;
  }, [graphData]);

  // ── Constellation ──────────────────────────────────────────────
  const constellation = useMemo(() => {
    if (canvasW === 0 || canvasH === 0) return { stars: [] as { x: number; y: number; r: number; opacity: number }[], lines: [] as { x1: number; y1: number; x2: number; y2: number; opacity: number }[] };
    return generateConstellation(canvasW, canvasH);
  }, [canvasW, canvasH]);

  // ── Hover connection highlighting ───────────────────────────────
  const hoverConnected = useMemo(() => {
    if (!hoveredNodeId) return null;
    const connected = new Set<string>([hoveredNodeId]);
    const connectedEdgeIndices = new Set<number>();
    layoutEdges.forEach((e, i) => {
      if (e.source === hoveredNodeId || e.target === hoveredNodeId) {
        connected.add(e.source);
        connected.add(e.target);
        connectedEdgeIndices.add(i);
      }
    });
    return { nodes: connected, edges: connectedEdgeIndices };
  }, [hoveredNodeId, layoutEdges]);

  // ── Nebula clouds (group centroids) ─────────────────────────────
  const nebulaClouds = useMemo(() => {
    const groups = new Map<string, { xs: number[]; ys: number[]; color: string }>();
    for (const node of layoutNodes) {
      const pos = mergedPositions.get(node.id) ?? { x: node.x, y: node.y };
      const cx = pos.x + NODE_W / 2;
      const cy = pos.y + NODE_H / 2;
      if (!groups.has(node.group)) {
        groups.set(node.group, { xs: [], ys: [], color: node.colors.border });
      }
      const g = groups.get(node.group)!;
      g.xs.push(cx);
      g.ys.push(cy);
    }
    return Array.from(groups.entries()).map(([, { xs, ys, color }]) => {
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
      const spread = Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
        200
      );
      return { cx, cy, rx: spread * 0.7, ry: spread * 0.55, color };
    });
  }, [layoutNodes, mergedPositions]);

  // ── Fit to view ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || canvasW === 0) return;
    const id = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const w = containerRef.current.getBoundingClientRect().width;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      // Fit all nodes in view
      const fitZoom = Math.min(w / canvasW, h / canvasH) * 0.92;
      // Center on the root/central node if it exists
      const centralNode = layoutNodes.find((n) => n.id === "central");
      let startPanX: number, startPanY: number;
      if (centralNode) {
        const cx = centralNode.x + NODE_W / 2;
        const cy = centralNode.y + NODE_H / 2;
        startPanX = w / 2 - cx * fitZoom;
        startPanY = h / 2 - cy * fitZoom;
      } else {
        startPanX = (w - canvasW * fitZoom) / 2;
        startPanY = (h - canvasH * fitZoom) / 2;
      }
      defaultViewRef.current = { zoom: fitZoom, pan: { x: startPanX, y: startPanY } };
      setZoom(fitZoom);
      setPan({ x: startPanX, y: startPanY });
    });
    return () => cancelAnimationFrame(id);
  }, [canvasW, canvasH, layoutNodes]);

  // ── Prevent ALL browser zoom on this page ──────────────────────
  // Intercepts Ctrl+wheel (trackpad pinch), Ctrl+/-, and Safari gesture events
  // so the browser never zooms the page — only our internal SVG zoom applies.
  useEffect(() => {
    const preventZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const preventKeyZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
        e.preventDefault();
      }
    };
    const preventGesture = (e: Event) => e.preventDefault();
    document.addEventListener("wheel", preventZoom, { passive: false });
    document.addEventListener("keydown", preventKeyZoom);
    document.addEventListener("gesturestart", preventGesture);
    document.addEventListener("gesturechange", preventGesture);
    document.addEventListener("gestureend", preventGesture);
    return () => {
      document.removeEventListener("wheel", preventZoom);
      document.removeEventListener("keydown", preventKeyZoom);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
    };
  }, []);

  // ── Canvas wheel handler (internal zoom) ──────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setZoom((prev) => {
        const minZ = Math.max(defaultViewRef.current.zoom * 0.3, 0.02);
        const maxZ = defaultViewRef.current.zoom * 4;
        const newZ = Math.min(Math.max(prev * (e.deltaY > 0 ? 0.97 : 1.03), minZ), maxZ);
        setPan((p) => ({ x: mx - (newZ / prev) * (mx - p.x), y: my - (newZ / prev) * (my - p.y) }));
        return newZ;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ── Interaction handlers ──────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return;
    const target = e.target as Element;
    const isBackground = target.tagName === "svg" || target.classList.contains("graph-bg");
    if (e.button === 1 || isBackground) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
      e.preventDefault();
    }
  }, [pan]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startPositions = new Map<string, { x: number; y: number }>();
    const sel = selectedNodeIdsRef.current;
    // If dragging a node that's part of a multi-selection, drag them all
    if (sel.has(nodeId) && sel.size > 1) {
      for (const id of sel) {
        const pos = mergedPositionsRef.current.get(id);
        if (pos) startPositions.set(id, { x: pos.x, y: pos.y });
      }
    } else {
      const pos = mergedPositionsRef.current.get(nodeId);
      if (pos) startPositions.set(nodeId, { x: pos.x, y: pos.y });
    }
    if (startPositions.size === 0) return;
    dragRef.current = {
      nodeId,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startPositions,
      hasMoved: false,
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      const dx = (e.clientX - d.startScreenX) / zoomRef.current;
      const dy = (e.clientY - d.startScreenY) / zoomRef.current;
      if (!d.hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        d.hasMoved = true;
        if (containerRef.current) containerRef.current.style.cursor = "grabbing";
      }
      if (d.hasMoved) {
        setNodeOverrides((prev) => {
          const next = { ...prev };
          for (const [id, start] of d.startPositions) {
            next[id] = { x: start.x + dx, y: start.y + dy };
          }
          return next;
        });
      }
      return;
    }
    if (isPanning) {
      setPan({
        x: panOrigin.current.x + (e.clientX - panStart.current.x),
        y: panOrigin.current.y + (e.clientY - panStart.current.y),
      });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      if (containerRef.current) containerRef.current.style.cursor = "";
      if (!d.hasMoved) {
        const node = graphDataRef.current?.nodes.find((n) => n.id === d.nodeId);
        if (e.shiftKey) {
          setSelectedNodeIds((prev) => {
            const next = new Set(prev);
            if (next.has(d.nodeId)) next.delete(d.nodeId); else next.add(d.nodeId);
            return next;
          });
        } else if (node) {
          setDetailNode(node);
        }
      }
      dragRef.current = null;
      return;
    }
    setIsPanning(false);
  }, []);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.25, defaultViewRef.current.zoom * 4)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z * 0.8, Math.max(defaultViewRef.current.zoom * 0.3, 0.02))), []);
  const handleResetZoom = useCallback(() => {
    setZoom(defaultViewRef.current.zoom);
    setPan(defaultViewRef.current.pan);
  }, []);

  const zoomPercent = Math.round(zoom / (defaultViewRef.current.zoom || 1) * 100);

  // ── Story generation ─────────────────────────────────────────
  const handleGenerateStory = useCallback(async () => {
    if (!graphDataRef.current || selectedNodeIds.size < 2) return;
    const cacheKey = [...selectedNodeIds].sort().join("|");
    const cached = storyCacheRef.current.get(cacheKey);
    if (cached) { setStoryText(cached); setShowStoryModal(true); return; }

    const concepts = graphDataRef.current.nodes
      .filter((n) => selectedNodeIds.has(n.id))
      .map((n) => ({ label: n.label, definition: n.definition }));

    setIsStoryLoading(true);
    setStoryText("");
    setShowStoryModal(true);
    try {
      const res = await fetch(`/api/graph/${documentId}/story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concepts }),
      });
      const data = await res.json();
      const story = data.story || "Failed to generate story.";
      storyCacheRef.current.set(cacheKey, story);
      setStoryText(story);
    } catch {
      setStoryText("Failed to generate story. Please try again.");
    } finally {
      setIsStoryLoading(false);
    }
  }, [selectedNodeIds, documentId]);

  // ── Story narration (TTS) ────────────────────────────────────
  const STORY_VOICES = [
    { id: "hudson_williams", label: "Hudson Williams" },
    { id: "male", label: "Male" },
    { id: "woman", label: "Woman" },
  ];

  const stopStoryNarration = useCallback(() => {
    if (storyAudioRef.current) {
      storyAudioRef.current.pause();
      storyAudioRef.current.removeAttribute("src");
    }
    setIsStoryPlaying(false);
  }, []);

  const playStoryNarration = useCallback(async (text: string, voice: string) => {
    stopStoryNarration();
    setIsStoryTtsLoading(true);
    try {
      // Only read the story portion, not the KEY/definitions at the bottom
      const { story } = parseStory(text);
      const ttsText = story || text;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, voiceId: voice }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (!storyAudioRef.current) {
        storyAudioRef.current = new Audio();
      }
      const audio = storyAudioRef.current;
      audio.src = url;
      audio.onended = () => setIsStoryPlaying(false);
      audio.onerror = () => setIsStoryPlaying(false);
      await audio.play();
      setIsStoryPlaying(true);
    } catch {
      // Silently fail
    } finally {
      setIsStoryTtsLoading(false);
    }
  }, [stopStoryNarration]);

  // ── Add Node ─────────────────────────────────────────────────
  const handleAddNode = useCallback(() => {
    const { label, definition, parentId, relationship } = addForm;
    if (!label.trim() || !definition.trim()) return;
    const newNode: ConceptNode = {
      id: `custom-${Date.now()}`,
      label: label.trim(),
      definition: definition.trim(),
      group: "Custom",
    };
    const newEdge: ConceptEdge | undefined = parentId
      ? { source: parentId, target: newNode.id, relationship: relationship.trim() || "related to" }
      : undefined;
    setGraphData((prev) =>
      prev
        ? { ...prev, nodes: [...prev.nodes, newNode], edges: newEdge ? [...prev.edges, newEdge] : prev.edges }
        : prev
    );
    setAddForm({ label: "", definition: "", parentId: "", relationship: "" });
    setShowAddModal(false);
  }, [addForm]);

  // ── Loading / empty states ────────────────────────────────────
  if (isLoading) return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-zinc-500">Loading concept graph...</p>
    </div>
  );

  if (!graphData || layoutNodes.length === 0) {
    const errorMsg = fetchError
      ? `Error: ${fetchError}`
      : layoutError
      ? `Layout error: ${layoutError}`
      : graphData && graphData.nodes?.length === 0
      ? "The concept graph has no nodes. Try re-uploading the document."
      : "No concept graph available. The document may still be processing.";
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Link href={`/documents/${documentId}`} className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
          &larr; Back to document
        </Link>
        <p className="text-zinc-500">{errorMsg}</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#050510" }}>
      {/* Header - fixed above everything */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          padding: "12px 16px",
          backgroundColor: "rgba(5, 5, 16, 0.97)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex items-center gap-4">
          <Link href={`/documents/${documentId}`} className="flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-amber-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <h1 className="text-lg font-bold gradient-text-amber">Concept Graph</h1>
          <span className="text-xs text-zinc-500">
            {layoutNodes.length} nodes &middot; {layoutEdges.length} edges
          </span>
          <span className="hidden text-xs text-zinc-600 lg:inline">
            &middot; Click for details &middot; Shift+click to select &middot; Drag to reposition &middot; Scroll to zoom
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedNodeIds.size > 0 && (
            <span className="text-sm text-zinc-500">{selectedNodeIds.size} selected</span>
          )}
          {selectedNodeIds.size >= 2 && (
            <button
              onClick={handleGenerateStory}
              disabled={isStoryLoading}
              className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-50"
            >
              {isStoryLoading ? "Generating..." : "Tell a Story"}
            </button>
          )}
          {selectedNodeIds.size > 0 && (
            <button
              onClick={() => setSelectedNodeIds(new Set())}
              className="rounded-xl glass px-3 py-2 text-sm text-zinc-400 transition-all glass-hover"
              title="Clear current selection"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => {
              if (selectedNodeIds.size === layoutNodes.length) {
                setSelectedNodeIds(new Set());
              } else {
                setSelectedNodeIds(new Set(layoutNodes.map((n) => n.id)));
              }
            }}
            className="rounded-xl glass px-3 py-2 text-sm text-zinc-400 transition-all glass-hover"
          >
            {selectedNodeIds.size === layoutNodes.length ? "Deselect All" : "Select All"}
          </button>
          <div style={{ margin: "0 2px", height: 20, width: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
          <button
            onClick={() => setMasteryView((v) => !v)}
            className={`rounded-xl glass px-3 py-2 text-sm transition-all glass-hover ${masteryView ? "text-emerald-400" : "text-zinc-600"}`}
            title={masteryView ? "Hide mastery" : "Show mastery"}
          >
            {masteryView ? "Mastery On" : "Mastery"}
          </button>
          <button
            onClick={() => setEffectsOn((v) => !v)}
            className={`rounded-xl glass px-3 py-2 text-sm transition-all glass-hover ${effectsOn ? "text-purple-400" : "text-zinc-600"}`}
            title={effectsOn ? "Disable effects" : "Enable effects"}
          >
            {effectsOn ? "✦ FX On" : "✦ FX Off"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-xl glass px-3 py-2 text-sm text-zinc-400 transition-all glass-hover hover-glow-blue"
          >
            + Add Node
          </button>
        </div>
      </div>

      {/* Canvas - fills remaining space below header */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          cursor: isPanning ? "grabbing" : "grab",
          userSelect: "none",
          overflow: "hidden",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg width="100%" height="100%" style={{ display: "block" }}>
          <defs>
            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="edgeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="activeEdgeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="nebula" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="60" />
            </filter>
            <filter id="nodeHoverGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="selectionGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="starGlow" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* ── Nebula clouds ── */}
            {effectsOn && nebulaClouds.map((cloud, i) => (
              <ellipse
                key={`nebula-${i}`}
                cx={cloud.cx} cy={cloud.cy}
                rx={cloud.rx} ry={cloud.ry}
                fill={cloud.color}
                filter="url(#nebula)"
              >
                <animate attributeName="opacity" values="0.04;0.09;0.04" dur={`${7 + i * 2.5}s`} repeatCount="indefinite" />
              </ellipse>
            ))}

            {/* ── Constellation lines ── */}
            {effectsOn && constellation.lines.map((line, i) => (
              <line
                key={`cl-${i}`}
                x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                stroke="#94a3b8" strokeWidth={0.5} opacity={line.opacity}
              />
            ))}

            {/* ── Twinkling stars ── */}
            {effectsOn && constellation.stars.map((star, i) => (
              <circle key={`cs-${i}`} cx={star.x} cy={star.y} r={star.r} fill="#e8f0ff"
                filter={star.r > 2.5 ? "url(#starGlow)" : undefined}>
                <animate
                  attributeName="opacity"
                  values={`${(star.opacity * 0.15).toFixed(3)};${star.opacity.toFixed(3)};${(star.opacity * 0.15).toFixed(3)}`}
                  dur={`${3 + (i % 7) * 1.2}s`}
                  begin={`${((i * 0.7) % 5).toFixed(1)}s`}
                  repeatCount="indefinite"
                />
              </circle>
            ))}

            {/* ── Edges with particles ── */}
            {layoutEdges.map((edge, i) => {
              const src = nodeCenters.get(edge.source);
              const tgt = nodeCenters.get(edge.target);
              if (!src || !tgt) return null;
              const dx = tgt.cx - src.cx;
              const dy = tgt.cy - src.cy;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len === 0) return null;
              const nx = -dy / len;
              const ny = dx / len;

              // Tree edges: straight or gentle curve. Cross-links: more curvature.
              const isTree = edge.isTreeEdge;
              const curvature = isTree
                ? 0
                : Math.min(len * 0.2, 50) * (i % 2 === 0 ? 1 : -1);
              const cpx = (src.cx + tgt.cx) / 2 + nx * curvature;
              const cpy = (src.cy + tgt.cy) / 2 + ny * curvature;
              const pathD = `M ${src.cx} ${src.cy} Q ${cpx} ${cpy} ${tgt.cx} ${tgt.cy}`;

              const isHov = hoverConnected?.edges.has(i) ?? false;
              const dimmed = hoverConnected !== null && !isHov;

              // Tree edges: brighter, thicker. Cross-links: dimmer, thinner, dashed.
              const treeColor = isHov ? "#60a5fa" : "#64748b";
              const crossColor = isHov ? "#60a5fa" : "#334155";
              const edgeColor = isTree ? treeColor : crossColor;

              return (
                <g key={`e-${i}`} style={{ transition: "opacity 0.3s ease" }} opacity={dimmed ? 0.04 : 1}>
                  {/* Glow layer */}
                  <path d={pathD} fill="none" stroke={edgeColor}
                    strokeWidth={isHov ? 4 : (isTree ? 3 : 1.5)}
                    filter={isHov ? "url(#activeEdgeGlow)" : "url(#edgeGlow)"}
                    opacity={isHov ? 0.5 : (isTree ? 0.25 : 0.08)}
                  />
                  {/* Main line */}
                  <path d={pathD} fill="none" stroke={edgeColor}
                    strokeWidth={isHov ? 2.5 : (isTree ? 2 : 0.8)}
                    opacity={isHov ? 0.9 : (isTree ? 0.6 : 0.22)}
                    strokeDasharray={isTree ? "none" : "5 4"}
                  />
                  {/* Animated sweep on hovered edges */}
                  {isHov && (
                    <path d={pathD} fill="none" stroke="#93c5fd" strokeWidth={2}
                      strokeDasharray="8 12" opacity={0.7}
                    >
                      <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1.5s" repeatCount="indefinite" />
                    </path>
                  )}
                  {/* Flowing particle — only on tree edges for cleaner look */}
                  {effectsOn && isTree && (
                    <circle r={1.5} fill={edgeColor}>
                      <animateMotion dur={`${3 + (i % 4) * 1.5}s`} repeatCount="indefinite" path={pathD} />
                      <animate attributeName="opacity" values="0;0.6;0.6;0" dur={`${3 + (i % 4) * 1.5}s`} repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              );
            })}

            {/* ── Node breathing halos ── */}
            {effectsOn && layoutNodes.map((node, idx) => {
              const pos = mergedPositions.get(node.id) ?? { x: node.x, y: node.y };
              const isCentral = node.id === "central";
              const nw = isCentral ? NODE_W * CENTRAL_SCALE : NODE_W;
              const nh = isCentral ? NODE_H * CENTRAL_SCALE : NODE_H;
              const cx = pos.x + NODE_W / 2;
              const cy = pos.y + NODE_H / 2;
              const dimmed = hoverConnected !== null && !hoverConnected.nodes.has(node.id);
              return (
                <ellipse
                  key={`halo-${node.id}`}
                  cx={cx} cy={cy}
                  rx={nw / 2 + 18} ry={nh / 2 + 18}
                  fill="none" stroke={node.colors.border}
                  style={{ transition: "opacity 0.3s ease" }}
                  opacity={dimmed ? 0.02 : undefined}
                >
                  {!dimmed && (
                    <>
                      <animate attributeName="opacity" values="0.05;0.2;0.05" dur={`${3 + (idx % 4)}s`} repeatCount="indefinite" />
                      <animate attributeName="stroke-width" values="1;3;1" dur={`${3 + (idx % 4)}s`} repeatCount="indefinite" />
                    </>
                  )}
                </ellipse>
              );
            })}

            {/* ── Nodes ── */}
            {layoutNodes.map((node) => {
              const pos = mergedPositions.get(node.id) ?? { x: node.x, y: node.y };
              const isCentral = node.id === "central";
              // Scale size and offset top-left so the visual center stays at the edge connection point
              const nw = isCentral ? NODE_W * CENTRAL_SCALE : NODE_W;
              const nh = isCentral ? NODE_H * CENTRAL_SCALE : NODE_H;
              const nx = pos.x - (nw - NODE_W) / 2;
              const ny = pos.y - (nh - NODE_H) / 2;
              const isSelected = selectedNodeIds.has(node.id);
              const isThisHovered = hoveredNodeId === node.id;
              const dimmed = hoverConnected !== null && !hoverConnected.nodes.has(node.id);
              const mStage = masteryData.get(node.id) ?? 0;
              const masteryBorder = masteryView
                ? mStage >= 3 ? "#4ade80" : mStage >= 1 ? "#eab308" : undefined
                : undefined;
              const masteryDimmed = masteryView && mStage === 0 && !isThisHovered && !isSelected;
              return (
                <g
                  key={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{
                    cursor: "grab",
                    opacity: dimmed ? 0.12 : masteryDimmed ? 0.35 : 1,
                    transition: "opacity 0.3s ease",
                  }}
                >
                  {/* Selection glow ring for story-selected nodes */}
                  {isSelected && (
                    <>
                      <rect
                        x={nx - 6} y={ny - 6}
                        width={nw + 12} height={nh + 12}
                        rx={14} fill="none" stroke="#818cf8" strokeWidth={3}
                        filter="url(#selectionGlow)"
                        opacity={0.8}
                      >
                        <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
                      </rect>
                      <rect
                        x={nx - 6} y={ny - 6}
                        width={nw + 12} height={nh + 12}
                        rx={14} fill="none" stroke="#a5b4fc" strokeWidth={1.5}
                        strokeDasharray="6 4" opacity={0.6}
                      >
                        <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="2s" repeatCount="indefinite" />
                      </rect>
                    </>
                  )}
                  {/* Outer glow */}
                  <rect
                    x={nx - 3} y={ny - 3}
                    width={nw + 6} height={nh + 6}
                    rx={12} fill="none"
                    stroke={isSelected ? "#818cf8" : (masteryBorder ?? node.colors.border)}
                    strokeWidth={isSelected ? 2.5 : (isThisHovered ? 2 : 1)}
                    filter={isSelected ? "url(#selectionGlow)" : (isThisHovered ? "url(#nodeHoverGlow)" : (masteryBorder ? "url(#nodeHoverGlow)" : "url(#nodeGlow)"))}
                    opacity={isSelected ? 0.6 : (isThisHovered ? 0.7 : (masteryBorder ? 0.5 : 0.35))}
                  />
                  {/* Body */}
                  <rect
                    x={nx} y={ny}
                    width={nw} height={nh}
                    rx={10}
                    fill={isSelected ? "#111827" : (masteryView && mStage >= 3 ? "#0a1a0f" : (isThisHovered ? "#0f1520" : "#0d1117"))}
                    stroke={isSelected ? "#818cf8" : (masteryBorder ?? node.colors.border)}
                    strokeWidth={isSelected ? 2.5 : (isCentral ? (isThisHovered ? 3 : 2) : (isThisHovered ? 2 : 1.5))}
                  />
                  {/* Group color accent bar */}
                  <rect
                    x={nx + 1} y={ny + 8}
                    width={isCentral ? 3 : 2} height={nh - 16}
                    rx={1}
                    fill={isSelected ? "#818cf8" : node.colors.border} opacity={isSelected ? 1 : (isThisHovered ? 1 : 0.8)}
                  />
                  {/* Label */}
                  <foreignObject
                    x={nx} y={ny}
                    width={nw} height={nh}
                    style={{ pointerEvents: "none" }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "4px 12px",
                        boxSizing: "border-box",
                        textAlign: "center",
                        fontSize: isCentral ? FONT_SIZE * 1.25 : FONT_SIZE,
                        fontWeight: isCentral ? 700 : 600,
                        color: isSelected ? "#c7d2fe" : (isThisHovered ? "#f0f0ff" : "#e4e4f0"),
                        lineHeight: 1.25,
                        overflow: "hidden",
                        fontFamily: "system-ui, -apple-system, sans-serif",
                      }}
                    >
                      {node.label}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Zoom controls - fixed position, outside canvas flow */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderRadius: 12,
          padding: "6px 8px",
          backgroundColor: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
        }}
      >
        <button onClick={handleZoomOut} className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300" title="Zoom out">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span style={{ width: 48, textAlign: "center", fontSize: 12, fontWeight: 500, color: "#a1a1aa" }}>{zoomPercent}%</span>
        <button onClick={handleZoomIn} className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300" title="Zoom in">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div style={{ margin: "0 4px", height: 16, width: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
        <button onClick={handleResetZoom} className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300" title="Fit to view">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
        </button>
      </div>

      {/* Node detail modal */}
      {detailNode && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => setDetailNode(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl glass-strong p-6 shadow-xl"
            style={{ margin: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{detailNode.label}</h2>
                <span
                  className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: getGroupColor(detailNode.group).bg, color: getGroupColor(detailNode.group).text }}
                >
                  {detailNode.group}
                </span>
              </div>
              <button onClick={() => setDetailNode(null)} className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-5">
              <h3 className="mb-2 text-sm font-medium text-zinc-500">Definition</h3>
              <p className="text-sm leading-relaxed text-zinc-300">{detailNode.definition}</p>
            </div>
            {(nodeEdgesMap.get(detailNode.id)?.length ?? 0) > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-500">Relationships</h3>
                <ul className="space-y-2">
                  {nodeEdgesMap.get(detailNode.id)!.map((rel, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="mt-0.5 shrink-0 text-zinc-500">{rel.direction === "outgoing" ? "\u2192" : "\u2190"}</span>
                      <span><strong className="font-medium text-zinc-200">{rel.label}</strong>: {rel.relationship}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <Link
                href={`/workbench/${documentId}/${encodeURIComponent(detailNode.group)}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500/80 to-pink-500/80 px-4 py-2.5 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(244,63,94,0.3)]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
                Deep Dive
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Story modal */}
      {showStoryModal && (() => {
        const parsed = parseStory(storyText);
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
            onClick={() => { if (!isStoryLoading) { stopStoryNarration(); setShowStoryModal(false); } }}
          >
            <div
              className="w-full max-w-2xl rounded-2xl glass-strong p-6 shadow-xl"
              style={{ margin: 16 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-100">Mnemonic Story</h2>
                <button onClick={() => { stopStoryNarration(); setShowStoryModal(false); }} className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {isStoryLoading ? (
                <div className="flex items-center justify-center py-12 text-zinc-500">
                  <div className="relative mr-3 h-5 w-5">
                    <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-purple-400" />
                  </div>
                  Generating your mnemonic story...
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  {/* Narration controls */}
                  <div className="mb-4 rounded-xl bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Read Aloud</span>
                      <button
                        onClick={() => {
                          if (isStoryPlaying) {
                            stopStoryNarration();
                          } else {
                            playStoryNarration(storyText, storyVoiceId);
                          }
                        }}
                        disabled={isStoryTtsLoading}
                        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                          isStoryPlaying
                            ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                            : isStoryTtsLoading
                            ? "bg-white/5 text-zinc-600 cursor-wait"
                            : "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                        }`}
                      >
                        {isStoryTtsLoading ? (
                          <>
                            <div className="relative h-3.5 w-3.5">
                              <div className="absolute inset-0 animate-spin rounded-full border border-transparent border-t-purple-400" />
                            </div>
                            Loading...
                          </>
                        ) : isStoryPlaying ? (
                          <>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h.01M15 10h.01M9 10v4m6-4v4" />
                            </svg>
                            Stop
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            Play
                          </>
                        )}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {STORY_VOICES.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setStoryVoiceId(v.id);
                            if (isStoryPlaying) {
                              playStoryNarration(storyText, v.id);
                            }
                          }}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                            storyVoiceId === v.id
                              ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40"
                              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                          }`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Story paragraphs as visual cards */}
                  <div className="space-y-3">
                    {parsed.story.split("\n\n").map((p, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-[10px] font-bold text-purple-400">
                          {i + 1}
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-300">{p}</p>
                      </div>
                    ))}
                  </div>
                  {parsed.keys.length > 0 && (
                    <div className="mt-6 border-t border-white/10 pt-4">
                      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Memory Key</h3>
                      <div className="space-y-2">
                        {parsed.keys.map((k, i) => {
                          const c = COLOR_PALETTE[i % COLOR_PALETTE.length];
                          return (
                            <div key={i} className="flex items-center gap-3 rounded-lg p-2.5" style={{ backgroundColor: `${c.bg}15` }}>
                              <span className="shrink-0 rounded-full px-3 py-1 text-sm font-bold" style={{ backgroundColor: c.border, color: "#fff" }}>{k.wordplay}</span>
                              <span className="text-lg text-zinc-500">{"\u2192"}</span>
                              <span className="min-w-0">
                                <strong className="font-semibold" style={{ color: c.text }}>{k.term}</strong>
                                <span className="ml-1.5 text-sm text-zinc-500"> {"\u2014"} {k.meaning}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Add Node modal */}
      {showAddModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl glass-strong p-6 shadow-xl"
            style={{ margin: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">Add Node</h2>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-400">Label *</label>
                <input
                  type="text"
                  value={addForm.label}
                  onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Concept name"
                  className="w-full rounded-xl glass px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-blue-500/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-400">Definition *</label>
                <textarea
                  value={addForm.definition}
                  onChange={(e) => setAddForm((f) => ({ ...f, definition: e.target.value }))}
                  placeholder="What does this concept mean?"
                  rows={3}
                  className="w-full rounded-xl glass px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-blue-500/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-400">Connect to (optional)</label>
                <select
                  value={addForm.parentId}
                  onChange={(e) => setAddForm((f) => ({ ...f, parentId: e.target.value }))}
                  className="w-full rounded-xl glass px-3 py-2 text-sm text-zinc-100 outline-none transition-all focus:border-blue-500/40"
                >
                  <option value="">{"\u2014"} No connection {"\u2014"}</option>
                  {graphData.nodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </select>
              </div>
              {addForm.parentId && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-400">Relationship (optional)</label>
                  <input
                    type="text"
                    value={addForm.relationship}
                    onChange={(e) => setAddForm((f) => ({ ...f, relationship: e.target.value }))}
                    placeholder='e.g. "is a subtype of", "is treated by"'
                    className="w-full rounded-xl glass px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all focus:border-blue-500/40"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl glass px-4 py-2 text-sm text-zinc-400 transition-all glass-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNode}
                  disabled={!addForm.label.trim() || !addForm.definition.trim()}
                  className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50"
                >
                  Add Node
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
