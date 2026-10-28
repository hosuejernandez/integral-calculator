// Calc 3 tools for multiple integrals: polar / cylindrical / spherical coordinates with the
// Jacobian, mass and center of mass, and reversing the order of a double integral.
import { num, sym, add, mul, pow, fn, sub, compile, substitute, freeSyms, key, toTex, isNum } from './expr.js';
import { simplify, pretty, expand } from './simplify.js';
import { iterated } from './calculus.js';
import { toRational, recognize, fmt } from './solve.js';

const S = n => sym(n);
const sin = u => fn('sin', u), cos = u => fn('cos', u);

export const SYSTEMS = {
  cartesian2: { dims: 2, vars: ['y', 'x'], name: 'Cartesian', jac: null },
  polar: {
    dims: 2, vars: ['r', 'theta'], name: 'Polar', jac: S('r'), jacTex: 'dA = r\\,dr\\,d\\theta',
    toXYZ: e => [e.r * Math.cos(e.theta), e.r * Math.sin(e.theta)],
    subs: { x: mul([S('r'), cos(S('theta'))]), y: mul([S('r'), sin(S('theta'))]) },
    subsTex: 'x = r\\cos\\theta,\\quad y = r\\sin\\theta',
    defaults: [['r', '0', '1'], ['theta', '0', '2pi']],
  },
  cartesian3: { dims: 3, vars: ['z', 'y', 'x'], name: 'Cartesian', jac: null },
  cylindrical: {
    dims: 3, vars: ['z', 'r', 'theta'], name: 'Cylindrical', jac: S('r'), jacTex: 'dV = r\\,dz\\,dr\\,d\\theta',
    toXYZ: e => [e.r * Math.cos(e.theta), e.r * Math.sin(e.theta), e.z],
    subs: { x: mul([S('r'), cos(S('theta'))]), y: mul([S('r'), sin(S('theta'))]) },
    subsTex: 'x = r\\cos\\theta,\\quad y = r\\sin\\theta,\\quad z = z',
    defaults: [['z', '0', '1'], ['r', '0', '1'], ['theta', '0', '2pi']],
  },
  spherical: {
    dims: 3, vars: ['rho', 'phi', 'theta'], name: 'Spherical', jac: mul([pow(S('rho'), num(2)), sin(S('phi'))]),
    jacTex: 'dV = \\rho^2\\sin\\phi\\,d\\rho\\,d\\phi\\,d\\theta',
    toXYZ: e => [e.rho * Math.sin(e.phi) * Math.cos(e.theta), e.rho * Math.sin(e.phi) * Math.sin(e.theta), e.rho * Math.cos(e.phi)],
    subs: {
      x: mul([S('rho'), sin(S('phi')), cos(S('theta'))]),
      y: mul([S('rho'), sin(S('phi')), sin(S('theta'))]),
      z: mul([S('rho'), cos(S('phi'))]),
    },
    subsTex: 'x = \\rho\\sin\\phi\\cos\\theta,\\quad y = \\rho\\sin\\phi\\sin\\theta,\\quad z = \\rho\\cos\\phi',
    defaults: [['rho', '0', '1'], ['phi', '0', 'pi'], ['theta', '0', '2pi']],
  },
};

// sin²u + cos²u = 1, applied wherever two terms differ only by sin² vs cos² of the same angle.
export function trigCollapse(n) {
  n = simplify(n);
  if (n.type !== 'add') {
    if (n.type === 'mul') return simplify(mul(n.factors.map(trigCollapse)));
    if (n.type === 'pow') return simplify(pow(trigCollapse(n.base), n.exp));
    return n;
  }
  let terms = n.terms.map(trigCollapse);
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < terms.length; i++) {
      for (const f of factorsOf(terms[i])) {
        if (!(f.type === 'pow' && isNum(f.exp, 2) && f.base.type === 'fn' && f.base.name === 'sin')) continue;
        const rest = simplify(mul([terms[i], pow(f, num(-1))]));
        const partner = key(simplify(mul([rest, pow(cos(f.base.arg), num(2))])));
        const j = terms.findIndex((t, k) => k !== i && key(t) === partner);
        if (j < 0) continue;
        terms = terms.filter((_, k) => k !== i && k !== j).concat([rest]);
        changed = true;
        break outer;
      }
    }
    terms = factorsOf(simplify(add(terms.length ? terms : [num(0)])), 'add');
  }
  return simplify(add(terms.length ? terms : [num(0)]));
}
const factorsOf = (t, kind = 'mul') => (t.type === kind ? (kind === 'mul' ? t.factors : t.terms) : [t]);

// Rewrite an expression in x, y, z into the system's variables and simplify sin² + cos².
export function convert(node, sys) {
  if (!sys.subs) return node;
  const uses = [...freeSyms(node)].some(s => s in sys.subs || (s === 'z' && sys.subs.z));
  if (!uses) return node;
  return trigCollapse(expand(substitute(node, sys.subs)));
}

// What to compute over the region
export function applications(kind, density, layers, sys, env = {}) {
  const J = sys.jac;
  const withJ = n => pretty(J ? mul([n, J]) : n);
  const coord = name => (sys.subs && sys.subs[name] ? sys.subs[name] : S(name));
  const run = integrand => iterated(withJ(convert(integrand, sys)), layers, env);
  const one = run(num(1));
  if (kind === 'measure') return { measure: one };
  if (kind === 'average') return { measure: one, total: run(density) };
  // mass and center of mass
  const mass = run(density);
  if (kind === 'mass') return { mass };
  const axes = sys.dims === 3 ? ['x', 'y', 'z'] : ['x', 'y'];
  const moments = axes.map(a => ({ axis: a, res: run(mul([coord(a), density])) }));
  return { mass, moments };
}

// ---------- reversing the order of a double integral ----------

// Solve curve(u) = w for u, where w is a symbol. Returns a node or null.
function invert(curve, u, w, nearU) {
  const W = S(w);
  const r = toRational(curve, u);
  if (r && r.D.length === 1 && r.N.length === 2) {
    return simplify(mul([add([W, mul([num(-1), r.N[0]])]), pow(r.N[1], num(-1))]));
  }
  // c * (a u + b)^k + d, including sqrt
  const parts = splitAffine(curve);
  if (parts) {
    const { c, d, inner } = parts;
    const solved = simplify(mul([add([W, mul([num(-1), d])]), pow(c, num(-1))]));
    let innerSol = null;
    if (inner.type === 'pow' && inner.exp.type === 'num') {
      const k = inner.exp;
      let root = pow(solved, num(k.d, k.n));
      if (k.n % 2 === 0 && nearU !== undefined) {
        const base = inner.base;
        const sign = Math.sign(compile(base)({ [u]: nearU })) || 1;
        if (sign < 0) root = mul([num(-1), root]);
      }
      innerSol = { base: inner.base, value: simplify(root) };
    } else if (inner.type === 'pow' && inner.base.type === 'sym' && inner.base.name === 'e') {
      innerSol = { base: inner.exp, value: simplify(fn('ln', solved)) };
    } else if (inner.type === 'fn' && inner.name === 'ln') {
      innerSol = { base: inner.arg, value: simplify(pow(S('e'), solved)) };
    } else if (inner.type === 'sym' && inner.name === u) {
      return solved;
    }
    if (!innerSol) return null;
    const lin = toRational(innerSol.base, u);
    if (!lin || lin.D.length !== 1 || lin.N.length !== 2) return null;
    return simplify(mul([add([innerSol.value, mul([num(-1), lin.N[0]])]), pow(lin.N[1], num(-1))]));
  }
  return null;
}

// curve = c * inner + d with c, d constants
function splitAffine(n) {
  const terms = n.type === 'add' ? n.terms : [n];
  const varTerms = terms.filter(t => freeSyms(t).size), consts = terms.filter(t => !freeSyms(t).size);
  if (varTerms.length !== 1) return null;
  const t = varTerms[0];
  const fs = t.type === 'mul' ? t.factors : [t];
  const cf = fs.filter(f => !freeSyms(f).size), vf = fs.filter(f => freeSyms(f).size);
  if (vf.length !== 1) return null;
  return { c: simplify(cf.length ? mul(cf) : num(1)), d: simplify(consts.length ? add(consts) : num(0)), inner: vf[0] };
}

const snap = (x, node) => {
  if (node) return { x, node };
  const r = recognize(x);
  return r && Math.abs(r.x - x) < 1e-7 * (1 + Math.abs(x)) ? { x: r.x, node: r.node } : { x, node: num(Math.round(x * 1e6), 1e6), approx: true };
};

// layers = [inner {v: w, lo, hi}, outer {v: u, lo: a, hi: b}]  (w = inner variable)
export function reverseOrder(layers) {
  const [L2, L1] = layers;
  const u = L1.v, w = L2.v;
  const a = compile(L1.lo)({}), b = compile(L1.hi)({});
  const loF = x => compile(L2.lo)({ [u]: x }), hiF = x => compile(L2.hi)({ [u]: x });
  const N = 2000;
  const us = Array.from({ length: N + 1 }, (_, i) => a + (b - a) * i / N);
  const lows = us.map(loF), highs = us.map(hiF);
  if (![...lows, ...highs].every(isFinite)) return { error: 'The bounds are undefined somewhere in the region.' };
  if (lows.some((l, i) => l > highs[i] + 1e-12)) return { error: 'The lower bound is above the upper bound somewhere, so this is not a simple region.' };
  // candidate breakpoints in w: values at the corners and the extremes of each curve
  const exactAt = (curve, x) => simplify(substitute(curve, { [u]: x }));
  const cands = [
    snap(loF(a), exactAt(L2.lo, L1.lo)), snap(loF(b), exactAt(L2.lo, L1.hi)),
    snap(hiF(a), exactAt(L2.hi, L1.lo)), snap(hiF(b), exactAt(L2.hi, L1.hi)),
    snap(Math.min(...lows)), snap(Math.max(...lows)), snap(Math.min(...highs)), snap(Math.max(...highs)),
  ];
  const ws = [];
  for (const c of cands.sort((p, q) => p.x - q.x)) if (!ws.some(q => Math.abs(q.x - c.x) < 1e-9)) ws.push(c);
  const wmin = Math.min(...lows), wmax = Math.max(...highs);
  const bands = [];
  for (let i = 0; i + 1 < ws.length; i++) {
    const w1 = ws[i], w2 = ws[i + 1];
    if (w1.x < wmin - 1e-9 || w2.x > wmax + 1e-9 || w2.x - w1.x < 1e-12) continue;
    const wm = (w1.x + w2.x) / 2;
    // u-interval(s) where the strip at height wm lies inside the region
    const inside = us.map((x, k) => lows[k] <= wm && wm <= highs[k]);
    const runs = [];
    for (let k = 0; k <= N; k++) {
      if (inside[k] && (k === 0 || !inside[k - 1])) runs.push([k, k]);
      if (inside[k]) runs[runs.length - 1][1] = k;
    }
    if (runs.length !== 1) return { error: 'For some values the region splits into separate pieces, so it needs more than one integral per band. Try reversing by hand.' };
    const side = (k, isLeft) => {
      const x = us[k];
      if ((isLeft && k === 0) || (!isLeft && k === N)) return { node: isLeft ? L1.lo : L1.hi, tex: toTex(isLeft ? L1.lo : L1.hi) };
      // refine where the boundary curve crosses wm, then invert that curve
      const curve = Math.abs(lows[k] - wm) < Math.abs(highs[k] - wm) ? L2.lo : L2.hi;
      const inv = invert(curve, u, w, x);
      if (!inv) return null;
      const check = compile(inv)({ [w]: wm });
      if (!isFinite(check) || Math.abs(check - x) > 2 * (b - a) / N + 1e-6) return null;
      return { node: inv, tex: toTex(inv) };
    };
    const left = side(runs[0][0], true), right = side(runs[0][1], false);
    if (!left || !right) return { error: 'One of the boundary curves could not be solved for the other variable. Reversing works for lines, powers, roots, eˣ and ln x.' };
    bands.push({ w1, w2, left, right, layers: [{ v: u, lo: left.node, hi: right.node }, { v: w, lo: w1.node, hi: w2.node }] });
  }
  if (!bands.length) return { error: 'Could not describe the region the other way.' };
  // merge neighbouring bands that use the same boundaries
  const merged = [];
  for (const B of bands) {
    const last = merged[merged.length - 1];
    if (last && key(last.left.node) === key(B.left.node) && key(last.right.node) === key(B.right.node)) {
      last.w2 = B.w2; last.layers[1].hi = B.w2.node;
    } else merged.push({ ...B, layers: B.layers.map(l => ({ ...l })) });
  }
  return { bands: merged, u, w };
}

export { fmt, toTex };
