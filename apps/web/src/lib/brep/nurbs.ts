/**
 * NURBS: bases B-spline, curvas y superficies racionales en R³.
 *
 * El CAD 2D ya tiene splines (`lib/cad/spline.ts`, Bézier cúbica y Catmull-Rom)
 * y no valen aquí: son 2D, no racionales y no llegan a la derivada segunda. Un
 * kernel B-rep necesita las tres cosas —tercera dimensión, pesos y curvatura—
 * porque la derivada segunda es lo que da el radio de curvatura con el que se
 * decide el teselado por tolerancia de cuerda y lo que hace converger la
 * proyección de punto a superficie.
 *
 * Todo sigue la notación de Piegl & Tiller, *The NURBS Book*: `findSpan`
 * (A2.1), `basisFunsDerivatives` (A2.3), y el paso de derivadas homogéneas a
 * racionales (A4.4). Se citan los algoritmos porque quien tenga que depurar
 * esto necesita poder contrastarlo con la fuente, no adivinar.
 *
 * Los nudos son CLAMPED (multiplicidad `grado+1` en los extremos): así la curva
 * pasa por el primer y el último punto de control, que es lo que espera
 * cualquiera que venga del mundo CAD.
 */
import { v3Add, v3Cross, v3Normalize, v3Scale, v3Sub, type Vec3 } from "./vec3";

export interface NurbsCurve {
  kind: "nurbs-curve";
  degree: number;
  /** `controlPoints.length + degree + 1` nudos. */
  knots: number[];
  controlPoints: Vec3[];
  /** Un peso por punto de control. Todos a 1 ⇒ B-spline no racional. */
  weights: number[];
}

export interface NurbsSurface {
  kind: "nurbs";
  degreeU: number;
  degreeV: number;
  knotsU: number[];
  knotsV: number[];
  countU: number;
  countV: number;
  /** Malla de control en orden fila-mayor: índice `i * countV + j`, `i` recorre U. */
  controlPoints: Vec3[];
  weights: number[];
}

/**
 * Índice del tramo de nudos que contiene `u` (A2.1).
 *
 * El caso `u === knots[n+1]` (el extremo derecho del dominio) se trata aparte:
 * la búsqueda binaria pura devolvería un tramo vacío y la evaluación saldría
 * NaN justo en el borde de la superficie, que es donde se cosen las caras.
 */
export function findSpan(count: number, degree: number, u: number, knots: readonly number[]): number {
  const n = count - 1;
  if (u >= knots[n + 1]) return n;
  if (u <= knots[degree]) return degree;
  let low = degree;
  let high = n + 1;
  let mid = Math.floor((low + high) / 2);
  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) high = mid;
    else low = mid;
    mid = Math.floor((low + high) / 2);
  }
  return mid;
}

/**
 * Funciones base no nulas y sus derivadas hasta orden `order` (A2.3).
 * Devuelve `ders[k][j]` = derivada k-ésima de la base `span-degree+j`.
 */
export function basisFunsDerivatives(
  span: number,
  u: number,
  degree: number,
  order: number,
  knots: readonly number[],
): number[][] {
  const ndu: number[][] = Array.from({ length: degree + 1 }, () => new Array<number>(degree + 1).fill(0));
  const left = new Array<number>(degree + 1).fill(0);
  const right = new Array<number>(degree + 1).fill(0);
  ndu[0][0] = 1;
  for (let j = 1; j <= degree; j += 1) {
    left[j] = u - knots[span + 1 - j];
    right[j] = knots[span + j] - u;
    let saved = 0;
    for (let r = 0; r < j; r += 1) {
      ndu[j][r] = right[r + 1] + left[j - r];
      const temp = ndu[j][r] === 0 ? 0 : ndu[r][j - 1] / ndu[j][r];
      ndu[r][j] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    ndu[j][j] = saved;
  }
  const ders: number[][] = Array.from({ length: order + 1 }, () => new Array<number>(degree + 1).fill(0));
  for (let j = 0; j <= degree; j += 1) ders[0][j] = ndu[j][degree];
  const a: number[][] = [new Array<number>(degree + 1).fill(0), new Array<number>(degree + 1).fill(0)];
  for (let r = 0; r <= degree; r += 1) {
    let s1 = 0;
    let s2 = 1;
    a[0][0] = 1;
    for (let k = 1; k <= order; k += 1) {
      let d = 0;
      const rk = r - k;
      const pk = degree - k;
      if (r >= k) {
        a[s2][0] = ndu[pk + 1][rk] === 0 ? 0 : a[s1][0] / ndu[pk + 1][rk];
        d = a[s2][0] * ndu[rk][pk];
      }
      const j1 = rk >= -1 ? 1 : -rk;
      const j2 = r - 1 <= pk ? k - 1 : degree - r;
      for (let j = j1; j <= j2; j += 1) {
        const denom = ndu[pk + 1][rk + j];
        a[s2][j] = denom === 0 ? 0 : (a[s1][j] - a[s1][j - 1]) / denom;
        d += a[s2][j] * ndu[rk + j][pk];
      }
      if (r <= pk) {
        const denom = ndu[pk + 1][r];
        a[s2][k] = denom === 0 ? 0 : -a[s1][k - 1] / denom;
        d += a[s2][k] * ndu[r][pk];
      }
      ders[k][r] = d;
      const swap = s1;
      s1 = s2;
      s2 = swap;
    }
  }
  let factor = degree;
  for (let k = 1; k <= order; k += 1) {
    for (let j = 0; j <= degree; j += 1) ders[k][j] *= factor;
    factor *= degree - k;
  }
  return ders;
}

/** Vector de nudos clamped uniforme para `count` puntos de control de grado `degree`. */
export function uniformClampedKnots(count: number, degree: number): number[] {
  const knots: number[] = [];
  const interior = count - degree - 1;
  for (let i = 0; i <= degree; i += 1) knots.push(0);
  for (let i = 1; i <= interior; i += 1) knots.push(i / (interior + 1));
  for (let i = 0; i <= degree; i += 1) knots.push(1);
  return knots;
}

/** Extremos del dominio útil de un vector de nudos clamped. */
export function knotDomain(knots: readonly number[], degree: number, count: number): [number, number] {
  return [knots[degree], knots[count]];
}

/**
 * Derivadas de una curva NURBS hasta orden `order`, ya racionalizadas.
 * `out[k]` es la derivada k-ésima; `out[0]` es el punto.
 */
export function nurbsCurveDerivatives(curve: NurbsCurve, u: number, order = 2): Vec3[] {
  const { degree, knots, controlPoints, weights } = curve;
  const count = controlPoints.length;
  const [uMin, uMax] = knotDomain(knots, degree, count);
  const clamped = Math.min(uMax, Math.max(uMin, u));
  const span = findSpan(count, degree, clamped, knots);
  const ders = basisFunsDerivatives(span, clamped, degree, Math.min(order, degree), knots);
  const maxOrder = Math.min(order, degree);
  const aders: Vec3[] = [];
  const wders: number[] = [];
  for (let k = 0; k <= order; k += 1) {
    let point: Vec3 = { x: 0, y: 0, z: 0 };
    let weight = 0;
    if (k <= maxOrder) {
      for (let j = 0; j <= degree; j += 1) {
        const index = span - degree + j;
        const w = weights[index];
        const basis = ders[k][j];
        point = v3Add(point, v3Scale(controlPoints[index], basis * w));
        weight += basis * w;
      }
    }
    aders.push(point);
    wders.push(weight);
  }
  return rationalize(aders, wders, order);
}

/** Paso de derivadas homogéneas a racionales (A4.2/A4.4), común a curva y superficie. */
function rationalize(aders: readonly Vec3[], wders: readonly number[], order: number): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k <= order; k += 1) {
    let value = aders[k];
    for (let i = 1; i <= k; i += 1) {
      value = v3Sub(value, v3Scale(out[k - i], binomial(k, i) * wders[i]));
    }
    out.push(wders[0] === 0 ? { x: 0, y: 0, z: 0 } : v3Scale(value, 1 / wders[0]));
  }
  return out;
}

const BINOMIAL_CACHE = new Map<number, number>();

export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const key = n * 64 + k;
  const cached = BINOMIAL_CACHE.get(key);
  if (cached !== undefined) return cached;
  let value = 1;
  for (let i = 1; i <= k; i += 1) value = (value * (n - k + i)) / i;
  const rounded = Math.round(value);
  BINOMIAL_CACHE.set(key, rounded);
  return rounded;
}

export function nurbsCurvePoint(curve: NurbsCurve, u: number): Vec3 {
  return nurbsCurveDerivatives(curve, u, 0)[0];
}

/**
 * Derivadas parciales de una superficie NURBS: `skl[k][l] = ∂^(k+l)S/∂u^k∂v^l`,
 * con `k + l ≤ order`. Racionalizadas por A4.4.
 */
export function nurbsSurfaceDerivatives(surface: NurbsSurface, u: number, v: number, order = 2): Vec3[][] {
  const { degreeU, degreeV, knotsU, knotsV, countU, countV, controlPoints, weights } = surface;
  const [uMin, uMax] = knotDomain(knotsU, degreeU, countU);
  const [vMin, vMax] = knotDomain(knotsV, degreeV, countV);
  const uc = Math.min(uMax, Math.max(uMin, u));
  const vc = Math.min(vMax, Math.max(vMin, v));
  const spanU = findSpan(countU, degreeU, uc, knotsU);
  const spanV = findSpan(countV, degreeV, vc, knotsV);
  const dersU = basisFunsDerivatives(spanU, uc, degreeU, Math.min(order, degreeU), knotsU);
  const dersV = basisFunsDerivatives(spanV, vc, degreeV, Math.min(order, degreeV), knotsV);

  const aders: Vec3[][] = [];
  const wders: number[][] = [];
  for (let k = 0; k <= order; k += 1) {
    aders.push([]);
    wders.push([]);
    for (let l = 0; l <= order; l += 1) {
      let point: Vec3 = { x: 0, y: 0, z: 0 };
      let weight = 0;
      if (k <= degreeU && l <= degreeV && k + l <= order) {
        for (let i = 0; i <= degreeU; i += 1) {
          for (let j = 0; j <= degreeV; j += 1) {
            const index = (spanU - degreeU + i) * countV + (spanV - degreeV + j);
            const w = weights[index];
            const basis = dersU[k][i] * dersV[l][j];
            point = v3Add(point, v3Scale(controlPoints[index], basis * w));
            weight += basis * w;
          }
        }
      }
      aders[k].push(point);
      wders[k].push(weight);
    }
  }

  const skl: Vec3[][] = Array.from({ length: order + 1 }, () =>
    Array.from({ length: order + 1 }, () => ({ x: 0, y: 0, z: 0 }) as Vec3),
  );
  const w0 = wders[0][0];
  for (let k = 0; k <= order; k += 1) {
    for (let l = 0; l <= order - k; l += 1) {
      let value = aders[k][l];
      for (let j = 1; j <= l; j += 1) {
        value = v3Sub(value, v3Scale(skl[k][l - j], binomial(l, j) * wders[0][j]));
      }
      for (let i = 1; i <= k; i += 1) {
        value = v3Sub(value, v3Scale(skl[k - i][l], binomial(k, i) * wders[i][0]));
        let inner: Vec3 = { x: 0, y: 0, z: 0 };
        for (let j = 1; j <= l; j += 1) {
          inner = v3Add(inner, v3Scale(skl[k - i][l - j], binomial(l, j) * wders[i][j]));
        }
        value = v3Sub(value, v3Scale(inner, binomial(k, i)));
      }
      skl[k][l] = w0 === 0 ? { x: 0, y: 0, z: 0 } : v3Scale(value, 1 / w0);
    }
  }
  return skl;
}

export function nurbsSurfacePoint(surface: NurbsSurface, u: number, v: number): Vec3 {
  return nurbsSurfaceDerivatives(surface, u, v, 0)[0][0];
}

export function nurbsSurfaceNormal(surface: NurbsSurface, u: number, v: number): Vec3 {
  const skl = nurbsSurfaceDerivatives(surface, u, v, 1);
  return v3Normalize(v3Cross(skl[1][0], skl[0][1]));
}

/**
 * Parche bilineal; la superficie NURBS más simple posible.
 *
 * Las esquinas llegan en orden antihorario visto desde el lado de la normal
 * deseada. El orden fila-mayor NO es el mismo: `u` debe recorrer c0→c1 y `v`
 * debe recorrer c0→c3 para que `Sᵤ × Sᵥ` salga del lado correcto. Poner las
 * esquinas "en orden" da la normal INVERTIDA, y ése es justo el error que
 * fabrica mallas con la mitad de las caras mirando hacia dentro.
 */
export function nurbsPlanePatch(corners: [Vec3, Vec3, Vec3, Vec3]): NurbsSurface {
  return {
    kind: "nurbs",
    degreeU: 1,
    degreeV: 1,
    knotsU: [0, 0, 1, 1],
    knotsV: [0, 0, 1, 1],
    countU: 2,
    countV: 2,
    controlPoints: [corners[0], corners[3], corners[1], corners[2]],
    weights: [1, 1, 1, 1],
  };
}

/**
 * Superficie NURBS a partir de una malla de control regular.
 * Valida tamaños porque una malla mal dimensionada produce índices fuera de
 * rango DENTRO del bucle de evaluación, donde el mensaje ya no dice nada útil.
 */
export function makeNurbsSurface(input: {
  degreeU: number;
  degreeV: number;
  countU: number;
  countV: number;
  controlPoints: Vec3[];
  weights?: number[];
  knotsU?: number[];
  knotsV?: number[];
}): NurbsSurface {
  const { degreeU, degreeV, countU, countV, controlPoints } = input;
  if (controlPoints.length !== countU * countV) {
    throw new Error(
      `Malla NURBS incoherente: ${controlPoints.length} puntos de control para ${countU}×${countV}.`,
    );
  }
  if (countU <= degreeU || countV <= degreeV) {
    throw new Error(`Grado NURBS demasiado alto: ${degreeU}×${degreeV} para ${countU}×${countV} puntos.`);
  }
  const knotsU = input.knotsU ?? uniformClampedKnots(countU, degreeU);
  const knotsV = input.knotsV ?? uniformClampedKnots(countV, degreeV);
  if (knotsU.length !== countU + degreeU + 1 || knotsV.length !== countV + degreeV + 1) {
    throw new Error("Vector de nudos NURBS con longitud incorrecta.");
  }
  return {
    kind: "nurbs",
    degreeU,
    degreeV,
    knotsU,
    knotsV,
    countU,
    countV,
    controlPoints: [...controlPoints],
    weights: input.weights ? [...input.weights] : new Array<number>(countU * countV).fill(1),
  };
}
