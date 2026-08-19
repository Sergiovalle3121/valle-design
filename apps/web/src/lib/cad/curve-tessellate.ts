/**
 * Teselado de curvas del CAD (CAD-NEXT-062).
 *
 * Convierte las primitivas curvas del pipeline DXF (arco, elipse, spline) en
 * cadenas de puntos, para que el editor pueda materializarlas como geometría
 * editable y cualquier consumidor lineal (muros, snap, medición) las aproveche.
 * La spline se evalúa con el algoritmo de De Boor sobre sus puntos de control,
 * grado y nudos — la CURVA real, no el polígono de control (ese era el bug que
 * obligaba a omitir splines en la conversión del editor).
 *
 * Puro (sin DOM/three): todo testeable en Node.
 */

import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";

const DEFAULT_STEPS = 24;

/** Nudos clamped uniforme (misma regla que el export DXF): n + grado + 1. */
function clampedKnots(controlCount: number, degree: number): number[] {
  const knots: number[] = [];
  const spans = controlCount - degree;
  for (let i = 0; i <= degree; i++) knots.push(0);
  for (let i = 1; i < spans; i++) knots.push(i / spans);
  for (let i = 0; i <= degree; i++) knots.push(1);
  return knots;
}

/**
 * Arco circular: centro + radio + ángulos en grados (CCW desde +X). El barrido
 * negativo o nulo se normaliza sumando 360 (convención DXF: siempre CCW).
 */
export function tessellateArc(
  center: CadDxfPoint,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
  steps = DEFAULT_STEPS,
): CadDxfPoint[] {
  if (!(radius > 0) || steps < 1) return [];
  let sweep = endAngleDeg - startAngleDeg;
  while (sweep <= 0) sweep += 360;
  const n = Math.max(2, Math.ceil((sweep / 360) * steps));
  const points: CadDxfPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const angle = ((startAngleDeg + (sweep * i) / n) * Math.PI) / 180;
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return points;
}

/**
 * Elipse: centro + vector del eje mayor (RELATIVO al centro) + razón de ejes +
 * rango de parámetros en grados. P(t) = C + cos(t)·M + sin(t)·(razón·M⊥). La
 * rotación de la elipse viene implícita en el vector del eje mayor.
 */
export function tessellateEllipse(
  center: CadDxfPoint,
  majorAxis: CadDxfPoint,
  axisRatio: number,
  startParamDeg = 0,
  endParamDeg = 360,
  steps = DEFAULT_STEPS,
): CadDxfPoint[] {
  const majorLen = Math.hypot(majorAxis.x, majorAxis.y);
  if (!(majorLen > 0) || !(axisRatio > 0) || steps < 1) return [];
  let sweep = endParamDeg - startParamDeg;
  while (sweep <= 0) sweep += 360;
  const minor = { x: -majorAxis.y * axisRatio, y: majorAxis.x * axisRatio };
  const n = Math.max(2, Math.ceil((sweep / 360) * steps));
  const points: CadDxfPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = ((startParamDeg + (sweep * i) / n) * Math.PI) / 180;
    points.push({
      x: center.x + Math.cos(t) * majorAxis.x + Math.sin(t) * minor.x,
      y: center.y + Math.cos(t) * majorAxis.y + Math.sin(t) * minor.y,
    });
  }
  return points;
}

/** Evaluación De Boor de una B-spline en el parámetro u (dominio de los nudos). */
function deBoor(
  u: number,
  degree: number,
  control: CadDxfPoint[],
  knots: number[],
): CadDxfPoint {
  // Índice del intervalo de nudos que contiene u (clamp al dominio válido).
  const n = control.length - 1;
  let k = degree;
  for (let i = degree; i <= n; i++) {
    if (u >= knots[i] && u <= knots[i + 1]) {
      k = i;
      break;
    }
    if (i === n) k = n;
  }
  const d: CadDxfPoint[] = [];
  for (let j = 0; j <= degree; j++) d.push({ ...control[j + k - degree] });
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const denom = knots[j + 1 + k - r] - knots[j + k - degree];
      const alpha = denom > 0 ? (u - knots[j + k - degree]) / denom : 0;
      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
      };
    }
  }
  return d[degree];
}

/**
 * ¿Es este vector de nudos USABLE, no sólo del tamaño correcto?
 *
 * La comprobación de LONGITUD por sí sola dejaba pasar basura con la forma
 * adecuada. Un DXF ajeno trae vectores de nudos con `NaN` —el escritor emitió
 * un grupo 40 vacío o un `1.#QNAN`— y también vectores constantes, y los dos
 * cumplen `length === n + grado + 1`. Con ellos, De Boor calcula `denom = 0`
 * en cada nivel, toma `alpha = 0` y devuelve SIEMPRE el primer punto de
 * control: la spline se COLAPSA en un punto.
 *
 * Y eso es lo peor que puede pasar, porque no hay error ni hueco: el arquitecto
 * ve un punto donde había una curva y el documento queda con una entidad cuya
 * caja envolvente miente. La salida correcta ya existía para el vector de
 * longitud equivocada —sintetizar nudos clamped, que es lo que el export DXF
 * escribe— y basta con enrutar aquí lo que no sirve.
 *
 * Se exige: todo finito, no decreciente y con dominio de longitud POSITIVA. Un
 * dominio nulo (`uMin === uMax`) daría todas las muestras en el mismo
 * parámetro, que es el mismo colapso por otro camino.
 */
function usableKnots(knots: readonly number[], degree: number): boolean {
  for (let i = 0; i < knots.length; i += 1) {
    if (!Number.isFinite(knots[i])) return false;
    if (i > 0 && knots[i] < knots[i - 1]) return false;
  }
  return knots[knots.length - 1 - degree] > knots[degree];
}

/**
 * B-spline por De Boor: puntos de control + grado (+ nudos; si faltan, no
 * cuadran con n+grado+1 o no son usables se sintetizan clamped, igual que el
 * export DXF). El muestreo es uniforme sobre el dominio válido de los nudos.
 */
export function tessellateSpline(
  controlPoints: CadDxfPoint[],
  degree = 3,
  knots?: number[],
  steps = DEFAULT_STEPS,
): CadDxfPoint[] {
  if (controlPoints.length < 2 || steps < 1) return [];
  const deg = Math.max(1, Math.min(Math.floor(degree), controlPoints.length - 1));
  const expected = controlPoints.length + deg + 1;
  const knotVector =
    knots && knots.length === expected && usableKnots(knots, deg)
      ? knots
      : clampedKnots(controlPoints.length, deg);
  const uMin = knotVector[deg];
  const uMax = knotVector[knotVector.length - 1 - deg];
  const points: CadDxfPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = uMin + ((uMax - uMin) * i) / steps;
    points.push(deBoor(u, deg, controlPoints, knotVector));
  }
  return points;
}

/**
 * Despachador para primitivas del pipeline DXF: devuelve la cadena de puntos de
 * una curva (arc/ellipse/spline) o null para los tipos que no son curvas — el
 * llamador decide qué hacer con líneas/rects/círculos por su propia vía.
 */
export function tessellateDxfPrimitive(
  primitive: CadDxfPrimitive,
  steps = DEFAULT_STEPS,
): CadDxfPoint[] | null {
  if (primitive.kind === "arc" && primitive.points[0] && primitive.radius) {
    return tessellateArc(
      primitive.points[0],
      primitive.radius,
      primitive.startAngle ?? 0,
      primitive.endAngle ?? 360,
      steps,
    );
  }
  if (
    primitive.kind === "ellipse" &&
    primitive.points[0] &&
    primitive.majorAxis &&
    typeof primitive.axisRatio === "number"
  ) {
    return tessellateEllipse(
      primitive.points[0],
      primitive.majorAxis,
      primitive.axisRatio,
      primitive.startAngle ?? 0,
      primitive.endAngle ?? 360,
      steps,
    );
  }
  if (primitive.kind === "spline" && primitive.points.length >= 2) {
    return tessellateSpline(primitive.points, primitive.degree ?? 3, primitive.knots, steps);
  }
  return null;
}
