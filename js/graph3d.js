// A small rotatable 3D renderer for regions of integration: shaded quad meshes drawn back to
// front (painter's algorithm) with simple lighting, a labeled bounding box, drag to rotate.

const AXIS_COLORS = { x: '#dc2626', y: '#15803d', z: '#2563eb' };
const fmt = v => { const r = Math.round(v * 100) / 100; return `${Object.is(r, -0) ? 0 : r}`; };

export class Graph3D {
  constructor(canvas, readout) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.readout = readout;
    this.yaw = -0.9; this.pitch = 0.45; this.zoom = 1;
    this.quads = [];
    this.bindEvents();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  // surfaces: [{ map: (s, t) => [x, y, z] for s, t in [0, 1], color: [r, g, b], n? }]
  // names: axis labels ['x', 'y', 'z']
  // equal: use one scale for all axes (solids of revolution must look round)
  set({ surfaces, names, equal = false }) {
    this.equal = equal;
    this.names = names;
    const pts = [];
    const raw = [];
    for (const S of surfaces) {
      const n = S.n || 22;
      const grid = [];
      for (let i = 0; i <= n; i++) {
        const row = [];
        for (let j = 0; j <= n; j++) {
          const p = S.map(i / n, j / n);
          row.push(p && p.every(isFinite) ? p : null);
          if (row[j]) pts.push(row[j]);
        }
        grid.push(row);
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        if (q.some(p => !p)) continue;
        raw.push({ q, color: S.color, front: !!S.front });
      }
    }
    if (!pts.length) { this.quads = []; this.draw(); return; }
    const lo = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k])));
    const hi = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])));
    // axes are scaled independently so long, thin regions still fill the view
    let span = hi.map((h, k) => (h - lo[k]) || 1);
    if (equal) { const m = Math.max(...span); span = [m, m, m]; }
    this.box = { lo, hi };
    const mids = lo.map((l, k) => (l + hi[k]) / 2);
    const norm = p => p.map((v, k) => (v - mids[k]) / span[k]);
    this.half = hi.map((h, k) => (h - lo[k]) / span[k] / 2 || 0.5);
    this.quads = raw.map(({ q, color, front }) => ({ q: q.map(norm), color, front }));
    this.yaw = -0.9; this.pitch = 0.45; this.zoom = 1;
    this.draw();
  }

  reset() { this.yaw = -0.9; this.pitch = 0.45; this.zoom = 1; this.draw(); }

  bindEvents() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (!drag) return;
      this.yaw = drag.yaw - (e.clientX - drag.x) * 0.01;
      this.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.01));
      this.draw();
    });
    c.addEventListener('pointerup', () => { drag = null; });
    c.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.max(0.4, Math.min(4, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); this.draw(); }, { passive: false });
  }

  project([x, y, z]) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    const depth = y1 * cp - z * sp, up = y1 * sp + z * cp;
    const s = Math.min(this.W, this.H) * 0.55 * this.zoom;
    return [this.W / 2 + s * x1, this.H / 2 - s * up, depth];
  }

  draw() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    if (!this.W || !this.H) return;
    if (c.width !== Math.round(this.W * dpr) || c.height !== Math.round(this.H * dpr)) { c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, this.W, this.H);
    if (!this.quads.length) { this.say('Nothing to draw.'); return; }

    this.drawBox(true);
    // light comes from the viewer's upper left
    const light = norm3([-0.4, -0.6, 0.7]);
    const proj = this.quads.map(Q => {
      const P = Q.q.map(p => this.project(p));
      const n = norm3(cross(sub3(Q.q[1], Q.q[0]), sub3(Q.q[3], Q.q[0])));
      const lit = 0.55 + 0.45 * Math.abs(dot(n, light));
      return { P, depth: (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4, color: Q.color, lit, front: Q.front };
    }).sort((a, b) => (a.front - b.front) || (b.depth - a.depth)); // highlighted pieces always on top
    for (const { P, color, lit } of proj) {
      ctx.beginPath();
      ctx.moveTo(P[0][0], P[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(P[k][0], P[k][1]);
      ctx.closePath();
      const [r0, g0, b0] = color.map(v => Math.round(v * lit));
      ctx.fillStyle = `rgba(${r0},${g0},${b0},0.88)`;
      ctx.strokeStyle = `rgba(${r0},${g0},${b0},0.95)`;
      ctx.lineWidth = 0.6;
      ctx.fill(); ctx.stroke();
    }
    this.drawBox(false);
    this.say(this.equal ? 'Drag to rotate, scroll to zoom.' : 'Drag to rotate, scroll to zoom. Each axis is scaled to fit, so shapes may look stretched.');
  }

  // bounding box edges (behind = dashed, drawn first) with axis labels
  drawBox(behind) {
    const ctx = this.ctx, { lo, hi } = this.box;
    const corners = [];
    const [h0, h1, h2] = this.half;
    for (const a of [-h0, h0]) for (const b of [-h1, h1]) for (const c of [-h2, h2]) corners.push([a, b, c]);
    const edges = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const d = corners[i].reduce((s, v, k) => s + (v !== corners[j][k]), 0);
      if (d === 1) edges.push([corners[i], corners[j]]);
    }
    const center = this.project([0, 0, 0])[2];
    ctx.lineWidth = 1;
    for (const [p, q] of edges) {
      const P = this.project(p), Q = this.project(q);
      const isBehind = (P[2] + Q[2]) / 2 > center;
      if (isBehind !== behind) continue;
      ctx.strokeStyle = behind ? 'rgba(100,116,139,0.45)' : 'rgba(100,116,139,0.7)';
      ctx.setLineDash(behind ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (behind) return;
    // axis labels along three edges from the low corner
    ctx.font = '600 12px system-ui, sans-serif';
    const o = this.half.map(h => -h);
    this.names.forEach((name, k) => {
      const end = o.slice(); end[k] = this.half[k];
      const mid = o.slice(); mid[k] = 0;
      const A = this.project(o), B = this.project(end), Mid = this.project(mid);
      ctx.strokeStyle = AXIS_COLORS[['x', 'y', 'z'][k]]; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      ctx.fillStyle = AXIS_COLORS[['x', 'y', 'z'][k]];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const away = (P, d) => [P[0] + (P[0] - this.W / 2) * d, P[1] + (P[1] - this.H / 2) * d];
      const L = away(Mid, 0.14);
      ctx.fillText(name, L[0], L[1]);
      ctx.font = '11px system-ui, sans-serif';
      const a = away(A, 0.08), b = away(B, 0.08);
      ctx.fillText(fmt(lo[k]), a[0], a[1]);
      ctx.fillText(fmt(hi[k]), b[0], b[1]);
      ctx.font = '600 12px system-ui, sans-serif';
    });
  }

  say(t) { if (this.readout) this.readout.textContent = t; }
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
