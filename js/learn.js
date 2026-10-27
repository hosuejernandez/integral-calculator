// Study tools: reveal-one-step-at-a-time, and checking a student's own answer.
import { parse, toTex, compile, freeSyms, symTex } from './expr.js';
import { simplify } from './simplify.js';
import { differentiate } from './diff.js';

const M = (tex, display = false) => katex.renderToString(tex, { throwOnError: false, displayMode: display });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wrap = n => (n.type === 'add' ? `\\left(${toTex(n)}\\right)` : toTex(n));

// Steps in the order a student would do them: the big decision first, then the pieces.
export function flattenSteps(root) {
  const out = [];
  (function walk(s) {
    out.push(s);
    s.children.forEach(walk);
  })(root);
  return out;
}

// Renders steps into `el` one at a time. Each step asks a question first; "Reveal" answers it.
export class Stepper {
  constructor(el, steps, { onChange } = {}) {
    this.el = el;
    this.steps = steps;
    this.i = 0;
    this.shown = false;
    this.onChange = onChange;
    el.onclick = e => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'reveal') this.shown = true;
      else if (a === 'next') { this.i = Math.min(this.i + 1, this.steps.length - 1); this.shown = false; }
      else if (a === 'back') { if (this.shown) this.shown = false; else if (this.i > 0) { this.i--; this.shown = true; } }
      else if (a === 'restart') { this.i = 0; this.shown = false; }
      else if (a === 'all') { this.i = this.steps.length - 1; this.shown = true; }
      this.render();
      if (this.onChange) this.onChange(this);
    };
    this.render();
  }

  get done() { return this.i === this.steps.length - 1 && this.shown; }

  // reveal one more piece; used by the quiz's Hint button
  hint() {
    if (!this.shown) this.shown = true;
    else if (this.i < this.steps.length - 1) { this.i++; this.shown = false; }
    this.render();
  }

  render() {
    const n = this.steps.length;
    const body = this.steps.slice(0, this.i + 1).map((s, k) => {
      const integral = M(`\\int ${wrap(s.expr)}\\,d${symTex(s.v)}`);
      const open = k < this.i || this.shown;
      const head = `<div class="q"><span class="num">${k + 1}</span>What do you do with ${integral}?</div>`;
      if (!open) return `<div class="one-step current">${head}<button class="primary" data-act="reveal">Reveal</button></div>`;
      return `<div class="one-step${k === this.i ? ' current' : ''}">${head}
        <div class="a"><span class="rule">${esc(s.rule)}</span>${s.why ? esc(s.why) : ''}</div>
        ${s.note ? `<div class="formula">${M(s.note)}</div>` : ''}
        ${s.formula ? `<div class="formula">Rule: ${M(s.formula)}</div>` : ''}
        <div class="formula">${M(`\\int ${wrap(s.expr)}\\,d${symTex(s.v)} = ${toTex(s.result)}`)}</div></div>`;
    }).join('');
    const nav = `<div class="row-actions">
      <button data-act="back" ${this.i === 0 && !this.shown ? 'disabled' : ''}>Back</button>
      ${this.shown && this.i < n - 1 ? '<button class="primary" data-act="next">Next step</button>' : ''}
      <button data-act="all">Show all</button><button class="ghost" data-act="restart">Start over</button>
      <span class="answer-note">Step ${this.i + 1} of ${n}</span></div>`;
    this.el.innerHTML = body + nav;
  }
}

// ---------- checking answers ----------

const SAMPLE = [0.37, 0.71, 1.13, 1.57, 2.21, -0.63, -1.29, 2.93, 0.11, -2.4];

// Is `src` an antiderivative of f (with respect to v)?
export function checkAntiderivative(src, f, v) {
  let text = src.trim();
  if (!text) return { level: 'empty', message: 'Type your antiderivative first.' };
  const hasC = /[+-]\s*[Cc]\s*$/.test(text);
  if (hasC) text = text.replace(/[+-]\s*[Cc]\s*$/, '');
  let S;
  try {
    S = simplify(parse(text));
    if (S.type === 'eq') return { level: 'error', message: 'Type just the antiderivative, without "=".' };
  } catch (e) { return { level: 'error', message: `I couldn't read that: ${e.message}` }; }
  const allowed = new Set([...freeSyms(f), v]);
  const extra = [...freeSyms(S)].filter(s => !allowed.has(s));
  if (extra.length) return { level: 'error', message: `Your answer uses the letter ${extra[0]}, which isn't in the problem. (Write the constant of integration as C at the end.)` };

  let dS;
  try { dS = differentiate(S, v).result; } catch { return { level: 'error', message: 'I could not differentiate that expression.' }; }
  const F = compile(f), D = compile(dS);
  const others = {};
  for (const s of freeSyms(f)) if (s !== v) others[s] = 1.37 + s.charCodeAt(0) % 7 * 0.29;
  const ratios = [];
  let matches = 0, tested = 0;
  for (const x of SAMPLE) {
    const env = { ...others, [v]: x };
    const a = F(env), b = D(env);
    if (!isFinite(a) || !isFinite(b)) continue;
    tested++;
    if (Math.abs(a - b) <= 1e-6 * (1 + Math.abs(a))) matches++;
    if (Math.abs(a) > 1e-6) ratios.push(b / a);
  }
  const dTex = toTex(dS);
  if (tested >= 2 && matches === tested) {
    return hasC
      ? { level: 'correct', message: 'Correct! Its derivative is exactly the integrand.' }
      : { level: 'needC', message: 'Correct, but don\'t forget the + C. Every antiderivative of this function differs by a constant.' };
  }
  const k = ratios[0];
  if (ratios.length >= 2 && ratios.every(r => Math.abs(r - k) < 1e-6 * (1 + Math.abs(k)))) {
    if (Math.abs(k + 1) < 1e-6) return { level: 'sign', message: 'Close: your answer is off by a minus sign. Its derivative is the negative of the integrand.', dTex };
    const kt = Math.abs(k - Math.round(k)) < 1e-9 ? `${Math.round(k)}` : fracText(k);
    return { level: 'factor', message: `Close: the derivative of your answer is ${kt} times the integrand. Check the constant you get from the chain rule (dividing by the inside's derivative).`, dTex };
  }
  return { level: 'wrong', message: 'Not quite. Differentiate your answer to check it: the derivative should equal the integrand, but you get', dTex };
}

function fracText(k) {
  for (let q = 2; q <= 24; q++) { const p = Math.round(k * q); if (Math.abs(p / q - k) < 1e-9) return `${p}/${q}`; }
  return `${Math.round(k * 1000) / 1000}`;
}

// Is `src` the same expression as `target` (a function of the letters in it)?
export function checkExpression(src, target) {
  const text = src.trim();
  if (!text) return { level: 'empty', message: 'Type your answer first.' };
  let S;
  try { S = simplify(parse(text)); } catch (e) { return { level: 'error', message: `I couldn't read that: ${e.message}` }; }
  if (S.type === 'eq') return { level: 'error', message: 'Type just the expression, without "=".' };
  const letters = new Set(freeSyms(target));
  const extra = [...freeSyms(S)].filter(l => !letters.has(l));
  if (extra.length) return { level: 'error', message: `Your answer uses the letter ${extra[0]}, which shouldn't appear in the answer.` };
  const A = compile(target), B = compile(S);
  let same = 0, tested = 0, neg = 0;
  for (const x of SAMPLE) {
    const env = {};
    for (const l of letters) env[l] = x + l.charCodeAt(0) % 3 * 0.17;
    const a = A(env), b = B(env);
    if (!isFinite(a) || !isFinite(b)) continue;
    tested++;
    if (Math.abs(a - b) <= 1e-6 * (1 + Math.abs(a))) same++;
    if (Math.abs(a + b) <= 1e-6 * (1 + Math.abs(a))) neg++;
  }
  if (tested >= 2 && same === tested) return { level: 'correct', message: 'Correct!' };
  if (tested >= 2 && neg === tested) return { level: 'sign', message: 'Close: your answer has the wrong sign. Remember the lower bound contributes with a minus sign.' };
  return { level: 'wrong', message: 'Not quite. Did you multiply by the derivative of the bound (chain rule)?' };
}

// Is `src` the right number? target = { value, diverges }
export function checkValue(src, target) {
  const text = src.trim();
  if (!text) return { level: 'empty', message: 'Type your answer first.' };
  if (/diverg|dne|does not exist|^[+-]?\s*(inf|infinity|∞)$/i.test(text)) {
    return target.diverges
      ? { level: 'correct', message: 'Correct! The integral diverges.' }
      : { level: 'wrong', message: 'Not quite: this one has a finite value.' };
  }
  let v;
  try {
    const n = simplify(parse(text));
    if (freeSyms(n).size) return { level: 'error', message: 'Your answer should be a number (you can use π, e, √, fractions).' };
    v = compile(n)({});
  } catch (e) { return { level: 'error', message: `I couldn't read that: ${e.message}` }; }
  if (target.diverges) return { level: 'wrong', message: 'Not quite: this integral actually diverges.' };
  const t = target.value, err = Math.abs(v - t);
  if (err <= 1e-9 * (1 + Math.abs(t))) return { level: 'correct', message: 'Correct!' };
  if (err <= 5e-3 * (1 + Math.abs(t)) && err <= 0.051) return { level: 'correct', message: 'Correct to the decimals you gave.' };
  if (Math.abs(v + t) <= 1e-6 * (1 + Math.abs(t))) return { level: 'sign', message: 'Close: your answer has the wrong sign. Check the order F(b) − F(a), or which curve is on top.' };
  return { level: 'wrong', message: 'Not quite. Compare your setup with the steps.' };
}

export function feedbackHTML(r) {
  const cls = r.level === 'correct' ? 'ok' : r.level === 'needC' || r.level === 'sign' || r.level === 'factor' ? 'close' : 'bad';
  const icon = cls === 'ok' ? '✓' : cls === 'close' ? '≈' : '✗';
  return `<div class="feedback ${cls}"><b>${icon}</b> ${esc(r.message)}${r.dTex ? ` ${M(r.dTex)}` : ''}</div>`;
}
