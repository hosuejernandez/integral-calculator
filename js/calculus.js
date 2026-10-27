// Definite integrals (FTC, improper limits, numeric fallback), Riemann sums, area between
// curves and iterated double / triple integrals.
import { num, sym, add, mul, pow, sub, neg, compile, substitute, freeSyms, toTex, isNum } from './expr.js';
import { simplify, pretty } from './simplify.js';
import { integrate } from './integrate.js';
import { toRational, realRoots, recognize, fmt } from './solve.js';

const at = (node, v, x) => pretty(substitute(node, { [v]: x }));
const fnOf = (node, v) => { const c = compile(node); return x => c({ [v]: x }); };

// ---------- numeric integration ----------

export function quad(f, a, b, eps = 1e-10) {
  if (a === b) return 0;
  const simpson = (a, b, fa, fm, fb) => (b - a) / 6 * (fa + 4 * fm + fb);
  let calls = 0;
  function rec(a, b, fa, fm, fb, whole, eps, depth) {
    const m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2;
    const flm = f(lm), frm = f(rm);
    calls += 2;
    const left = simpson(a, m, fa, flm, fm), right = simpson(m, b, fm, frm, fb);
    if (depth <= 0 || calls > 2e5 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15;
    return rec(a, m, fa, flm, fm, left, eps / 2, depth - 1) + rec(m, b, fm, frm, fb, right, eps / 2, depth - 1);
  }
  // start from 16 panels so narrow features are not skipped
  let total = 0;
  const N = 16, h = (b - a) / N;
  for (let i = 0; i < N; i++) {
    const x0 = a + i * h, x1 = x0 + h, xm = (x0 + x1) / 2;
    const f0 = f(x0), fm = f(xm), f1 = f(x1);
    total += rec(x0, x1, f0, fm, f1, simpson(x0, x1, f0, fm, f1), eps / N, 40);
  }
  return total;
}

// ---------- definite integrals ----------

// Points in [lo, hi] where f blows up or is undefined.
function singularities(f, lo, hi) {
  const N = 3000, h = (hi - lo) / N, out = [];
  const xs = [], ys = [];
  for (let i = 0; i <= N; i++) { const x = lo + i * h; xs.push(x); ys.push(Math.abs(f(x))); }
  const add1 = x => {
    const r = recognize(x);
    const c = r && Math.abs(r.x - x) < 1e-6 * (1 + Math.abs(x)) ? r.x : x;
    if (!out.some(p => Math.abs(p - c) < 1e-6 * (1 + Math.abs(c)))) out.push(c);
  };
  for (let i = 0; i <= N; i++) {
    if (!isFinite(ys[i])) { add1(xs[i]); continue; }
    if (i > 0 && i < N && ys[i] > 1e3 && ys[i] >= ys[i - 1] && ys[i] >= ys[i + 1]) {
      let a = xs[i - 1], b = xs[i + 1];
      for (let k = 0; k < 80; k++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (Math.abs(f(m1)) > Math.abs(f(m2))) b = m2; else a = m1; }
      const c = (a + b) / 2;
      if (!(Math.abs(f(c)) < 1e8)) add1(c);
    }
  }
  // NaN gaps (outside the domain) inside the interval
  for (let i = 0; i < N; i++) if (Number.isNaN(ys[i]) !== Number.isNaN(ys[i + 1])) add1((xs[i] + xs[i + 1]) / 2);
  return out.sort((p, q) => p - q);
}

// Numeric one-sided limit of g as x -> c (c may be +-Infinity). Returns {value} or {diverges, sign}.
function limit(g, c, side) {
  const ts = [];
  if (c === Infinity) for (let k = 2; k <= 9; k++) ts.push(10 ** k);
  else if (c === -Infinity) for (let k = 2; k <= 9; k++) ts.push(-(10 ** k));
  else for (let k = 3; k <= 11; k++) ts.push(c + side * 10 ** -k * Math.max(1, Math.abs(c)));
  const vals = ts.map(g).filter(isFinite);
  if (vals.length < 4) return { diverges: true, sign: 1 };
  const last = vals[vals.length - 1], prev = vals[vals.length - 2], prev2 = vals[vals.length - 3];
  const d1 = Math.abs(last - prev), d2 = Math.abs(prev - prev2);
  if (d1 < 1e-6 * (1 + Math.abs(last)) || (d1 < d2 * 0.5 && d1 < 1e-4 * (1 + Math.abs(last)))) {
    const r = recognize(last);
    return { value: r && Math.abs(r.x - last) < 1e-5 * (1 + Math.abs(last)) ? r.x : last };
  }
  return { diverges: true, sign: Math.sign(last - prev) || Math.sign(last) };
}

const niceTex = x => { const r = recognize(x); return r && Math.abs(r.x - x) < 1e-7 * (1 + Math.abs(x)) ? r.tex : fmt(x); };
const boundTex = x => (x === Infinity ? '\\infty' : x === -Infinity ? '-\\infty' : niceTex(x));

// a, b: { node, value } where node is null for +-Infinity.
export function definite(f, v, a, b) {
  const anti = integrate(f, v);
  const F = anti ? anti.result : null;
  const fN = fnOf(f, v);
  const A = a.value, B = b.value;
  const lo = Math.min(A, B), hi = Math.max(A, B), sign = A <= B ? 1 : -1;
  const sLo = isFinite(lo) ? lo : (isFinite(hi) ? Math.min(hi - 1, -50) : -50);
  const sHi = isFinite(hi) ? hi : Math.max(sLo + 1, 50);
  let sing = singularities(fN, sLo, sHi);
  const ends = [lo, hi];
  const improperInfinite = !isFinite(lo) || !isFinite(hi);
  const out = { anti, F, improper: improperInfinite || sing.length > 0, singular: sing, notes: [] };

  if (!out.improper) {
    if (F) {
      const exact = pretty(sub(substitute(F, { [v]: b.node }), substitute(F, { [v]: a.node })));
      const value = compile(exact)({});
      const check = sign * quad(fN, lo, hi);
      if (isFinite(value) && Math.abs(value - check) < 1e-6 * (1 + Math.abs(check))) {
        return { ...out, method: 'ftc', exact, value, Fa: at(F, v, a.node), Fb: at(F, v, b.node) };
      }
      out.notes.push('The antiderivative does not match a numeric check on this interval, so the numeric value is shown.');
    }
    return { ...out, method: 'numeric', value: sign * quad(fN, lo, hi) };
  }

  // improper: split at the trouble spots and take limits at every bad endpoint
  const cuts = [...new Set([...ends, ...sing.filter(c => c > lo && c < hi)])].sort((p, q) => p - q);
  const bad = x => !isFinite(x) || sing.some(c => Math.abs(c - x) < 1e-9 * (1 + Math.abs(x))) || !isFinite(fN(x));
  const FN = F ? fnOf(F, v) : null;
  const pieces = [];
  let total = 0, diverges = false;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const l = cuts[i], r = cuts[i + 1];
    let val, piece = { l, r, lTex: boundTex(l), rTex: boundTex(r), badL: bad(l), badR: bad(r) };
    if (FN) {
      // F is often fine where f blows up (2 sqrt(x) at 0), so use F(c) directly when it is continuous there
      const lim = (c, side) => {
        if (isFinite(c) && isFinite(FN(c)) && Math.abs(FN(c + side * 1e-9 * (1 + Math.abs(c))) - FN(c)) < 1e-3) return { value: FN(c) };
        return limit(FN, c, side);
      };
      const Fr = piece.badR ? lim(r, -1) : { value: FN(r) };
      const Fl = piece.badL ? lim(l, 1) : { value: FN(l) };
      if (Fr.diverges || Fl.diverges) { piece.diverges = true; diverges = true; }
      else val = Fr.value - Fl.value;
      piece.FrTex = Fr.diverges ? (Fr.sign > 0 ? '\\infty' : '-\\infty') : niceTex(Fr.value);
      piece.FlTex = Fl.diverges ? (Fl.sign > 0 ? '\\infty' : '-\\infty') : niceTex(Fl.value);
    } else {
      // no antiderivative: numeric integral over a shrinking / growing interval
      const g = t => {
        const L = piece.badL ? (isFinite(l) ? l + t : -1 / t) : l;
        const R = piece.badR ? (isFinite(r) ? r - t : 1 / t) : r;
        return quad(fN, L, R, 1e-9);
      };
      const lim = limit(g, 0, 1);
      if (lim.diverges) { piece.diverges = true; diverges = true; } else val = lim.value;
    }
    piece.value = val;
    pieces.push(piece);
    if (!piece.diverges) total += val;
  }
  return { ...out, method: FN ? 'limits' : 'numeric-limits', pieces, diverges, value: diverges ? NaN : sign * total };
}

// ---------- Riemann sums ----------

export function riemann(f, a, b, n, method) {
  const dx = (b - a) / n;
  const rects = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x0 = a + i * dx, x1 = x0 + dx;
    if (method === 'trapezoid') {
      const y0 = f(x0), y1 = f(x1);
      rects.push({ x0, x1, y0, y1, xs: [x0, x1] });
      sum += (y0 + y1) / 2 * dx;
    } else {
      const xs = method === 'left' ? x0 : method === 'right' ? x1 : (x0 + x1) / 2;
      const y = f(xs);
      rects.push({ x0, x1, y0: y, y1: y, sample: xs });
      sum += y * dx;
    }
  }
  return { dx, rects, sum };
}

// ---------- area between curves ----------

export function intersections(h, v, lo, hi) {
  const r = toRational(h, v);
  if (r) {
    const H = fnOf(h, v);
    return realRoots(r.N).filter(p => p.x >= lo - 1e-12 && p.x <= hi + 1e-12 && isFinite(H(p.x)));
  }
  const H = fnOf(h, v), N = 4000, step = (hi - lo) / N, out = [];
  let px = lo, py = H(lo);
  for (let i = 1; i <= N; i++) {
    const x = lo + i * step, y = H(x);
    if (isFinite(py) && isFinite(y) && (py === 0 || py * y < 0)) {
      let a = px, b = x;
      if (py === 0) { a = b = px; } else {
        for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (H(a) * H(m) <= 0) b = m; else a = m; }
      }
      const c = (a + b) / 2, rc = recognize(c);
      const pt = rc && Math.abs(rc.x - c) < 1e-7 ? rc : { x: c, tex: `\\approx ${fmt(c)}`, node: null, exact: false };
      if (!out.some(p => Math.abs(p.x - pt.x) < 1e-7)) out.push(pt);
    }
    px = x; py = y;
  }
  return out;
}

export function areaBetween(f, g, v, bounds) {
  const h = pretty(sub(f, g));
  const lo = bounds ? bounds[0].value : -20, hi = bounds ? bounds[1].value : 20;
  const pts = intersections(h, v, lo, hi);
  let cuts;
  if (bounds) {
    cuts = [{ x: lo, tex: boundTex(lo), node: bounds[0].node }, ...pts.filter(p => p.x > lo + 1e-12 && p.x < hi - 1e-12), { x: hi, tex: boundTex(hi), node: bounds[1].node }];
  } else {
    if (pts.length < 2) return { error: 'The curves cross fewer than two times, so there is no enclosed region. Enter bounds a and b.', pts };
    cuts = pts;
  }
  const H = integrate(h, v);
  const hN = fnOf(h, v);
  const pieces = [];
  let total = 0, exactNodes = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const l = cuts[i], r = cuts[i + 1];
    const top = hN((l.x + r.x) / 2) >= 0 ? 'f' : 'g';
    const s = top === 'f' ? 1 : -1;
    let exact = null, value;
    if (H && l.node && r.node) {
      exact = pretty(mul([num(s), sub(substitute(H.result, { [v]: r.node }), substitute(H.result, { [v]: l.node }))]));
      value = compile(exact)({});
      if (!isFinite(value) || Math.abs(value - s * quad(hN, l.x, r.x)) > 1e-6 * (1 + Math.abs(value))) { exact = null; value = s * quad(hN, l.x, r.x); }
    } else value = s * quad(hN, l.x, r.x);
    pieces.push({ l, r, top, exact, value });
    total += value;
    exactNodes.push(exact);
  }
  const exactTotal = exactNodes.every(Boolean) ? pretty(add(exactNodes.length ? exactNodes : [num(0)])) : null;
  return { h, H, pts, cuts, pieces, total, exactTotal };
}

// ---------- iterated integrals ----------

// layers are listed from the inside out: [{ v, lo, hi }] with lo / hi as expression nodes.
export function iterated(integrand, layers) {
  let cur = integrand;
  const steps = [];
  for (const L of layers) {
    const anti = integrate(cur, L.v);
    if (!anti) { steps.push({ ...L, integrand: cur, failed: true }); return { steps, exact: null, value: numericIterated(integrand, layers) }; }
    const upper = substitute(anti.result, { [L.v]: L.hi }), lower = substitute(anti.result, { [L.v]: L.lo });
    const next = pretty(sub(upper, lower));
    steps.push({ ...L, integrand: cur, F: anti.result, antiSteps: anti.steps, upper: pretty(upper), lower: pretty(lower), result: next });
    cur = next;
  }
  const leftover = freeSyms(cur);
  const value = leftover.size ? NaN : compile(cur)({});
  // cheap numeric check first; a closer look only when it disagrees (square roots converge slowly)
  let check = numericIterated(integrand, layers, false);
  if (!leftover.size && isFinite(check) && Math.abs(value - check) > 1e-6 * (1 + Math.abs(check))) {
    check = numericIterated(integrand, layers, true);
    if (Math.abs(value - check) > 1e-4 * (1 + Math.abs(check))) return { steps, exact: null, value: check, mismatch: true };
  }
  return { steps, exact: cur, value };
}

// Gauss-Legendre, 20 points per layer on 4 panels.
const GL = (() => {
  const n = 12, xs = [], ws = [];
  for (let i = 1; i <= n; i++) {
    let x = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 50; it++) {
      let p0 = 1, p1 = x;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (x * p1 - p0) / (x * x - 1);
      const dx = p1 / dp; x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    xs.push(x); ws.push(2 / ((1 - x * x) * dp * dp));
  }
  return { xs, ws };
})();

function glInt(g, a, b, panels = 4) {
  let s = 0;
  const h = (b - a) / panels;
  for (let p = 0; p < panels; p++) {
    const m = a + (p + 0.5) * h, r = h / 2;
    for (let i = 0; i < GL.xs.length; i++) s += GL.ws[i] * g(m + r * GL.xs[i]);
  }
  return s * h / 2;
}

export function numericIterated(integrand, layers, fine = true) {
  const F = compile(integrand);
  const bounds = layers.map(L => ({ v: L.v, lo: compile(L.lo), hi: compile(L.hi) }));
  const env = {}; // one shared, mutable environment keeps this fast
  const rec = k => {
    if (k < 0) return F(env);
    const L = bounds[k];
    const lo = L.lo(env), hi = L.hi(env);
    const panels = fine ? (k === bounds.length - 1 ? 10 : 5) : 2;
    return glInt(t => { env[L.v] = t; return rec(k - 1); }, lo, hi, panels);
  };
  return rec(bounds.length - 1);
}

export { boundTex, niceTex, fnOf, sym, neg, isNum, toTex };
