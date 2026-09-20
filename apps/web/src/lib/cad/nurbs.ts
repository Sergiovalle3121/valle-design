/**
 * NURBS racional: evaluación, derivadas y partición por inserción de nudo.
 *
 * ## Por qué existe (ola 7, «las splines dejan de ser ciudadanas de segunda»)
 *
 * Dos auditorías dejaron escrito que TRIM y EXTEND rechazan la SPLINE
 * nombrándola, y que `curve-model.ts` decía explícitamente «NURBS no se
 * modela». La razón que daba ese módulo era honesta: recortar una spline por
 * su POLIGONAL teselada corta en el sitio equivocado —el punto de cruce
 * calculado sobre la aproximación no es el punto de cruce real sobre la
 * curva—, y devolver eso habría sido EXACTAMENTE la mentira silenciosa que
 * esta ola tiene prohibida. Hacían falta dos piezas para hacerlo bien:
 *
 *   1. Evaluar la curva racional (con pesos) y su DERIVADA, para afinar por
 *      Newton el parámetro exacto del cruce en vez de conformarse con el
 *      muestreo que ya basta para arco×elipse.
 *   2. Partir la curva por INSERCIÓN DE NUDO (de Boor/Boehm) para que el
 *      tramo conservado sea una NURBS EXACTA —mismos grado, misma forma,
 *      dominio recortado— y no una poligonal con el mismo número de puntos.
 *
 * Este módulo es geometría pura (sin dependencias del documento ni del
 * editor) y dimensional-agnóstica en su núcleo: `bsplineEval` y
 * `bsplineDerivativeRep` operan sobre vectores de cualquier tamaño, así que la
 * MISMA implementación sirve para evaluar la curva racional en coordenadas
 * HOMOGÉNEAS `[x·w, y·w, w]` — la manera estándar de que los pesos entren en
 * la recursión de De Boor sin ecuaciones aparte— y para derivar la curva
 * derivada, que es ELLA MISMA una B-spline de grado `p−1` con la fórmula de
 * control-points estándar. La curvatura y las intersecciones se construyen
 * encima de esas dos piezas.
 *
 * ## Partir = insertar un nudo con multiplicidad plena
 *
 * Insertar el nudo `u` con multiplicidad `p` (el grado) en un punto de la
 * curva la separa en dos NURBS independientes que se tocan justo ahí — es la
 * generalización de Boehm del De Casteljau que ya usa `bezierSplit` en
 * `spline.ts` para una Bézier cúbica suelta. La construcción es la MISMA
 * recursión de De Boor que evalúa el punto: basta con guardar las dos
 * diagonales del triángulo en vez de sólo el vértice final. `splitNurbsAt`
 * hace eso — no hay un algoritmo de inserción por separado que pueda
 * desincronizarse del de evaluación.
 */
import type { CadVec2 } from "./primitives";

/** NURBS 2D: puntos de control, pesos (mismo tamaño), grado y nudos clamped. */
export interface CadNurbsCurve {
  controlPoints: readonly CadVec2[];
  weights: readonly number[];
  degree: number;
  knots: readonly number[];
}

const EPS = 1e-12;

// ---------------------------------------------------------------------------
// B-spline genérica (cualquier dimensión): evaluación y curva derivada
// ---------------------------------------------------------------------------

/**
 * Índice del intervalo de nudos que contiene `u` (Piegl & Tiller, A2.1).
 * Robusto a nudos repetidos y a los dos extremos del dominio.
 */
function findSpan(u: number, degree: number, knots: readonly number[], n: number): number {
  if (u >= knots[n + 1]) return n;
  if (u <= knots[degree]) return degree;
  let lo = degree;
  let hi = n + 1;
  let mid = Math.floor((lo + hi) / 2);
  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) hi = mid;
    else lo = mid;
    mid = Math.floor((lo + hi) / 2);
  }
  return mid;
}

/** Punto de una B-spline de dimensión arbitraria en `u`, por De Boor. */
function bsplineEval(
  u: number,
  degree: number,
  controlPoints: readonly number[][],
  knots: readonly number[],
): number[] {
  const n = controlPoints.length - 1;
  const k = findSpan(u, degree, knots, n);
  const dim = controlPoints[0].length;
  let row: number[][] = [];
  for (let j = 0; j <= degree; j += 1) row.push([...controlPoints[j + k - degree]]);
  for (let r = 1; r <= degree; r += 1) {
    for (let j = degree; j >= r; j -= 1) {
      const left = j + k - degree;
      const denom = knots[j + 1 + k - r] - knots[left];
      const alpha = denom > EPS ? (u - knots[left]) / denom : 0;
      const a = row[j - 1];
      const b = row[j];
      const next = new Array(dim);
      for (let c = 0; c < dim; c += 1) next[c] = a[c] * (1 - alpha) + b[c] * alpha;
      row[j] = next;
    }
  }
  return row[degree];
}

interface BsplineRep {
  controlPoints: number[][];
  knots: number[];
  degree: number;
}

/**
 * Representación de la curva DERIVADA: grado `p−1`, mismos nudos sin el
 * primero ni el último, y puntos de control `Q_i = p·(P_{i+1}-P_i) /
 * (u_{i+p+1}-u_{i+1})` (Piegl & Tiller 3.3). Es ella misma una B-spline —no
 * una aproximación—, así que derivar dos veces es aplicar esto dos veces.
 * `null` cuando el grado no da para más (una constante no tiene derivada que
 * sea una B-spline de grado ≥ 0 útil aquí).
 */
function bsplineDerivativeRep(rep: BsplineRep): BsplineRep | null {
  const { controlPoints, knots, degree } = rep;
  if (degree < 1) return null;
  const n = controlPoints.length - 1;
  const dim = controlPoints[0].length;
  const next: number[][] = [];
  for (let i = 0; i <= n - 1; i += 1) {
    const denom = knots[i + degree + 1] - knots[i + 1];
    const scale = denom > EPS ? degree / denom : 0;
    const row = new Array(dim);
    for (let c = 0; c < dim; c += 1) row[c] = (controlPoints[i + 1][c] - controlPoints[i][c]) * scale;
    next.push(row);
  }
  return { controlPoints: next, knots: knots.slice(1, knots.length - 1), degree: degree - 1 };
}

// ---------------------------------------------------------------------------
// Racional: homogéneas [x·w, y·w, w]
// ---------------------------------------------------------------------------

function homogeneous(curve: CadNurbsCurve): number[][] {
  return curve.controlPoints.map((p, i) => {
    const w = curve.weights[i] ?? 1;
    return [p.x * w, p.y * w, w];
  });
}

/** Dominio válido en `u` (el de los nudos clamped): `[knots[p], knots[len-1-p]]`. */
export function nurbsDomain(curve: CadNurbsCurve): { min: number; max: number } {
  const p = curve.degree;
  return { min: curve.knots[p], max: curve.knots[curve.knots.length - 1 - p] };
}

/** `t ∈ [0,1]` de esta curva → parámetro `u` real sobre sus nudos. */
export function nurbsParamToKnot(curve: CadNurbsCurve, t: number): number {
  const { min, max } = nurbsDomain(curve);
  return min + t * (max - min);
}

/** Punto racional en `t ∈ [0,1]`. */
export function nurbsPointAt(curve: CadNurbsCurve, t: number): CadVec2 {
  const u = nurbsParamToKnot(curve, t);
  const [x, y, w] = bsplineEval(u, curve.degree, homogeneous(curve), curve.knots);
  const denom = Math.abs(w) > EPS ? w : 1;
  return { x: x / denom, y: y / denom };
}

/**
 * Punto Y derivada primera (respecto a `t ∈ [0,1]`) en un solo paso —evita
 * evaluar la curva dos veces cuando Newton necesita las dos cosas—.
 *
 * Racional: `C = N/W`, `C' = (N' - C·W')/W` (regla del cociente aplicada a la
 * curva homogénea). `N'` y `W'` salen de la curva DERIVADA homogénea, que es
 * una B-spline de grado `p−1` — no una diferencia finita.
 */
export function nurbsPointAndTangent(curve: CadNurbsCurve, t: number): { point: CadVec2; tangent: CadVec2 } {
  const { min, max } = nurbsDomain(curve);
  const span = max - min || 1;
  const u = min + t * span;
  const home = homogeneous(curve);
  const [x, y, w] = bsplineEval(u, curve.degree, home, curve.knots);
  const denom = Math.abs(w) > EPS ? w : 1;
  const point = { x: x / denom, y: y / denom };
  const deriv1 = bsplineDerivativeRep({ controlPoints: home, knots: [...curve.knots], degree: curve.degree });
  if (!deriv1) return { point, tangent: { x: 0, y: 0 } };
  const [x1, y1, w1] = bsplineEval(u, deriv1.degree, deriv1.controlPoints, deriv1.knots);
  // C'(u) = (N' - C·W')/W, y luego regla de la cadena u→t: ×(max-min).
  const tangent = {
    x: ((x1 - point.x * w1) / denom) * span,
    y: ((y1 - point.y * w1) / denom) * span,
  };
  return { point, tangent };
}

/**
 * Curvatura con signo en `t`: `κ = (x'y'' − y'x'') / (x'²+y'²)^{3/2}`.
 *
 * Necesita la SEGUNDA derivada racional, `C'' = (N'' − 2·C'·W'' … )`
 * (Piegl & Tiller 4.9, ecuación de dos términos con `Aₖ`/`wₖ`): se deriva la
 * curva homogénea DOS veces (cada vez, otra B-spline exacta de grado menor) y
 * se combina con la regla del cociente de segundo orden. Sirve para
 * comprobar que partir la curva no cambia su forma —el uso que le da esta
 * ola es precisamente medir esa invariancia en los specs—, no para dibujar.
 */
export function nurbsCurvatureAt(curve: CadNurbsCurve, t: number): number {
  const { min, max } = nurbsDomain(curve);
  const span = max - min || 1;
  const u = min + t * span;
  const home = homogeneous(curve);
  const rep0: BsplineRep = { controlPoints: home, knots: [...curve.knots], degree: curve.degree };
  const [x, y, w] = bsplineEval(u, rep0.degree, rep0.controlPoints, rep0.knots);
  const W = Math.abs(w) > EPS ? w : 1;
  const C = { x: x / W, y: y / W };

  const rep1 = bsplineDerivativeRep(rep0);
  if (!rep1) return 0;
  const [x1raw, y1raw, w1raw] = bsplineEval(u, rep1.degree, rep1.controlPoints, rep1.knots);
  // Derivadas respecto a `u` (sin la regla de la cadena todavía: la curvatura
  // es un cociente donde el factor de la cadena se CANCELA entre numerador y
  // denominador, así que se puede trabajar directamente en `u`).
  const Cu = { x: (x1raw - C.x * w1raw) / W, y: (y1raw - C.y * w1raw) / W };

  const rep2 = bsplineDerivativeRep(rep1);
  if (!rep2) return 0;
  const [x2raw, y2raw, w2raw] = bsplineEval(u, rep2.degree, rep2.controlPoints, rep2.knots);
  const Cuu = {
    x: (x2raw - 2 * Cu.x * w1raw - C.x * w2raw) / W,
    y: (y2raw - 2 * Cu.y * w1raw - C.y * w2raw) / W,
  };

  const speed2 = Cu.x * Cu.x + Cu.y * Cu.y;
  if (speed2 <= EPS) return 0;
  const cross = Cu.x * Cuu.y - Cu.y * Cuu.x;
  return cross / Math.pow(speed2, 1.5);
}

// ---------------------------------------------------------------------------
// Partición por inserción de nudo (Boehm, vía el triángulo de De Boor)
// ---------------------------------------------------------------------------

/**
 * Parte la curva en `t ∈ (0,1)` en dos NURBS EXACTAS del mismo grado.
 *
 * Es el mismo triángulo que `bsplineEval` —los `p+1` puntos activos del tramo
 * que contiene `u`, combinados `p` veces— pero en vez de quedarse sólo con el
 * vértice final se guardan las DOS diagonales: la que arranca en la primera
 * fila (borde IZQUIERDO del triángulo, la curva de `[0,u]`) y la que llega al
 * vértice por la fila de arriba en cada paso (borde DERECHO, la curva de
 * `[u,1]`). Es exactamente lo que hace Boehm insertando el nudo `p` veces de
 * golpe: aquí sale de una sola pasada porque la recursión ya visita esos
 * puntos al evaluar.
 */
export function splitNurbsAt(curve: CadNurbsCurve, t: number): [CadNurbsCurve, CadNurbsCurve] {
  const p = curve.degree;
  const { min, max } = nurbsDomain(curve);
  const u = min + t * (max - min);
  const home = homogeneous(curve);
  const knots = curve.knots;
  const n = home.length - 1;
  const k = findSpan(u, p, knots, n);

  let row: number[][] = [];
  for (let j = 0; j <= p; j += 1) row.push([...home[j + k - p]]);
  const leftDiag: number[][] = [row[0]]; // leftDiag[0] = P_{k-p}
  const rightDiagRev: number[][] = [row[p]]; // valor de d[p] ANTES de iterar (r=0)
  for (let r = 1; r <= p; r += 1) {
    for (let j = p; j >= r; j -= 1) {
      const left = j + k - p;
      const denom = knots[j + 1 + k - r] - knots[left];
      const alpha = denom > EPS ? (u - knots[left]) / denom : 0;
      const a = row[j - 1];
      const b = row[j];
      row[j] = [a[0] * (1 - alpha) + b[0] * alpha, a[1] * (1 - alpha) + b[1] * alpha, a[2] * (1 - alpha) + b[2] * alpha];
      if (j === r) leftDiag.push(row[j]); // último calculado de esta fila = diagonal izquierda
    }
    rightDiagRev.push(row[p]); // primero calculado de esta fila (j=p) = diagonal derecha
  }
  // leftDiag: [d0..dp] = [P_{k-p}, d1^(1), …, dp^(p)]  (dp^(p) es el punto de corte)
  // rightDiagRev: [d[p] en r=0, r=1, …, r=p] = [P_k, …, dp^(p)] → se invierte.
  const rightDiag = [...rightDiagRev].reverse(); // [dp^(p), …, P_k]

  const leftHome = [...home.slice(0, k - p), ...leftDiag];
  const rightHome = [...rightDiag, ...home.slice(k + 1)];

  const leftKnots = [...knots.slice(0, k + 1), ...Array(p + 1).fill(u)];
  const rightKnots = [...Array(p + 1).fill(u), ...knots.slice(k + 1)];

  return [fromHomogeneous(leftHome, p, leftKnots), fromHomogeneous(rightHome, p, rightKnots)];
}

function fromHomogeneous(home: readonly number[][], degree: number, knots: readonly number[]): CadNurbsCurve {
  const controlPoints: CadVec2[] = [];
  const weights: number[] = [];
  for (const [x, y, w] of home) {
    const denom = Math.abs(w) > EPS ? w : 1;
    controlPoints.push({ x: x / denom, y: y / denom });
    weights.push(w);
  }
  return { controlPoints, weights, degree, knots: [...knots] };
}

/**
 * El tramo `[t0,t1]` (0 ≤ t0 < t1 ≤ 1) como NURBS propia, partiendo dos veces
 * (o una, o ninguna, en los extremos). El tramo devuelto reparametriza su
 * PROPIO `t ∈ [0,1]` sobre `[t0,t1]` del original.
 */
export function nurbsSubcurve(curve: CadNurbsCurve, t0: number, t1: number): CadNurbsCurve {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const from = clamp(t0);
  const to = clamp(t1);
  if (to - from <= 1e-9) throw new Error("nurbsSubcurve: el tramo pedido está vacío.");
  if (from <= 1e-9 && to >= 1 - 1e-9) return curve;
  if (from <= 1e-9) return splitNurbsAt(curve, to)[0];
  if (to >= 1 - 1e-9) return splitNurbsAt(curve, from)[1];
  const [, right] = splitNurbsAt(curve, from);
  // `to` estaba expresado sobre el dominio ORIGINAL; `right` empieza en `from`,
  // así que se reexpresa como fracción de lo que quedaba por delante.
  return splitNurbsAt(right, (to - from) / (1 - from))[0];
}

// ---------------------------------------------------------------------------
// Cruce con una recta, afinado por Newton usando la tangente racional
// ---------------------------------------------------------------------------

/**
 * Parámetros `t` donde `f(S(t)) = 0` —cero de una función implícita
 * cualquiera evaluada sobre la curva racional—, afinados por Newton.
 *
 * Se MUESTREA para LOCALIZAR cada intervalo donde `f∘S` cambia de signo (o
 * roza el cero sin cambiar: tangencia, igual que `curve-model.ts` ya hace
 * para arco×elipse) y se AFINA cada uno por Newton sobre `g(t)=f(S(t))`,
 * `g'(t) = ∇f(S(t))·S'(t)` — la regla de la cadena, con la tangente RACIONAL
 * de `nurbsPointAndTangent` como la pieza que antes faltaba. El muestreo sólo
 * localiza el intervalo; el valor final es el punto fijo de Newton, nunca el
 * punto de la malla más cercano. `gradF` puede ser exacto (una recta tiene
 * gradiente constante, ver `nurbsLineIntersections`) o una diferencia finita
 * de `f` —válido aquí porque quien la usa vuelve a refinar con Newton hasta
 * la tolerancia, así que un gradiente aproximado sólo cuesta una iteración
 * más, nunca precisión final—.
 */
export function nurbsImplicitCrossings(
  curve: CadNurbsCurve,
  f: (p: CadVec2) => number,
  gradF: (p: CadVec2) => CadVec2,
  samples = 200,
): number[] {
  const g = (t: number) => f(nurbsPointAt(curve, t));
  const scale = Math.max(curveExtent(curve), 1);
  const tol = scale * 1e-10;
  const steps = Math.max(8, Math.floor(samples));
  const values = Array.from({ length: steps + 1 }, (_, i) => g(i / steps));
  const roots: number[] = [];

  const withDerivative = (t: number) => {
    const { point, tangent } = nurbsPointAndTangent(curve, t);
    const grad = gradF(point);
    return { value: f(point), slope: grad.x * tangent.x + grad.y * tangent.y };
  };

  const newtonRefine = (loT: number, hiT: number): number | null => {
    let t = (loT + hiT) / 2;
    for (let iter = 0; iter < 30; iter += 1) {
      const { value, slope } = withDerivative(t);
      if (Math.abs(value) <= tol) return t;
      if (Math.abs(slope) < 1e-14) break;
      const next = t - value / slope;
      // Newton amortiguado: si se sale del intervalo que lo acotaba, se
      // recorta a bisección en vez de dejar que diverja.
      if (!(next > loT - 1e-6 && next < hiT + 1e-6)) {
        const mid = (loT + hiT) / 2;
        const midVal = g(mid);
        if (Math.sign(midVal) === Math.sign(g(loT))) loT = mid;
        else hiT = mid;
        t = (loT + hiT) / 2;
        continue;
      }
      t = next;
    }
    const { value } = withDerivative(t);
    return Math.abs(value) <= tol * 100 ? t : null;
  };

  for (let i = 0; i < steps; i += 1) {
    const lo = i / steps;
    const hi = (i + 1) / steps;
    const vLo = values[i];
    const vHi = values[i + 1];
    if (Math.abs(vLo) > tol && Math.abs(vHi) > tol && vLo * vHi < 0) {
      const root = newtonRefine(lo, hi);
      if (root !== null) roots.push(root);
      continue;
    }
    // Tangencia: mínimo local de |g| que de verdad toca el cero.
    if (i > 0 && Math.abs(vLo) <= Math.abs(values[i - 1]) && Math.abs(vLo) <= Math.abs(vHi)) {
      const root = newtonRefine(Math.max(0, lo - 1 / steps), hi);
      if (root !== null && !roots.some((seen) => Math.abs(seen - root) < 1e-7)) roots.push(root);
    }
  }
  return roots;
}

/**
 * Cruces con la recta `(a,b)` —recta COMPLETA, sin acotar a un segmento;
 * quien llama decide si acepta `t` fuera de `[0,1]`—. Caso particular de
 * `nurbsImplicitCrossings` con la distancia con signo a la recta, cuyo
 * gradiente es CONSTANTE y por tanto exacto (no una diferencia finita).
 */
export function nurbsLineIntersections(curve: CadNurbsCurve, a: CadVec2, b: CadVec2, samples = 200): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < EPS) return [];
  const nx = dy / length;
  const ny = -dx / length;
  const f = (p: CadVec2) => (p.x - a.x) * nx + (p.y - a.y) * ny;
  const grad = { x: nx, y: ny };
  return nurbsImplicitCrossings(curve, f, () => grad, samples);
}

/** Diagonal de la caja de los puntos de control: escala para tolerancias. */
function curveExtent(curve: CadNurbsCurve): number {
  const xs = curve.controlPoints.map((p) => p.x);
  const ys = curve.controlPoints.map((p) => p.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/**
 * Proyección de un punto sobre la curva: el `t` que minimiza la distancia.
 *
 * Newton sobre `h(t) = (S(t)-point)·S'(t)` (el producto escalar se anula en
 * el pie de la perpendicular), con `h'(t) ≈ |S'(t)|²` —se omite el término de
 * la segunda derivada, que sólo importa cerca de un punto de curvatura muy
 * alta; a cambio no hace falta la curva segunda derivada para esto—.
 * Arranca del mejor de `samples` puntos muestreados, así que no depende de
 * una semilla razonable por parte de quien llama.
 */
export function nurbsClosestParam(curve: CadNurbsCurve, point: CadVec2, samples = 64): number {
  const steps = Math.max(4, Math.floor(samples));
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = nurbsPointAt(curve, t);
    const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  let t = bestT;
  for (let iter = 0; iter < 20; iter += 1) {
    const { point: s, tangent } = nurbsPointAndTangent(curve, t);
    const dx = s.x - point.x;
    const dy = s.y - point.y;
    const speed2 = tangent.x * tangent.x + tangent.y * tangent.y;
    if (speed2 <= EPS) break;
    const h = dx * tangent.x + dy * tangent.y;
    const next = t - h / speed2;
    if (!Number.isFinite(next)) break;
    t = Math.max(0, Math.min(1, next));
  }
  return t;
}

/**
 * Gradiente de `f` por diferencia central. Sirve para reutilizar
 * `nurbsImplicitCrossings` contra un arco o una elipse —curvas con forma
 * implícita pero cuyo gradiente no vale la pena derivar a mano— sin perder
 * precisión: Newton vuelve a refinar hasta la tolerancia, así que el único
 * coste de un gradiente aproximado es una iteración más, nunca el resultado
 * final. Para una recta el gradiente es EXACTO y constante (ver
 * `nurbsLineIntersections`), que es el camino que de verdad importa para
 * recortar una spline.
 */
export function numericGradient(f: (p: CadVec2) => number, point: CadVec2, scale: number): CadVec2 {
  const h = Math.max(scale, 1) * 1e-6;
  return {
    x: (f({ x: point.x + h, y: point.y }) - f({ x: point.x - h, y: point.y })) / (2 * h),
    y: (f({ x: point.x, y: point.y + h }) - f({ x: point.x, y: point.y - h })) / (2 * h),
  };
}

// ---------------------------------------------------------------------------
// Nudos: sintetizar/validar (misma regla que el export DXF y `curve-tessellate.ts`)
// ---------------------------------------------------------------------------

/** Nudos clamped uniformes: el vector que espera una NURBS de grado `degree`. */
export function synthesizeClampedKnots(controlCount: number, degree: number): number[] {
  const knots: number[] = [];
  const spans = controlCount - degree;
  for (let i = 0; i <= degree; i += 1) knots.push(0);
  for (let i = 1; i < spans; i += 1) knots.push(i / spans);
  for (let i = 0; i <= degree; i += 1) knots.push(1);
  return knots;
}

/**
 * ¿Es este vector de nudos USABLE? Mismo criterio que `curve-tessellate.ts`
 * (donde vive el comentario largo): finito, no decreciente y con dominio de
 * longitud positiva. Un vector del tamaño correcto pero roto (`NaN`,
 * constante) colapsaría la curva en un punto sin un solo error.
 */
export function usableKnotVector(knots: readonly number[], degree: number): boolean {
  for (let i = 0; i < knots.length; i += 1) {
    if (!Number.isFinite(knots[i])) return false;
    if (i > 0 && knots[i] < knots[i - 1]) return false;
  }
  return knots[knots.length - 1 - degree] > knots[degree];
}

/** Nudos a usar: los dados si tienen el tamaño correcto y son usables; si no, clamped sintéticos. */
export function resolveKnots(
  knots: readonly number[] | undefined,
  controlCount: number,
  degree: number,
): number[] {
  const expected = controlCount + degree + 1;
  if (knots && knots.length === expected && usableKnotVector(knots, degree)) return [...knots];
  return synthesizeClampedKnots(controlCount, degree);
}
