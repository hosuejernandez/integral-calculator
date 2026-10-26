# Integral Calculator

A companion to the [Derivative Calculator](https://hosuejernandez.github.io/derivative-calculator/) for calculus students. It has five modes:

- **Indefinite.** Step-by-step antiderivatives. The rules are: power, constant multiple, sum, a table of standard integrals, linear and u-substitution, integration by parts (including the "parts twice, then solve for the integral" case), partial fractions, power-reducing and Pythagorean identities, √(a² − x²) and sec³x. Every answer is checked by differentiating it.
- **Definite.** The Fundamental Theorem of Calculus, shown as [F(x)]ₐᵇ = F(b) − F(a), with signed area shaded on the graph.
  - Improper integrals (infinite bounds or vertical asymptotes) are written as limits and judged convergent or divergent.
  - When there is no elementary antiderivative, it gives an accurate numeric value instead.
- **Riemann sums.** Left, right, midpoint and trapezoid sums with a slider for n. The rectangles are drawn on the graph, alongside a table and the error compared to the exact value.
- **Area between curves.** It finds where the curves cross, decides which is on top on each piece, and integrates top − bottom, shading the region.
- **Double & triple integrals.** Iterated integrals, worked from the inside out with steps. Inner bounds may use outer variables, and there is a numeric fallback.

There is no build step. It is plain HTML, CSS and JavaScript modules, with KaTeX from a CDN. The math engine (`expr.js`, `simplify.js`, `solve.js`, `diff.js`) is shared with the Derivative Calculator.

## Embedding

```html
<iframe src="https://hosuejernandez.github.io/integral-calculator/" width="100%" height="900" style="border:0"></iframe>
```

## Running locally and testing

```bash
python3 -m http.server 8766
node tests/run.mjs
```
