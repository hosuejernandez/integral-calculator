// Canvas grapher for integrals: curves, shaded (signed) area, area between curves,
// Riemann rectangles / trapezoids, labeled points, pan and zoom.

const C = {
  grid: '#e5e7eb', axis: '#475569', text: '#334155', point: '#0f172a',
  pos: 'rgba(37, 99, 235, 0.22)', neg: 'rgba(220, 38, 38, 0.22)',
  rectFill: 'rgba(245, 158, 11, 0.25)', rectLine: '#d97706',
};

function niceStep(span) {
  const raw = span / 8;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
const fmtTick = v => { const r = Math.round(v * 1e6) / 1e6; return Math.abs(r) >= 1e5 || (Math.abs(r) < 1e-3 && r !== 0) ? r.toExponential(1) : `${r}`; };
const fmtNum = v => (isFinite(v) ? `${Math.round(v * 1000) / 1000}` : 'undefined');

export class Graph {
  constructor(canvas, readout) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.readout = readout;
    this.view = { x0: -10, x1: 10, y0: -10, y1: 10 };
    this.home = { ...this.view };
    this.scene = null;
    this.hover = null;
    this.bindEvents();
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  // scene: { curves: [{ f, color, label, dash }], shade: [{ top, bottom, a, b, signed }],
  //          rects: [{ x0, x1, y0, y1, trap }], points: [{ x, y, label }], window: [a, b], xName }
  set(scene) {
    this.scene = scene;
    this.home = this.autoView();
    this.view = { ...this.home };
    this.hover = null;
    this.draw();
  }

  autoView() {
    const s = this.scene;
    if (s.view) return { ...s.view };
    let [x0, x1] = s.window || [-6, 6];
    if (!isFinite(x0)) x0 = isFinite(x1) ? x1 - 10 : -10;
    if (!isFinite(x1)) x1 = x0 + 10;
    const pad = (x1 - x0) * 0.25 || 1;
    x0 -= pad; x1 += pad;
    const ys = [0];
    for (const c of s.curves) for (let i = 0; i <= 300; i++) { const y = c.f(x0 + (x1 - x0) * i / 300); if (isFinite(y)) ys.push(y); }
    for (const r of s.rects || []) ys.push(r.y0, r.y1);
    ys.sort((a, b) => a - b);
    let y0 = ys[Math.floor(ys.length * 0.03)], y1 = ys[Math.ceil(ys.length * 0.97) - 1];
    y0 = Math.min(y0, 0); y1 = Math.max(y1, 0);
    const p = Math.max((y1 - y0) * 0.15, 0.5);
    return { x0, x1, y0: y0 - p, y1: y1 + p };
  }

  reset() { this.view = { ...this.home }; this.draw(); }
  zoom(f, cx, cy) {
    const v = this.view;
    if (cx === undefined) { cx = (v.x0 + v.x1) / 2; cy = (v.y0 + v.y1) / 2; }
    this.view = { x0: cx + (v.x0 - cx) * f, x1: cx + (v.x1 - cx) * f, y0: cy + (v.y0 - cy) * f, y1: cy + (v.y1 - cy) * f };
    this.draw();
  }

  sx(x) { return (x - this.view.x0) / (this.view.x1 - this.view.x0) * this.W; }
  sy(y) { return this.H - (y - this.view.y0) / (this.view.y1 - this.view.y0) * this.H; }
  wx(px) { return this.view.x0 + px / this.W * (this.view.x1 - this.view.x0); }
  wy(py) { return this.view.y0 + (this.H - py) / this.H * (this.view.y1 - this.view.y0); }

  bindEvents() {
    const c = this.canvas;
    let drag = null;
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', e => { const [px, py] = pos(e); drag = { px, py, view: { ...this.view }, moved: false }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      const [px, py] = pos(e);
      if (drag) {
        if (Math.abs(px - drag.px) + Math.abs(py - drag.py) > 3) drag.moved = true;
        if (drag.moved && e.pointerType === 'mouse') {
          const dx = (px - drag.px) / this.W * (drag.view.x1 - drag.view.x0), dy = (py - drag.py) / this.H * (drag.view.y1 - drag.view.y0);
          this.view = { x0: drag.view.x0 - dx, x1: drag.view.x1 - dx, y0: drag.view.y0 + dy, y1: drag.view.y1 + dy };
        }
      }
      this.hover = { px, py };
      this.draw();
    });
    c.addEventListener('pointerup', () => { drag = null; });
    c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { this.hover = null; this.draw(); } });
    c.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = pos(e); this.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, this.wx(px), this.wy(py)); }, { passive: false });
  }

  draw() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
    this.W = r.width; this.H = r.height;
    if (!this.W || !this.H) return;
    if (c.width !== Math.round(this.W * dpr) || c.height !== Math.round(this.H * dpr)) { c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.W, this.H);
    this.grid();
    const s = this.scene;
    if (!s) return;
    for (const sh of s.shade || []) (sh.horizontal ? this.shadeH(sh) : this.shade(sh));
    for (const rc of s.rects || []) this.rect(rc);
    for (const b of s.boxes || []) {
      const ctx = this.ctx;
      ctx.fillStyle = b.outline ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.45)';
      ctx.strokeStyle = '#b45309'; ctx.lineWidth = b.outline ? 2 : 1.5;
      ctx.setLineDash(b.outline ? [6, 4] : []);
      const X0 = this.sx(b.x0), X1 = this.sx(b.x1), Y0 = this.sy(b.y0), Y1 = this.sy(b.y1);
      ctx.fillRect(Math.min(X0, X1), Math.min(Y0, Y1), Math.max(Math.abs(X1 - X0), 3), Math.max(Math.abs(Y1 - Y0), 3));
      ctx.strokeRect(Math.min(X0, X1), Math.min(Y0, Y1), Math.max(Math.abs(X1 - X0), 3), Math.max(Math.abs(Y1 - Y0), 3));
      ctx.setLineDash([]);
    }
    for (const cv of s.curves) {
      if (cv.px) this.paramCurve(cv);
      else this.curve(cv.f, cv.color, cv.dash || [], cv.width || 3);
    }
    ctx.font = '600 12px system-ui, sans-serif';
    for (const p of s.points || []) {
      if (!isFinite(p.y)) continue;
      const X = this.sx(p.x), Y = this.sy(p.y);
      ctx.fillStyle = C.point; ctx.beginPath(); ctx.arc(X, Y, 4.5, 0, 2 * Math.PI); ctx.fill();
      if (p.label) this.label(p.label, X, Y - 10);
    }
    this.hoverInfo();
  }

  grid() {
    const ctx = this.ctx, v = this.view, gx = niceStep(v.x1 - v.x0), gy = niceStep(v.y1 - v.y0);
    ctx.lineWidth = 1; ctx.strokeStyle = C.grid; ctx.beginPath();
    for (let x = Math.ceil(v.x0 / gx) * gx; x <= v.x1; x += gx) { const p = Math.round(this.sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, this.H); }
    for (let y = Math.ceil(v.y0 / gy) * gy; y <= v.y1; y += gy) { const p = Math.round(this.sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(this.W, p); }
    ctx.stroke();
    const ax = Math.min(Math.max(this.sy(0), 0), this.H), ay = Math.min(Math.max(this.sx(0), 0), this.W);
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(0, ax); ctx.lineTo(this.W, ax); ctx.moveTo(ay, 0); ctx.lineTo(ay, this.H); ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ly = ax > this.H - 16 ? this.H - 14 : ax + 3;
    for (let x = Math.ceil(v.x0 / gx) * gx; x <= v.x1; x += gx) if (Math.abs(x) > gx / 2) ctx.fillText(fmtTick(x), this.sx(x), ly);
    ctx.textAlign = ay > this.W - 40 ? 'right' : 'left'; ctx.textBaseline = 'middle';
    const lx = ay > this.W - 40 ? this.W - 4 : ay + 4;
    for (let y = Math.ceil(v.y0 / gy) * gy; y <= v.y1; y += gy) if (Math.abs(y) > gy / 2) ctx.fillText(fmtTick(y), lx, this.sy(y));
  }

  curve(g, color, dash, width) {
    const ctx = this.ctx, n = Math.ceil(this.W * 1.5), limit = this.H * 4;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.lineJoin = 'round';
    ctx.beginPath();
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const x = this.wx(i / n * this.W), y = g(x);
      const pt = isFinite(y) ? [this.sx(x), this.sy(y)] : null;
      if (pt && prev && Math.abs(pt[1] - prev[1]) < limit && Math.abs(pt[1]) < limit * 2) ctx.lineTo(pt[0], pt[1]);
      else if (pt) ctx.moveTo(pt[0], pt[1]);
      prev = pt;
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // curve given as t -> [x, y] for t in [t0, t1]
  paramCurve({ px, t0 = 0, t1 = 1, color, width = 3, dash = [] }) {
    const ctx = this.ctx, n = 300;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
    let started = false;
    for (let i = 0; i <= n; i++) {
      const [x, y] = px(t0 + (t1 - t0) * i / n);
      if (!isFinite(x) || !isFinite(y)) { started = false; continue; }
      if (started) ctx.lineTo(this.sx(x), this.sy(y)); else { ctx.moveTo(this.sx(x), this.sy(y)); started = true; }
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // fill between x = left(y) and x = right(y) for y in [c, d] (horizontal strips)
  shadeH({ left, right, c, d }) {
    const ctx = this.ctx, n = 240;
    ctx.fillStyle = C.pos;
    for (let i = 0; i < n; i++) {
      const y0 = c + (d - c) * i / n, y1 = c + (d - c) * (i + 1) / n;
      const l0 = left(y0), l1 = left(y1), r0 = right(y0), r1 = right(y1);
      if (![l0, l1, r0, r1].every(isFinite)) continue;
      ctx.beginPath();
      ctx.moveTo(this.sx(l0), this.sy(y0)); ctx.lineTo(this.sx(r0), this.sy(y0));
      ctx.lineTo(this.sx(r1), this.sy(y1)); ctx.lineTo(this.sx(l1), this.sy(y1));
      ctx.closePath(); ctx.fill();
    }
  }

  // fill between top(x) and bottom(x) on [a, b]; signed = blue above / red below
  shade({ top, bottom = () => 0, a, b, signed = true }) {
    const ctx = this.ctx;
    const A = Math.max(a, this.view.x0), B = Math.min(b, this.view.x1);
    if (!(A < B)) return;
    const n = Math.max(2, Math.ceil((this.sx(B) - this.sx(A)) * 1.5));
    const clampY = y => Math.max(Math.min(y, this.view.y1 + (this.view.y1 - this.view.y0)), this.view.y0 - (this.view.y1 - this.view.y0));
    for (let i = 0; i < n; i++) {
      const x0 = A + (B - A) * i / n, x1 = A + (B - A) * (i + 1) / n, xm = (x0 + x1) / 2;
      const t0 = top(x0), t1 = top(x1), b0 = bottom(x0), b1 = bottom(x1);
      if (![t0, t1, b0, b1].every(isFinite)) continue;
      ctx.fillStyle = !signed || top(xm) >= bottom(xm) ? C.pos : C.neg;
      ctx.beginPath();
      ctx.moveTo(this.sx(x0), this.sy(clampY(t0))); ctx.lineTo(this.sx(x1), this.sy(clampY(t1)));
      ctx.lineTo(this.sx(x1), this.sy(clampY(b1))); ctx.lineTo(this.sx(x0), this.sy(clampY(b0)));
      ctx.closePath(); ctx.fill();
    }
  }

  rect({ x0, x1, y0, y1, trap, sample }) {
    const ctx = this.ctx;
    ctx.fillStyle = C.rectFill; ctx.strokeStyle = C.rectLine; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.sx(x0), this.sy(0)); ctx.lineTo(this.sx(x0), this.sy(y0));
    ctx.lineTo(this.sx(x1), this.sy(trap ? y1 : y0)); ctx.lineTo(this.sx(x1), this.sy(0));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (sample !== undefined && isFinite(y0)) {
      ctx.fillStyle = C.rectLine; ctx.beginPath(); ctx.arc(this.sx(sample), this.sy(y0), 3, 0, 2 * Math.PI); ctx.fill();
    }
  }

  label(text, x, y) {
    const ctx = this.ctx, w = ctx.measureText(text).width + 10;
    x = Math.min(Math.max(x, w / 2 + 2), this.W - w / 2 - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x - w / 2, y - 14, w, 18);
    ctx.fillStyle = C.point; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, x, y);
  }

  hoverInfo() {
    const s = this.scene;
    if (!this.hover) { this.setReadout(s.hint || 'Move over the graph to read values. Drag to pan, scroll to zoom.'); return; }
    const x = this.wx(this.hover.px);
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(15,23,42,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(this.sx(x), 0); ctx.lineTo(this.sx(x), this.H); ctx.stroke(); ctx.setLineDash([]);
    const parts = [`${s.xName || 'x'} = ${fmtNum(x)}`];
    for (const cv of s.curves) {
      if (!cv.f || !cv.label) continue;
      const y = cv.f(x);
      if (isFinite(y)) { ctx.fillStyle = cv.color; ctx.beginPath(); ctx.arc(this.sx(x), this.sy(y), 4, 0, 2 * Math.PI); ctx.fill(); }
      parts.push(`${cv.label} = ${fmtNum(y)}`);
    }
    this.setReadout(parts.join('    '));
  }

  setReadout(t) { if (this.readout) this.readout.textContent = t; }
}
