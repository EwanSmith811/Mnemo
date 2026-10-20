/**
 * A small particle engine for the upload screen. Particles morph between
 * formations that mirror what the server is doing:
 *   uploading  → a vortex drawing material inward
 *   reading    → a slide whose "lines of text" re-form for each page read
 *   generating → a rotating 3D concept graph labelled with real content
 *   complete   → collapse to a point, then a burst
 * Rendering is plain 2D canvas with a perspective projection.
 */
export type Phase =
  'uploading' | 'reading' | 'generating' | 'saving' | 'complete' | 'error';

interface Particle {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  vx: number;
  vy: number;
  vz: number;
  a: number;
  b: number;
  c: number;
  ember: boolean;
}
interface Node3 {
  x: number;
  y: number;
  z: number;
}

const COUNT = 320;
const SLIDE_MS = 2300;
const TAU = Math.PI * 2;

function fibonacciSphere(n: number, radius: number): Node3[] {
  const points: Node3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    points.push({
      x: Math.cos(theta) * r * radius,
      y: y * radius * 0.78,
      z: Math.sin(theta) * r * radius,
    });
  }
  return points;
}

export class Constellation {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private nodes: Node3[] = [];
  private edges: [number, number][] = [];
  private labels: string[] = [];
  private phase: Phase = 'uploading';
  private phaseAt = 0;
  private slide = -1;
  private lines: number[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;
  private radius = 200;
  private frame = 0;
  private last = 0;
  private time = 0;
  private paused = false;
  private pointer = { x: 0, y: 0 };
  private tilt = { x: 0, y: 0 };
  private mono = 'monospace';
  private colors = { ink: '#eef0f5', ember: '#7d95ff', bad: '#f2766b' };
  onSlide?: (index: number) => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private still: boolean,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const styles = getComputedStyle(canvas);
    this.mono = styles.getPropertyValue('--font-geist-mono') || 'monospace';
    this.colors.ink = styles.getPropertyValue('--gen-ink').trim() || '#f2ece2';
    this.colors.ember =
      styles.getPropertyValue('--gen-accent').trim() || '#7d95ff';
    for (let i = 0; i < COUNT; i++) {
      const u = Math.random() * TAU;
      const v = Math.acos(2 * Math.random() - 1);
      const r = 1.6 + Math.random() * 1.4;
      const p = {
        x: Math.sin(v) * Math.cos(u) * r,
        y: Math.sin(v) * Math.sin(u) * r,
        z: Math.cos(v) * r,
        a: Math.random(),
        b: Math.random(),
        c: Math.random(),
        ember: Math.random() < 0.16,
      };
      this.particles.push({ ...p, tx: 0, ty: 0, tz: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.resize();
    this.setLabels([]);
    this.phaseAt = performance.now();
    if (still) this.settle();
    else this.frame = requestAnimationFrame(this.tick);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    const wide = this.width > 900;
    this.radius = wide
      ? Math.min(this.width * 0.22, this.height * 0.27)
      : Math.min(this.width * 0.3, this.height * 0.15);
    if (this.still) this.settle();
  }

  point(x: number, y: number) {
    this.pointer = {
      x: (x / this.width - 0.5) * 2,
      y: (y / this.height - 0.5) * 2,
    };
  }

  setPhase(phase: Phase) {
    if (phase === this.phase) return;
    this.phase = phase;
    this.phaseAt = performance.now();
    if (phase === 'complete')
      for (const p of this.particles) {
        p.vx = p.vy = p.vz = 0;
      }
    if (this.still) this.settle();
  }

  /** Real slide titles first, then concept names once the map is ready. */
  setLabels(labels: string[]) {
    const unique = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
    if (unique.join('|') === this.labels.join('|') && this.nodes.length) return;
    this.labels = unique;
    const count = Math.max(9, Math.min(16, unique.length || 12));
    this.nodes = fibonacciSphere(count, 1);
    const edges = new Set<string>();
    this.nodes.forEach((n, i) => {
      this.nodes
        .map((m, j) => ({
          j,
          d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 + (m.z - n.z) ** 2,
        }))
        .filter((e) => e.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach(({ j }) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
    });
    this.edges = [...edges].map(
      (e) => e.split('-').map(Number) as [number, number],
    );
    if (this.still) this.settle();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (this.still) return;
    cancelAnimationFrame(this.frame);
    if (!paused) {
      this.last = 0;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  destroy() {
    cancelAnimationFrame(this.frame);
  }

  private settle() {
    this.time = 4000;
    this.targets(this.time, 1);
    for (const p of this.particles) {
      p.x = p.tx;
      p.y = p.ty;
      p.z = p.tz;
    }
    this.draw();
  }

  private tick = (now: number) => {
    const dt = this.last ? Math.min(50, now - this.last) : 16;
    this.last = now;
    this.time += dt;
    const step = dt / 16.67;
    this.tilt.x += (this.pointer.y * 0.25 - this.tilt.x) * 0.04 * step;
    this.tilt.y += (this.pointer.x * 0.35 - this.tilt.y) * 0.04 * step;
    const since = now - this.phaseAt;
    this.targets(this.time, step, since);
    this.draw(since);
    if (!this.paused) this.frame = requestAnimationFrame(this.tick);
  };

  /** Compute each particle's target in unit space for the current formation. */
  private targets(t: number, step: number, since = 4000) {
    const ps = this.particles;
    const phase = this.phase;
    if (phase === 'reading') {
      const index = Math.floor(t / SLIDE_MS);
      if (index !== this.slide) {
        this.slide = index;
        // A fresh page: a title bar and five lines of varying length.
        this.lines = [0.55 + Math.random() * 0.3];
        for (let i = 0; i < 5; i++) this.lines.push(0.35 + Math.random() * 0.6);
        this.onSlide?.(index);
      }
    }
    let ease = 0.05;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (phase === 'uploading') {
        const r = 0.35 + p.a * 1.5;
        const angle = p.b * TAU + (t / 1000) * (0.9 / r);
        p.tx = Math.cos(angle) * r;
        p.ty = (p.c - 0.5) * 0.3 * r;
        p.tz = Math.sin(angle) * r;
        ease = 0.03;
      } else if (phase === 'reading') {
        const w = 1.7;
        const h = 1.06;
        const frameShare = 0.24;
        if (p.a < frameShare) {
          // Slide border.
          const k = p.a / frameShare;
          const per = 2 * (w + h);
          let d = k * per;
          let x: number, y: number;
          if (d < w) [x, y] = [-w / 2 + d, -h / 2];
          else if ((d -= w) < h) [x, y] = [w / 2, -h / 2 + d];
          else if ((d -= h) < w) [x, y] = [w / 2 - d, h / 2];
          else [x, y] = [-w / 2, h / 2 - (d - w)];
          p.tx = x;
          p.ty = y;
        } else {
          const k = (p.a - frameShare) / (1 - frameShare);
          const line = Math.min(
            this.lines.length - 1,
            Math.floor(k * this.lines.length),
          );
          const along = (k * this.lines.length) % 1;
          const len = this.lines[line] ?? 0.5;
          p.tx = -w / 2 + 0.16 + along * (w - 0.32) * len;
          p.ty =
            -h / 2 +
            0.2 +
            (line === 0 ? 0 : 0.16 + line * 0.13) +
            (p.c - 0.5) * (line === 0 ? 0.05 : 0.02);
        }
        p.tz = (p.b - 0.5) * 0.04;
        // Lean the page; a quick turn marks each new slide.
        const turn = Math.max(0, 1 - (t % SLIDE_MS) / 450);
        const ry = Math.sin(t / 2100) * 0.35 + turn * 0.6;
        const rx = -0.18;
        const x1 = p.tx * Math.cos(ry) + p.tz * Math.sin(ry);
        const z1 = -p.tx * Math.sin(ry) + p.tz * Math.cos(ry);
        const y1 = p.ty * Math.cos(rx) - z1 * Math.sin(rx);
        p.tz = p.ty * Math.sin(rx) + z1 * Math.cos(rx);
        p.tx = x1;
        p.ty = y1;
        ease = 0.085;
      } else if (phase === 'generating' || phase === 'saving') {
        const node = this.nodes[i % this.nodes.length];
        const orbit = 0.08 + p.c * 0.12;
        const angle = p.b * TAU + t / (900 + p.a * 900);
        const ox = Math.cos(angle) * orbit;
        const oy = Math.sin(angle * 0.7 + p.a * 3) * orbit;
        const oz = Math.sin(angle) * orbit;
        const spin = t / 9000;
        const nx = node.x * Math.cos(spin) + node.z * Math.sin(spin);
        const nz = -node.x * Math.sin(spin) + node.z * Math.cos(spin);
        const squeeze = phase === 'saving' ? 0.55 : 1;
        p.tx = (nx + ox) * squeeze;
        p.ty = (node.y + oy) * squeeze;
        p.tz = (nz + oz) * squeeze;
        ease = 0.045;
      } else if (phase === 'complete') {
        if (since < 650) {
          p.tx = p.ty = p.tz = 0;
          ease = 0.12;
        } else {
          if (!p.vx && !p.vy) {
            const u = p.a * TAU;
            const v = Math.acos(2 * p.b - 1);
            const speed = 0.04 + p.c * 0.07;
            p.vx = Math.sin(v) * Math.cos(u) * speed;
            p.vy = Math.sin(v) * Math.sin(u) * speed;
            p.vz = Math.cos(v) * speed;
          }
          p.tx = p.x + p.vx * step;
          p.ty = p.y + p.vy * step;
          p.tz = p.z + p.vz * step;
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.vz *= 0.985;
          ease = 1;
        }
      } else {
        // error: drift and settle.
        p.tx = p.x * 0.999;
        p.ty = p.y + 0.002 * step;
        p.tz = p.z;
        ease = 1;
      }
      const k = Math.min(1, ease * step);
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.z += (p.tz - p.z) * k;
    }
  }

  private project(x: number, y: number, z: number) {
    const rx = this.tilt.x - 0.08;
    const ry = this.tilt.y;
    const x1 = x * Math.cos(ry) + z * Math.sin(ry);
    const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
    const y1 = y * Math.cos(rx) - z1 * Math.sin(rx);
    const z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
    const depth = 3.2;
    const scale = depth / (depth + z2);
    const wide = this.width > 900;
    const cx = this.width * (wide ? 0.62 : 0.5);
    const cy = this.height * (wide ? 0.42 : 0.24);
    return {
      x: cx + x1 * this.radius * scale,
      y: cy + y1 * this.radius * scale,
      s: scale,
      z: z2,
    };
  }

  private draw(since = 4000) {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const error = this.phase === 'error';
    const fade =
      this.phase === 'complete' && since > 650
        ? Math.max(0, 1 - (since - 650) / 1500)
        : 1;

    // Concept graph edges and labels.
    if (this.phase === 'generating' || this.phase === 'saving') {
      const spin = this.time / 9000;
      const squeeze = this.phase === 'saving' ? 0.55 : 1;
      const projected = this.nodes.map((n) => {
        const x = n.x * Math.cos(spin) + n.z * Math.sin(spin);
        const z = -n.x * Math.sin(spin) + n.z * Math.cos(spin);
        return this.project(x * squeeze, n.y * squeeze, z * squeeze);
      });
      const grow = Math.min(1, (since + 300) / 1800);
      ctx.lineWidth = 1;
      this.edges.forEach(([a, b], i) => {
        const p = projected[a];
        const q = projected[b];
        const reveal = Math.min(1, Math.max(0, grow * this.edges.length - i));
        if (reveal <= 0) return;
        const depth = (p.s + q.s) / 2;
        ctx.strokeStyle = this.alpha(this.colors.ink, 0.16 * depth * reveal);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + (q.x - p.x) * reveal, p.y + (q.y - p.y) * reveal);
        ctx.stroke();
        // A signal travelling along each edge.
        const k = ((this.time / 1600 + i * 0.37) % 1) * reveal;
        ctx.fillStyle = this.alpha(this.colors.ember, 0.9 * depth);
        ctx.beginPath();
        ctx.arc(
          p.x + (q.x - p.x) * k,
          p.y + (q.y - p.y) * k,
          1.6 * depth,
          0,
          TAU,
        );
        ctx.fill();
      });
      ctx.textBaseline = 'middle';
      projected.forEach((p, i) => {
        const front = Math.max(0, Math.min(1, (p.s - 0.78) / 0.4));
        ctx.strokeStyle = this.alpha(this.colors.ember, 0.55 * front + 0.1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7 * p.s, 0, TAU);
        ctx.stroke();
        const label = this.labels[i % Math.max(1, this.labels.length)];
        if (!label || !this.labels.length || front < 0.05) return;
        const text = label.length > 30 ? label.slice(0, 29) + '…' : label;
        ctx.font = `500 ${Math.round(10.5 * p.s + 1)}px ${this.mono}`;
        ctx.fillStyle = this.alpha(this.colors.ink, 0.85 * front * grow);
        ctx.fillText(text.toUpperCase(), p.x + 13 * p.s, p.y);
      });
    }

    // Particles, back to front with additive glow.
    ctx.globalCompositeOperation = 'lighter';
    const scan =
      this.phase === 'reading'
        ? ((this.time % SLIDE_MS) / SLIDE_MS) * 1.4 - 0.7
        : null;
    for (const p of this.particles) {
      const q = this.project(p.x, p.y, p.z);
      if (q.s <= 0) continue;
      let size = (p.ember ? 1.7 : 1.15) * q.s * (0.7 + p.c * 0.6);
      let alpha = Math.min(1, 0.25 + (q.s - 0.6) * 0.9) * fade;
      let color = error
        ? this.colors.bad
        : p.ember
          ? this.colors.ember
          : this.colors.ink;
      if (scan !== null && Math.abs(p.ty - scan) < 0.07) {
        size *= 1.9;
        alpha = Math.min(1, alpha + 0.5);
        color = this.colors.ember;
      }
      if (error) alpha *= 0.45;
      ctx.fillStyle = this.alpha(color, alpha);
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(0.4, size), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // The reading beam.
    if (scan !== null) {
      const left = this.project(-0.95, scan, 0);
      const right = this.project(0.95, scan, 0);
      const gradient = ctx.createLinearGradient(left.x, 0, right.x, 0);
      gradient.addColorStop(0, this.alpha(this.colors.ember, 0));
      gradient.addColorStop(0.5, this.alpha(this.colors.ember, 0.7));
      gradient.addColorStop(1, this.alpha(this.colors.ember, 0));
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }

    // Completion shockwave.
    if (this.phase === 'complete' && since > 600) {
      const centre = this.project(0, 0, 0);
      const k = (since - 600) / 1400;
      if (k < 1) {
        for (const [offset, width] of [
          [0, 2],
          [0.12, 1],
        ]) {
          const r =
            Math.max(0, k - offset) * Math.max(this.width, this.height) * 0.7;
          ctx.strokeStyle = this.alpha(this.colors.ember, (1 - k) * 0.8);
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.arc(centre.x, centre.y, r, 0, TAU);
          ctx.stroke();
        }
      }
    }
  }

  private rgb = new Map<string, string>();
  private alpha(hex: string, a: number) {
    let base = this.rgb.get(hex);
    if (!base) {
      const value = hex.replace('#', '');
      const n = parseInt(
        value.length === 3 ? value.replace(/./g, '$&$&') : value,
        16,
      );
      base = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
      this.rgb.set(hex, base);
    }
    return `rgba(${base},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }
}
