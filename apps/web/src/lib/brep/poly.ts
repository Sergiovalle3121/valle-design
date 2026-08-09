/**
 * Raíces reales de polinomios de grado ≤ 4.
 *
 * Parece un módulo de utilidad y en realidad es el corazón de las
 * intersecciones analíticas del kernel: recta contra cilindro es una cuadrática,
 * contra esfera otra, contra cono otra, y contra TORO es una cuártica. Sin un
 * solucionador que se porte bien en los casos degenerados, la intersección
 * recta-toro se convierte en un generador de puntos fantasma.
 *
 * Tres decisiones que cambian el resultado:
 *
 *   1. La cuadrática NO usa `(-b ± √Δ)/2a`. Cuando `b² ≫ 4ac` una de las dos
 *      raíces sale de restar dos números casi iguales y pierde casi todos sus
 *      dígitos. Se usa la forma estable de Numerical Recipes con
 *      `q = -(b + sgn(b)√Δ)/2`.
 *   2. La cúbica usa la solución TRIGONOMÉTRICA cuando hay tres raíces reales.
 *      Cardano con raíces cúbicas de complejos da el mismo resultado en teoría y
 *      basura en coma flotante.
 *   3. TODA raíz se pule con Newton sobre el polinomio original antes de
 *      devolverse. La cuártica de Ferrari pasa por una cúbica resolvente, y ese
 *      rodeo pierde precisión; dos pasos de Newton la recuperan y además
 *      corrigen las raíces dobles que salen desplazadas.
 *
 * Convenio de coeficientes: DESCENDENTE. `[a, b, c]` es `a·x² + b·x + c`.
 */

/** Evalúa por Horner. */
export function polyEval(coeffs: readonly number[], x: number): number {
  let acc = 0;
  for (const c of coeffs) acc = acc * x + c;
  return acc;
}

/** Derivada, también en orden descendente. */
export function polyDerivative(coeffs: readonly number[]): number[] {
  const degree = coeffs.length - 1;
  if (degree <= 0) return [0];
  const out: number[] = [];
  for (let i = 0; i < degree; i += 1) out.push(coeffs[i] * (degree - i));
  return out;
}

/** Quita ceros iniciales: un polinomio cuyo coeficiente líder se anuló baja de grado. */
function deflateLeading(coeffs: readonly number[], tol: number): number[] {
  let start = 0;
  while (start < coeffs.length - 1 && Math.abs(coeffs[start]) <= tol) start += 1;
  return coeffs.slice(start);
}

/**
 * Pule una raíz con Newton sobre el polinomio original.
 *
 * Se limita a 12 iteraciones y sólo acepta el paso si REDUCE |p(x)|. Un Newton
 * que acepta cualquier paso puede alejarse de la raíz cuando la derivada es
 * casi cero, que es justamente el caso de la raíz doble donde más falta hace.
 */
export function newtonPolish(coeffs: readonly number[], x0: number, iterations = 12): number {
  const derivative = polyDerivative(coeffs);
  let x = x0;
  let best = x0;
  let bestValue = Math.abs(polyEval(coeffs, x0));
  for (let i = 0; i < iterations; i += 1) {
    const f = polyEval(coeffs, x);
    const df = polyEval(derivative, x);
    if (df === 0 || !Number.isFinite(df)) break;
    const next = x - f / df;
    if (!Number.isFinite(next)) break;
    const value = Math.abs(polyEval(coeffs, next));
    if (value < bestValue) {
      bestValue = value;
      best = next;
    }
    if (Math.abs(next - x) <= Number.EPSILON * Math.max(1, Math.abs(x))) {
      x = next;
      break;
    }
    x = next;
  }
  return best;
}

/** `a·x + b = 0`. */
function linearRoots(a: number, b: number): number[] {
  if (a === 0) return [];
  return [-b / a];
}

/** `a·x² + b·x + c = 0`, en la forma numéricamente estable. */
export function quadraticRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return linearRoots(b, c);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  if (disc === 0) return [-b / (2 * a)];
  const sqrtDisc = Math.sqrt(disc);
  const q = -0.5 * (b + (b >= 0 ? sqrtDisc : -sqrtDisc));
  const roots = [q / a];
  if (q !== 0) roots.push(c / q);
  else roots.push(0);
  return roots.sort((x, y) => x - y);
}

/**
 * `a·x³ + b·x² + c·x + d = 0`.
 *
 * Se deprime a `t³ + p·t + q` y se elige rama según el discriminante: tres
 * raíces reales → forma trigonométrica de Viète; una real → Cardano con
 * cbrt real.
 */
export function cubicRoots(a: number, b: number, c: number, d: number): number[] {
  if (a === 0) return quadraticRoots(b, c, d);
  const bn = b / a;
  const cn = c / a;
  const dn = d / a;
  const shift = bn / 3;
  const p = cn - (bn * bn) / 3;
  const q = (2 * bn * bn * bn) / 27 - (bn * cn) / 3 + dn;
  const half = q / 2;
  const third = p / 3;
  const disc = half * half + third * third * third;
  let roots: number[];
  if (disc > 0) {
    const sqrtDisc = Math.sqrt(disc);
    const u = Math.cbrt(-half + sqrtDisc);
    const v = Math.cbrt(-half - sqrtDisc);
    roots = [u + v];
  } else if (disc === 0) {
    const u = Math.cbrt(-half);
    roots = [2 * u, -u];
  } else {
    const r = Math.sqrt(-third * third * third);
    const phi = Math.acos(Math.max(-1, Math.min(1, -half / r)));
    const m = 2 * Math.sqrt(-third);
    roots = [
      m * Math.cos(phi / 3),
      m * Math.cos((phi + 2 * Math.PI) / 3),
      m * Math.cos((phi + 4 * Math.PI) / 3),
    ];
  }
  const original = [a, b, c, d];
  return roots.map((t) => newtonPolish(original, t - shift)).sort((x, y) => x - y);
}

/**
 * `a·x⁴ + b·x³ + c·x² + d·x + e = 0` por el método de Ferrari.
 *
 * Deprime a `y⁴ + p·y² + q·y + r`, resuelve la cúbica resolvente y factoriza en
 * dos cuadráticas. El caso `q ≈ 0` (bicuadrática) se trata aparte porque la
 * resolvente se vuelve singular justo ahí — y ése es el caso de la recta que
 * corta un toro por su plano de simetría, es decir, el caso COMÚN, no el raro.
 */
export function quarticRoots(a: number, b: number, c: number, d: number, e: number): number[] {
  if (a === 0) return cubicRoots(b, c, d, e);
  const bn = b / a;
  const cn = c / a;
  const dn = d / a;
  const en = e / a;
  const shift = bn / 4;
  const p = cn - (3 * bn * bn) / 8;
  const q = dn - (bn * cn) / 2 + (bn * bn * bn) / 8;
  const r = en - (bn * dn) / 4 + (bn * bn * cn) / 16 - (3 * bn * bn * bn * bn) / 256;
  const original = [a, b, c, d, e];
  const scale = Math.max(1, Math.abs(p), Math.abs(q), Math.abs(r));

  let depressed: number[];
  if (Math.abs(q) <= 1e-14 * scale) {
    // Bicuadrática: y⁴ + p·y² + r = 0.
    depressed = [];
    for (const y2 of quadraticRoots(1, p, r)) {
      if (y2 < 0) continue;
      const root = Math.sqrt(y2);
      depressed.push(root, -root);
    }
  } else {
    // Resolvente cúbica: z³ - p·z² - 4r·z + (4pr - q²) = 0.
    const resolvent = cubicRoots(1, -p, -4 * r, 4 * p * r - q * q);
    let z = resolvent[resolvent.length - 1] ?? p;
    for (const candidate of resolvent) {
      if (candidate - p > 0) {
        z = candidate;
        break;
      }
    }
    const inner = z - p;
    if (inner <= 0) {
      // Sin rama real utilizable: se cae a una búsqueda numérica acotada.
      return numericRealRoots(original);
    }
    const s = Math.sqrt(inner);
    const t1 = z / 2 - q / (2 * s);
    const t2 = z / 2 + q / (2 * s);
    depressed = [...quadraticRoots(1, s, t1), ...quadraticRoots(1, -s, t2)];
  }
  const polished = depressed.map((y) => newtonPolish(original, y - shift));
  return dedupeSorted(polished, 1e-9 * Math.max(1, Math.abs(shift)));
}

/**
 * Red de seguridad: muestreo + bisección + Newton sobre un intervalo acotado por
 * la cota de Cauchy. Sólo se usa cuando la forma cerrada se queda sin rama real,
 * y garantiza que el kernel nunca devuelve "cero intersecciones" por un fallo
 * algebraico en lugar de por geometría.
 */
export function numericRealRoots(coeffs: readonly number[], samples = 512): number[] {
  const reduced = deflateLeading(coeffs, 0);
  if (reduced.length <= 1) return [];
  const lead = reduced[0];
  let bound = 1;
  for (let i = 1; i < reduced.length; i += 1) {
    bound = Math.max(bound, 1 + Math.abs(reduced[i] / lead));
  }
  const roots: number[] = [];
  let prevX = -bound;
  let prevY = polyEval(reduced, prevX);
  for (let i = 1; i <= samples; i += 1) {
    const x = -bound + (2 * bound * i) / samples;
    const y = polyEval(reduced, x);
    if (prevY === 0) roots.push(prevX);
    else if (prevY * y < 0) {
      let lo = prevX;
      let hi = x;
      for (let k = 0; k < 80; k += 1) {
        const mid = (lo + hi) / 2;
        const value = polyEval(reduced, mid);
        if (polyEval(reduced, lo) * value <= 0) hi = mid;
        else lo = mid;
      }
      roots.push(newtonPolish(reduced, (lo + hi) / 2));
    }
    prevX = x;
    prevY = y;
  }
  if (Math.abs(polyEval(reduced, bound)) === 0) roots.push(bound);
  return dedupeSorted(roots, 1e-9 * bound);
}

/** Ordena y colapsa raíces que están a menos de `tol`: una raíz doble es UNA raíz. */
export function dedupeSorted(values: readonly number[], tol: number): number[] {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  const out: number[] = [];
  for (const value of sorted) {
    if (out.length === 0 || Math.abs(value - out[out.length - 1]) > tol) out.push(value);
  }
  return out;
}

/**
 * Raíces reales de un polinomio de grado arbitrario ≤ 4 en orden descendente.
 * Por encima de grado 4 cae al método numérico, que sigue siendo correcto
 * aunque más lento.
 */
export function polyRealRoots(coeffs: readonly number[], tol = 1e-14): number[] {
  const reduced = deflateLeading(coeffs, tol);
  switch (reduced.length) {
    case 0:
    case 1:
      return [];
    case 2:
      return linearRoots(reduced[0], reduced[1]);
    case 3:
      return quadraticRoots(reduced[0], reduced[1], reduced[2]);
    case 4:
      return cubicRoots(reduced[0], reduced[1], reduced[2], reduced[3]);
    case 5:
      return quarticRoots(reduced[0], reduced[1], reduced[2], reduced[3], reduced[4]);
    default:
      return numericRealRoots(reduced);
  }
}
