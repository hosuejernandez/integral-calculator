// Engine tests:  node tests/run.mjs
import { parse, toTex, compile } from '../js/expr.js';
import { simplify, setMainVar } from '../js/simplify.js';
import { integrate } from '../js/integrate.js';
import { definite, riemann, areaBetween, iterated } from '../js/calculus.js';

let pass = 0, fail = 0;
function check(name, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}\n   got:  ${got}\n   want: ${want}`);
}
const P = s => simplify(parse(s));
const close = (a, b) => Math.abs(a - b) < 1e-6 * (1 + Math.abs(b));

// antiderivatives that must be found (integrate() itself checks each by differentiating)
const MUST = ['x^2', 'ax^2 + bx + c', '1/x', 'sqrt(x)', 'e^(3x)', 'sin(2x)', 'sec^2 x', 'x e^x', 'x^2 e^x', 'ln x',
  'x ln x', 'e^x sin x', '2x cos(x^2)', 'x e^(x^2)', 'ln(x)/x', '(2x+1)/(x^2+x)', '1/(x^2+1)', '1/(x^2+4)',
  '1/(x^2-1)', '(x^3+1)/(x^2-1)', '1/(x(x+1)^2)', '1/sqrt(1-x^2)', 'sin^2 x', 'sin^3 x', 'sin^2 x cos^3 x',
  'tan x', 'tan^2 x', 'x sqrt(x+1)', 'arctan x', 'sec x tan x', '2^x', '(x+1)^5', 'x/(x^2+1)', 'x^2 sin x',
  'cos^4 x', '1/(x^2+2x+5)', 'e^x/(1+e^x)', 'sqrt(9-x^2)', 'sec^3 x', '1/(x ln x)', 'ln(x)^2'];
for (const src of MUST) {
  setMainVar('x');
  const r = integrate(P(src), 'x');
  check(`integrate ${src}`, !!r, true);
}
setMainVar('x');
check('power rule', toTex(integrate(P('x^2'), 'x').result), '\\frac{x^{3}}{3}');
check('constants', toTex(integrate(P('ax^2+bx+c'), 'x').result), '\\frac{a x^{3}}{3} + \\frac{b x^{2}}{2} + c x');
check('no elementary antiderivative', integrate(P('e^(x^2)'), 'x'), null);

// definite and improper
const B = s => (s === 'inf' ? { node: null, value: Infinity } : s === '-inf' ? { node: null, value: -Infinity } : (n => ({ node: n, value: compile(n)({}) }))(P(s)));
const D = (f, a, b) => definite(P(f), 'x', B(a), B(b));
check('ftc x^2', toTex(D('x^2', '0', '3').exact), '9');
check('ftc sin', toTex(D('sin x', '0', 'pi').exact), '2');
check('ftc 1/x', toTex(D('1/x', '1', 'e').exact), '1');
check('improper 1/x^2', D('1/x^2', '1', 'inf').value, 1);
check('improper 1/x diverges', D('1/x', '1', 'inf').diverges, true);
check('improper 1/sqrt x', D('1/sqrt(x)', '0', '1').value, 2);
check('asymptote inside', D('1/x^2', '-1', '1').diverges, true);
check('arctan over R', close(D('1/(1+x^2)', '-inf', 'inf').value, Math.PI), true);
check('gaussian numeric', close(D('e^(-x^2)', '-inf', 'inf').value, Math.sqrt(Math.PI)), true);

// Riemann sums
check('left sum', riemann(x => x * x, 0, 2, 4, 'left').sum, 1.75);
check('right sum', riemann(x => x * x, 0, 2, 4, 'right').sum, 3.75);
check('trapezoid', riemann(x => x * x, 0, 2, 4, 'trapezoid').sum, 2.75);

// area between curves
check('area x, x^2', toTex(areaBetween(P('x'), P('x^2'), 'x', null).exactTotal), '\\frac{1}{6}');
check('area x^3, x', toTex(areaBetween(P('x^3'), P('x'), 'x', null).exactTotal), '\\frac{1}{2}');
check('area sin cos', toTex(areaBetween(P('sin x'), P('cos x'), 'x', [B('0'), B('2pi')]).exactTotal), '4 \\sqrt{2}');

// iterated integrals
const L = rows => rows.map(([v, lo, hi]) => ({ v, lo: P(lo), hi: P(hi) }));
check('triple xyz', toTex(iterated(P('x y z'), L([['z', '0', '1'], ['y', '0', 'x'], ['x', '0', '2']])).exact), '1');
check('tetrahedron', toTex(iterated(P('1'), L([['z', '0', '1 - x - y'], ['y', '0', '1 - x'], ['x', '0', '1']])).exact), '\\frac{1}{6}');
check("quarter disk numeric", Math.abs(iterated(P('x^2 + y^2'), L([['y', '0', 'sqrt(1 - x^2)'], ['x', '0', '1']])).value - Math.PI / 8) < 1e-5, true);

// study tools
const { checkAntiderivative, checkValue } = await import('../js/learn.js');
const { makeProblem } = await import('../js/quiz.js');
setMainVar('x');
const xe = P('x e^x');
check('check correct', checkAntiderivative('x e^x - e^x + C', xe, 'x').level, 'correct');
check('check +5', checkAntiderivative('x e^x - e^x + 5 + C', xe, 'x').level, 'correct');
check('check missing C', checkAntiderivative('x e^x - e^x', xe, 'x').level, 'needC');
check('check factor', checkAntiderivative('2(x e^x - e^x) + C', xe, 'x').level, 'factor');
check('check sign', checkAntiderivative('e^x - x e^x + C', xe, 'x').level, 'sign');
check('check wrong', checkAntiderivative('x^2 e^x + C', xe, 'x').level, 'wrong');
check('value exact', checkValue('9', { value: 9 }).level, 'correct');
check('value pi', checkValue('3.1416', { value: Math.PI }).level, 'correct');
check('value wrong', checkValue('3', { value: Math.PI }).level, 'wrong');
check('value diverges', checkValue('diverges', { value: NaN, diverges: true }).level, 'correct');
let solvable = 0;
for (const t of ['usub', 'parts', 'pf', 'trig', 'mixed']) for (const L of [1, 2, 3]) for (let i = 0; i < 8; i++) {
  try { if (makeProblem(t, L).solution) solvable++; } catch { /* counted as missing */ }
}
check('quiz problems all solvable', solvable, 120);

// volumes
const { volume } = await import('../js/volume.js');
const { num: N } = await import('../js/expr.js');
const VOL = o => { setMainVar(o.v || 'x'); const r = volume({ v: 'x', g: null, bounds: null, method: 'auto', ...o }); return r.exact ? toTex(r.exact) : r.total; };
check('disk sqrt x', VOL({ f: P('sqrt(x)'), bounds: [B('0'), B('4')], kind: 'revolve', axis: { dir: 'h', k: N(0) } }), '8 \\pi');
check('washer', VOL({ f: P('x'), g: P('x^2'), kind: 'revolve', axis: { dir: 'h', k: N(0) } }), '\\frac{2 \\pi}{15}');
check('shell y-axis', VOL({ f: P('x'), g: P('x^2'), kind: 'revolve', axis: { dir: 'v', k: N(0) } }), '\\frac{\\pi}{6}');
check('washer about y=2', VOL({ f: P('x'), g: P('x^2'), kind: 'revolve', axis: { dir: 'h', k: P('2') } }), '\\frac{8 \\pi}{15}');
check('shell about x=-1', VOL({ f: P('x'), g: P('x^2'), kind: 'revolve', axis: { dir: 'v', k: P('-1') } }), '\\frac{\\pi}{2}');
check('sphere', VOL({ f: P('sqrt(4 - x^2)'), bounds: [B('-2'), B('2')], kind: 'revolve', axis: { dir: 'h', k: N(0) } }), '\\frac{32 \\pi}{3}');
check('squares', VOL({ f: P('sqrt(x)'), bounds: [B('0'), B('4')], kind: 'cross', shape: 'square' }), '8');
check('disk in y', VOL({ v: 'y', f: P('sqrt(y)'), bounds: [B('0'), B('4')], kind: 'revolve', axis: { dir: 'v', k: N(0) } }), '8 \\pi');
let threw = false;
try { VOL({ f: P('x'), g: P('x^2'), kind: 'revolve', axis: { dir: 'h', k: P('1/2') } }); } catch { threw = true; }
check('axis through region rejected', threw, true);

// coordinate systems, applications, reversing the order
const MU = await import('../js/multi.js');
const { mul: MUL } = await import('../js/expr.js');
const { pretty: PR } = await import('../js/simplify.js');
const inSys = (f, sysName, rows) => { const sys = MU.SYSTEMS[sysName]; const conv = MU.convert(P(f), sys); return toTex(iterated(PR(sys.jac ? MUL([conv, sys.jac]) : conv), L(rows)).exact); };
check('polar quarter disk', inSys('x^2 + y^2', 'polar', [['r', '0', '1'], ['theta', '0', 'pi/2']]), '\\frac{\\pi}{8}');
check('spherical ball', inSys('1', 'spherical', [['rho', '0', '1'], ['phi', '0', 'pi'], ['theta', '0', '2pi']]), '\\frac{4 \\pi}{3}');
check('cylinder', inSys('1', 'cylindrical', [['z', '0', '2'], ['r', '0', '1'], ['theta', '0', '2pi']]), '2 \\pi');
check('spherical x^2+y^2+z^2', inSys('x^2 + y^2 + z^2', 'spherical', [['rho', '0', '1'], ['phi', '0', 'pi'], ['theta', '0', '2pi']]), '\\frac{4 \\pi}{5}');
const cm = MU.applications('center', P('1'), L([['y', '0', 'x'], ['x', '0', '1']]), MU.SYSTEMS.cartesian2);
check('centroid of triangle', cm.moments.map(m => m.res.value / cm.mass.value).map(v => v.toFixed(6)).join(','), '0.666667,0.333333');
for (const rows of [[['y', 'x^2', 'x'], ['x', '0', '1']], [['y', '0', '1 - x^2'], ['x', '-1', '1']], [['y', '0', 'ln(x)'], ['x', '1', 'e']]]) {
  const r = MU.reverseOrder(L(rows));
  const tot = r.bands ? r.bands.reduce((t, B) => t + iterated(P('1'), B.layers).value, 0) : NaN;
  check(`reverse ${rows[0][1]}..${rows[0][2]}`, Math.abs(tot - iterated(P('1'), L(rows)).value) < 1e-6, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
