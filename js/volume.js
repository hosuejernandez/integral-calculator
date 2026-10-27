// Volumes: solids of revolution (disk / washer and shell) and solids with known cross-sections.
// The region lies between two curves given as functions of the integration variable v
// (y = f(x) when v = x, or x = f(y) when v = y).
import { num, sym, add, mul, pow, sub, compile, substitute, toTex, freeSyms } from './expr.js';
import { pretty } from './simplify.js';
import { definite, intersections, boundTex } from './calculus.js';

const PI = sym('pi');
const fnOf = (n, v) => { const c = compile(n); return x => c({ [v]: x }); };

export const SHAPES = {
  square: { name: 'Squares', area: s => pow(s, num(2)), tex: 's^2' },
  semicircle: { name: 'Semicircles (diameter in the base)', area: s => mul([num(1, 8), PI, pow(s, num(2))]), tex: '\\frac{\\pi}{8}s^2' },
  equilateral: { name: 'Equilateral triangles', area: s => mul([num(1, 4), pow(num(3), num(1, 2)), pow(s, num(2))]), tex: '\\frac{\\sqrt{3}}{4}s^2' },
  isosceles: { name: 'Isosceles right triangles (leg in the base)', area: s => mul([num(1, 2), pow(s, num(2))]), tex: '\\frac{1}{2}s^2' },
  rectangle: { name: 'Rectangles of height h', area: (s, h) => mul([h, s]), tex: 'h\\,s' },
};

// opts: { f, g, v, bounds: [lo, hi] | null, kind: 'revolve' | 'cross',
//         axis: { dir: 'h' | 'v', k: node }, method: 'auto' | 'washer' | 'shell', shape, height: node }
export function volume(opts) {
  const { f, v } = opts;
  const g = opts.g || num(0);
  const other = v === 'x' ? 'y' : 'x';
  const h = pretty(sub(f, g));
  // where is the region? between the bounds, or between the first and last crossing
  let lo, hi, loNode, hiNode;
  if (opts.bounds) {
    [lo, hi] = opts.bounds.map(b => b.value);
    [loNode, hiNode] = opts.bounds.map(b => b.node);
  } else {
    const pts = intersections(h, v, -20, 20);
    if (pts.length < 2) throw new Error('The curves cross fewer than two times, so there is no enclosed region. Enter bounds.');
    lo = pts[0].x; hi = pts[pts.length - 1].x;
    loNode = pts[0].node; hiNode = pts[pts.length - 1].node;
  }
  const inner = intersections(h, v, lo, hi).filter(p => p.x > lo + 1e-9 && p.x < hi - 1e-9);
  const cuts = [{ x: lo, node: loNode }, ...inner.map(p => ({ x: p.x, node: p.node })), { x: hi, node: hiNode }];
  const fN = fnOf(f, v), gN = fnOf(g, v);
  // the axis of rotation is "parallel" when it runs along the v-axis (washers), else "perpendicular" (shells)
  let method = null, axisParallel = null, k = null;
  if (opts.kind === 'revolve') {
    axisParallel = (opts.axis.dir === 'h') === (v === 'x');
    k = opts.axis.k;
    method = opts.method === 'auto' ? (axisParallel ? 'washer' : 'shell') : opts.method;
    if (method === 'washer' && !axisParallel) throw new Error(`Washers need the axis to be parallel to the ${v}-axis. Use shells here, or rewrite the curves as functions of ${other} and integrate with respect to ${other}.`);
    if (method === 'shell' && axisParallel) throw new Error(`Shells need the axis to be perpendicular to the ${v}-axis. Use washers here, or rewrite the curves as functions of ${other}.`);
  }
  const kv = k ? compile(k)({}) : 0;
  const pieces = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const l = cuts[i], r = cuts[i + 1], m = (l.x + r.x) / 2;
    const fTop = fN(m) >= gN(m);
    const top = fTop ? f : g, bot = fTop ? g : f;
    let integrand, parts;
    if (opts.kind === 'cross') {
      const s = pretty(sub(top, bot));
      const A = SHAPES[opts.shape].area(s, opts.height);
      integrand = pretty(A);
      parts = { s, A: integrand };
    } else if (method === 'washer') {
      const T = fnOf(top, v), Bf = fnOf(bot, v);
      const bv = Bf(m);
      let through = false;
      for (let q = 1; q < 200 && !through; q++) { const x = l.x + (r.x - l.x) * q / 200; through = kv > Bf(x) + 1e-9 && kv < T(x) - 1e-9; }
      if (through) throw new Error('The axis of rotation passes through the region, so the slices are not washers. Choose an axis on the edge of or outside the region.');
      // the axis is below (or at) the region: R = top - k, r = bot - k; above: R = k - bot, r = k - top
      const below = kv <= bv + 1e-12;
      const R = pretty(below ? sub(top, k) : sub(k, bot));
      const rr = pretty(below ? sub(bot, k) : sub(k, top));
      const disk = isZeroish(rr, v, l.x, r.x);
      integrand = pretty(mul([PI, disk ? pow(R, num(2)) : sub(pow(R, num(2)), pow(rr, num(2)))]));
      parts = { R, r: disk ? null : rr, disk };
    } else {
      if (kv > l.x + 1e-12 && kv < r.x - 1e-12) throw new Error('The axis of rotation passes through the region. Choose an axis on the edge of or outside the region.');
      const radius = pretty(kv <= l.x + 1e-12 ? sub(sym(v), k) : sub(k, sym(v)));
      const height = pretty(sub(top, bot));
      integrand = pretty(mul([num(2), PI, radius, height]));
      parts = { radius, height };
    }
    const res = definite(integrand, v, { node: l.node, value: l.x }, { node: r.node, value: r.x });
    pieces.push({ l, r, top, bot, integrand, parts, res, lTex: l.node ? toTex(l.node) : boundTex(l.x), rTex: r.node ? toTex(r.node) : boundTex(r.x) });
  }
  const total = pieces.reduce((s, p) => s + p.res.value, 0);
  const exact = pieces.every(p => p.res.exact) ? pretty(add(pieces.map(p => p.res.exact))) : null;
  return { method, axisParallel, kv, lo, hi, pieces, total, exact, h, other };
}

function isZeroish(n, v, a, b) {
  if (freeSyms(n).size === 0 && compile(n)({}) === 0) return true;
  const F = fnOf(n, v);
  return [0.13, 0.5, 0.87].every(t => Math.abs(F(a + (b - a) * t)) < 1e-12);
}

// ---------- 3D surfaces ----------

// Plane point (p along the v-axis, q the other coordinate) -> world [x, depth, up] after rotating by
// angle th about the axis. Works for both orientations of v.
export function solidSurfaces(vol, opts, colors) {
  const { f, v } = opts;
  const g = opts.g || num(0);
  const fN = fnOf(f, v), gN = fnOf(g, v);
  const top = t => Math.max(fN(t), gN(t)), bot = t => Math.min(fN(t), gN(t));
  const { lo, hi } = vol;
  const P = (s) => lo + (hi - lo) * s;
  // plane coordinates (X horizontal, Y vertical) of a point given v-value t and other-value q
  const plane = (t, q) => (v === 'x' ? [t, q] : [q, t]);
  const surfaces = [];
  const mid = (lo + hi) / 2;

  if (opts.kind === 'revolve') {
    const k = vol.kv;
    const rot = ([X, Y], th) => (opts.axis.dir === 'h'
      ? [X, (Y - k) * Math.sin(th), k + (Y - k) * Math.cos(th)]
      : [k + (X - k) * Math.cos(th), (X - k) * Math.sin(th), Y]);
    const rev = (curve, color, n) => ({ map: (s, w) => rot(curve(s), w * 2 * Math.PI), color, n });
    surfaces.push(rev(s => plane(P(s), top(P(s))), colors.top, 28));
    surfaces.push(rev(s => plane(P(s), bot(P(s))), colors.bottom, 28));
    for (const t of [lo, hi]) surfaces.push(rev(s => plane(t, bot(t) + (top(t) - bot(t)) * s), colors.wall, 16));
    // one representative slice
    const ts = mid, th = 0.03 * (hi - lo);
    if (vol.method === 'washer') surfaces.push({ ...rev(s => plane(ts, bot(ts) + (top(ts) - bot(ts)) * s), colors.slice, 24), front: true });
    else for (const dt of [-th / 2, th / 2]) surfaces.push({ ...rev(s => plane(ts + dt, bot(ts) + (top(ts) - bot(ts)) * s), colors.slice, 24), front: true });
    return { surfaces, names: v === 'x' ? ['x', 'z', 'y'] : ['x', 'z', 'y'], equal: true };
  }

  // cross-sections stand straight up out of the plane (depth axis), perpendicular to the v-axis
  const hv = opts.height ? compile(opts.height)({}) : 1;
  const shapePoint = (t, a, b) => {
    // a, b in [0, 1] parametrize the cross-section at v = t; returns plane point + height
    const B = bot(t), T = top(t), s = T - B, c = (B + T) / 2;
    switch (opts.shape) {
      case 'square': return [plane(t, B + s * a), s * b];
      case 'rectangle': return [plane(t, B + s * a), hv * b];
      case 'semicircle': { const ang = Math.PI * a, rad = s / 2 * b; return [plane(t, c + rad * Math.cos(ang)), rad * Math.sin(ang)]; }
      case 'equilateral': { const base = B + s * a, apexQ = c, apexH = Math.sqrt(3) / 2 * s; return [plane(t, base + (apexQ - base) * b), apexH * b]; }
      case 'isosceles': { const base = B + s * a; return [plane(t, base + (T - base) * b), s * a * b]; }
      default: return [plane(t, B), 0];
    }
  };
  const toWorld = ([pt, up]) => [pt[0], up, pt[1]];
  // the outer skin: the edge of each cross-section swept along v
  const edge = (t, e) => {
    const B = bot(t), T = top(t), s = T - B, c = (B + T) / 2;
    switch (opts.shape) {
      case 'semicircle': { const ang = Math.PI * e; return [plane(t, c + s / 2 * Math.cos(ang)), s / 2 * Math.sin(ang)]; }
      case 'equilateral': return e < 0.5 ? [plane(t, B + (c - B) * 2 * e), Math.sqrt(3) / 2 * s * 2 * e] : [plane(t, c + (T - c) * (2 * e - 1)), Math.sqrt(3) / 2 * s * (2 - 2 * e)];
      case 'isosceles': return e < 0.5 ? [plane(t, B + s * 2 * e), s * 2 * e] : [plane(t, T), s * (2 - 2 * e)];
      default: { // square / rectangle: up one side, across the top, down the other
        const H = opts.shape === 'square' ? s : hv;
        if (e < 1 / 3) return [plane(t, B), H * 3 * e];
        if (e < 2 / 3) return [plane(t, B + s * (3 * e - 1)), H];
        return [plane(t, T), H * (3 - 3 * e)];
      }
    }
  };
  surfaces.push({ map: (s, e) => toWorld(edge(P(s), e)), color: colors.top, n: 30 });
  surfaces.push({ map: (s, e) => toWorld([plane(P(s), bot(P(s)) + (top(P(s)) - bot(P(s))) * e), 0]), color: colors.bottom, n: 20 });
  for (const t of [lo, hi]) surfaces.push({ map: (a, b) => toWorld(shapePoint(t, a, b)), color: colors.wall, n: 12 });
  surfaces.push({ map: (a, b) => toWorld(shapePoint(mid, a, b)), color: colors.slice, n: 14, front: true });
  return { surfaces, names: ['x', 'z', 'y'], equal: true };
}
