// Page wiring for the integral calculator.
import { parse, toTex, freeSyms, compile, symTex } from './expr.js';
import { simplify, setMainVar } from './simplify.js';
import { integrate } from './integrate.js';
import { definite, riemann, areaBetween, iterated, boundTex, niceTex, fnOf } from './calculus.js';
import { Graph } from './graph.js';
import { fmt, recognize } from './solve.js';

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
  multi: [
    ['Triple: box-like region', { f: 'x y z', layers: [['z', '0', '1'], ['y', '0', 'x'], ['x', '0', '2']] }],
    ['Triple: volume of a tetrahedron', { f: '1', layers: [['z', '0', '1 - x - y'], ['y', '0', '1 - x'], ['x', '0', '1']] }],
    ['Double: rectangle', { f: 'x^2 y', layers: [['y', '0', '3'], ['x', '1', '2']] }],
    ['Double: triangle', { f: 'x + y', layers: [['y', '0', 'x'], ['x', '0', '1']] }],
    ['Double: quarter disk (numeric)', { f: 'x^2 + y^2', layers: [['y', '0', 'sqrt(1 - x^2)'], ['x', '0', '1']] }],
  ],
};

const state = { mode: 'indef', lastInput: null, steps: null };
let graph;

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

function showSteps(html) {
  state.steps = html;
  $('toggle-steps').hidden = !html;
  $('steps').innerHTML = html || '';
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
  $('detail-card').hidden = true;
  if (!r) {
    setAnswer('Indefinite integral', `<p>${esc(NO_ANTI)}</p><p class="answer-note">Switch to <b>Definite</b> to get a numeric value over an interval.</p>`);
    showSteps(null);
  } else {
    setAnswer('Indefinite integral', M(`\\int ${wrap(f)}\\,d${vt} = ${toTex(r.result)} + C`, true) +
      `<p class="answer-note">✓ Checked: the derivative of the answer equals the integrand.</p>`);
    showSteps(stepTree(r.steps));
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
  const integral = `\\int_{${boundShow(A)}}^{${boundShow(B)}} ${wrap(f)}\\,d${vt}`;
  showSteps(r.anti ? stepTree(r.anti.steps) : null);

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
  const exact = definite(f, v, A, B);
  const Sn = `${m.sym}_{${n}}`;
  setAnswer(`${m.name} Riemann sum`, M(`${Sn} = ${valueTex(rs.sum)}`, true) +
    (isFinite(exact.value) ? `<p class="answer-note">Exact integral: ${M(exact.exact ? exactTex(exact.exact, exact.value) : valueTex(exact.value))}, error ${M(`${Sn} - \\int = ${fmt(rs.sum - exact.value)}`)}</p>` : ''));
  showSteps(exact.anti ? stepTree(exact.anti.steps) : null);

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
  setAnswer('Area between curves', M(`\\text{Area} = ${r.exactTotal ? exactTex(r.exactTotal, r.total) : valueTex(r.total)}`, true));
  showSteps(r.H ? stepTree(r.H.steps) : null);

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

function renderLayers() {
  const dims = +$('dims').value;
  const box = $('layers');
  const old = [...box.querySelectorAll('.layer')].map(row => [...row.querySelectorAll('input')].map(i => i.value));
  const defaults = dims === 3 ? [['z', '0', '1'], ['y', '0', '1'], ['x', '0', '1']] : [['y', '0', '1'], ['x', '0', '1']];
  const names = dims === 3 ? ['inner', 'middle', 'outer'] : ['inner', 'outer'];
  box.innerHTML = defaults.map((d, i) => {
    const vals = old.length === dims ? old[i] : d;
    return `<div class="layer"><span class="tag neither">${names[i]}</span>
      <label>d<input class="var" type="text" value="${esc(vals[0])}" data-k="v" autocomplete="off"></label>
      <label>from <input type="text" value="${esc(vals[1])}" data-k="lo" autocomplete="off"></label>
      <label>to <input type="text" value="${esc(vals[2])}" data-k="hi" autocomplete="off"></label></div>`;
  }).join('');
}

function setLayers(list) {
  $('dims').value = String(list.length);
  $('layers').innerHTML = '';
  renderLayers();
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
  layers.forEach((L, i) => {
    const outer = vars.slice(i + 1);
    for (const s of [...freeSyms(L.lo), ...freeSyms(L.hi)]) {
      if (!outer.includes(s)) throw new Error(`The bounds for d${L.v} can only use outer variables (${outer.join(', ') || 'none'}), not ${s}.`);
    }
  });
  return layers;
}

function runMulti() {
  const f = readExpr('f', 'the integrand');
  const layers = readLayers();
  const extra = [...freeSyms(f)].filter(s => !layers.some(L => L.v === s));
  if (extra.length) throw new Error(`The integrand uses ${extra[0]}, which is not one of the integration variables.`);
  setMainVar(layers[layers.length - 1].v);
  const r = iterated(f, layers);
  const ints = [...layers].reverse().map(L => `\\int_{${toTex(L.lo)}}^{${toTex(L.hi)}}`).join('');
  const ds = layers.map(L => `d${symTex(L.v)}`).join('\\,');
  const full = `${ints} ${wrap(f)}\\,${ds}`;
  setAnswer(layers.length === 3 ? 'Triple integral' : 'Double integral',
    M(`${full} = ${r.exact ? exactTex(r.exact, r.value) : valueTex(r.value)}`, true) +
    (r.exact ? '' : `<p class="answer-note">Numeric value (Gauss–Legendre quadrature).${closeTo(r.value)}</p>`));
  showSteps(null);
  const body = r.steps.map((s, i) => {
    const others = layers.filter(L => L.v !== s.v).map(L => symTex(L.v));
    const hold = others.length ? `Treat ${others.map(o => M(o)).join(' and ')} as constant${others.length > 1 ? 's' : ''}.` : '';
    const title = `Integrate with respect to ${M(symTex(s.v))}`;
    if (s.failed) return stage(i + 1, title, `<p>${hold}</p><div class="math-line">${M(`\\int_{${toTex(s.lo)}}^{${toTex(s.hi)}} ${wrap(s.integrand)}\\,d${symTex(s.v)}`, true)}</div><p>${esc(NO_ANTI)} The rest is computed numerically.</p>`);
    return stage(i + 1, title,
      `<p>${hold}</p>
       <div class="math-line">${M(`\\int_{${toTex(s.lo)}}^{${toTex(s.hi)}} ${wrap(s.integrand)}\\,d${symTex(s.v)} = \\Big[ ${toTex(s.F)} \\Big]_{${symTex(s.v)} = ${toTex(s.lo)}}^{${toTex(s.hi)}}`, true)}</div>
       <div class="math-line">${M(`= \\left(${toTex(s.upper)}\\right) - \\left(${toTex(s.lower)}\\right) = ${toTex(s.result)}`, true)}</div>
       <details class="mini"><summary>Steps for the antiderivative</summary><div class="steps">${stepTree(s.antiSteps)}</div></details>`);
  }).join('');
  $('detail-card').innerHTML = `<h2>Integrate from the inside out</h2>${r.mismatch ? '<p class="note">The exact steps did not match a numeric check, so the numeric value is shown.</p>' : ''}${body}`;
  $('detail-card').hidden = false;
  $('graph-card').hidden = true;
}

function showGraph(scene, legend) {
  $('graph-card').hidden = false;
  $('legend').innerHTML = legend;
  graph.set(scene);
}

// ---------- mode switching, preview, events ----------

const RUN = { indef: runIndefinite, def: runDefinite, riemann: runRiemann, area: runArea, multi: runMulti };

function compute() {
  $('error').hidden = true;
  try { RUN[state.mode](); } catch (e) {
    console.error(e);
    $('error').textContent = e.message || String(e);
    $('error').hidden = false;
    ['answer-card', 'detail-card', 'graph-card'].forEach(id => { $(id).hidden = true; });
  }
}

function setMode(mode) {
  state.mode = mode;
  for (const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
  $('g-row').hidden = mode !== 'area';
  $('bounds-row').hidden = !['def', 'riemann', 'area'].includes(mode);
  $('riemann-row').hidden = mode !== 'riemann';
  $('multi-row').hidden = mode !== 'multi';
  $('wrt-row').hidden = mode === 'multi';
  $('area-hint').hidden = mode !== 'area';
  $('f-label').textContent = { indef: 'Integrand', def: 'Integrand', riemann: 'Function', area: 'Curves', multi: 'Integrand' }[mode];
  $('f').placeholder = mode === 'area' ? 'first curve f(x), e.g.  x' : mode === 'multi' ? 'e.g.  x y z' : 'e.g.  x e^x    sin^2 x    1/(x^2 + 1)';
  $('examples').innerHTML = '<option value="">Choose an example…</option>' +
    EXAMPLES[mode].map(([name, ex], i) => `<option value="${i}">${esc(name)}: ${esc(ex.f)}${ex.g ? ` and ${esc(ex.g)}` : ''}${ex.a ? ` on [${esc(ex.a)}, ${esc(ex.b)}]` : ''}</option>`).join('');
  if (mode === 'multi' && !$('layers').children.length) renderLayers();
  ['answer-card', 'detail-card', 'graph-card'].forEach(id => { $(id).hidden = true; });
  $('error').hidden = true;
  updatePreview();
  if ($('f').value.trim()) compute();
}

function loadExample(i) {
  const ex = EXAMPLES[state.mode][i][1];
  $('f').value = ex.f;
  $('g').value = ex.g || '';
  $('a').value = ex.a || '';
  $('b').value = ex.b || '';
  if (ex.layers) setLayers(ex.layers);
  $('wrt').value = 'x';
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
    else if (mode === 'area') {
      let g = '?';
      try { g = toTex(readExpr('g', 'g')); } catch { /* not typed yet */ }
      tex = `\\text{area between } y = ${toTex(f)} \\text{ and } y = ${g}`;
    } else {
      const rows = [...$('layers').querySelectorAll('.layer')].map(row => [...row.querySelectorAll('input')].map(i => i.value.trim()));
      const t = s => { try { return toTex(simplify(parse(s))); } catch { return '?'; } };
      tex = `${[...rows].reverse().map(r => `\\int_{${t(r[1])}}^{${t(r[2])}}`).join('')} ${wrap(f)}\\,${rows.map(r => `d${r[0] || '?'}`).join('\\,')}`;
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

function init() {
  graph = new Graph($('graph'), $('readout'));
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  $('examples').addEventListener('change', e => { if (e.target.value !== '') loadExample(+e.target.value); });
  $('go').addEventListener('click', compute);
  document.addEventListener('focusin', e => { if (e.target.matches('input[type="text"]')) state.lastInput = e.target; });
  document.querySelector('.input-card').addEventListener('input', e => {
    if (e.target.id === 'n') { $('n-out').textContent = e.target.value; compute(); return; }
    updatePreview();
  });
  document.querySelector('.input-card').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input[type="text"]')) compute(); });
  $('method').addEventListener('change', compute);
  $('dims').addEventListener('change', () => { renderLayers(); updatePreview(); });
  $('keypad').addEventListener('click', e => { const b = e.target.closest('button'); if (b) insertAtCursor(b.dataset.insert, b.dataset.close || ''); });
  $('toggle-steps').addEventListener('click', () => {
    const s = $('steps');
    s.hidden = !s.hidden;
    $('toggle-steps').textContent = s.hidden ? 'Show steps' : 'Hide steps';
  });
  $('zoom-in').addEventListener('click', () => graph.zoom(1 / 1.4));
  $('zoom-out').addEventListener('click', () => graph.zoom(1.4));
  $('zoom-reset').addEventListener('click', () => graph.reset());

  $('f').value = 'x e^x';
  setMode('indef');
}

init();
