// Page wiring for the integral calculator.
import { parse, toTex, freeSyms, compile, symTex, num, mul, pow, sub, substitute, key } from './expr.js';
import { simplify, setMainVar, pretty } from './simplify.js';
import { integrate } from './integrate.js';
import { definite, riemann, areaBetween, iterated, boundTex, niceTex, fnOf, intersections, quad } from './calculus.js';
import { Graph } from './graph.js';
import { Graph3D } from './graph3d.js';
import { volume, solidSurfaces, SHAPES } from './volume.js';
import { SYSTEMS, convert, applications, reverseOrder } from './multi.js';
import { fmt, recognize } from './solve.js';
import { Stepper, flattenSteps, checkAntiderivative, checkValue, checkExpression, feedbackHTML } from './learn.js';
import { differentiate } from './diff.js';
import { makeProblem, TECHNIQUES, loadScore, saveScore } from './quiz.js';

const $ = id => document.getElementById(id);
// "= \approx 2.65" reads badly, so a value that is only approximate takes the place of the "="
const M = (tex, display = false) => katex.renderToString(tex.replace(/=\s*\\approx/g, '\\approx'), { throwOnError: false, displayMode: display });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const COLORS = { f: '#2563eb', g: '#db2777', F: '#7c3aed' };

const EXAMPLES = {
  indef: [
    ['Polynomial', { f: 'x^2 + 3x - 5' }], ['Constants as letters', { f: 'ax^2 + bx + c' }],
    ['u-substitution', { f: '2x cos(x^2)' }], ['u-substitution', { f: 'x e^(x^2)' }],
    ['Integration by parts', { f: 'x e^x' }], ['Parts twice (solve for I)', { f: 'e^x sin x' }],
    ['Partial fractions', { f: '1/(x^2 - 1)' }], ['Arctangent', { f: '1/(x^2 + 4)' }],
    ['Power-reducing identity', { f: 'sin^2 x' }], ['Odd power of sine', { f: 'sin^3 x' }],
    ['Integral of ln x', { f: 'ln x' }], ['Trig substitution', { f: 'sqrt(9 - x^2)' }],
    ['No elementary antiderivative', { f: 'e^(x^2)' }],
  ],
  def: [
    ['Polynomial', { f: 'x^2', a: '0', b: '3' }], ['Sine over [0, π]', { f: 'sin x', a: '0', b: 'pi' }],
    ['Net (signed) area', { f: 'sin x', a: '0', b: '2pi' }], ['ln rule', { f: '1/x', a: '1', b: 'e' }],
    ['Improper: infinite bound', { f: '1/x^2', a: '1', b: 'inf' }], ['Improper: diverges', { f: '1/x', a: '1', b: 'inf' }],
    ['Improper: vertical asymptote', { f: '1/sqrt(x)', a: '0', b: '1' }], ['Asymptote inside the interval', { f: '1/x^2', a: '-1', b: '1' }],
    ['Both bounds infinite', { f: '1/(1 + x^2)', a: '-inf', b: 'inf' }], ['No antiderivative (numeric)', { f: 'e^(-x^2)', a: '0', b: '1' }],
  ],
  riemann: [
    ['x² on [0, 2]', { f: 'x^2', a: '0', b: '2' }], ['sin x on [0, π]', { f: 'sin x', a: '0', b: 'pi' }],
    ['1/x on [1, 3]', { f: '1/x', a: '1', b: '3' }], ['e^x on [0, 1]', { f: 'e^x', a: '0', b: '1' }],
  ],
  area: [
    ['Line and parabola', { f: 'x', g: 'x^2' }], ['Two parabolas', { f: '4 - x^2', g: 'x^2 - 4' }],
    ['Curves cross 3 times', { f: 'x^3', g: 'x' }], ['sin and cos on [0, 2π]', { f: 'sin x', g: 'cos x', a: '0', b: '2pi' }],
    ['Region with given bounds', { f: 'e^x', g: '0', a: '0', b: '1' }],
  ],
  volume: [
    ['Disk: y = √x about the x-axis', { f: 'sqrt(x)', a: '0', b: '4', kind: 'revolve', axis: 'xaxis' }],
    ['Washer: y = x and y = x² about the x-axis', { f: 'x', g: 'x^2', kind: 'revolve', axis: 'xaxis' }],
    ['Washer about the line y = 2', { f: 'x', g: 'x^2', kind: 'revolve', axis: 'y=k', k: '2' }],
    ['Shells about the y-axis', { f: 'x', g: 'x^2', kind: 'revolve', axis: 'yaxis' }],
    ['Shells about the line x = −1', { f: 'x', g: 'x^2', kind: 'revolve', axis: 'x=k', k: '-1' }],
    ['Disk in y: x = √y about the y-axis', { f: 'sqrt(y)', a: '0', b: '4', wrt: 'y', kind: 'revolve', axis: 'yaxis' }],
    ['Sphere: y = √(4 − x²) about the x-axis', { f: 'sqrt(4 - x^2)', a: '-2', b: '2', kind: 'revolve', axis: 'xaxis' }],
    ['Squares on y = √x', { f: 'sqrt(x)', a: '0', b: '4', kind: 'cross', shape: 'square' }],
    ['Semicircles on y = 1 − x²', { f: '1 - x^2', kind: 'cross', shape: 'semicircle' }],
    ['Equilateral triangles between y = x and y = x²', { f: 'x', g: 'x^2', kind: 'cross', shape: 'equilateral' }],
  ],
  ftc: [
    ['FTC 1: d/dx of ∫ from 0 to x of sin t', { kind: 'ftc1', f: 'sin(t)', a: '0', b: 'x', wrt: 't' }],
    ['Chain rule: upper bound x²', { kind: 'ftc1', f: 'sin(t)', a: '0', b: 'x^2', wrt: 't' }],
    ['Variable lower bound', { kind: 'ftc1', f: 'sqrt(1 + t^3)', a: 'x', b: '2', wrt: 't' }],
    ['Both bounds variable (no antiderivative needed)', { kind: 'ftc1', f: 'e^(t^2)', a: 'x', b: '3x', wrt: 't' }],
    ['Average value of x² on [0, 3]', { kind: 'avg', f: 'x^2', a: '0', b: '3' }],
    ['Average value of sin x on [0, π]', { kind: 'avg', f: 'sin x', a: '0', b: 'pi' }],
    ['Average value of eˣ on [0, 1]', { kind: 'avg', f: 'e^x', a: '0', b: '1' }],
  ],
  multi: [
    ['Triple: box-like region', { f: 'x y z', layers: [['z', '0', '1'], ['y', '0', 'x'], ['x', '0', '2']] }],
    ['Triple: volume of a tetrahedron', { f: '1', layers: [['z', '0', '1 - x - y'], ['y', '0', '1 - x'], ['x', '0', '1']] }],
    ['Double: rectangle', { f: 'x^2 y', layers: [['y', '0', '3'], ['x', '1', '2']] }],
    ['Double: triangle', { f: 'x + y', layers: [['y', '0', 'x'], ['x', '0', '1']] }],
    ['Double: quarter disk (numeric)', { f: 'x^2 + y^2', layers: [['y', '0', 'sqrt(1 - x^2)'], ['x', '0', '1']] }],
    ['Polar: the same quarter disk, exactly', { f: 'x^2 + y^2', coords: 'polar', layers: [['r', '0', '1'], ['theta', '0', 'pi/2']] }],
    ['Polar: area of a cardioid', { f: '1', app: 'measure', coords: 'polar', layers: [['r', '0', '1 + cos(theta)'], ['theta', '0', '2pi']] }],
    ['Cylindrical: volume of a cylinder', { f: '1', app: 'measure', coords: 'cylindrical', layers: [['z', '0', '3'], ['r', '0', '2'], ['theta', '0', '2pi']] }],
    ['Cylindrical: under a paraboloid', { f: 'z', coords: 'cylindrical', layers: [['z', '0', '4 - r^2'], ['r', '0', '2'], ['theta', '0', '2pi']] }],
    ['Spherical: volume of a ball', { f: '1', app: 'measure', coords: 'spherical', layers: [['rho', '0', '2'], ['phi', '0', 'pi'], ['theta', '0', '2pi']] }],
    ['Spherical: ∭(x² + y² + z²) dV over the unit ball', { f: 'x^2 + y^2 + z^2', coords: 'spherical', layers: [['rho', '0', '1'], ['phi', '0', 'pi'], ['theta', '0', '2pi']] }],
    ['Center of mass of a triangle (density 1)', { f: '1', app: 'center', layers: [['y', '0', 'x'], ['x', '0', '1']] }],
    ['Mass with density x + y', { f: 'x + y', app: 'mass', layers: [['y', '0', '1 - x'], ['x', '0', '1']] }],
    ['Center of mass of a half disk (polar)', { f: '1', app: 'center', coords: 'polar', layers: [['r', '0', '1'], ['theta', '0', 'pi']] }],
    ['Reverse the order: y from x² to x', { f: '1', app: 'measure', layers: [['y', 'x^2', 'x'], ['x', '0', '1']] }],
  ],
};

const state = { mode: 'indef', lastInput: null, stepRoot: null, stepMode: 'all', check: null, revealed: false };
let graph, graph3d;

// ---------- reading inputs ----------

const INF = /^\s*([+-])?\s*(inf|infinity|∞|oo)\s*$/i;

function readExpr(id, what) {
  const src = $(id).value;
  if (!src.trim()) throw new Error(`Type ${what}.`);
  const n = parse(src);
  if (n.type === 'eq') throw new Error(`${what[0].toUpperCase() + what.slice(1)} should not contain "=".`);
  return simplify(n);
}

function readVar(str) {
  const n = parse(str || 'x');
  if (n.type !== 'sym' || ['pi', 'e'].includes(n.name)) throw new Error(`"${str}" can't be a variable. Use a single letter like x or t.`);
  return n.name;
}

function readBound(id, label, { allowInf = true, allowVars = [] } = {}) {
  const src = $(id).value.trim();
  if (!src) throw new Error(`Fill in the ${label}.`);
  const m = INF.exec(src);
  if (m) {
    if (!allowInf) throw new Error(`The ${label} must be a number here, not ∞.`);
    return { node: null, value: m[1] === '-' ? -Infinity : Infinity };
  }
  const node = simplify(parse(src));
  const bad = [...freeSyms(node)].filter(s => !allowVars.includes(s));
  if (bad.length) throw new Error(`The ${label} can't contain the letter ${bad[0]}.`);
  return { node, value: allowVars.length ? NaN : compile(node)({}) };
}

const boundShow = b => (b.node ? toTex(b.node) : boundTex(b.value));

// ---------- rendering helpers ----------

function stepTree(step, depth = 0) {
  const head = `<span class="rule">${esc(step.rule)}</span><span class="step-math">${M(`\\int ${wrap(step.expr)}\\,d${symTex(step.v)} = ${toTex(step.result)}`)}</span>`;
  const note = step.note ? `<div class="formula">${M(step.note)}</div>` : '';
  const formula = step.formula ? `<div class="formula">Rule: ${M(step.formula)}</div>` : '';
  if (!step.children.length) return `<div class="step"><div class="leaf">${head}${note}${formula}</div></div>`;
  return `<div class="step"><details ${depth < 3 ? 'open' : ''}><summary>${head}</summary><div class="step-body">${note}${formula}${step.children.map(c => stepTree(c, depth + 1)).join('')}</div></details></div>`;
}
const wrap = n => (n.type === 'add' ? `\\left(${toTex(n)}\\right)` : toTex(n));

function showSteps(root) {
  state.stepRoot = root;
  $('toggle-steps').hidden = !root;
  $('steps-mode').hidden = !root || $('steps').hidden;
  renderSteps();
}

function renderSteps() {
  const el = $('steps');
  el.onclick = null;
  if (!state.stepRoot) { el.innerHTML = ''; return; }
  for (const b of $('steps-mode').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.smode === state.stepMode));
  if (state.stepMode === 'one') new Stepper(el, flattenSteps(state.stepRoot));
  else el.innerHTML = stepTree(state.stepRoot);
}

const approx = v => {
  if (!isFinite(v)) return '';
  const r = recognize(v);
  return fmt(v) === (r && r.tex) ? '' : ` \\approx ${fmt(v)}`;
};
const valueTex = v => {
  const r = recognize(v);
  return r && Math.abs(r.x - v) < 1e-9 * (1 + Math.abs(v)) ? `${r.tex}${approx(v)}` : `\\approx ${fmt(v)}`;
};
const closeTo = v => {
  const r = recognize(v);
  return r && Math.abs(r.x - v) < 1e-6 * (1 + Math.abs(v)) && Math.abs(r.x - v) > 1e-12 ? ` It is very close to ${M(r.tex)}, which is probably the exact value.` : '';
};
const exactTex = (node, v) => `${toTex(node)}${node.type === 'num' && node.d === 1 ? '' : approx(v)}`;

const NO_ANTI = 'No elementary antiderivative was found. Some integrals, like those of e^(x²) or sin(x)/x, cannot be written with the usual functions at all; others need techniques beyond this calculator.';

function stage(n, title, body, open = true) {
  return `<details class="stage"${open ? ' open' : ''}><summary><span class="num">${n}</span>${title}</summary><div class="stage-body">${body}</div></details>`;
}

function setAnswer(title, html) {
  $('answer-title').textContent = title;
  $('answer').innerHTML = html;
  $('answer-card').hidden = false;
}

// ---------- modes ----------

function runIndefinite() {
  const v = readVar($('wrt').value.trim());
  setMainVar(v);
  const f = readExpr('f', 'the integrand');
  const vt = symTex(v);
  const r = integrate(f, v);
  state.check = r ? { kind: 'anti', f, v } : null;
  $('detail-card').hidden = true;
  if (!r) {
    setAnswer('Indefinite integral', `<p>${esc(NO_ANTI)}</p><p class="answer-note">Switch to <b>Definite</b> to get a numeric value over an interval.</p>`);
    showSteps(null);
  } else {
    setAnswer('Indefinite integral', M(`\\int ${wrap(f)}\\,d${vt} = ${toTex(r.result)} + C`, true) +
      `<p class="answer-note">✓ Checked: the derivative of the answer equals the integrand.</p>`);
    showSteps(r.steps);
  }
  // graph f and one antiderivative
  if (freeSyms(f).size > 1 || (freeSyms(f).size === 1 && !freeSyms(f).has(v))) { $('graph-card').hidden = true; return; }
  const curves = [{ f: fnOf(f, v), color: COLORS.f, label: 'f' }];
  let legend = `<span><i style="background:${COLORS.f}"></i>${M(`f(${vt}) = ${toTex(f)}`)}</span>`;
  if (r) {
    curves.push({ f: fnOf(r.result, v), color: COLORS.F, label: 'F', dash: [7, 5] });
    legend += `<span><i style="background:${COLORS.F}"></i>${M(`F(${vt})`)} with ${M('C = 0')} (dashed)</span>`;
  }
  showGraph({ curves, xName: v, hint: 'F rises where f is positive and falls where f is negative. Move over the graph to compare.' }, legend);
}

function runDefinite() {
  const v = readVar($('wrt').value.trim());
  setMainVar(v);
  const f = readExpr('f', 'the integrand');
  if ([...freeSyms(f)].some(s => s !== v)) throw new Error(`For a definite integral, the integrand can only use ${v}. Replace other letters with numbers.`);
  const A = readBound('a', 'lower bound'), B = readBound('b', 'upper bound');
  const vt = symTex(v);
  const r = definite(f, v, A, B);
  state.check = { kind: 'value', value: r.value, diverges: !!r.diverges };
  const integral = `\\int_{${boundShow(A)}}^{${boundShow(B)}} ${wrap(f)}\\,d${vt}`;
  showSteps(r.anti ? r.anti.steps : null);

  let answer, body = '';
  if (r.diverges) answer = M(`${integral} \\text{ diverges}`, true);
  else if (r.exact) answer = M(`${integral} = ${exactTex(r.exact, r.value)}`, true);
  else answer = M(`${integral} = ${valueTex(r.value)}`, true);
  setAnswer('Definite integral', answer + (r.method === 'numeric' || r.method === 'numeric-limits' ? `<p class="answer-note">Numeric value (adaptive Simpson's rule).${closeTo(r.value)}</p>` : ''));

  const antiLine = r.F ? `<div class="math-line">${M(`F(${vt}) = ${toTex(r.F)}`, true)}</div>` : `<p>${esc(NO_ANTI)}</p>`;
  if (r.method === 'ftc') {
    body = stage(1, 'Find an antiderivative', antiLine) +
      stage(2, 'Apply the Fundamental Theorem of Calculus',
        `<div class="math-line">${M(`\\int_a^b f(${vt})\\,d${vt} = F(b) - F(a)`, true)}</div>
         <div class="math-line">${M(`\\Big[ ${toTex(r.F)} \\Big]_{${boundShow(A)}}^{${boundShow(B)}} = \\left(${toTex(r.Fb)}\\right) - \\left(${toTex(r.Fa)}\\right) = ${exactTex(r.exact, r.value)}`, true)}</div>
         <p class="note">The definite integral is a <b>signed</b> area: area above the ${M(vt)}-axis counts as positive and area below counts as negative.</p>`);
  } else if (r.method === 'numeric') {
    body = stage(1, 'Find an antiderivative', antiLine) +
      stage(2, 'Estimate numerically', `<p>Without an antiderivative, the value is computed numerically: ${M(valueTex(r.value))}.</p>`);
  } else {
    const why = [];
    if (!isFinite(A.value) || !isFinite(B.value)) why.push('a bound is infinite');
    const inside = r.singular.filter(c => c >= Math.min(A.value, B.value) && c <= Math.max(A.value, B.value));
    if (inside.length) why.push(`the integrand is undefined (blows up) at ${inside.map(c => M(`${vt} = ${niceTex(c)}`)).join(', ')}`);
    const limits = r.pieces.map(p => {
      const t = 't';
      const lo = p.badL ? t : p.lTex, hi = p.badR ? t : p.rTex;
      const lim = p.badR ? `\\lim_{${t} \\to ${p.rTex}${isFinite(p.r) ? '^-' : ''}}` : p.badL ? `\\lim_{${t} \\to ${p.lTex}${isFinite(p.l) ? '^+' : ''}}` : '';
      const val = p.diverges ? '\\text{diverges}' : niceTex(p.value);
      if (r.method === 'limits') {
        return `<div class="math-line">${M(`${lim} \\int_{${lo}}^{${hi}} ${wrap(f)}\\,d${vt} = ${lim} \\Big[ F(${hi}) - F(${lo}) \\Big] = ${p.FrTex} - \\left(${p.FlTex}\\right) = ${val}`, true)}</div>`;
      }
      return `<div class="math-line">${M(`${lim} \\int_{${lo}}^{${hi}} ${wrap(f)}\\,d${vt} ${p.diverges ? '' : '\\approx'} ${val}`, true)}</div>`;
    }).join('');
    body = stage(1, 'Why this integral is improper', `<p>This integral is <b>improper</b> because ${why.join(' and ')}. We replace each trouble spot with a limit${r.pieces.length > 1 ? ' and split the integral there' : ''}.</p>`) +
      stage(2, 'Find an antiderivative', antiLine) +
      stage(3, 'Take the limits', limits + (r.diverges
        ? `<p><b>At least one limit is infinite, so the integral diverges.</b></p>`
        : `<p><b>Every limit is finite, so the integral converges</b> to ${M(valueTex(r.value))}.</p>`));
  }
  $('detail-card').innerHTML = `<h2>${r.improper ? 'Improper integral' : 'Fundamental Theorem of Calculus'}</h2>${r.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}${body}`;
  $('detail-card').hidden = false;

  const fN = fnOf(f, v);
  const lo = Math.min(A.value, B.value), hi = Math.max(A.value, B.value);
  const wl = isFinite(lo) ? lo : (isFinite(hi) ? hi - 10 : -10), wh = isFinite(hi) ? hi : wl + 10;
  showGraph({
    curves: [{ f: fN, color: COLORS.f, label: 'f' }], xName: v, window: [wl, wh],
    shade: [{ top: fN, a: isFinite(lo) ? lo : -1e9, b: isFinite(hi) ? hi : 1e9, signed: true }],
  }, `<span><i style="background:${COLORS.f}"></i>${M(`f(${vt}) = ${toTex(f)}`)}</span>` +
    `<span><i style="background:rgba(37,99,235,.35)"></i>positive area</span><span><i style="background:rgba(220,38,38,.35)"></i>negative area</span>`);
}

const METHOD = {
  left: { sym: 'L', name: 'Left endpoint', idx: i => `${i}`, last: 'n-1', first: '0' },
  right: { sym: 'R', name: 'Right endpoint', idx: i => `${i + 1}`, last: 'n', first: '1' },
  midpoint: { sym: 'M', name: 'Midpoint', idx: i => `${i}`, last: 'n', first: '1' },
  trapezoid: { sym: 'T', name: 'Trapezoid', idx: i => `${i}`, last: 'n', first: '0' },
};

function runRiemann() {
  const v = readVar($('wrt').value.trim());
  setMainVar(v);
  const f = readExpr('f', 'the function');
  if ([...freeSyms(f)].some(s => s !== v)) throw new Error(`The function can only use ${v}. Replace other letters with numbers.`);
  const A = readBound('a', 'left endpoint a', { allowInf: false }), B = readBound('b', 'right endpoint b', { allowInf: false });
  if (!(A.value < B.value)) throw new Error('Riemann sums need a < b.');
  const n = +$('n').value, method = $('method').value, m = METHOD[method];
  const vt = symTex(v), fN = fnOf(f, v);
  const rs = riemann(fN, A.value, B.value, n, method);
  state.check = { kind: 'value', value: rs.sum };
  const exact = definite(f, v, A, B);
  const Sn = `${m.sym}_{${n}}`;
  setAnswer(`${m.name} Riemann sum`, M(`${Sn} = ${valueTex(rs.sum)}`, true) +
    (isFinite(exact.value) ? `<p class="answer-note">Exact integral: ${M(exact.exact ? exactTex(exact.exact, exact.value) : valueTex(exact.value))}, error ${M(`${Sn} - \\int = ${fmt(rs.sum - exact.value)}`)}</p>` : ''));
  showSteps(exact.anti ? exact.anti.steps : null);

  const dxTex = `\\Delta ${vt} = \\frac{b - a}{n} = \\frac{${boundShow(B)} - ${boundShow(A)}}{${n}} = ${valueTex(rs.dx)}`;
  let formula;
  if (method === 'trapezoid') formula = `T_n = \\frac{\\Delta ${vt}}{2}\\left[f(${vt}_0) + 2f(${vt}_1) + \\cdots + 2f(${vt}_{n-1}) + f(${vt}_n)\\right]`;
  else if (method === 'midpoint') formula = `M_n = \\Delta ${vt}\\left[f(\\bar{${vt}}_1) + f(\\bar{${vt}}_2) + \\cdots + f(\\bar{${vt}}_n)\\right]`;
  else formula = `${m.sym}_n = \\Delta ${vt}\\left[f(${vt}_{${m.first}}) + f(${vt}_{${method === 'left' ? 1 : 2}}) + \\cdots + f(${vt}_{${m.last}})\\right]`;
  const shown = rs.rects.slice(0, 12);
  const rows = shown.map((r, i) => {
    if (method === 'trapezoid') return `<tr><td>${i + 1}</td><td>${M(`[${fmt(r.x0)}, ${fmt(r.x1)}]`)}</td><td>${M(`\\frac{${fmt(r.y0)} + ${fmt(r.y1)}}{2}`)}</td><td>${fmt((r.y0 + r.y1) / 2 * rs.dx)}</td></tr>`;
    return `<tr><td>${i + 1}</td><td>${M(`${vt} = ${fmt(r.sample)}`)}</td><td>${fmt(r.y0)}</td><td>${fmt(r.y0 * rs.dx)}</td></tr>`;
  }).join('');
  const more = rs.rects.length > shown.length ? `<tr><td colspan="4">… ${rs.rects.length - shown.length} more</td></tr>` : '';
  const head = method === 'trapezoid' ? '<th>#</th><th>Subinterval</th><th>Average height</th><th>Area</th>' : '<th>#</th><th>Sample point</th><th>Height f</th><th>Area f·Δx</th>';
  $('detail-card').innerHTML = `<h2>How the sum is built</h2>` +
    stage(1, 'Width of each subinterval', `<div class="math-line">${M(dxTex, true)}</div>`) +
    stage(2, 'Add up the areas', `<div class="math-line">${M(formula, true)}</div>
      <div class="table-wrap"><table class="signs"><tr>${head}</tr>${rows}${more}</table></div>
      <div class="math-line">${M(`${Sn} = ${valueTex(rs.sum)}`, true)}</div>`) +
    stage(3, 'Compare with the exact integral', isFinite(exact.value)
      ? `<p>${M(`\\int_{${boundShow(A)}}^{${boundShow(B)}} ${wrap(f)}\\,d${vt} = ${exact.exact ? exactTex(exact.exact, exact.value) : valueTex(exact.value)}`)}</p>
         <p>Error: ${M(`${Sn} - \\int = ${fmt(rs.sum - exact.value)}`)}. Slide <i>n</i> higher and watch the error shrink toward 0.</p>`
      : '<p>The exact integral could not be computed for comparison.</p>');
  $('detail-card').hidden = false;
  showGraph({
    curves: [{ f: fN, color: COLORS.f, label: 'f' }], xName: v, window: [A.value, B.value],
    rects: rs.rects.map(r => ({ ...r, trap: method === 'trapezoid' })),
  }, `<span><i style="background:${COLORS.f}"></i>${M(`f(${vt}) = ${toTex(f)}`)}</span><span><i style="background:rgba(245,158,11,.5)"></i>${m.name.toLowerCase()} ${method === 'trapezoid' ? 'trapezoids' : 'rectangles'}</span>`, true);
}

function runArea() {
  const v = readVar($('wrt').value.trim());
  setMainVar(v);
  const f = readExpr('f', 'the first curve'), g = readExpr('g', 'the second curve');
  for (const h of [f, g]) if ([...freeSyms(h)].some(s => s !== v)) throw new Error(`The curves can only use ${v}.`);
  const aSrc = $('a').value.trim(), bSrc = $('b').value.trim();
  if (!!aSrc !== !!bSrc) throw new Error('Fill in both bounds, or leave both blank to use where the curves cross.');
  const bounds = aSrc ? [readBound('a', 'lower bound', { allowInf: false }), readBound('b', 'upper bound', { allowInf: false })] : null;
  if (bounds && !(bounds[0].value < bounds[1].value)) throw new Error('The lower bound must be less than the upper bound.');
  const r = areaBetween(f, g, v, bounds);
  const vt = symTex(v);
  if (r.error) throw new Error(r.error);
  state.check = { kind: 'value', value: r.total };
  setAnswer('Area between curves', M(`\\text{Area} = ${r.exactTotal ? exactTex(r.exactTotal, r.total) : valueTex(r.total)}`, true));
  showSteps(r.H ? r.H.steps : null);

  const F = `f(${vt}) = ${toTex(f)}`, G = `g(${vt}) = ${toTex(g)}`;
  const meet = r.pts.length
    ? `${M(`f(${vt}) = g(${vt}) \\;\\Rightarrow\\; ${toTex(r.h)} = 0`)} at ${r.pts.map(p => M(`${vt} = ${p.tex}`)).join(', ')}`
    : 'The curves do not cross in this interval.';
  const rows = r.pieces.map(p => {
    const top = p.top === 'f' ? 'f' : 'g', bot = p.top === 'f' ? 'g' : 'f';
    return `<tr><td>${M(`[${p.l.tex.replace('\\approx ', '')}, ${p.r.tex.replace('\\approx ', '')}]`)}</td><td>${M(top)} on top</td>
      <td>${M(`\\int (${top} - ${bot})\\,d${vt} = ${p.exact ? exactTex(p.exact, p.value) : valueTex(p.value)}`)}</td></tr>`;
  }).join('');
  $('detail-card').innerHTML = `<h2>Setting up the area</h2>` +
    stage(1, 'Find where the curves meet', `<p>${M(F)}, &nbsp; ${M(G)}</p><p>${meet}</p>${bounds ? `<p>Using the bounds ${M(`${boundShow(bounds[0])} \\le ${vt} \\le ${boundShow(bounds[1])}`)}.</p>` : '<p>The region runs from the first crossing to the last.</p>'}`) +
    stage(2, 'Integrate top minus bottom on each piece',
      `<p>Area is always positive, so on each piece subtract the <b>lower</b> curve from the <b>upper</b> curve. A test point in the middle of each piece tells which is on top.</p>
       <div class="table-wrap"><table class="signs"><tr><th>Interval</th><th>Top curve</th><th>Area of the piece</th></tr>${rows}</table></div>`) +
    stage(3, 'Add the pieces', `<div class="math-line">${M(`\\text{Area} = ${r.pieces.map(p => p.exact ? toTex(p.exact) : fmt(p.value)).join(' + ')} = ${r.exactTotal ? exactTex(r.exactTotal, r.total) : valueTex(r.total)}`, true)}</div>`);
  $('detail-card').hidden = false;
  const fN = fnOf(f, v), gN = fnOf(g, v);
  const lo = r.cuts[0].x, hi = r.cuts[r.cuts.length - 1].x;
  showGraph({
    curves: [{ f: fN, color: COLORS.f, label: 'f' }, { f: gN, color: COLORS.g, label: 'g' }], xName: v, window: [lo, hi],
    shade: r.pieces.map(p => ({ top: x => Math.max(fN(x), gN(x)), bottom: x => Math.min(fN(x), gN(x)), a: p.l.x, b: p.r.x, signed: false })),
    points: r.pts.map(p => ({ x: p.x, y: fN(p.x) })),
  }, `<span><i style="background:${COLORS.f}"></i>${M(F)}</span><span><i style="background:${COLORS.g}"></i>${M(G)}</span><span><i style="background:rgba(37,99,235,.35)"></i>region</span>`);
}

const CART_DEFAULTS = { 2: [['y', '0', '1'], ['x', '0', '1']], 3: [['z', '0', '1'], ['y', '0', '1'], ['x', '0', '1']] };
const sysOf = () => SYSTEMS[$('coords').value] || SYSTEMS[+$('dims').value === 3 ? 'cartesian3' : 'cartesian2'];

function syncCoords() {
  const dims = +$('dims').value;
  const keep = $('coords').value;
  const opts = dims === 3 ? ['cartesian3', 'cylindrical', 'spherical'] : ['cartesian2', 'polar'];
  $('coords').innerHTML = opts.map(k => `<option value="${k}">${SYSTEMS[k].name}</option>`).join('');
  $('coords').value = opts.includes(keep) ? keep : opts[0];
  $('reverse').hidden = !(dims === 2 && $('coords').value === 'cartesian2');
}

function renderLayers(force = false) {
  const sys = sysOf();
  const dims = sys.dims;
  const box = $('layers');
  const same = box.dataset.sys === $('coords').value;
  const old = [...box.querySelectorAll('.layer')].map(row => [...row.querySelectorAll('input')].map(i => i.value));
  const defaults = sys.defaults || CART_DEFAULTS[dims];
  const names = dims === 3 ? ['inner', 'middle', 'outer'] : ['inner', 'outer'];
  box.dataset.sys = $('coords').value;
  box.innerHTML = defaults.map((d, i) => {
    const vals = !force && same && old.length === dims ? old[i] : d;
    return `<div class="layer"><span class="tag neither">${names[i]}</span>
      <label>d<input class="var" type="text" value="${esc(vals[0])}" data-k="v" autocomplete="off"></label>
      <label>from <input type="text" value="${esc(vals[1])}" data-k="lo" autocomplete="off"></label>
      <label>to <input type="text" value="${esc(vals[2])}" data-k="hi" autocomplete="off"></label></div>`;
  }).join('');
}

function setLayers(list, coords) {
  $('dims').value = String(list.length);
  syncCoords();
  $('coords').value = coords || (list.length === 3 ? 'cartesian3' : 'cartesian2');
  syncCoords();
  renderLayers(true);
  [...$('layers').querySelectorAll('.layer')].forEach((row, i) => {
    const inputs = row.querySelectorAll('input');
    list[i].forEach((val, k) => { inputs[k].value = val; });
  });
}

function readLayers() {
  const rows = [...$('layers').querySelectorAll('.layer')];
  const layers = rows.map(row => {
    const [vIn, loIn, hiIn] = row.querySelectorAll('input');
    const v = readVar(vIn.value.trim());
    if (!loIn.value.trim() || !hiIn.value.trim()) throw new Error(`Fill in both bounds for d${v}.`);
    return { v, lo: simplify(parse(loIn.value)), hi: simplify(parse(hiIn.value)) };
  });
  const vars = layers.map(L => L.v);
  if (new Set(vars).size !== vars.length) throw new Error('Each layer needs a different variable.');
  const sys = sysOf();
  if (sys.subs && [...sys.vars].sort().join() !== [...vars].sort().join()) {
    throw new Error(`${sys.name} coordinates use the variables ${sys.vars.map(v => (v === 'theta' ? 'θ' : v === 'phi' ? 'φ' : v === 'rho' ? 'ρ' : v)).join(', ')}. Type theta, phi, rho (or θ, φ, ρ).`);
  }
  layers.forEach((L, i) => {
    const outer = vars.slice(i + 1);
    for (const s of [...freeSyms(L.lo), ...freeSyms(L.hi)]) {
      if (!outer.includes(s)) throw new Error(`The bounds for d${L.v} can only use outer variables (${outer.join(', ') || 'none'}), not ${s}.`);
    }
  });
  return layers;
}

const intsTex = layers => [...layers].reverse().map(L => `\\int_{${toTex(L.lo)}}^{${toTex(L.hi)}}`).join('');
const dsTex = layers => layers.map(L => `d${symTex(L.v)}`).join('\\,');

function layerStages(r, layers, start) {
  return r.steps.map((s, i) => {
    const others = layers.filter(L => L.v !== s.v).map(L => symTex(L.v));
    const hold = others.length ? `Treat ${others.map(o => M(o)).join(' and ')} as constant${others.length > 1 ? 's' : ''}.` : '';
    const title = `Integrate with respect to ${M(symTex(s.v))}`;
    if (s.failed) return stage(start + i, title, `<p>${hold}</p><div class="math-line">${M(`\\int_{${toTex(s.lo)}}^{${toTex(s.hi)}} ${wrap(s.integrand)}\\,d${symTex(s.v)}`, true)}</div><p>${esc(NO_ANTI)} The rest is computed numerically.</p>`);
    return stage(start + i, title,
      `<p>${hold}</p>
       <div class="math-line">${M(`\\int_{${toTex(s.lo)}}^{${toTex(s.hi)}} ${wrap(s.integrand)}\\,d${symTex(s.v)} = \\Big[ ${toTex(s.F)} \\Big]_{${symTex(s.v)} = ${toTex(s.lo)}}^{${toTex(s.hi)}}`, true)}</div>
       <div class="math-line">${M(`= \\left(${toTex(s.upper)}\\right) - \\left(${toTex(s.lower)}\\right) = ${toTex(s.result)}`, true)}</div>
       <details class="mini"><summary>Steps for the antiderivative</summary><div class="steps">${stepTree(s.antiSteps)}</div></details>`);
  }).join('');
}
const resTex = r => (r.exact ? exactTex(r.exact, r.value) : valueTex(r.value));

function runMulti() {
  const sys = sysOf();
  const app = $('m-app').value;
  const layers = readLayers();
  const dims = layers.length;
  const f = app === 'measure' ? num(1) : readExpr('f', app === 'mass' || app === 'center' ? 'the density' : 'the integrand');
  const allowed = new Set([...layers.map(L => L.v), ...(sys.subs ? ['x', 'y', 'z'] : [])]);
  const extra = [...freeSyms(f)].filter(s => !allowed.has(s));
  if (extra.length) throw new Error(`The integrand uses ${extra[0]}, which is not one of the integration variables.`);
  setMainVar(layers[dims - 1].v);
  const conv = convert(f, sys);
  const full = pretty(sys.jac ? mul([conv, sys.jac]) : conv);
  const dA = dims === 3 ? 'dV' : 'dA';
  const region = dims === 3 ? 'E' : 'R';
  const set = `${'\\iint'.replace('ii', dims === 3 ? 'iii' : 'ii')}_{${region}}`;
  // change of coordinates explanation
  let coordStage = '';
  if (sys.subs) {
    coordStage = stage(1, `Change to ${sys.name.toLowerCase()} coordinates`,
      `<div class="math-line">${M(sys.subsTex, true)}</div>
       ${key(conv) !== key(f) ? `<p>The integrand becomes</p><div class="math-line">${M(`${toTex(f)} = ${toTex(conv)}`, true)}</div>` : ''}
       <p>The area/volume element picks up the Jacobian:</p><div class="math-line">${M(sys.jacTex, true)}</div>
       <div class="math-line">${M(`${intsTex(layers)} ${wrap(conv)}\\cdot ${wrap(sys.jac)}\\,${dsTex(layers)} = ${intsTex(layers)} ${wrap(full)}\\,${dsTex(layers)}`, true)}</div>`);
  }
  const offset = sys.subs ? 2 : 1;
  let marker = null, answerHTML, detailTitle = 'Integrate from the inside out', body = '', mainR;
  const titleBase = dims === 3 ? 'Triple integral' : 'Double integral';
  if (app === 'center') {
    const res = applications('center', f, layers, sys);
    const M0 = res.mass;
    mainR = M0;
    const coords = res.moments.map(m => {
      const exact = M0.exact && m.res.exact ? pretty(mul([m.res.exact, pow(M0.exact, num(-1))])) : null;
      return { axis: m.axis, exact, value: m.res.value / M0.value, mom: m.res };
    });
    const point = `\\left(${coords.map(c => (c.exact ? toTex(c.exact) : fmt(c.value))).join(',\\ ')}\\right)`;
    answerHTML = M(`(\\bar{x},\\ \\bar{y}${dims === 3 ? ',\\ \\bar{z}' : ''}) = ${point}`, true) +
      (coords.some(c => !c.exact || c.exact.type !== 'num') ? `<p class="answer-note">≈ (${coords.map(c => fmt(c.value)).join(', ')})</p>` : '');
    state.check = null;
    marker = coords.map(c => c.value);
    detailTitle = 'Center of mass';
    body = stage(offset, 'Mass', `<div class="math-line">${M(`M = ${set} \\rho\\,${dA} = ${resTex(M0)}`, true)}</div>`) +
      stage(offset + 1, 'Moments and the center', coords.map(c => `<div class="math-line">${M(`\\bar{${c.axis}} = \\frac{1}{M}${set} ${c.axis}\\,\\rho\\,${dA} = \\frac{${resTex(c.mom).replace(/\\approx.*/, '')}}{${resTex(M0).replace(/\\approx.*/, '')}} = ${c.exact ? exactTex(c.exact, c.value) : valueTex(c.value)}`, true)}</div>`).join('')) +
      `<details class="mini"><summary>Steps for the mass integral</summary>${layerStages(M0, layers, offset + 2)}</details>`;
  } else if (app === 'average') {
    const res = applications('average', f, layers, sys);
    const T = res.total, A = res.measure;
    mainR = T;
    const exact = T.exact && A.exact ? pretty(mul([T.exact, pow(A.exact, num(-1))])) : null;
    const value = T.value / A.value;
    answerHTML = M(`f_{\\text{avg}} = ${exact ? exactTex(exact, value) : valueTex(value)}`, true);
    state.check = { kind: 'value', value };
    detailTitle = 'Average value over the region';
    body = stage(offset, 'Size of the region', `<div class="math-line">${M(`${dims === 3 ? 'V' : 'A'} = ${set} 1\\,${dA} = ${resTex(A)}`, true)}</div>`) +
      stage(offset + 1, 'Integral of the function', `<div class="math-line">${M(`${set} f\\,${dA} = ${resTex(T)}`, true)}</div>`) +
      stage(offset + 2, 'Divide', `<div class="math-line">${M(`f_{\\text{avg}} = \\frac{1}{${dims === 3 ? 'V' : 'A'}}${set} f\\,${dA} = ${exact ? exactTex(exact, value) : valueTex(value)}`, true)}</div>`) +
      `<details class="mini"><summary>Steps for the integral of the function</summary>${layerStages(T, layers, offset + 3)}</details>`;
  } else {
    const r = iterated(full, layers);
    mainR = r;
    state.check = { kind: 'value', value: r.value };
    const lhs = app === 'measure' ? (dims === 3 ? 'V' : 'A') : app === 'mass' ? 'M' : `${intsTex(layers)} ${wrap(f)}\\,${sys.subs ? dA : dsTex(layers)}`;
    answerHTML = M(`${lhs} = ${resTex(r)}`, true) + (r.exact ? '' : `<p class="answer-note">Numeric value (Gauss–Legendre quadrature).${closeTo(r.value)}</p>`);
    if (r.mismatch) body += '<p class="note">The exact steps did not match a numeric check, so the numeric value is shown.</p>';
    body += layerStages(r, layers, offset);
  }
  const answerTitle = { integral: titleBase, measure: dims === 3 ? 'Volume' : 'Area', mass: 'Mass', center: 'Center of mass', average: 'Average value' }[app];
  setAnswer(answerTitle, answerHTML);
  showSteps(null);
  $('detail-card').innerHTML = `<h2>${detailTitle}</h2>${coordStage}${body}`;
  $('detail-card').hidden = false;
  state.multi = { layers, sys };
  drawMulti(conv, layers, sys, marker);
  void mainR;
}

// ---------- pictures for double and triple integrals ----------

// Region of a Cartesian double integral, drawn with strips the way the bounds describe it.
// pairs: [[inner, outer], ...] — more than one pair after reversing the order.
function drawRegion(pairs, title, mark) {
  const all = pairs.map(([L2, L1]) => {
    const u = L1.v, w = L2.v;
    const a = compile(L1.lo)({}), b = compile(L1.hi)({});
    const loC = compile(L2.lo), hiC = compile(L2.hi);
    return { L1, L2, u, w, a, b, lo: x => loC({ [u]: x }), hi: x => hiC({ [u]: x }) };
  });
  const { u, w } = all[0];
  const pair = new Set([u, w]);
  const horiz = pair.has('x') && pair.has('y') ? 'x' : u;
  const vertStrips = horiz === u;
  const xs = [], ys = [];
  for (const R of all) for (let i = 0; i <= 200; i++) {
    const t = R.a + (R.b - R.a) * i / 200;
    for (const val of [R.lo(t), R.hi(t)]) if (isFinite(val)) { (vertStrips ? xs : ys).push(t); (vertStrips ? ys : xs).push(val); }
  }
  const box = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = k => Math.max((box[k + 1] - box[k]) * 0.25, 0.5);
  const view = { x0: box[0] - pad(0), x1: box[1] + pad(0), y0: box[2] - pad(2), y1: box[3] + pad(2) };
  const red = '#dc2626', green = '#15803d', grey = '#64748b';
  const curves = [], shade = [];
  for (const R of all) {
    const { a, b, lo, hi } = R;
    if (vertStrips) {
      curves.push({ px: t => [t, lo(t)], t0: a, t1: b, color: red }, { px: t => [t, hi(t)], t0: a, t1: b, color: green },
        { px: t => [a, lo(a) + (hi(a) - lo(a)) * t], color: grey, width: 2, dash: [5, 4] },
        { px: t => [b, lo(b) + (hi(b) - lo(b)) * t], color: grey, width: 2, dash: [5, 4] });
      shade.push({ top: hi, bottom: lo, a, b, signed: false });
    } else {
      curves.push({ px: t => [lo(t), t], t0: a, t1: b, color: red }, { px: t => [hi(t), t], t0: a, t1: b, color: green },
        { px: t => [lo(a) + (hi(a) - lo(a)) * t, a], color: grey, width: 2, dash: [5, 4] },
        { px: t => [lo(b) + (hi(b) - lo(b)) * t, b], color: grey, width: 2, dash: [5, 4] });
      shade.push({ horizontal: true, left: lo, right: hi, c: a, d: b });
    }
  }
  $('graph-title').textContent = title;
  const legend = all.length === 1
    ? `<span><i style="background:${red}"></i>lower bound ${M(`${symTex(w)} = ${toTex(all[0].L2.lo)}`)}</span>` +
      `<span><i style="background:${green}"></i>upper bound ${M(`${symTex(w)} = ${toTex(all[0].L2.hi)}`)}</span>` +
      `<span><i style="background:${grey}"></i>${M(`${symTex(u)} = ${toTex(all[0].L1.lo)}`)} and ${M(`${symTex(u)} = ${toTex(all[0].L1.hi)}`)}</span>`
    : `<span><i style="background:${red}"></i>lower bounds</span><span><i style="background:${green}"></i>upper bounds</span><span><i style="background:${grey}"></i>band edges</span>`;
  showGraph({
    curves, view, xName: horiz, shade,
    points: mark ? [{ x: mark[0], y: mark[1], label: 'center of mass' }] : [],
    hint: vertStrips ? `Each vertical strip runs from the red curve up to the green curve.` : `Each horizontal strip runs from the red curve to the green curve.`,
  }, legend + `<span><i style="background:rgba(37,99,235,.35)"></i>region</span>`);
}

// Region drawn by mapping the parameter rectangle through a coordinate change (polar regions).
function drawMappedRegion(L2, L1, toPlane, title, mark) {
  const u = L1.v, w = L2.v;
  const a = compile(L1.lo)({}), b = compile(L1.hi)({});
  const loC = compile(L2.lo), hiC = compile(L2.hi);
  const at = (s, r) => { const uu = a + (b - a) * s; const env = { [u]: uu }; const lo = loC(env), hi = hiC(env); env[w] = lo + (hi - lo) * r; return toPlane(env); };
  const n = 120, pts = [];
  for (let i = 0; i <= n; i++) pts.push(at(i / n, 1));
  for (let i = n; i >= 0; i--) pts.push(at(i / n, 0));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const view = { x0: cx - span * 0.75, x1: cx + span * 0.75, y0: cy - span * 0.75, y1: cy + span * 0.75 };
  $('graph-title').textContent = title;
  showGraph({
    curves: [{ px: s => at(s, 1), color: '#15803d' }, { px: s => at(s, 0), color: '#dc2626' }],
    view, xName: 'x', polys: [{ pts }],
    points: mark ? [{ x: mark[0], y: mark[1], label: 'center of mass' }] : [],
    hint: 'The region drawn in the xy-plane.',
  }, `<span><i style="background:#dc2626"></i>${M(`${symTex(w)} = ${toTex(L2.lo)}`)}</span><span><i style="background:#15803d"></i>${M(`${symTex(w)} = ${toTex(L2.hi)}`)}</span><span><i style="background:rgba(37,99,235,.35)"></i>region</span>`);
}

const TOP = [37, 99, 235], BOTTOM = [13, 148, 136], WALL = [147, 197, 253];

function drawMulti(conv, layers, sys, mark) {
  const n = layers.length;
  const outer = layers[n - 1], mid = layers[n - 2];
  const u = outer.v, w = mid.v;
  const a = compile(outer.lo)({}), b = compile(outer.hi)({});
  const wLo = compile(mid.lo), wHi = compile(mid.hi);
  const envAt = (s, r) => { const env = { [u]: a + (b - a) * s }; const l = wLo(env), h = wHi(env); env[w] = l + (h - l) * r; return env; };
  const cart = !sys.toXYZ;
  // where a point with these coordinate values sits in the xy-plane (double) or space (triple)
  const plane2 = env => (cart ? [env.x !== undefined ? env.x : env[u], env.y !== undefined ? env.y : env[w]] : sys.toXYZ(env));
  if (n === 2 || !sys.toXYZ || sys.vars.includes('z')) {
    const title = n === 3 ? 'Shadow of the solid in the xy-plane' : 'Region of integration';
    if (cart) drawRegion([[mid, outer]], title, mark);
    else drawMappedRegion(mid, outer, env => sys.toXYZ(env).slice(0, 2), title, mark);
  } else $('graph-card').hidden = true;

  let surfaces, names = ['x', 'y', 'z'], legend;
  const surf = (map, color) => ({ map, color });
  if (n === 2) {
    const F = compile(conv);
    const P = (env, h) => { const [X, Y] = plane2(env); return [X, Y, h]; };
    const top = env => F(env);
    surfaces = [
      surf((s, r) => { const e = envAt(s, r); return P(e, top(e)); }, TOP),
      surf((s, r) => P(envAt(s, r), 0), BOTTOM),
      ...[0, 1].map(edge => surf((s, t) => { const e = envAt(s, edge); return P(e, top(e) * t); }, WALL)),
      ...[0, 1].map(edge => surf((s, t) => { const e = envAt(edge, s); return P(e, top(e) * t); }, WALL)),
    ];
    if (cart) names = [u === 'y' || w === 'x' ? w : u, u === 'y' || w === 'x' ? u : w, 'z'];
    $('graph3d-title').textContent = 'Volume under the surface';
    legend = `<span><i style="background:rgb(${TOP})"></i>surface ${M(`z = ${toTex(conv)}`)}</span><span><i style="background:rgb(${BOTTOM})"></i>the region</span><span>The double integral is the signed volume between them.</span>`;
  } else {
    const inner = layers[0], t0 = inner.v;
    const tLo = compile(inner.lo), tHi = compile(inner.hi);
    const set = new Set([u, w, t0]);
    const xyz = set.has('x') && set.has('y') && set.has('z');
    const idx = v => (xyz ? { x: 0, y: 1, z: 2 }[v] : { [u]: 0, [w]: 1, [t0]: 2 }[v]);
    const place = env => {
      if (!cart) return sys.toXYZ(env);
      const p = []; p[idx(u)] = env[u]; p[idx(w)] = env[w]; p[idx(t0)] = env[t0]; return p;
    };
    if (cart) { names = []; names[idx(u)] = u; names[idx(w)] = w; names[idx(t0)] = t0; }
    const full = (s, r, t) => { const e = envAt(s, r); const lo = tLo(e), hi = tHi(e); e[t0] = lo + (hi - lo) * t; return place(e); };
    surfaces = [
      surf((s, r) => full(s, r, 1), TOP), surf((s, r) => full(s, r, 0), BOTTOM),
      ...[0, 1].map(edge => surf((s, t) => full(s, edge, t), WALL)),
      ...[0, 1].map(edge => surf((s, t) => full(edge, s, t), WALL)),
    ];
    $('graph3d-title').textContent = 'The solid region';
    legend = `<span><i style="background:rgb(${TOP})"></i>${M(`${symTex(t0)} = ${toTex(inner.hi)}`)} (outer surface)</span><span><i style="background:rgb(${BOTTOM})"></i>${M(`${symTex(t0)} = ${toTex(inner.lo)}`)}</span><span><i style="background:rgb(${WALL})"></i>sides</span>`;
  }
  $('graph3d-card').hidden = false;
  $('legend3d').innerHTML = legend;
  const points = mark ? [{ at: n === 3 ? mark : [mark[0], mark[1], 0], label: 'center of mass' }] : [];
  graph3d.set({ surfaces, names, equal: !cart, points });
}

function reverseNow() {
  const s = state.multi;
  if (!s || s.layers.length !== 2 || s.sys.subs) return;
  const r = reverseOrder(s.layers);
  let html;
  if (r.error) html = `<p class="note">${esc(r.error)}</p>`;
  else {
    const fNode = $('m-app').value === 'measure' ? num(1) : readExpr('f', 'the integrand');
    const vals = r.bands.map(B => iterated(fNode, B.layers));
    const total = vals.reduce((t, x) => t + x.value, 0);
    const integrals = r.bands.map(B => `${intsTex(B.layers)} ${wrap(fNode)}\\,${dsTex(B.layers)}`).join(' + ');
    html = `<p>Read the region with ${r.bands.length > 1 ? 'horizontal strips. The left and right boundaries change partway, so it takes ' + r.bands.length + ' integrals' : 'strips the other way'}:</p>
      <div class="math-line">${M(integrals, true)}</div>
      <p>Value: ${M(valueTex(total))}, the same as before. ✓</p>
      ${r.bands.length === 1 ? '<button id="use-reversed">Use these bounds</button>' : ''}`;
    state.reversed = r;
    drawRegion(r.bands.map(B => B.layers), 'Region with the order reversed');
  }
  $('detail-card').insertAdjacentHTML('beforeend', stage('↻', 'Reverse the order of integration', html));
  $('detail-card').lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- volume ----------

const VCOLORS = { top: [37, 99, 235], bottom: [13, 148, 136], wall: [147, 197, 253], slice: [245, 158, 11] };

function readAxis() {
  const a = $('v-axis').value;
  if (a === 'xaxis') return { dir: 'h', k: num(0), tex: '\\text{the } x\\text{-axis}' };
  if (a === 'yaxis') return { dir: 'v', k: num(0), tex: '\\text{the } y\\text{-axis}' };
  const k = readBound('v-k', 'value of k', { allowInf: false });
  return { dir: a === 'y=k' ? 'h' : 'v', k: k.node, tex: `${a === 'y=k' ? 'y' : 'x'} = ${toTex(k.node)}` };
}

function runVolume() {
  const v = readVar($('wrt').value.trim() || 'x');
  if (v !== 'x' && v !== 'y') throw new Error('For volumes, integrate with respect to x (curves y = f(x)) or y (curves x = f(y)).');
  setMainVar(v);
  const other = v === 'x' ? 'y' : 'x';
  const f = readExpr('f', 'the curve');
  const gSrc = $('g').value.trim();
  const g = gSrc ? readExpr('g', 'the second curve') : num(0);
  for (const c of [f, g]) if ([...freeSyms(c)].some(s => s !== v)) throw new Error(`The curves must be written as ${other} = (an expression in ${v}).`);
  const aSrc = $('a').value.trim(), bSrc = $('b').value.trim();
  if (!!aSrc !== !!bSrc) throw new Error('Fill in both bounds, or leave both blank to use where the curves cross.');
  const bounds = aSrc ? [readBound('a', 'lower bound', { allowInf: false }), readBound('b', 'upper bound', { allowInf: false })] : null;
  if (bounds && !(bounds[0].value < bounds[1].value)) throw new Error('The lower bound must be less than the upper bound.');
  const kind = $('v-kind').value;
  const axis = kind === 'revolve' ? readAxis() : null;
  const shape = $('v-shape').value;
  const height = shape === 'rectangle' ? readBound('v-h', 'height h', { allowInf: false }).node : null;
  const opts = { f, g, v, bounds, kind, axis, method: $('v-method').value, shape, height };
  const vol = volume(opts);
  const vt = symTex(v), ot = symTex(other);
  const valTex = vol.exact ? exactTex(vol.exact, vol.total) : valueTex(vol.total);
  state.check = { kind: 'value', value: vol.total };
  setAnswer('Volume', M(`V = ${valTex}`, true));
  showSteps(vol.pieces[0].res.anti ? vol.pieces[0].res.anti.steps : null);

  const p0 = vol.pieces[0];
  const curveTex = `${ot} = ${toTex(f)}${gSrc ? `\\text{ and } ${ot} = ${toTex(g)}` : `\\text{ and } ${ot} = 0`}`;
  const range = `${p0.lTex} \\le ${vt} \\le ${vol.pieces[vol.pieces.length - 1].rTex}`;
  let slice;
  if (kind === 'cross') {
    const sh = SHAPES[shape];
    slice = `<p>Each slice perpendicular to the ${M(vt)}-axis is a <b>${esc(sh.name.toLowerCase())}</b>. Its side (or diameter) ${M('s')} runs across the region from the bottom curve to the top curve:</p>` +
      vol.pieces.map(p => `<div class="math-line">${M(`s(${vt}) = ${toTex(p.parts.s)}, \\quad A(${vt}) = ${sh.tex.replace('h\\,', height ? `${toTex(height)}\\,` : 'h\\,')} = ${toTex(p.parts.A)}`, true)}</div>`).join('') +
      `<div class="math-line">${M(`V = \\int_a^b A(${vt})\\,d${vt}`, true)}</div>`;
  } else if (vol.method === 'washer') {
    slice = `<p>Slices perpendicular to the axis of rotation are <b>${p0.parts.disk ? 'disks' : 'washers'}</b>. Measure each radius from the axis ${M(axis.tex)}:</p>` +
      vol.pieces.map(p => `<div class="math-line">${M(p.parts.disk ? `R(${vt}) = ${toTex(p.parts.R)}` : `R(${vt}) = ${toTex(p.parts.R)} \\;(\\text{outer}), \\quad r(${vt}) = ${toTex(p.parts.r)} \\;(\\text{inner})`, true)}</div>`).join('') +
      `<div class="math-line">${M(p0.parts.disk ? `V = \\pi\\int_a^b R(${vt})^2\\,d${vt}` : `V = \\pi\\int_a^b \\left(R(${vt})^2 - r(${vt})^2\\right)d${vt}`, true)}</div>`;
  } else {
    slice = `<p>Thin strips parallel to the axis of rotation sweep out <b>cylindrical shells</b>. The radius is the distance from the strip to the axis ${M(axis.tex)}; the height is top minus bottom:</p>` +
      vol.pieces.map(p => `<div class="math-line">${M(`\\text{radius} = ${toTex(p.parts.radius)}, \\quad \\text{height} = ${toTex(p.parts.height)}`, true)}</div>`).join('') +
      `<div class="math-line">${M(`V = 2\\pi\\int_a^b (\\text{radius})(\\text{height})\\,d${vt}`, true)}</div>`;
  }
  const integ = vol.pieces.map(p => `<div class="math-line">${M(`\\int_{${p.lTex}}^{${p.rTex}} ${wrap(p.integrand)}\\,d${vt} = ${p.res.exact ? exactTex(p.res.exact, p.res.value) : valueTex(p.res.value)}`, true)}</div>`).join('');
  $('detail-card').innerHTML = `<h2>Setting up the volume</h2>` +
    stage(1, 'The region', `<p>The region between ${M(curveTex)} for ${M(range)}${bounds ? '' : ' (where the curves cross)'}.</p>`) +
    stage(2, 'Slice it', slice) +
    stage(3, 'Integrate', integ + (vol.pieces.length > 1 ? `<div class="math-line">${M(`V = ${valTex}`, true)}</div>` : ''));
  $('detail-card').hidden = false;

  // 2D region with the axis and one representative strip
  const fN = fnOf(f, v), gN = fnOf(g, v);
  const top = t => Math.max(fN(t), gN(t)), bot = t => Math.min(fN(t), gN(t));
  const lo = vol.lo, hi = vol.hi, m = (lo + hi) / 2, w = (hi - lo) / 40;
  const qs = [];
  for (let i = 0; i <= 100; i++) { const t = lo + (hi - lo) * i / 100; qs.push(top(t), bot(t)); }
  if (axis) qs.push(vol.kv);
  const qlo = Math.min(...qs), qhi = Math.max(...qs);
  let tlo = lo, thi = hi;
  if (axis && !vol.axisParallel) { tlo = Math.min(lo, vol.kv); thi = Math.max(hi, vol.kv); }
  const padT = (thi - tlo) * 0.2 || 1, padQ = (qhi - qlo) * 0.2 || 1;
  const P = (t, q) => (v === 'x' ? [t, q] : [q, t]);
  const view = v === 'x'
    ? { x0: tlo - padT, x1: thi + padT, y0: qlo - padQ, y1: qhi + padQ }
    : { x0: qlo - padQ, x1: qhi + padQ, y0: tlo - padT, y1: thi + padT };
  const curves = [
    { px: t => P(t, fN(t)), t0: view[v === 'x' ? 'x0' : 'y0'], t1: view[v === 'x' ? 'x1' : 'y1'], color: COLORS.f },
    { px: t => P(t, gN(t)), t0: view[v === 'x' ? 'x0' : 'y0'], t1: view[v === 'x' ? 'x1' : 'y1'], color: COLORS.g },
  ];
  if (axis) {
    const k = vol.kv;
    curves.push(axis.dir === 'h' ? { px: t => [view.x0 + (view.x1 - view.x0) * t, k], color: '#f59e0b', width: 2.5, dash: [8, 5] }
      : { px: t => [k, view.y0 + (view.y1 - view.y0) * t], color: '#f59e0b', width: 2.5, dash: [8, 5] });
  }
  const strip = v === 'x' ? { x0: m - w, x1: m + w, y0: bot(m), y1: top(m) } : { x0: bot(m), x1: top(m), y0: m - w, y1: m + w };
  $('graph-title').textContent = 'The region';
  showGraph({
    curves, view, xName: 'x',
    shade: [v === 'x' ? { top, bottom: bot, a: lo, b: hi, signed: false } : { horizontal: true, left: bot, right: top, c: lo, d: hi }],
    boxes: [strip],
    hint: kind === 'cross' ? 'The orange strip is one slice; the cross-section stands on it.' : `The orange strip is one slice; spinning it around the dashed axis makes ${vol.method === 'shell' ? 'a shell' : 'a disk or washer'}.`,
  }, `<span><i style="background:${COLORS.f}"></i>${M(`${ot} = ${toTex(f)}`)}</span><span><i style="background:${COLORS.g}"></i>${M(`${ot} = ${toTex(g)}`)}</span>` +
    (axis ? `<span><i style="background:#f59e0b"></i>axis ${M(axis.tex)}</span>` : '') + `<span><i style="background:rgba(245,158,11,.6)"></i>one slice</span>`);
  $('graph-title').textContent = 'The region';

  const sol = solidSurfaces(vol, opts, VCOLORS);
  $('graph3d-card').hidden = false;
  $('graph3d-title').textContent = kind === 'cross' ? 'The solid built on the region' : 'The solid of revolution';
  $('legend3d').innerHTML = `<span><i style="background:rgb(${VCOLORS.top})"></i>${kind === 'cross' ? 'cross-section surfaces' : 'outer surface'}</span>` +
    `<span><i style="background:rgb(${VCOLORS.bottom})"></i>${kind === 'cross' ? 'base region' : 'inner surface'}</span>` +
    `<span><i style="background:rgb(${VCOLORS.slice})"></i>one ${kind === 'cross' ? 'cross-section' : vol.method === 'shell' ? 'shell' : p0.parts.disk ? 'disk' : 'washer'}</span>`;
  graph3d.set(sol);
}

// ---------- FTC part 1 and average value ----------

function runFtc() {
  if ($('ftc-kind').value === 'avg') return runAverage();
  const t = readVar($('wrt').value.trim() || 't');
  const f = readExpr('f', 'the integrand f(t)');
  if ([...freeSyms(f)].some(s => s !== t)) throw new Error(`The integrand should only use ${t}, the variable of integration.`);
  if (!$('a').value.trim() || !$('b').value.trim()) throw new Error('Fill in both bounds. At least one should contain x, like 0 and x².');
  const lower = simplify(parse($('a').value)), upper = simplify(parse($('b').value));
  const letters = [...new Set([...freeSyms(lower), ...freeSyms(upper)])];
  if (letters.includes(t)) throw new Error(`The bounds can't use ${t}; that letter is the variable of integration.`);
  if (letters.length > 1) throw new Error('The bounds should use only one variable, like x.');
  const X = letters[0] || 'x';
  setMainVar(X);
  const xt = symTex(X), tt = symTex(t);
  const dh = differentiate(upper, X).result, dg = differentiate(lower, X).result;
  const fh = pretty(substitute(f, { [t]: upper })), fg = pretty(substitute(f, { [t]: lower }));
  const result = pretty(sub(mul([fh, dh]), mul([fg, dg])));
  const integral = `\\int_{${toTex(lower)}}^{${toTex(upper)}} ${wrap(f)}\\,d${tt}`;
  state.check = { kind: 'expr', target: result };
  setAnswer('Derivative of an integral', M(`\\frac{d}{d${xt}} ${integral} = ${toTex(result)}`, true));
  const anti = integrate(f, t);
  showSteps(null);

  const lowerConst = !freeSyms(lower).size, upperConst = !freeSyms(upper).size;
  const piece = (b, fb, db, sign) => `${sign}f\\left(${toTex(b)}\\right)\\cdot\\frac{d}{d${xt}}\\left[${toTex(b)}\\right] = ${sign}\\left(${toTex(fb)}\\right)\\left(${toTex(db)}\\right)`;
  let chain = `<div class="math-line">${M(`\\frac{d}{d${xt}} \\int_{g(${xt})}^{h(${xt})} f(${tt})\\,d${tt} = f\\big(h(${xt})\\big)\\,h'(${xt}) - f\\big(g(${xt})\\big)\\,g'(${xt})`, true)}</div>`;
  chain += upperConst ? `<p>The upper bound is a constant, so its term is 0.</p>` : `<p>Upper bound ${M(`h(${xt}) = ${toTex(upper)}`)}:</p><div class="math-line">${M(piece(upper, fh, dh, ''), true)}</div>`;
  chain += lowerConst ? `<p>The lower bound is a constant, so its term is 0.</p>` : `<p>Lower bound ${M(`g(${xt}) = ${toTex(lower)}`)} (subtracted):</p><div class="math-line">${M(piece(lower, fg, dg, '-'), true)}</div>`;
  chain += `<div class="math-line">${M(`\\frac{d}{d${xt}} ${integral} = ${toTex(result)}`, true)}</div>`;
  let check = '';
  if (anti) {
    const A = pretty(sub(substitute(anti.result, { [t]: upper }), substitute(anti.result, { [t]: lower })));
    check = stage(3, 'Check with an antiderivative', `<p>Here ${M(`F(${tt}) = ${toTex(anti.result)}`)}, so the integral is</p>
      <div class="math-line">${M(`A(${xt}) = F\\big(${toTex(upper)}\\big) - F\\big(${toTex(lower)}\\big) = ${toTex(A)}`, true)}</div>
      <p>Differentiating that directly gives ${M(`A'(${xt}) = ${toTex(differentiate(A, X).result)}`)}, the same answer.</p>`);
  } else {
    check = stage(3, 'No antiderivative needed', `<p>${M(`f(${tt}) = ${toTex(f)}`)} has no elementary antiderivative, yet the derivative of the integral is easy. That is the power of FTC part 1.</p>`);
  }
  $('detail-card').innerHTML = `<h2>Fundamental Theorem of Calculus, part 1</h2>` +
    stage(1, 'The theorem', `<p>If ${M(`A(${xt}) = \\int_a^{${xt}} f(${tt})\\,d${tt}`)} and ${M('f')} is continuous, then ${M(`A'(${xt}) = f(${xt})`)}: differentiating the accumulated area gives back the function.</p>`) +
    stage(2, 'Use the chain rule on the bounds', chain) + check;
  $('detail-card').hidden = false;

  // graph f(t), shading the accumulated area at the slider's x
  $('ftc-x-name').textContent = X;
  const x0 = +$('ftc-x').value;
  const lo = compile(lower)({ [X]: x0 }), hi = compile(upper)({ [X]: x0 });
  const fN = fnOf(f, t);
  const area = quad(fN, Math.min(lo, hi), Math.max(lo, hi)) * (hi >= lo ? 1 : -1);
  const dA = compile(result)({ [X]: x0 });
  $('graph-title').textContent = 'Accumulated area';
  showGraph({
    curves: [{ f: fN, color: COLORS.f, label: 'f' }], xName: t, window: [Math.min(lo, hi, 0), Math.max(lo, hi, 1)],
    shade: [{ top: fN, a: Math.min(lo, hi), b: Math.max(lo, hi), signed: true }],
    hint: `At ${X} = ${fmt(x0)} the integral runs from ${tt === 't' ? 't' : t} = ${fmt(lo)} to ${fmt(hi)}. Slide ${X} to watch the area change.`,
  }, `<span><i style="background:${COLORS.f}"></i>${M(`f(${tt}) = ${toTex(f)}`)}</span>` +
    `<span>${M(`A(${fmt(x0)}) \\approx ${fmt(area)}`)} &nbsp; ${M(`A'(${fmt(x0)}) \\approx ${fmt(dA)}`)}</span>`);
}

function runAverage() {
  const v = readVar($('wrt').value.trim() || 'x');
  setMainVar(v);
  const f = readExpr('f', 'the function');
  if ([...freeSyms(f)].some(s => s !== v)) throw new Error(`The function can only use ${v}.`);
  const A = readBound('a', 'left endpoint a', { allowInf: false }), B = readBound('b', 'right endpoint b', { allowInf: false });
  if (!(A.value < B.value)) throw new Error('Average value needs a < b.');
  const vt = symTex(v);
  const r = definite(f, v, A, B);
  const width = pretty(sub(B.node, A.node));
  const avgExact = r.exact ? pretty(mul([pow(width, num(-1)), r.exact])) : null;
  const avg = r.value / (B.value - A.value);
  const avgTex = avgExact ? exactTex(avgExact, avg) : valueTex(avg);
  state.check = { kind: 'value', value: avg };
  setAnswer('Average value', M(`f_{\\text{avg}} = ${avgTex}`, true));
  showSteps(r.anti ? r.anti.steps : null);
  const level = avgExact || num(Math.round(avg * 1e9), 1e9);
  const cs = intersections(pretty(sub(f, level)), v, A.value, B.value);
  $('detail-card').innerHTML = `<h2>Average value</h2>` +
    stage(1, 'The formula', `<div class="math-line">${M(`f_{\\text{avg}} = \\frac{1}{b - a}\\int_a^b f(${vt})\\,d${vt}`, true)}</div>
      <p>It is the height of the rectangle on ${M(`[${boundShow(A)}, ${boundShow(B)}]`)} that has the same area as the region under the curve.</p>`) +
    stage(2, 'Integrate', `<div class="math-line">${M(`\\int_{${boundShow(A)}}^{${boundShow(B)}} ${wrap(f)}\\,d${vt} = ${r.exact ? exactTex(r.exact, r.value) : valueTex(r.value)}`, true)}</div>`) +
    stage(3, 'Divide by the width', `<div class="math-line">${M(`f_{\\text{avg}} = \\frac{1}{${toTex(width)}}\\cdot ${r.exact ? wrap(r.exact) : fmt(r.value)} = ${avgTex}`, true)}</div>`) +
    stage(4, 'Mean Value Theorem for integrals', cs.length
      ? `<p>The function reaches its average value at ${cs.map(c => M(`${vt} = ${c.tex}`)).join(', ')}: ${M(`f(c) = f_{\\text{avg}}`)}.</p>`
      : '<p>No point in the interval was found where the function equals its average.</p>');
  $('detail-card').hidden = false;
  const fN = fnOf(f, v);
  $('graph-title').textContent = 'Graph';
  showGraph({
    curves: [{ f: fN, color: COLORS.f, label: 'f' }, { f: () => avg, color: '#f59e0b', label: 'avg', dash: [8, 5], width: 2.5 }],
    xName: v, window: [A.value, B.value],
    shade: [{ top: fN, a: A.value, b: B.value, signed: true }],
    boxes: [{ x0: A.value, x1: B.value, y0: 0, y1: avg, outline: true }],
    points: cs.map(c => ({ x: c.x, y: avg, label: `c ≈ ${fmt(c.x)}` })),
    hint: 'The orange rectangle (height = average value) has the same area as the shaded region.',
  }, `<span><i style="background:${COLORS.f}"></i>${M(`f(${vt}) = ${toTex(f)}`)}</span><span><i style="background:#f59e0b"></i>${M(`y = f_{\\text{avg}}`)}</span>`);
}

function showGraph(scene, legend) {
  $('graph-card').hidden = false;
  if (state.mode !== 'multi' && state.mode !== 'volume') { if (state.mode !== 'ftc') $('graph-title').textContent = 'Graph'; $('graph3d-card').hidden = true; }
  $('legend').innerHTML = legend;
  graph.set(scene);
}

// ---------- mode switching, preview, events ----------

const RUN = { indef: runIndefinite, def: runDefinite, riemann: runRiemann, area: runArea, volume: runVolume, ftc: runFtc, multi: runMulti };

const RESULT_CARDS = ['answer-card', 'detail-card', 'graph-card', 'graph3d-card'];

// quiet = true when switching tabs: half-filled inputs just leave the results empty.
// keep = true for small changes (the Riemann n slider) that should not re-hide the answer.
function compute(quiet = false, keep = false) {
  $('error').hidden = true;
  if (!keep) state.revealed = false;
  state.check = null;
  $('check-out').innerHTML = '';
  try {
    RUN[state.mode]();
    setupCheck();
    gateAnswer();
  } catch (e) {
    if (quiet) { ['answer-card', 'detail-card', 'graph-card', 'graph3d-card'].forEach(id => { $(id).hidden = true; }); return; }
    console.error(e);
    $('error').textContent = e.message || String(e);
    $('error').hidden = false;
    ['answer-card', 'detail-card', 'graph-card', 'graph3d-card'].forEach(id => { $(id).hidden = true; });
  }
}

// "Hide the answer until I try it myself": keep the result covered until the student checks
// an answer or asks to see it.
function gateAnswer() {
  if (!$('hide-answer').checked || state.revealed || !state.check) return;
  state.hiddenAnswer = $('answer').innerHTML;
  state.hiddenCards = RESULT_CARDS.filter(id => id !== 'answer-card' && !$(id).hidden);
  state.hiddenCards.forEach(id => { $(id).hidden = true; });
  $('answer').innerHTML = `<p class="hidden-answer">The answer is hidden. Work it out, then check it below, or <button id="reveal-answer">Show answer</button></p>`;
  $('toggle-steps').hidden = true;
  $('steps').hidden = true;
  $('steps-mode').hidden = true;
}

function revealAnswer() {
  if (state.revealed) return;
  state.revealed = true;
  if (state.hiddenAnswer === undefined) return;
  $('answer').innerHTML = state.hiddenAnswer;
  state.hiddenCards.forEach(id => { $(id).hidden = false; });
  if (!$('graph-card').hidden) graph.draw();
  if (!$('graph3d-card').hidden) graph3d.draw();
  $('toggle-steps').hidden = !state.stepRoot;
  state.hiddenAnswer = undefined;
}

function setupCheck() {
  const c = state.check;
  $('check-box').hidden = !c;
  if (!c) return;
  $('check-label').textContent = c.kind === 'anti' ? 'Check your own antiderivative (end it with + C)'
    : c.kind === 'expr' ? 'Check your own answer (an expression)' : 'Check your own answer (a number like 9/2 or 3π, or "diverges")';
  $('mine').placeholder = c.kind === 'anti' ? 'e.g.  x e^x - e^x + C' : c.kind === 'expr' ? 'e.g.  2x sin(x^2)' : 'e.g.  2pi/3';
}

function runCheck() {
  const c = state.check;
  if (!c) return;
  const r = c.kind === 'anti' ? checkAntiderivative($('mine').value, c.f, c.v)
    : c.kind === 'expr' ? checkExpression($('mine').value, c.target) : checkValue($('mine').value, c);
  $('check-out').innerHTML = feedbackHTML(r);
  if (r.level === 'correct' || r.level === 'needC') revealAnswer();
}

function setMode(mode) {
  state.mode = mode;
  const quiz = mode === 'quiz';
  document.querySelector('.input-card').hidden = quiz;
  $('quiz-card').hidden = !quiz;
  if (quiz) {
    for (const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    RESULT_CARDS.forEach(id => { $(id).hidden = true; });
    $('error').hidden = true;
    if (!state.quiz) newProblem();
    return;
  }
  for (const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
  $('g-row').hidden = !['area', 'volume'].includes(mode);
  $('g').placeholder = mode === 'volume' ? 'second curve (optional; blank means the axis 0)' : 'second curve g(x), e.g.  x^2';
  $('bounds-row').hidden = !['def', 'riemann', 'area', 'volume', 'ftc'].includes(mode);
  $('ftc-row').hidden = mode !== 'ftc';
  $('ftc-x-wrap').hidden = $('ftc-kind').value !== 'ftc1';
  if (mode === 'ftc' && $('ftc-kind').value === 'ftc1' && $('wrt').value.trim() === 'x') $('wrt').value = 't';
  if (mode !== 'ftc' && $('wrt').value.trim() === 't') $('wrt').value = 'x';
  $('volume-row').hidden = mode !== 'volume';
  syncVolumeControls();
  $('riemann-row').hidden = mode !== 'riemann';
  $('multi-row').hidden = mode !== 'multi';
  $('wrt-row').hidden = mode === 'multi';
  $('area-hint').hidden = !['area', 'volume'].includes(mode);
  $('f-label').textContent = { indef: 'Integrand', def: 'Integrand', riemann: 'Function', area: 'Curves', volume: 'Region between the curves', ftc: 'Integrand', multi: 'Integrand' }[mode];
  $('f').placeholder = mode === 'area' ? 'first curve f(x), e.g.  x' : mode === 'multi' ? 'e.g.  x y z' : 'e.g.  x e^x    sin^2 x    1/(x^2 + 1)';
  $('examples').innerHTML = '<option value="">Choose an example…</option>' +
    EXAMPLES[mode].map(([name, ex], i) => `<option value="${i}">${esc(name)}: ${esc(ex.f)}${ex.g ? ` and ${esc(ex.g)}` : ''}${ex.a ? ` on [${esc(ex.a)}, ${esc(ex.b)}]` : ''}</option>`).join('');
  if (mode === 'multi' && !$('layers').children.length) { syncCoords(); renderLayers(); }
  ['answer-card', 'detail-card', 'graph-card', 'graph3d-card'].forEach(id => { $(id).hidden = true; });
  $('error').hidden = true;
  updatePreview();
  if ($('f').value.trim()) compute(true);
}

function loadExample(i) {
  const ex = EXAMPLES[state.mode][i][1];
  $('f').value = ex.f;
  $('g').value = ex.g || '';
  $('a').value = ex.a || '';
  $('b').value = ex.b || '';
  if (ex.layers) setLayers(ex.layers, ex.coords);
  if (state.mode === 'multi') $('m-app').value = ex.app || 'integral';
  $('wrt').value = ex.wrt || 'x';
  if (state.mode === 'ftc') {
    $('ftc-kind').value = ex.kind;
    $('ftc-x-wrap').hidden = ex.kind !== 'ftc1';
  }
  if (state.mode === 'volume') {
    $('v-kind').value = ex.kind;
    if (ex.axis) $('v-axis').value = ex.axis;
    if (ex.k) $('v-k').value = ex.k;
    $('v-method').value = ex.method || 'auto';
    if (ex.shape) $('v-shape').value = ex.shape;
    syncVolumeControls();
  }
  updatePreview();
  compute();
}

function updatePreview() {
  const pv = $('preview');
  try {
    const mode = state.mode;
    const f = readExpr('f', 'the integrand');
    let v = 'x';
    try { v = readVar($('wrt').value.trim()); } catch { /* keep x */ }
    const vt = symTex(v);
    const b = id => { const s = $(id).value.trim(); if (!s) return '?'; const m = INF.exec(s); return m ? (m[1] === '-' ? '-\\infty' : '\\infty') : toTex(simplify(parse(s))); };
    let tex;
    if (mode === 'indef') tex = `\\int ${wrap(f)}\\,d${vt}`;
    else if (mode === 'def' || mode === 'riemann') tex = `\\int_{${b('a')}}^{${b('b')}} ${wrap(f)}\\,d${vt}`;
    else if (mode === 'ftc') {
      tex = $('ftc-kind').value === 'avg'
        ? `f_{\\text{avg}} = \\frac{1}{b - a}\\int_{${b('a')}}^{${b('b')}} ${wrap(f)}\\,d${vt}`
        : `\\frac{d}{dx}\\int_{${b('a')}}^{${b('b')}} ${wrap(f)}\\,d${vt}`;
    } else if (mode === 'volume') {
      let g = '0';
      try { if ($('g').value.trim()) g = toTex(readExpr('g', 'g')); } catch { g = '?'; }
      const o = v === 'x' ? 'y' : 'x';
      tex = `\\text{volume from the region between } ${o} = ${toTex(f)} \\text{ and } ${o} = ${g}`;
    } else if (mode === 'area') {
      let g = '?';
      try { g = toTex(readExpr('g', 'g')); } catch { /* not typed yet */ }
      tex = `\\text{area between } y = ${toTex(f)} \\text{ and } y = ${g}`;
    } else {
      const rows = [...$('layers').querySelectorAll('.layer')].map(row => [...row.querySelectorAll('input')].map(i => i.value.trim()));
      const t = s => { try { return toTex(simplify(parse(s))); } catch { return '?'; } };
      tex = `${[...rows].reverse().map(r => `\\int_{${t(r[1])}}^{${t(r[2])}}`).join('')} ${wrap(f)}\\,${rows.map(r => `d${r[0] ? symTex(r[0]) : '?'}`).join('\\,')}`;
    }
    pv.className = 'preview';
    pv.innerHTML = M(tex, true);
  } catch (e) {
    const src = $('f').value.trim();
    pv.className = src ? 'preview bad' : 'preview';
    pv.innerHTML = src ? esc(e.message) : '<span class="hint-text">Your integral will appear here as you type.</span>';
  }
}

function insertAtCursor(text, close = '') {
  const el = state.lastInput || $('f');
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
  const sel = el.value.slice(s, e);
  el.value = el.value.slice(0, s) + text + sel + close + el.value.slice(e);
  const pos = s + text.length + sel.length + (sel ? close.length : 0);
  el.focus();
  el.setSelectionRange(pos, pos);
  updatePreview();
}

// a node written back as text the parser understands
const simpleInput = n => toTex(n).replace(/\\left|\\right/g, '').replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)')
  .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)').replace(/\\ln/g, 'ln').replace(/\\pi/g, 'pi')
  .replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/[{}]/g, '').replace(/\\,|\\ /g, ' ');

function syncVolumeControls() {
  const rev = $('v-kind').value === 'revolve';
  $('v-axis-wrap').hidden = !rev;
  $('v-method-wrap').hidden = !rev;
  $('v-shape-wrap').hidden = rev;
  $('v-k-wrap').hidden = !['y=k', 'x=k'].includes($('v-axis').value);
  $('v-h-wrap').hidden = $('v-shape').value !== 'rectangle';
}

function init() {
  $('v-shape').innerHTML = Object.entries(SHAPES).map(([k, s]) => `<option value="${k}">${esc(s.name)}</option>`).join('');
  for (const id of ['v-kind', 'v-axis', 'v-method', 'v-shape']) $(id).addEventListener('change', () => { syncVolumeControls(); compute(true); });
  $('ftc-kind').addEventListener('change', () => {
    const avg = $('ftc-kind').value === 'avg';
    $('ftc-x-wrap').hidden = avg;
    $('wrt').value = avg ? 'x' : 't';
    updatePreview();
    compute(true);
  });
  graph = new Graph($('graph'), $('readout'));
  graph3d = new Graph3D($('graph3d'), $('readout3d'));
  $('reset3d').addEventListener('click', () => graph3d.reset());
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  $('examples').addEventListener('change', e => { if (e.target.value !== '') loadExample(+e.target.value); });
  $('go').addEventListener('click', () => compute());
  document.addEventListener('focusin', e => { if (e.target.matches('input[type="text"]')) state.lastInput = e.target; });
  document.querySelector('.input-card').addEventListener('input', e => {
    if (e.target.id === 'n') { $('n-out').textContent = e.target.value; compute(false, true); return; }
    if (e.target.id === 'ftc-x') { $('ftc-x-out').textContent = e.target.value; compute(true, true); return; }
    updatePreview();
  });
  document.querySelector('.input-card').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[type="text"]')) compute(); });
  $('method').addEventListener('change', () => compute(false, true));
  $('dims').addEventListener('change', () => { syncCoords(); renderLayers(true); updatePreview(); });
  $('coords').addEventListener('change', () => { syncCoords(); renderLayers(true); updatePreview(); });
  $('m-app').addEventListener('change', () => compute(true));
  $('reverse').addEventListener('click', () => { if (!state.multi) compute(); reverseNow(); });
  $('detail-card').addEventListener('click', e => {
    if (e.target.id !== 'use-reversed' || !state.reversed) return;
    const B = state.reversed.bands[0];
    setLayers(B.layers.map(L => [L.v, simpleInput(L.lo), simpleInput(L.hi)]), 'cartesian2');
    compute();
  });
  $('keypad').addEventListener('click', e => { const b = e.target.closest('button'); if (b) insertAtCursor(b.dataset.insert, b.dataset.close || ''); });
  $('toggle-steps').addEventListener('click', () => {
    const s = $('steps');
    s.hidden = !s.hidden;
    $('steps-mode').hidden = s.hidden;
    $('toggle-steps').textContent = s.hidden ? 'Show steps' : 'Hide steps';
  });
  $('steps-mode').addEventListener('click', e => {
    const b = e.target.closest('[data-smode]');
    if (!b) return;
    state.stepMode = b.dataset.smode;
    renderSteps();
  });
  $('check-btn').addEventListener('click', runCheck);
  $('mine').addEventListener('keydown', e => { if (e.key === 'Enter') runCheck(); });
  $('answer').addEventListener('click', e => { if (e.target.id === 'reveal-answer') revealAnswer(); });
  try { $('hide-answer').checked = localStorage.getItem('hide-answer') === '1'; } catch { /* storage unavailable */ }
  $('hide-answer').addEventListener('change', e => {
    try { localStorage.setItem('hide-answer', e.target.checked ? '1' : '0'); } catch { /* storage unavailable */ }
    if (e.target.checked) { state.revealed = false; gateAnswer(); } else revealAnswer();
  });
  initQuiz();
  $('zoom-in').addEventListener('click', () => graph.zoom(1 / 1.4));
  $('zoom-out').addEventListener('click', () => graph.zoom(1.4));
  $('zoom-reset').addEventListener('click', () => graph.reset());

  $('f').value = 'x e^x';
  setMode('indef');
}

// ---------- quiz ----------

function scoreLine() {
  const s = loadScore();
  $('q-score').textContent = s.tries
    ? `Score: ${s.right} of ${s.tries} correct · streak ${s.streak} · best streak ${s.best} (saved in this browser only)`
    : 'Your score is saved in this browser only.';
}

function record(right) {
  const s = loadScore();
  s.tries++;
  if (right) { s.right++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
  saveScore(s);
  scoreLine();
}

function newProblem() {
  const topic = $('q-topic').value, level = +$('q-level').value, type = $('q-type').value;
  let p;
  try { p = makeProblem(topic, level); } catch (e) { $('q-work').innerHTML = `<p class="note">${esc(e.message)}</p>`; return; }
  state.quiz = { ...p, type, scored: false };
  setMainVar('x');
  $('q-problem').innerHTML = M(`\\int ${wrap(p.node)}\\,dx`, true);
  renderQuizWork();
  scoreLine();
}

function renderQuizWork() {
  const q = state.quiz;
  if (q.type === 'which') {
    $('q-work').innerHTML = `<p>Which technique should you use first?</p>
      <div class="choices">${Object.entries(TECHNIQUES).map(([k, name]) => `<button data-tech="${k}">${esc(name)}</button>`).join('')}</div>
      <div id="q-feedback"></div>`;
    return;
  }
  $('q-work').innerHTML = `<label class="field-label" for="q-mine">Your antiderivative (end with + C)</label>
    <div class="input-row"><input id="q-mine" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g.  (x^2 + 4)^4/4 + C"><button id="q-check" class="primary">Check</button></div>
    <div class="row-actions"><button id="q-hint">Hint (next step)</button><button id="q-solution">Show solution</button></div>
    <div id="q-feedback"></div><div id="q-steps" class="steps"></div>`;
  q.stepper = null;
}

function quizStepper() {
  const q = state.quiz;
  if (!q.stepper) q.stepper = new Stepper($('q-steps'), flattenSteps(q.solution.steps));
  return q.stepper;
}

function initQuiz() {
  $('q-new').addEventListener('click', newProblem);
  for (const id of ['q-topic', 'q-level']) $(id).addEventListener('change', newProblem);
  $('q-type').addEventListener('change', () => { if (state.quiz) { state.quiz.type = $('q-type').value; renderQuizWork(); } });
  $('quiz-card').addEventListener('click', e => {
    const q = state.quiz;
    if (!q) return;
    const tech = e.target.closest('[data-tech]');
    if (tech) {
      const right = tech.dataset.tech === q.technique;
      for (const b of $('q-work').querySelectorAll('[data-tech]')) {
        b.disabled = true;
        if (b.dataset.tech === q.technique) b.classList.add('right');
        else if (b === tech) b.classList.add('wrong');
      }
      if (!q.scored) { record(right); q.scored = true; }
      const why = flattenSteps(q.solution.steps).find(s => s.rule !== 'Constant multiple rule' && s.rule !== 'Sum rule');
      $('q-feedback').innerHTML = feedbackHTML({ level: right ? 'correct' : 'wrong', message: right ? `Correct! ${why && why.why ? why.why : ''}` : `Not this time: the best first step is ${TECHNIQUES[q.technique].toLowerCase()}. ${why && why.why ? why.why : ''}` }) +
        `<div class="row-actions"><button id="q-try">Now find the antiderivative</button><button class="primary" id="q-next">Next problem</button></div>`;
      return;
    }
    if (e.target.id === 'q-try') { q.type = 'anti'; renderQuizWork(); return; }
    if (e.target.id === 'q-next') { newProblem(); return; }
    if (e.target.id === 'q-check') {
      const r = checkAntiderivative($('q-mine').value, q.node, 'x');
      if (r.level === 'empty' || r.level === 'error') { $('q-feedback').innerHTML = feedbackHTML(r); return; }
      const right = r.level === 'correct' || r.level === 'needC';
      if (!q.scored) { record(right && !q.usedSolution); q.scored = true; }
      $('q-feedback').innerHTML = feedbackHTML(r) + (right ? '<div class="row-actions"><button class="primary" id="q-next">Next problem</button></div>' : '');
      return;
    }
    if (e.target.id === 'q-hint') { quizStepper().hint(); return; }
    if (e.target.id === 'q-solution') { q.usedSolution = true; const st = quizStepper(); st.i = st.steps.length - 1; st.shown = true; st.render(); }
  });
  $('quiz-card').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'q-mine') $('q-check').click(); });
}

init();
