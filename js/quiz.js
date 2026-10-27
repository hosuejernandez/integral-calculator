// Practice problems built from templates with random whole-number parameters. Every problem
// is solved by the integrator before it is shown, so students only get solvable problems.
import { parse } from './expr.js';
import { simplify, setMainVar } from './simplify.js';
import { integrate } from './integrate.js';

export const TECHNIQUES = {
  usub: 'u-substitution',
  parts: 'Integration by parts',
  pf: 'Partial fractions',
  trig: 'Trig identities',
};

const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const nz = (lo, hi) => { let k; do k = ri(lo, hi); while (k === 0); return k; };
const signed = k => (k < 0 ? `- ${-k}` : `+ ${k}`);
const signedX = k => (k === 1 ? '+ x' : k === -1 ? '- x' : `${signed(k)}x`);
const coef = k => (k === 1 ? '' : k === -1 ? '-' : `${k}`);

// [level, template] — level 1 easy, 2 medium, 3 hard
const TEMPLATES = {
  usub: [
    [1, () => { const c = ri(1, 9), n = ri(2, 5); return `2x(x^2 ${signed(c)})^${n}`; }],
    [1, () => `cos(x) sin(x)^${ri(2, 5)}`],
    [1, () => { const a = ri(2, 5); return `x e^(${a}x^2)`; }],
    [2, () => { const b = ri(1, 6), c = ri(1, 9); return `(2x ${signed(b)})/(x^2 ${signedX(b)} ${signed(c)})`; }],
    [2, () => `ln(x)^${ri(2, 4)}/x`],
    [2, () => `e^x/(e^x ${signed(ri(1, 9))})`],
    [2, () => `x/sqrt(x^2 ${signed(ri(1, 16))})`],
    [3, () => { const k = ri(2, 4); return `x^${k - 1} cos(x^${k})`; }],
    [3, () => `x sqrt(x ${signed(ri(1, 5))})`],
    [3, () => `sec(x)^2 tan(x)^${ri(2, 4)}`],
  ],
  parts: [
    [1, () => `x e^(${coef(ri(1, 4))}x)`.replace('e^(x)', 'e^x')],
    [1, () => `x cos(${coef(ri(1, 3))}x)`.replace('cos(x)', 'cos x')],
    [1, () => `x sin(${coef(ri(1, 3))}x)`.replace('sin(x)', 'sin x')],
    [2, () => `x^${ri(1, 3)} ln(x)`],
    [2, () => pick(['ln(x)', 'arctan(x)', 'ln(x)^2'])],
    [2, () => `x^2 e^(${coef(nz(-2, 2))}x)`],
    [3, () => `e^(${coef(ri(1, 2))}x) ${pick(['sin', 'cos'])}(${coef(ri(1, 3))}x)`],
    [3, () => `x^2 ${pick(['sin', 'cos'])}(x)`],
  ],
  pf: [
    [1, () => { const r = nz(-6, 6); return `1/(x(x ${signed(r)}))`; }],
    [1, () => { const m = ri(1, 6); return `${2 * m}/(x^2 - ${m * m})`; }],
    [2, () => {
      let r1 = nz(-5, 5), r2;
      do r2 = nz(-5, 5); while (r2 === r1);
      let p, q;
      do { p = nz(-4, 4); q = ri(-9, 9); } while (p * r1 + q === 0 || p * r2 + q === 0);
      return `(${p}x ${signed(q)})/((x ${signed(-r1)})(x ${signed(-r2)}))`;
    }],
    [2, () => { const r = nz(-4, 4); return `(x ${signed(ri(1, 6))})/(x^2 ${signedX(r)})`; }],
    [3, () => `1/(x^2 (x ${signed(nz(-4, 4))}))`],
    [3, () => { const a = ri(1, 3); return `1/(x(x^2 + ${a * a}))`; }],
    [3, () => { const r = nz(-3, 3); return `(x^2 + 1)/((x ${signed(-r)})(x ${signed(r + (r > 0 ? 1 : -1))}))`; }],
  ],
  trig: [
    [1, () => `sin(${coef(ri(1, 4))}x) cos(${coef(ri(1, 1))}x)`.replace(/\(1x\)/g, '(x)')],
    [1, () => `${pick(['sin', 'cos'])}(x)^2`],
    [2, () => `${pick(['sin', 'cos'])}(x)^3`],
    [2, () => `tan(x)^2`],
    [2, () => `sin(x)^${pick([3, 5])} cos(x)^2`],
    [3, () => `sin(x)^2 cos(x)^2`],
    [3, () => `cos(x)^4`],
    [3, () => `tan(x)^3`],
  ],
};

// level: 1, 2 or 3 — problems at or below the level, weighted toward it
export function makeProblem(topic, level) {
  setMainVar('x');
  for (let attempt = 0; attempt < 25; attempt++) {
    const t = topic === 'mixed' ? pick(Object.keys(TEMPLATES)) : topic;
    const pool = TEMPLATES[t].filter(([l]) => l <= level);
    const top = pool.filter(([l]) => l === level);
    const [, make] = pick(Math.random() < 0.6 && top.length ? top : pool);
    const src = make();
    let node;
    try { node = simplify(parse(src)); } catch { continue; }
    const sol = integrate(node, 'x');
    if (!sol) continue;
    return { src, node, technique: t, solution: sol };
  }
  throw new Error('Could not make a problem; try again.');
}

// Score kept only in this browser
const KEY = 'integral-quiz-score';
export function loadScore() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { right: 0, tries: 0, streak: 0, best: 0 }; } catch { return { right: 0, tries: 0, streak: 0, best: 0 }; }
}
export function saveScore(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
