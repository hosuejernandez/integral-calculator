# Integral Calculator

A companion to the [Derivative Calculator](https://hosuejernandez.github.io/derivative-calculator/), for AP Calculus and Calc 3 students.

## Tabs

**AP Calculus**
- **Indefinite.** Step-by-step antiderivatives. The rules are: power, constant multiple, sum, a table of standard integrals, u-substitution (with the rewritten integral in u shown), integration by parts (including "parts twice, then solve for the integral"), partial fractions, trig identities, √(a² − x²) and sec³x. Every answer is checked by differentiating it.
- **Definite.** The Fundamental Theorem of Calculus, with signed area shaded on the graph.
  - Improper integrals are written as limits and judged convergent or divergent.
  - When there is no elementary antiderivative, it gives a numeric value instead.
- **Riemann sums.** Left, right, midpoint and trapezoid sums with a slider for n, a table of values, and the error compared to the exact value.
- **Area between curves.** It finds the crossings, decides which curve is on top on each piece, and integrates top − bottom.
- **Volume.**
  - Disk/washer and shell methods about the x- or y-axis or any line y = k or x = k, integrating in x or y.
  - Known cross-sections: squares, semicircles, triangles and rectangles.
  - A 3D picture of the solid with one slice highlighted.
- **FTC & average.**
  - d/dx of ∫ from g(x) to h(x) of f(t) dt with the chain rule, and an area graph you can slide.
  - Average value of a function, with the Mean Value Theorem point(s).

**Calc 3**
- **Multiple integrals.**
  - Double and triple integrals in Cartesian, polar, cylindrical and spherical coordinates, with the Jacobian shown. Integrands typed in x, y, z are converted automatically.
  - It can compute the integral itself, area or volume, mass, center of mass, or average value.
  - For Cartesian double integrals, "Reverse the order" rewrites the bounds.
  - Pictures: a 3D view and the region of integration.
- **Line integrals.**
  - Scalar ∫ f ds and work ∫ F·dr along a parametrized curve.
  - A test for whether the field is conservative, and if so its potential function and the Fundamental Theorem for line integrals.
  - Green's theorem for closed curves.
  - The curve is drawn in the vector field.

**Practice**
- **Quiz.** Random u-substitution, by-parts, partial-fraction and trig problems at three levels. Students either pick the technique or find the antiderivative, with hints that reveal one step at a time. The score is kept in the student's browser.

## Study tools (every tab)
- **Show steps.** Shows the whole solution at once, or one step at a time, with a plain-language reason for each rule.
- **Check your own answer.** Accepts any correct form or constant. It reminds students about + C and gives hints for chain-rule factor and sign mistakes.
- **"Hide the answer until I try it myself."** Keeps the result covered until the student checks an answer or asks to see it.

## Embedding

```html
<iframe src="https://hosuejernandez.github.io/integral-calculator/" width="100%" height="900" style="border:0"></iframe>
```

## Development

```bash
python3 -m http.server 8766
node tests/run.mjs
```

Before each commit, run `node tools/stamp.mjs`. It version-stamps every JavaScript and CSS file, so students' browsers never mix old and new files after an update.

The math engine (`expr.js`, `simplify.js`, `solve.js`, `diff.js`) is shared with the Derivative Calculator. Copy any change to these files to the other app as well.
