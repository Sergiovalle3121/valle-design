/**
 * Curva acotada canónica y sus intersecciones. Geometría pura.
 *
 * ## Por qué hace falta
 *
 * `intersect.ts` resuelve recta-recta, recta-círculo, círculo-círculo y sus
 * variantes con arcos, y está bien. Pero devuelve PUNTOS, y TRIM, EXTEND, BREAK
 * o JOIN no necesitan puntos: necesitan saber DÓNDE, a lo largo del objeto, cae
 * cada cruce. Sin esa coordenada no se puede decir «el trozo entre el corte
 * anterior y el siguiente al sitio donde pinchó el usuario», que es la regla de
 * TRIM en cualquier CAD y la única que da el mismo resultado para un segmento,
 * un arco, una elipse y una polilínea.
 *
 * Este módulo introduce esa coordenada. Toda curva acotada se parametriza en
 * `t ∈ [0, 1]` —0 en su inicio, 1 en su final— y `curveIntersections` devuelve
 * el parámetro sobre CADA una de las dos. A partir de ahí, «recortar» es
 * quedarse con un intervalo de `t`, y esa operación es la misma para los cuatro
 * tipos.
 *
 * ## Extender es intersecar la curva SIN acotar
 *
 * EXTEND necesita cruces que caen fuera del objeto: más allá del extremo de un
 * segmento, o fuera del barrido de un arco. Por eso `curveIntersections` toma
 * `extendA`/`extendB`: con ellos el segmento se trata como recta infinita, el
 * arco como circunferencia completa y el arco elíptico como elipse entera. Los
 * parámetros devueltos siguen midiéndose sobre el objeto ACOTADO, así que un
 * cruce más allá del final sale con `t > 1` y uno anterior al inicio con
 * `t < 0`. Es la misma convención que ya usaba `cad-line-edit.ts`, aquí
 * generalizada a las tres familias.
 *
 * ## Qué es exacto y qué no
 *
 * Segmento×segmento, segmento×arco, arco×arco y segmento×elipse se resuelven de
 * forma **cerrada** (la elipse se lleva a su marco local, donde es la
 * circunferencia unidad, y la recta sigue siendo recta). Arco×elipse y
 * elipse×elipse necesitarían resolver una cuártica; aquí se muestrean sobre su
 * dominio periódico —siempre acotado, incluso al extender— y se afina por
 * bisección. Las tangencias entre dos curvas cerradas se detectan por mínimo
 * local, no por cambio de signo, y se aceptan con tolerancia relativa al
 * tamaño: es el único caso en el que este módulo puede fallar por un pelo, y se
 * dice aquí en vez de fingir exactitud.
 *
 * NURBS (SPLINE) NO se modela. Un spline no se recorta con esta matemática y
 * devolver su poligonal aproximada cortaría en el sitio equivocado; quien lo
 * pida recibe `null` de `cadEntityCurves` y puede negarse nombrando el tipo.
 */
import type { CadEntity } from "./cad-document";
import {
  circleCircleIntersections,
  lineCircleIntersections,
  lineLineIntersection,
} from "./intersect";
import { norm360, type CadVec2 } from "./primitives";

const EPS = 1e-9;
const DEG = Math.PI / 180;

/**
 * Curva acotada. Los ángulos van en GRADOS, como en el documento canónico.
 *
 * `sweep` es CON SIGNO —positivo antihorario— porque el `bulge` de una
 * polilínea describe arcos en los dos sentidos y perderlo obligaría a
 * intercambiar extremos, que es justo lo que rompe el orden de recorrido de la
 * polilínea. Un `sweep` de ±360 es la curva cerrada (círculo o elipse entera).
 */
export type CadCurve =
  | { kind: "segment"; a: CadVec2; b: CadVec2 }
  | { kind: "arc"; center: CadVec2; radius: number; startAngle: number; sweep: number }
  | {
      kind: "ellipse";
      center: CadVec2;
      /** Vector del centro al extremo del semieje mayor. */
      major: CadVec2;
      /** Semieje menor / semieje mayor, en (0, 1]. */
      ratio: number;
      startParam: number;
      sweep: number;
    };

export interface CadCurveHit {
  point: CadVec2;
  /** Parámetro sobre la primera curva, medida ACOTADA (puede salir de [0,1]). */
  tA: number;
  tB: number;
}

// ---------------------------------------------------------------------------
// Conversión desde el documento
// ---------------------------------------------------------------------------

type CadPolylineEntity = Extract<CadEntity, { type: "polyline" }>;

/**
 * Arco de un tramo con `bulge`, convención DXF `bulge = tan(θ/4)`.
 *
 * Se reimplementa aquí en vez de importarlo de `entity-runtime` a propósito:
 * ese módulo carga los once adaptadores, y un adaptador que algún día quiera
 * intersecar curvas cerraría un ciclo de importación con VALORES —el fallo que
 * `tsc --noEmit` no ve y que revienta al cargar. Son veinte líneas de una
 * convención congelada por el formato; el precio de copiarlas es menor.
 */
function bulgeArc(
  start: { x: number; y: number; bulge?: number },
  end: { x: number; y: number },
): CadCurve | null {
  const bulge = typeof start.bulge === "number" && Number.isFinite(start.bulge) ? start.bulge : 0;
  if (Math.abs(bulge) < 1e-12) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return null;
  const theta = 4 * Math.atan(bulge);
  const halfSin = Math.sin(theta / 2);
  if (Math.abs(halfSin) < 1e-12) return null;
  const radius = chord / (2 * halfSin);
  const offset = radius * Math.cos(theta / 2);
  const center = {
    x: (start.x + end.x) / 2 + (-dy / chord) * offset,
    y: (start.y + end.y) / 2 + (dx / chord) * offset,
  };
  return {
    kind: "arc",
    center,
    radius: Math.abs(radius),
    startAngle: (Math.atan2(start.y - center.y, start.x - center.x) * 180) / Math.PI,
    sweep: (theta * 180) / Math.PI,
  };
}

/**
 * Las curvas que componen una entidad, en orden de recorrido.
 *
 * `null` —no una lista vacía— para lo que este módulo no modela. La diferencia
 * importa: una lista vacía es «una polilínea de un solo vértice», que sí se
 * entiende; `null` es «no sé qué es esto», y quien llama debe rechazarlo
 * nombrando el tipo en vez de tratarlo como geometría nula.
 */
export function cadEntityCurves(entity: CadEntity): CadCurve[] | null {
  if (entity.type === "line")
    return [
      {
        kind: "segment",
        a: { x: entity.start.x, y: entity.start.y },
        b: { x: entity.end.x, y: entity.end.y },
      },
    ];
  if (entity.type === "circle")
    return [
      {
        kind: "arc",
        center: { x: entity.center.x, y: entity.center.y },
        radius: entity.radius,
        startAngle: 0,
        sweep: 360,
      },
    ];
  if (entity.type === "arc")
    return [
      {
        kind: "arc",
        center: { x: entity.center.x, y: entity.center.y },
        radius: entity.radius,
        startAngle: entity.startAngle,
        // Un arco DXF se recorre siempre CCW de start a end; start == end es la
        // circunferencia completa, no un arco nulo.
        sweep: norm360(entity.endAngle - entity.startAngle) || 360,
      },
    ];
  if (entity.type === "ellipse")
    return [
      {
        kind: "ellipse",
        center: { x: entity.center.x, y: entity.center.y },
        major: { x: entity.majorAxis.x, y: entity.majorAxis.y },
        ratio: entity.ratio,
        startParam: entity.startParameter,
        sweep: norm360(entity.endParameter - entity.startParameter) || 360,
      },
    ];
  if (entity.type === "polyline") return polylineCurves(entity);
  return null;
}

function polylineCurves(entity: CadPolylineEntity): CadCurve[] {
  const vertices = entity.vertices;
  if (vertices.length < 2) return [];
  const count = entity.closed ? vertices.length : vertices.length - 1;
  const curves: CadCurve[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    curves.push(
      bulgeArc(start, end) ?? {
        kind: "segment",
        a: { x: start.x, y: start.y },
        b: { x: end.x, y: end.y },
      },
    );
  }
  return curves;
}

// ---------------------------------------------------------------------------
// Parametrización
// ---------------------------------------------------------------------------

/** Marco local de una elipse: la lleva a la circunferencia unidad. */
function ellipseFrame(curve: Extract<CadCurve, { kind: "ellipse" }>) {
  const minor = { x: -curve.major.y * curve.ratio, y: curve.major.x * curve.ratio };
  const det = curve.major.x * minor.y - curve.major.y * minor.x;
  return { minor, det };
}

export function curvePointAt(curve: CadCurve, t: number): CadVec2 {
  if (curve.kind === "segment")
    return {
      x: curve.a.x + (curve.b.x - curve.a.x) * t,
      y: curve.a.y + (curve.b.y - curve.a.y) * t,
    };
  if (curve.kind === "arc") {
    const angle = (curve.startAngle + curve.sweep * t) * DEG;
    return {
      x: curve.center.x + curve.radius * Math.cos(angle),
      y: curve.center.y + curve.radius * Math.sin(angle),
    };
  }
  const { minor } = ellipseFrame(curve);
  const angle = (curve.startParam + curve.sweep * t) * DEG;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: curve.center.x + cos * curve.major.x + sin * minor.x,
    y: curve.center.y + cos * curve.major.y + sin * minor.y,
  };
}

/** El ángulo/parámetro local (grados) del punto sobre la curva de apoyo. */
function angularParamOf(curve: CadCurve, point: CadVec2): number {
  if (curve.kind === "arc")
    return (Math.atan2(point.y - curve.center.y, point.x - curve.center.x) * 180) / Math.PI;
  if (curve.kind === "ellipse") {
    const { minor, det } = ellipseFrame(curve);
    if (Math.abs(det) < EPS) return 0;
    const dx = point.x - curve.center.x;
    const dy = point.y - curve.center.y;
    const cos = (dx * minor.y - dy * minor.x) / det;
    const sin = (curve.major.x * dy - curve.major.y * dx) / det;
    return (Math.atan2(sin, cos) * 180) / Math.PI;
  }
  return 0;
}

/**
 * Parámetro del punto sobre la curva, con la misma escala que `curvePointAt`.
 *
 * Para un segmento es la proyección sobre su RECTA, así que sale de `[0,1]` si
 * el punto está más allá de un extremo: eso es precisamente lo que EXTEND
 * necesita saber. Para arco y elipse el avance se mide en el sentido del
 * barrido, de modo que un cruce pasado el final sale con `t > 1` y uno anterior
 * al inicio también —dando la vuelta— con `t` cercano a `360/|sweep|`. Quien
 * quiera «antes del inicio» resta ese periodo, y `curveExtensionPeriod` lo da.
 */
export function curveParamAt(curve: CadCurve, point: CadVec2): number {
  if (curve.kind === "segment") {
    const rx = curve.b.x - curve.a.x;
    const ry = curve.b.y - curve.a.y;
    const lengthSquared = rx * rx + ry * ry;
    if (lengthSquared <= EPS) return 0;
    return ((point.x - curve.a.x) * rx + (point.y - curve.a.y) * ry) / lengthSquared;
  }
  const start = curve.kind === "arc" ? curve.startAngle : curve.startParam;
  const sweep = curve.sweep;
  const advance = norm360((angularParamOf(curve, point) - start) * Math.sign(sweep || 1));
  return advance / Math.abs(sweep || 360);
}

/**
 * Periodo del parámetro, o `null` si la curva no se cierra al extenderla.
 *
 * Un segmento extendido es una recta infinita: no hay periodo. Un arco de 90°
 * extendido es la circunferencia, y su periodo en `t` vale 4 — restarlo
 * convierte «tres cuartos de vuelta hacia delante» en «un cuarto hacia atrás»,
 * que es lo que EXTEND quiere oír.
 */
export function curveExtensionPeriod(curve: CadCurve): number | null {
  if (curve.kind === "segment") return null;
  return 360 / Math.abs(curve.sweep || 360);
}

export function curveIsClosed(curve: CadCurve): boolean {
  return curve.kind !== "segment" && Math.abs(curve.sweep) >= 360 - 1e-7;
}

/**
 * Parámetro del punto de la curva ACOTADA más cercano al dado.
 *
 * Es la traducción de «dónde pinchó el usuario» a la coordenada con la que se
 * recorta. Se acota a `[0, 1]` a propósito: un clic siempre cae sobre el objeto
 * dibujado, y dejar que el parámetro se escapara del barrido haría que TRIM
 * eligiera un tramo que no está en pantalla.
 */
export function curveClosestParam(curve: CadCurve, point: CadVec2): number {
  const raw = curveParamAt(curve, point);
  if (curve.kind === "segment") return Math.max(0, Math.min(1, raw));
  if (curveIsClosed(curve)) return raw;
  // Fuera del barrido hay que decidir a qué extremo se parece más, y el
  // parámetro no lo dice: 1.1 y 3.9 están ambos fuera, pero el segundo está
  // más cerca del inicio. Se compara la distancia real a los dos extremos.
  if (raw >= 0 && raw <= 1) return raw;
  const toStart = distanceBetween(point, curvePointAt(curve, 0));
  const toEnd = distanceBetween(point, curvePointAt(curve, 1));
  return toStart <= toEnd ? 0 : 1;
}

function distanceBetween(a: CadVec2, b: CadVec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Distancia del punto a la curva acotada.
 *
 * Para segmento y arco es exacta. Para una elipse usa la proyección RADIAL en
 * el marco local, no el pie de perpendicular verdadero: es lo que hace falta
 * para decidir en qué sector paramétrico pinchó el usuario —que es el uso—, y
 * no sirve para medir separaciones.
 */
export function curveDistanceTo(curve: CadCurve, point: CadVec2): number {
  return distanceBetween(point, curvePointAt(curve, curveClosestParam(curve, point)));
}

/**
 * Longitud de la curva acotada.
 *
 * Exacta para segmento y arco. Para el arco elíptico es una suma de cuerdas
 * sobre 256 muestras: la integral elíptica no tiene forma cerrada y ese error
 * —menos de una millonésima del semieje— no cambia ninguna decisión que se tome
 * con ella.
 */
export function curveLength(curve: CadCurve): number {
  if (curve.kind === "segment") return distanceBetween(curve.a, curve.b);
  if (curve.kind === "arc") return (Math.abs(curve.sweep) * Math.PI * curve.radius) / 180;
  let total = 0;
  let previous = curvePointAt(curve, 0);
  for (let index = 1; index <= 256; index += 1) {
    const current = curvePointAt(curve, index / 256);
    total += distanceBetween(previous, current);
    previous = current;
  }
  return total;
}

/** Longitud aproximada; suficiente para ordenar y para tolerancias relativas. */
export function curveScale(curve: CadCurve): number {
  if (curve.kind === "segment") return Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y);
  if (curve.kind === "arc") return curve.radius;
  return Math.hypot(curve.major.x, curve.major.y);
}

// ---------------------------------------------------------------------------
// Intersecciones
// ---------------------------------------------------------------------------

/** Distancia con signo a la curva cerrada de apoyo; cero sobre ella. */
function implicitOf(curve: CadCurve): (point: CadVec2) => number {
  if (curve.kind === "arc")
    return (point) => Math.hypot(point.x - curve.center.x, point.y - curve.center.y) - curve.radius;
  if (curve.kind === "ellipse") {
    const { minor, det } = ellipseFrame(curve);
    const scale = Math.hypot(curve.major.x, curve.major.y);
    return (point) => {
      if (Math.abs(det) < EPS) return 1;
      const dx = point.x - curve.center.x;
      const dy = point.y - curve.center.y;
      const cos = (dx * minor.y - dy * minor.x) / det;
      const sin = (curve.major.x * dy - curve.major.y * dx) / det;
      // Se devuelve en unidades de longitud (radio local × escala) para que la
      // tolerancia de la bisección signifique lo mismo en cualquier dibujo.
      return (Math.hypot(cos, sin) - 1) * scale;
    };
  }
  const dx = curve.b.x - curve.a.x;
  const dy = curve.b.y - curve.a.y;
  const length = Math.hypot(dx, dy) || 1;
  return (point) => ((point.x - curve.a.x) * dy - (point.y - curve.a.y) * dx) / length;
}

/**
 * Puntos candidatos por muestreo del dominio periódico de `sampled`.
 *
 * Sólo se usa cuando hay una elipse frente a otra curva CERRADA, así que el
 * dominio siempre es finito: una vuelta completa. Se buscan cambios de signo
 * (cruces transversales) y mínimos locales de `|f|` (tangencias).
 */
function sampledHits(sampled: CadCurve, against: CadCurve): CadVec2[] {
  const f = implicitOf(against);
  const period = curveExtensionPeriod(sampled) ?? 1;
  const steps = 720;
  const paramOf = (index: number) => (period * index) / steps;
  const valueAt = (t: number) => f(curvePointAt(sampled, t));
  // Tolerancia RELATIVA al tamaño: `implicitOf` devuelve longitudes, así que
  // «cero» significa lo mismo en un plano en milímetros que en uno en metros.
  const tolerance = Math.max(curveScale(sampled), curveScale(against), 1) * 1e-9;
  const values = Array.from({ length: steps }, (_, index) => valueAt(paramOf(index)));
  const hits: CadVec2[] = [];

  /** Mínimo de `|f|` en `[lo, hi]` por ternaria; el cero si de verdad lo alcanza. */
  const refineMinimum = (lo: number, hi: number): CadVec2 | null => {
    for (let iteration = 0; iteration < 120; iteration += 1) {
      const third = (hi - lo) / 3;
      if (Math.abs(valueAt(lo + third)) <= Math.abs(valueAt(hi - third))) hi -= third;
      else lo += third;
    }
    const point = curvePointAt(sampled, (lo + hi) / 2);
    return Math.abs(f(point)) <= tolerance ? point : null;
  };

  for (let index = 0; index < steps; index += 1) {
    const previous = values[(index - 1 + steps) % steps];
    const current = values[index];
    const next = values[(index + 1) % steps];

    // Un cruce TRANSVERSAL exige que ambos extremos estén claramente fuera del
    // cero. Exigirlo evita contar dos veces una tangencia, que roza el cero por
    // un lado y vuelve: sin este cuidado saldrían cuatro «cruces» donde hay dos
    // toques, y TRIM partiría la curva en trozos de longitud nula.
    if (Math.abs(current) > tolerance && Math.abs(next) > tolerance && current * next < 0) {
      let lo = paramOf(index);
      let hi = paramOf(index + 1);
      const loSign = Math.sign(current);
      for (let iteration = 0; iteration < 80; iteration += 1) {
        const mid = (lo + hi) / 2;
        if (Math.sign(valueAt(mid)) === loSign) lo = mid;
        else hi = mid;
      }
      hits.push(curvePointAt(sampled, (lo + hi) / 2));
      continue;
    }

    // Tangencia: `f` toca el cero sin cambiar de signo. Se busca como mínimo
    // local de `|f|` y sólo se acepta si al afinarlo llega de verdad al cero.
    if (Math.abs(current) <= Math.abs(previous) && Math.abs(current) <= Math.abs(next)) {
      const point = refineMinimum(paramOf(index - 1), paramOf(index + 1));
      if (point) hits.push(point);
    }
  }
  return hits;
}

/** Los puntos donde se cortan las curvas de apoyo (sin acotar a los barridos). */
function supportHits(a: CadCurve, b: CadCurve): CadVec2[] {
  if (a.kind === "segment" && b.kind === "segment") {
    const hit = lineLineIntersection(a.a, a.b, b.a, b.b);
    return hit ? [hit] : [];
  }
  if (a.kind === "segment" && b.kind === "arc")
    return lineCircleIntersections(a.a, a.b, b.center, b.radius);
  if (a.kind === "arc" && b.kind === "segment")
    return lineCircleIntersections(b.a, b.b, a.center, a.radius);
  if (a.kind === "arc" && b.kind === "arc")
    return circleCircleIntersections(a.center, a.radius, b.center, b.radius);
  // Segmento contra elipse: la elipse es una afín de la circunferencia unidad,
  // y una afín lleva rectas a rectas. Se resuelve EXACTO en el marco local.
  if (a.kind === "segment" && b.kind === "ellipse") return segmentEllipseHits(a, b);
  if (a.kind === "ellipse" && b.kind === "segment") return segmentEllipseHits(b, a);
  // Elipse contra curva cerrada: cuártica. Se muestrea la que no es elipse
  // cuando se puede (un círculo es más barato de muestrear que una elipse).
  return a.kind === "ellipse" ? sampledHits(b, a) : sampledHits(a, b);
}

function segmentEllipseHits(
  segment: Extract<CadCurve, { kind: "segment" }>,
  ellipse: Extract<CadCurve, { kind: "ellipse" }>,
): CadVec2[] {
  const { minor, det } = ellipseFrame(ellipse);
  if (Math.abs(det) < EPS) return [];
  const toLocal = (point: CadVec2): CadVec2 => {
    const dx = point.x - ellipse.center.x;
    const dy = point.y - ellipse.center.y;
    return {
      x: (dx * minor.y - dy * minor.x) / det,
      y: (ellipse.major.x * dy - ellipse.major.y * dx) / det,
    };
  };
  return lineCircleIntersections(toLocal(segment.a), toLocal(segment.b), { x: 0, y: 0 }, 1).map(
    // De vuelta al mundo por el mismo parámetro sobre el segmento: así el punto
    // que sale está EXACTAMENTE sobre el segmento original, sin el error que
    // introduciría reconstruirlo desde el marco local.
    (local) => {
      const t = curveParamAt({ kind: "segment", a: toLocal(segment.a), b: toLocal(segment.b) }, local);
      return curvePointAt(segment, t);
    },
  );
}

export interface CadCurveIntersectionOptions {
  /** Trata A como recta infinita / circunferencia / elipse completa. */
  extendA?: boolean;
  extendB?: boolean;
  /** Holgura en el parámetro al acotar. Por defecto 1e-9. */
  tolerance?: number;
}

function withinDomain(curve: CadCurve, t: number, tolerance: number): boolean {
  if (curveIsClosed(curve)) return true;
  return t >= -tolerance && t <= 1 + tolerance;
}

/**
 * Cruces de dos curvas, con el parámetro sobre cada una.
 *
 * Ordenados por `tA`, sin duplicados (dos muestreos vecinos pueden converger al
 * mismo punto). Un cruce repetido movería el corte de TRIM a un intervalo de
 * longitud cero y el objeto desaparecería.
 */
export function curveIntersections(
  a: CadCurve,
  b: CadCurve,
  options: CadCurveIntersectionOptions = {},
): CadCurveHit[] {
  const tolerance = options.tolerance ?? 1e-9;
  const scale = Math.max(curveScale(a), curveScale(b), 1);
  const hits: CadCurveHit[] = [];
  for (const point of supportHits(a, b)) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const tA = curveParamAt(a, point);
    const tB = curveParamAt(b, point);
    if (!options.extendA && !withinDomain(a, tA, tolerance)) continue;
    if (!options.extendB && !withinDomain(b, tB, tolerance)) continue;
    if (hits.some((seen) => Math.hypot(seen.point.x - point.x, seen.point.y - point.y) <= scale * 1e-9))
      continue;
    hits.push({ point, tA, tB });
  }
  return hits.sort((left, right) => left.tA - right.tA);
}

/**
 * Cruces de una curva contra TODAS las de otra entidad (una polilínea tiene
 * varias), con el parámetro medido sobre la primera.
 */
export function curveIntersectionsWithAll(
  a: CadCurve,
  others: readonly CadCurve[],
  options: CadCurveIntersectionOptions = {},
): CadCurveHit[] {
  const collected: CadCurveHit[] = [];
  const scale = Math.max(curveScale(a), 1);
  for (const other of others)
    for (const hit of curveIntersections(a, other, options)) {
      if (
        collected.some(
          (seen) => Math.hypot(seen.point.x - hit.point.x, seen.point.y - hit.point.y) <= scale * 1e-9,
        )
      )
        continue;
      collected.push(hit);
    }
  return collected.sort((left, right) => left.tA - right.tA);
}
