// Step-by-step antiderivatives: basic rules, a table of standard integrals, linear and
// u-substitution, integration by parts (including the "solve for I" cyclic case), partial
// fractions and trig identities. Every final answer is checked by differentiating it.
import {
  num, sym, add, mul, pow, fn, neg, sub, freeSyms, key, compile, substitute, isNum, rmul, rdiv, radd, HALF, toTex,
} from './expr.js';
import { simplify, pretty, expand } from './simplify.js';
import { differentiate } from './diff.js';
import { toRational, realRoots, poly } from './solve.js';

const { R0, R1, trim, deg, lead, pmul, pdivmod } = poly;
const MAX_DEPTH = 7;
const TIME_LIMIT = 2500; // ms

const lnAbs = u => fn('ln', fn('abs', u));
const product = list => (list.length === 1 ? list[0] : mul(list));
const isE = b => b.type === 'sym' && b.name === 'e';
const TRIG = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot']);

// Antiderivatives of f(u) for the table, written in terms of u.
const TABLE = {
  sin: [u => neg(fn('cos', u)), '\\int \\sin(u)\\,du = -\\cos(u) + C'],
  cos: [u => fn('sin', u), '\\int \\cos(u)\\,du = \\sin(u) + C'],
  tan: [u => lnAbs(fn('sec', u)), '\\int \\tan(u)\\,du = \\ln|\\sec(u)| + C'],
  cot: [u => lnAbs(fn('sin', u)), '\\int \\cot(u)\\,du = \\ln|\\sin(u)| + C'],
  sec: [u => lnAbs(add([fn('sec', u), fn('tan', u)])), '\\int \\sec(u)\\,du = \\ln|\\sec(u) + \\tan(u)| + C'],
  csc: [u => neg(lnAbs(add([fn('csc', u), fn('cot', u)]))), '\\int \\csc(u)\\,du = -\\ln|\\csc(u) + \\cot(u)| + C'],
  ln: [u => sub(mul([u, fn('ln', u)]), u), '\\int \\ln(u)\\,du = u\\ln(u) - u + C'],
  log: [u => mul([sub(mul([u, fn('ln', u)]), u), pow(fn('ln', num(10)), num(-1))]), '\\int \\log(u)\\,du = \\frac{u\\ln(u) - u}{\\ln(10)} + C'],
  asin: [u => add([mul([u, fn('asin', u)]), pow(sub(num(1), pow(u, num(2))), HALF)]), '\\int \\arcsin(u)\\,du = u\\arcsin(u) + \\sqrt{1-u^2} + C'],
  acos: [u => sub(mul([u, fn('acos', u)]), pow(sub(num(1), pow(u, num(2))), HALF)), '\\int \\arccos(u)\\,du = u\\arccos(u) - \\sqrt{1-u^2} + C'],
  atan: [u => sub(mul([u, fn('atan', u)]), mul([HALF, fn('ln', add([num(1), pow(u, num(2))]))])), '\\int \\arctan(u)\\,du = u\\arctan(u) - \\tfrac{1}{2}\\ln(1+u^2) + C'],
  abs: [u => mul([HALF, u, fn('abs', u)]), '\\int |u|\\,du = \\tfrac{1}{2}u|u| + C'],
};
const TABLE_NAMES = {
  sin: 'Integral of sine', cos: 'Integral of cosine', tan: 'Integral of tangent', cot: 'Integral of cotangent',
  sec: 'Integral of secant', csc: 'Integral of cosecant', ln: 'Integral of ln', log: 'Integral of log',
  asin: 'Integral of arcsin', acos: 'Integral of arccos', atan: 'Integral of arctan', abs: 'Integral of |x|',
};

export function integrate(node, v) {
  const ctx = { v0: v, start: Date.now(), cache: new Map() };
  let out = null;
  try { out = I(simplify(node), v, 0, ctx); } catch (e) { if (e.message !== 'timeout') throw e; }
  if (!out) return null;
  const result = pretty(out.raw);
  if (!verify(result, node, v)) return null;
  return { result, steps: out.step };
}

// d/dv(result) must match the integrand at a handful of points.
// A rough plain-text version of a node for sentences ("x^2 + 1").
function plain(n) {
  return toTex(simplify(n)).replace(/\\left|\\right/g, '').replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\(sin|cos|tan|sec|csc|cot|ln|arctan|arcsin|arccos)/g, '$1').replace(/\{|\}/g, '').replace(/\\,|\\/g, '').replace(/\s+/g, ' ').trim();
}

export function verify(result, integrand, v) {
  let dres;
  try { dres = compile(differentiate(result, v).result); } catch { return false; }
  const f = compile(integrand);
  const others = {};
  for (const s of freeSyms(integrand)) if (s !== v) others[s] = 1.37 + s.charCodeAt(0) % 7 * 0.29;
  let good = 0;
  for (const x of [0.37, 0.71, 1.13, 1.57, 2.21, -0.63, -1.29, 2.93, 0.11, -2.4]) {
    const env = { ...others, [v]: x };
    const a = f(env), b = dres(env);
    if (!isFinite(a) || !isFinite(b)) continue;
    if (Math.abs(a - b) > 1e-6 * (1 + Math.abs(a))) return false;
    good++;
  }
  return good >= 2;
}

function mk(expr, v, raw, rule, formula, kids = [], note = null, why = null) {
  return { raw, step: { expr, v, result: pretty(raw), rule, formula, note, why: why || whyFor(rule, v), children: kids.map(k => k.step) } };
}

// A short, plain-language reason for each rule, shown when students reveal steps one at a time.
function whyFor(rule, v) {
  if (rule.includes('(linear substitution)'))
    return `The inside is linear (a${v} + b), so integrate the outside function and divide by a.`;
  const R = {
    'Constant rule': `The integrand has no ${v} in it, so it is a constant: multiply by ${v}.`,
    'Power rule': `A power of ${v} (not 1/${v}): add 1 to the exponent and divide by the new exponent.`,
    'Log rule': `This is 1 over (linear) ${v}, which integrates to a natural log of the absolute value.`,
    'Sum rule': 'Integrate each term separately and add the results.',
    'Constant multiple rule': 'Pull the constant factor out in front of the integral.',
    'Exponential rule': 'An exponential: e^u integrates to itself, a^u picks up a factor 1/ln(a).',
    'Arctangent rule': 'One over a quadratic that never crosses zero: complete the square, which gives an arctangent.',
    'Arcsine rule': `One over √(a² − ${v}²) is the derivative of an arcsine.`,
    'Trig substitution': `√(a² − ${v}²) calls for ${v} = a sin θ; the result is a standard formula.`,
    'Pythagorean identity': 'An odd power (or tan², cot²): peel off one factor and rewrite the rest with sin² + cos² = 1, then substitute.',
    'Power-reducing identity': 'Only even powers of sine and cosine: use the half-angle identities to lower the powers.',
    'Expand the polynomial': 'A product or power of polynomials: multiply it out so each term uses the power rule.',
    'Expand first': 'Multiply out the product so the integral splits into simpler terms.',
    'Partial fractions': 'A rational function whose denominator factors: split it into simpler fractions you already know how to integrate.',
    'u-substitution': 'Part of the integrand is the derivative of an inner expression, so substitute u for that expression.',
    'Integration by parts': 'A product of two different kinds of functions: use integration by parts. LIATE (Log, Inverse trig, Algebraic, Trig, Exponential) picks u.',
    'Integration by parts (solve for the integral)': 'After integration by parts the original integral shows up again, so solve for it algebraically.',
    'Integration by parts twice (solve for the integral)': 'An exponential times sine or cosine: integrate by parts twice. The original integral returns, so solve for it.',
  };
  if (R[rule]) return R[rule];
  if (rule.startsWith('Integral of')) return 'This one is in the table of standard integrals.';
  return null;
}

// Linear in v?  returns { a, b } (rationals) for a*v + b.
function linear(u, v) {
  const r = toRational(u, v);
  if (!r || r.D.length !== 1 || r.N.length !== 2 || isNum(r.N[1], 0)) return null;
  return { a: r.N[1], b: r.N[0] };
}

function I(n, v, d, ctx) {
  if (Date.now() - ctx.start > TIME_LIMIT) throw new Error('timeout');
  if (d > MAX_DEPTH) return null;
  n = simplify(n);
  const ck = `${v}|${key(n)}`;
  const hit = ctx.cache.get(ck);
  if (hit && (hit.res || hit.d <= d)) return hit.res;
  const res = I0(n, v, d, ctx);
  ctx.cache.set(ck, { res, d });
  return res;
}

function I0(n, v, d, ctx) {
  const varies = m => freeSyms(m).has(v);
  if (!varies(n)) return mk(n, v, mul([n, sym(v)]), 'Constant rule', '\\int c\\,dx = cx + C');
  if (n.type === 'sym') return mk(n, v, mul([HALF, pow(n, num(2))]), 'Power rule', '\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C');

  if (n.type === 'add') {
    const kids = n.terms.map(t => I(t, v, d, ctx));
    if (kids.every(Boolean)) return mk(n, v, add(kids.map(k => k.raw)), 'Sum rule', '\\int (f \\pm g)\\,dx = \\int f\\,dx \\pm \\int g\\,dx', kids);
    return null;
  }
  if (n.type === 'mul') {
    const cs = n.factors.filter(f => !varies(f)), vs = n.factors.filter(varies);
    if (cs.length) {
      const k = I(product(vs), v, d, ctx);
      return k && mk(n, v, mul([product(cs), k.raw]), 'Constant multiple rule', '\\int c\\,f(x)\\,dx = c\\int f(x)\\,dx', [k]);
    }
  }
  for (const rule of [table, trigRewrite, rational, uSub, parts, expandFirst]) {
    const r = rule(n, v, d, ctx);
    if (r) return r;
  }
  return null;
}

// ---------- table of standard integrals (argument x or a linear ax + b) ----------

function table(n, v) {
  const withLinear = (u, F, rule, formula) => {
    if (u.type === 'sym' && u.name === v) return mk(n, v, F(u), rule, formula);
    const L = linear(u, v);
    if (!L) return null;
    return mk(n, v, mul([pow(L.a, num(-1)), F(u)]), `${rule} (linear substitution)`, formula,
      [], `u = ${tex(u)},\\; du = ${tex(L.a)}\\,d${v}`);
  };
  if (n.type === 'pow' && n.exp.type === 'num' && !freeSyms(n.exp).has(v)) {
    const e = n.exp;
    if (isNum(e, -1)) {
      const logRule = withLinear(n.base, lnAbs, 'Log rule', '\\int \\frac{1}{u}\\,du = \\ln|u| + C');
      if (logRule) return logRule;
    }
    const e1 = radd(e, R1);
    const powRule = isNum(e, -1) ? null : withLinear(n.base, u => mul([pow(e1, num(-1)), pow(u, e1)]), 'Power rule', '\\int u^n\\,du = \\frac{u^{n+1}}{n+1} + C');
    if (powRule) return powRule;
    if (n.base.type === 'fn' && n.base.name === 'sec' && isNum(e, 3)) {
      return withLinear(n.base.arg, u => mul([HALF, add([mul([fn('sec', u), fn('tan', u)]), lnAbs(add([fn('sec', u), fn('tan', u)]))])]),
        'Integral of sec³ (reduction formula)', '\\int \\sec^3(u)\\,du = \\tfrac{1}{2}\\left(\\sec(u)\\tan(u) + \\ln|\\sec(u) + \\tan(u)|\\right) + C');
    }
    if (n.base.type === 'fn' && isNum(e, 2)) {
      if (n.base.name === 'sec') return withLinear(n.base.arg, u => fn('tan', u), 'Integral of sec²', '\\int \\sec^2(u)\\,du = \\tan(u) + C');
      if (n.base.name === 'csc') return withLinear(n.base.arg, u => neg(fn('cot', u)), 'Integral of csc²', '\\int \\csc^2(u)\\,du = -\\cot(u) + C');
    }
    const r = toRational(n.base, v);
    if (r && r.D.length === 1 && deg(r.N) === 2) {
      const [c, b, a] = r.N.map(q => q.n / q.d);
      const disc = 4 * a * c - b * b;
      if (isNum(e, -1) && disc > 0) {
        // 1/(ax^2 + bx + c) = 2/sqrt(4ac - b^2) * arctan((2ax + b)/sqrt(4ac - b^2))
        const D4 = radd(rmul(num(4), rmul(r.N[2], r.N[0])), rmul(num(-1), rmul(r.N[1], r.N[1])));
        const root = pow(D4, HALF);
        const inner = mul([add([mul([num(2), r.N[2], sym(v)]), r.N[1]]), pow(root, num(-1))]);
        return mk(n, v, mul([num(2), pow(root, num(-1)), fn('atan', inner)]), 'Arctangent rule',
          '\\int \\frac{du}{u^2 + a^2} = \\frac{1}{a}\\arctan\\left(\\frac{u}{a}\\right) + C', [],
          'Complete the square in the denominator.');
      }
      if (isNum(e, 1 / 2) && b === 0 && a < 0 && c > 0) {
        // sqrt(c - k x^2) = (x/2) sqrt(c - k x^2) + c/(2 sqrt k) arcsin(x sqrt(k/c))
        const k = rmul(num(-1), r.N[2]);
        const inner = mul([sym(v), pow(rdiv(k, r.N[0]), HALF)]);
        return mk(n, v, add([mul([HALF, sym(v), n]), mul([r.N[0], HALF, pow(k, num(-1, 2)), fn('asin', inner)])]),
          'Trig substitution', '\\int \\sqrt{a^2 - u^2}\\,du = \\frac{u}{2}\\sqrt{a^2 - u^2} + \\frac{a^2}{2}\\arcsin\\left(\\frac{u}{a}\\right) + C',
          [], `\\text{Let } ${v} = a\\sin\\theta \\text{ with } a^2 = ${tex(rdiv(r.N[0], k))}`);
      }
      if (isNum(e, -1 / 2) && e.d === 2 && b === 0 && a < 0 && c > 0) {
        const k = pow(rmul(num(-1), r.N[2]), HALF);
        const inner = mul([sym(v), pow(rdiv(rmul(num(-1), r.N[2]), r.N[0]), HALF)]);
        return mk(n, v, mul([pow(k, num(-1)), fn('asin', inner)]), 'Arcsine rule',
          '\\int \\frac{du}{\\sqrt{a^2 - u^2}} = \\arcsin\\left(\\frac{u}{a}\\right) + C');
      }
    }
  }
  if (n.type === 'pow' && !freeSyms(n.base).has(v)) {
    if (isE(n.base)) return withLinear(n.exp, u => pow(sym('e'), u), 'Exponential rule', '\\int e^u\\,du = e^u + C');
    if (n.base.type === 'num' && n.base.n > 0 || n.base.type === 'sym')
      return withLinear(n.exp, u => mul([pow(n.base, u), pow(fn('ln', n.base), num(-1))]), 'Exponential rule', '\\int a^u\\,du = \\frac{a^u}{\\ln(a)} + C');
  }
  if (n.type === 'fn' && TABLE[n.name]) {
    const [F, formula] = TABLE[n.name];
    return withLinear(n.arg, F, TABLE_NAMES[n.name], formula);
  }
  if (n.type === 'mul' && n.factors.length === 2 && n.factors.every(f => f.type === 'fn') && key(n.factors[0].arg) === key(n.factors[1].arg)) {
    const [p, q] = n.factors.map(f => f.name).sort();
    const u = n.factors[0].arg;
    if (p === 'sec' && q === 'tan') return withLinear(u, w => fn('sec', w), 'Integral of sec·tan', '\\int \\sec(u)\\tan(u)\\,du = \\sec(u) + C');
    if (p === 'cot' && q === 'csc') return withLinear(u, w => neg(fn('csc', w)), 'Integral of csc·cot', '\\int \\csc(u)\\cot(u)\\,du = -\\csc(u) + C');
  }
  return null;
}

// ---------- trig identities ----------

function trigRewrite(n, v, d, ctx) {
  const factors = n.type === 'mul' ? n.factors : [n];
  const parts = factors.map(f => {
    const b = f.type === 'pow' ? f.base : f, e = f.type === 'pow' ? f.exp : num(1);
    return b.type === 'fn' && TRIG.has(b.name) && e.type === 'num' && e.d === 1 && e.n > 0 ? { name: b.name, arg: b.arg, k: e.n } : null;
  });
  if (parts.some(p => !p)) return null;
  const arg = parts[0].arg;
  if (parts.some(p => key(p.arg) !== key(arg))) return null;
  const power = name => parts.filter(p => p.name === name).reduce((s, p) => s + p.k, 0);
  const S = fn('sin', arg), C = fn('cos', arg), T = fn('tan', arg), Sec = fn('sec', arg), Cot = fn('cot', arg), Csc = fn('csc', arg);
  const go = (rewritten, rule, formula) => {
    const k = I(expand(rewritten), v, d + 1, ctx);
    return k && mk(n, v, k.raw, rule, formula, [k]);
  };
  const m = power('sin'), c = power('cos'), t = power('tan'), ct = power('cot');
  if (parts.length === 1 && t >= 2)
    return go(mul([pow(T, num(t - 2)), sub(pow(Sec, num(2)), num(1))]), 'Pythagorean identity', '\\tan^2(u) = \\sec^2(u) - 1');
  if (parts.length === 1 && ct >= 2)
    return go(mul([pow(Cot, num(ct - 2)), sub(pow(Csc, num(2)), num(1))]), 'Pythagorean identity', '\\cot^2(u) = \\csc^2(u) - 1');
  if (m + c !== parts.reduce((s, p) => s + p.k, 0) || m + c < 2) return null;
  if (m % 2 === 1 && (m > 1 || c === 0))
    return go(mul([S, pow(sub(num(1), pow(C, num(2))), num((m - 1) / 2)), pow(C, num(c))]),
      'Pythagorean identity', '\\sin^2(u) = 1 - \\cos^2(u)\\text{, then substitute } w = \\cos(u)');
  if (c % 2 === 1 && c > 1)
    return go(mul([C, pow(sub(num(1), pow(S, num(2))), num((c - 1) / 2)), pow(S, num(m))]),
      'Pythagorean identity', '\\cos^2(u) = 1 - \\sin^2(u)\\text{, then substitute } w = \\sin(u)');
  if (m % 2 === 0 && c % 2 === 0) {
    const two = mul([num(2), arg]);
    const s2 = mul([HALF, sub(num(1), fn('cos', two))]), c2 = mul([HALF, add([num(1), fn('cos', two)])]);
    return go(mul([pow(s2, num(m / 2)), pow(c2, num(c / 2))]), 'Power-reducing identity',
      '\\sin^2(u) = \\frac{1 - \\cos(2u)}{2},\\quad \\cos^2(u) = \\frac{1 + \\cos(2u)}{2}');
  }
  return null;
}

// ---------- polynomials and partial fractions ----------

function rational(n, v, d, ctx) {
  const r = toRational(n, v);
  if (!r) return null;
  if (deg(r.D) <= 0) {
    const e = expand(n);
    if (key(e) === key(n)) return null;
    const k = I(e, v, d + 1, ctx);
    return k && mk(n, v, k.raw, 'Expand the polynomial', null, [k]);
  }
  const decomposition = partialFractions(r.N, r.D, v);
  if (!decomposition || key(decomposition) === key(n)) return null;
  const k = I(decomposition, v, d + 1, ctx);
  return k && mk(n, v, k.raw, 'Partial fractions', null, [k], `${tex(n)} = ${tex(pretty(decomposition))}`);
}

function partialFractions(N, D, v) {
  const x = sym(v);
  const [Q, R] = pdivmod(N, D);
  // factor D = (x - r1)^m1 ... * rest, rest of degree 0 or an irreducible quadratic
  let rest = D;
  const linear = [];
  for (const root of realRoots(D)) {
    if (!root.exact || root.node.type !== 'num') return null;
    let m = 0;
    const lin = [rmul(num(-1), root.node), R1];
    while (deg(rest) >= 1 && isNum(poly.pevalR(rest, root.node), 0)) { rest = pdivmod(rest, lin)[0]; m++; }
    linear.push({ r: root.node, m, lin });
  }
  if (deg(rest) !== 0 && deg(rest) !== 2) return null;
  // basis polynomials: D/(x-r)^j and x*D/rest, D/rest
  const basis = [], terms = [];
  for (const { r, m, lin } of linear) {
    for (let j = 1; j <= m; j++) {
      let p = D;
      for (let k = 0; k < j; k++) p = pdivmod(p, lin)[0];
      basis.push(p);
      terms.push(c => mul([c, pow(add([x, rmul(num(-1), r)]), num(-j))]));
    }
  }
  if (deg(rest) === 2) {
    const base = pdivmod(D, rest)[0];
    basis.push(pmul(base, [R0, R1]), base);
    terms.push(null, null);
  }
  const nUnknown = basis.length;
  if (nUnknown !== deg(D)) return null;
  // solve sum c_k basis_k = R by Gaussian elimination over the rationals
  const A = [];
  for (let row = 0; row < nUnknown; row++) {
    A.push([...basis.map(p => p[row] || R0), R[row] || R0]);
  }
  for (let col = 0; col < nUnknown; col++) {
    const piv = A.findIndex((rw, i) => i >= col && !isNum(rw[col], 0));
    if (piv < 0) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const p = A[col][col];
    A[col] = A[col].map(q => rdiv(q, p));
    for (let i = 0; i < nUnknown; i++) {
      if (i === col || isNum(A[i][col], 0)) continue;
      const f = A[i][col];
      A[i] = A[i].map((q, j) => radd(q, rmul(num(-f.n, f.d), A[col][j])));
    }
  }
  const coef = A.map(rw => rw[nUnknown]);
  const out = [];
  if (!(Q.length === 1 && isNum(Q[0], 0))) out.push(poly_to_node(Q, x));
  coef.forEach((c, i) => { if (terms[i] && !isNum(c, 0)) out.push(terms[i](c)); });
  if (deg(rest) === 2) {
    // (Bx + C)/(x^2 + px + q) = (B/2)(2x + p)/(...) + (C - Bp/2)/(...)
    const B = coef[nUnknown - 2], C = coef[nUnknown - 1];
    const [q0, p1] = rest; // monic? make it so
    const lc = lead(rest);
    const p = rdiv(p1, lc), q = rdiv(q0, lc);
    const restNode = add([pow(x, num(2)), mul([p, x]), q]);
    const Bm = rdiv(B, lc), Cm = rdiv(C, lc);
    const half = rmul(Bm, HALF);
    if (!isNum(half, 0)) out.push(mul([half, add([mul([num(2), x]), p]), pow(restNode, num(-1))]));
    const k = radd(Cm, rmul(num(-1), rmul(half, p)));
    if (!isNum(k, 0)) out.push(mul([k, pow(restNode, num(-1))]));
  }
  return simplify(add(out.length ? out : [num(0)]));
}

function poly_to_node(p, x) {
  return simplify(add(p.map((c, i) => mul([c, pow(x, num(i))]))));
}

// ---------- u-substitution ----------

function uSub(n, v, d, ctx) {
  const used = freeSyms(n);
  const U = ['u', 'w', 'z', 's'].find(s => !used.has(s) && s !== v);
  const cands = new Map();
  const varies = m => freeSyms(m).has(v);
  const isV = m => m.type === 'sym' && m.name === v;
  (function walk(t) {
    if (t.type === 'fn') {
      if (varies(t.arg) && !isV(t.arg)) cands.set(key(t.arg), t.arg);
      if (varies(t)) cands.set(key(t), t);
      walk(t.arg);
    } else if (t.type === 'pow') {
      if (varies(t.base) && !isV(t.base)) cands.set(key(t.base), t.base);
      if (varies(t.exp) && !isV(t.exp)) cands.set(key(t.exp), t.exp);
      walk(t.base); walk(t.exp);
    } else if (t.type === 'add' || t.type === 'mul') (t.terms || t.factors).forEach(walk);
  })(n);
  const list = [...cands.values()].filter(u => u.type !== 'add' || true).sort((a, b) => keyLen(b) - keyLen(a)).slice(0, 14);
  for (const u of list) {
    const du = differentiate(u, v).result;
    if (isNum(du, 0)) continue;
    let g = simplify(mul([n, pow(du, num(-1))]));
    let h = replace(g, u, sym(U));
    if (freeSyms(h).has(v)) {
      const L = linear(u, v);
      if (!L) continue;
      h = simplify(substitute(h, { [v]: mul([add([sym(U), rmul(num(-1), L.b)]), pow(L.a, num(-1))]) }));
      if (freeSyms(h).has(v)) continue;
    }
    if (key(h) === key(substitute(n, { [v]: sym(U) }))) continue; // no progress
    const k = I(h, U, d + 1, ctx);
    if (!k) continue;
    return mk(n, v, substitute(k.raw, { [U]: u }), 'u-substitution', null, [k],
      `${U} = ${tex(u)},\\quad d${U} = ${tex(du)}\\,d${v} \\quad\\Rightarrow\\quad \\int ${tex(n)}\\,d${v} = \\int ${tex(h)}\\,d${U}`,
      `Inside the integrand is ${U} = ${plain(u)}, and its derivative ${plain(du)} is also there (up to a constant), so substitute.`);
  }
  return null;
}
const keyLen = u => key(u).length;

function replace(t, target, by) {
  if (key(t) === key(target)) return by;
  switch (t.type) {
    case 'add': return simplify(add(t.terms.map(c => replace(c, target, by))));
    case 'mul': return simplify(mul(t.factors.map(c => replace(c, target, by))));
    case 'pow': return simplify(pow(replace(t.base, target, by), replace(t.exp, target, by)));
    case 'fn': return simplify(fn(t.name, replace(t.arg, target, by)));
    default: return t;
  }
}

// ---------- integration by parts ----------

function liate(f, v) {
  const b = f.type === 'pow' && f.exp.type === 'num' ? f.base : f;
  if (b.type === 'fn' && (b.name === 'ln' || b.name === 'log')) return 0;
  if (b.type === 'fn' && ['asin', 'acos', 'atan'].includes(b.name)) return 1;
  const r = toRational(f, v);
  if (r && r.D.length === 1) return 2;
  if (b.type === 'fn' && TRIG.has(b.name)) return 3;
  if (f.type === 'pow' && !freeSyms(f.base).has(v)) return 4;
  return 9;
}

function parts(n, v, d, ctx) {
  let u, dv;
  const factors = n.type === 'mul' ? n.factors : [n];
  const ranked = factors.map(f => ({ f, r: liate(f, v) })).sort((a, b) => a.r - b.r);
  if (ranked[0].r >= 9) return null;
  if (factors.length === 1) {
    if (ranked[0].r > 1) return null; // ln x, arctan x, ln^2 x: u = f, dv = dx
    u = n; dv = num(1);
  } else {
    u = ranked[0].f;
    const rest = factors.filter(f => f !== u);
    dv = product(rest);
    if (ranked[0].r === 4) return null;
  }
  const du = differentiate(u, v).result;
  const V = I(dv, v, d + 1, ctx);
  if (!V) return null;
  const Vr = pretty(V.raw);
  const J = simplify(mul([Vr, du]));
  const note = `u = ${tex(u)},\\; dv = ${tex(dv)}\\,d${v},\\; du = ${tex(du)}\\,d${v},\\; v = ${tex(Vr)}`;
  const formula = '\\int u\\,dv = uv - \\int v\\,du';
  const ratio = simplify(mul([J, pow(n, num(-1))]));
  if (ratio.type === 'num' && !isNum(ratio, -1)) {
    // I = uv - r I
    return mk(n, v, mul([mul([u, Vr]), pow(add([num(1), ratio]), num(-1))]), 'Integration by parts (solve for the integral)', formula, [V], note);
  }
  // e^x sin x: parts twice, then the original integral reappears; solve for it
  const cyclic = ranked[0].r === 3 && liate(dv, v) === 4;
  if (!cyclic) {
    const K = I(J, v, d + 1, ctx);
    return K && mk(n, v, sub(mul([u, Vr]), K.raw), 'Integration by parts', formula, [V, K], note);
  }
  const jf = J.type === 'mul' ? J.factors : [J];
  const trig = jf.find(f => liate(f, v) === 3);
  if (!trig) return null;
  const dv2 = simplify(mul([J, pow(trig, num(-1))]));
  const V2 = I(dv2, v, d + 1, ctx);
  if (!V2) return null;
  const V2r = pretty(V2.raw);
  const J2 = simplify(mul([V2r, differentiate(trig, v).result]));
  const c = simplify(mul([J2, pow(n, num(-1))]));
  if (c.type !== 'num' || isNum(c, 1)) return null;
  const top = sub(mul([u, Vr]), mul([trig, V2r]));
  return mk(n, v, mul([top, pow(sub(num(1), c), num(-1))]), 'Integration by parts twice (solve for the integral)', formula, [V, V2],
    `${note}.\\;\\text{ Parts again on } \\int ${tex(J)}\\,d${v} \\text{ brings back the original integral, so solve for it.}`);
}

function expandFirst(n, v, d, ctx) {
  const e = expand(n);
  if (key(e) === key(n)) return null;
  const k = I(e, v, d + 1, ctx);
  return k && mk(n, v, k.raw, 'Expand first', null, [k]);
}

const tex = n => toTex(simplify(n));
export { tex };
