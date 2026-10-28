// Line integrals along a parametrized curve r(t): scalar ∫_C f ds and work ∫_C F·dr, with the
// conservative-field test (potential function) and Green's theorem for closed plane curves.
import { num, sym, add, mul, pow, sub, compile, substitute, freeSyms, toTex } from './expr.js';
import { simplify, pretty, expand } from './simplify.js';
import { differentiate } from './diff.js';
import { integrate } from './integrate.js';
import { definite, iterated, quad } from './calculus.js';
import { trigCollapse } from './multi.js';
import { recognize } from './solve.js';

export const PRESETS = {
  circle: { name: 'Unit circle, counterclockwise', x: 'cos(t)', y: 'sin(t)', z: '', a: '0', b: '2pi' },
  circle2: { name: 'Circle of radius 2, counterclockwise', x: '2cos(t)', y: '2sin(t)', z: '', a: '0', b: '2pi' },
  ellipse: { name: 'Ellipse x²/9 + y²/4 = 1', x: '3cos(t)', y: '2sin(t)', z: '', a: '0', b: '2pi' },
  segment: { name: 'Line segment from (0, 0) to (1, 2)', x: 't', y: '2t', z: '', a: '0', b: '1' },
  parabola: { name: 'Parabola y = x² from (0, 0) to (1, 1)', x: 't', y: 't^2', z: '', a: '0', b: '1' },
  helix: { name: 'Helix (3D), one turn', x: 'cos(t)', y: 'sin(t)', z: 't', a: '0', b: '2pi' },
};

const tidy = n => pretty(trigCollapse(expand(n)));
const AX = ['x', 'y', 'z'];

// curve: { comps: [x(t), y(t), z(t)?] nodes }, a, b: { node, value }
export function lineIntegral({ kind, comps, a, b, f, F, params = null }) {
  const env = params ? params.env : {};
  const t = 't';
  const dims = comps.length;
  const map = Object.fromEntries(comps.map((c, i) => [AX[i], c]));
  const d = comps.map(c => differentiate(c, t).result);
  const out = { dims, d };
  let integrand;
  if (kind === 'scalar') {
    const speed2 = tidy(add(d.map(c => pow(c, num(2)))));
    const speed = simplify(pow(speed2, num(1, 2)));
    const fOn = tidy(substitute(f, map));
    integrand = tidy(mul([fOn, speed]));
    Object.assign(out, { speed2, speed, fOn });
  } else {
    const onC = F.map(P => tidy(substitute(P, map)));
    integrand = tidy(add(onC.map((P, i) => mul([P, d[i]]))));
    Object.assign(out, { onC });
    out.conservative = conservative(F, dims, env);
    if (out.conservative.potential) {
      const pot = out.conservative.potential;
      const endA = simplify(substitute(pot, substituteAt(comps, a.node))), endB = simplify(substitute(pot, substituteAt(comps, b.node)));
      out.conservative.ends = { A: endA, B: endB, value: pretty(sub(endB, endA)) };
    }
    if (dims === 2) out.green = green(F, comps, a, b, env);
  }
  out.integrand = integrand;
  out.res = definite(integrand, t, a, b, params);
  return out;
}

function substituteAt(comps, tNode) {
  return Object.fromEntries(comps.map((c, i) => [AX[i], simplify(substitute(c, { t: tNode }))]));
}

// zero everywhere? (checked at sample points)
function isZero(n, env = {}) {
  const c = compile(n);
  return [[0.3, 0.7, 1.1], [1.3, -0.4, 0.2], [-0.9, 1.7, -1.2], [2.1, 0.5, 0.8]].every(([x, y, z]) => Math.abs(c({ ...env, x, y, z })) < 1e-9);
}

// F = ∇φ ?  2D: Q_x = P_y.  3D: curl F = 0.  Then build φ by integrating one variable at a time.
function conservative(F, dims, env) {
  const D = (n, v) => differentiate(n, v).result;
  const tests = dims === 2
    ? [{ tex: '\\frac{\\partial Q}{\\partial x} = \\frac{\\partial P}{\\partial y}', a: D(F[1], 'x'), b: D(F[0], 'y') }]
    : [
      { tex: '\\frac{\\partial R}{\\partial y} = \\frac{\\partial Q}{\\partial z}', a: D(F[2], 'y'), b: D(F[1], 'z') },
      { tex: '\\frac{\\partial P}{\\partial z} = \\frac{\\partial R}{\\partial x}', a: D(F[0], 'z'), b: D(F[2], 'x') },
      { tex: '\\frac{\\partial Q}{\\partial x} = \\frac{\\partial P}{\\partial y}', a: D(F[1], 'x'), b: D(F[0], 'y') },
    ];
  const ok = tests.every(T => isZero(sub(T.a, T.b), env));
  if (!ok) return { ok, tests };
  // φ = ∫P dx, then add what is missing in y (and z)
  let phi = integrate(F[0], 'x');
  if (!phi) return { ok, tests };
  let pot = phi.result;
  for (let i = 1; i < dims; i++) {
    const v = AX[i];
    const missing = tidy(sub(F[i], D(pot, v)));
    if (freeSyms(missing).size && [...freeSyms(missing)].some(s => AX.slice(0, i).includes(s))) return { ok, tests };
    const g = integrate(missing, v);
    if (!g) return { ok, tests };
    pot = pretty(add([pot, g.result]));
  }
  return { ok, tests, potential: pot };
}

// Green's theorem: ∮ P dx + Q dy = ∬ (Q_x − P_y) dA over the region inside a closed curve.
// The region is swept from a center point c:  (x, y) = c + s (r(t) − c),  dA = s·|(r − c) × r'| ds dt.
function green(F, comps, a, b, env) {
  const t = 't';
  const X0 = compile(comps[0]), Y0 = compile(comps[1]);
  const X = e => X0({ ...env, ...e }), Y = e => Y0({ ...env, ...e });
  const tv = B => (B.node ? compile(B.node)(env) : B.value);
  a = { node: a.node, value: tv(a) }; b = { node: b.node, value: tv(b) };
  const start = [X({ t: a.value }), Y({ t: a.value })], end = [X({ t: b.value }), Y({ t: b.value })];
  if (Math.hypot(start[0] - end[0], start[1] - end[1]) > 1e-9) return { closed: false };
  const curl = tidy(sub(differentiate(F[1], 'x').result, differentiate(F[0], 'y').result));
  // center: the average point of the curve, snapped to a nice number when close
  const avg = k => quad(s => (k ? Y : X)({ t: s }), a.value, b.value) / (b.value - a.value);
  const nice = x => { const r = recognize(x); return r && Math.abs(r.x - x) < 1e-6 ? r.node : num(Math.round(x * 1e4), 1e4); };
  const cx = nice(avg(0)), cy = nice(avg(1));
  const s = sym('s');
  const relX = sub(comps[0], cx), relY = sub(comps[1], cy);
  const dx = differentiate(comps[0], t).result, dy = differentiate(comps[1], t).result;
  const jac = tidy(sub(mul([relX, dy]), mul([relY, dx])));
  const curlAt = substitute(curl, { x: add([cx, mul([s, relX])]), y: add([cy, mul([s, relY])]) });
  const integrand = tidy(mul([curlAt, s, jac]));
  const r = iterated(integrand, [{ v: 's', lo: num(0), hi: num(1) }, { v: t, lo: a.node, hi: b.node }], env);
  const area = iterated(tidy(mul([s, jac])), [{ v: 's', lo: num(0), hi: num(1) }, { v: t, lo: a.node, hi: b.node }], env);
  return { closed: true, curl, value: r.value, exact: r.exact, clockwise: area.value < 0 };
}

export { toTex, freeSyms };
