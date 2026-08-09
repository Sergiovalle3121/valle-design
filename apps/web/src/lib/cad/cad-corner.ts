/**
 * FILLET entre curvas cualesquiera: línea, arco y círculo.
 *
 * ## Qué había y por qué no bastaba
 *
 * `cad-fillet.ts` resuelve el empalme de DOS LÍNEAS y su comportamiento está
 * congelado y probado. Pero un dibujante redondea una línea contra una rotonda
 * y dos arcos entre sí todos los días, y ahí `computeCadLineFillet` no sólo no
 * servía: leía `entity.start` de un arco, obtenía `undefined` y escribía **NaN**
 * en las coordenadas del documento sin un solo error visible. Geometría
 * corrupta, persistida y exportada a DXF.
 *
 * Este módulo cubre los pares que aquél no cubre. El caso línea-línea sigue
 * yendo por `computeCadLineFillet`: su regla de desambiguación —el extremo más
 * cercano al cruce es la esquina— es la que tienen sus specs, y sustituirla por
 * la de aquí cambiaría resultados que hoy son correctos.
 *
 * ## Cómo se resuelve, y por qué así
 *
 * El centro de un arco de radio `r` tangente a dos curvas está a distancia `r`
 * de ambas: es decir, sobre el DESFASE de cada una. Así que los candidatos son
 * los cruces de los desfases —dos por línea (a cada lado) y dos por
 * circunferencia (por fuera y por dentro)—, y de ahí salen hasta ocho esquinas
 * posibles.
 *
 * Elegir entre ellas no es un detalle: las ocho son geométricamente válidas y
 * siete son la que el usuario NO quería. Se elige por los PUNTOS DE
 * DESIGNACIÓN, que es la regla de AutoCAD y la única que no depende de
 * casualidades de la geometría: gana el candidato cuyos puntos de tangencia
 * caen más cerca de donde se pinchó.
 *
 * ## Los círculos no se recortan
 *
 * Es la regla de AutoCAD, y aquí además es la sensata: un círculo recortado
 * deja de ser un círculo, y hacerlo por sorpresa al redondear una esquina
 * destruiría el objeto que sirve de referencia. Se recortan las líneas y los
 * arcos; el círculo se queda entero.
 *
 * CHAMFER NO se generaliza, y no es una carencia: en AutoCAD el chaflán sólo
 * admite segmentos rectos. Un chaflán contra un arco no está definido —no hay
 * «distancia a lo largo» de una curva que dé una recta tangente— y aceptarlo
 * habría significado inventarse una geometría que ningún otro CAD produce.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "./cad-document";

export type CadCornerEntity = Extract<CadEntity, { type: "line" | "arc" | "circle" }>;
type CadArc = Extract<CadEntity, { type: "arc" }>;

const EPS = 1e-9;

/** Curva de apoyo SIN acotar: la recta infinita o la circunferencia completa. */
type Support =
  | { kind: "line"; point: CadPoint2; dir: CadPoint2 }
  | { kind: "circle"; center: CadPoint2; radius: number };

function supportOf(entity: CadCornerEntity): Support | null {
  if (entity.type === "line") {
    const dx = entity.end.x - entity.start.x;
    const dy = entity.end.y - entity.start.y;
    const length = Math.hypot(dx, dy);
    if (!(length > EPS)) return null;
    return {
      kind: "line",
      point: { x: entity.start.x, y: entity.start.y },
      dir: { x: dx / length, y: dy / length },
    };
  }
  if (!(entity.radius > EPS)) return null;
  return { kind: "circle", center: { x: entity.center.x, y: entity.center.y }, radius: entity.radius };
}

/** Los desfases a distancia `r`: dos por recta, y por fuera y por dentro en una circunferencia. */
function offsets(support: Support, radius: number): Support[] {
  if (support.kind === "line") {
    const normal = { x: -support.dir.y, y: support.dir.x };
    return [1, -1].map((sign) => ({
      kind: "line" as const,
      point: {
        x: support.point.x + normal.x * radius * sign,
        y: support.point.y + normal.y * radius * sign,
      },
      dir: support.dir,
    }));
  }
  const inner = support.radius - radius;
  return [
    { kind: "circle" as const, center: support.center, radius: support.radius + radius },
    ...(Math.abs(inner) > EPS
      ? [{ kind: "circle" as const, center: support.center, radius: Math.abs(inner) }]
      : []),
  ];
}

function intersectSupports(a: Support, b: Support): CadPoint2[] {
  if (a.kind === "line" && b.kind === "line") {
    const denominator = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
    if (Math.abs(denominator) < EPS) return [];
    const qx = b.point.x - a.point.x;
    const qy = b.point.y - a.point.y;
    const t = (qx * b.dir.y - qy * b.dir.x) / denominator;
    return [{ x: a.point.x + a.dir.x * t, y: a.point.y + a.dir.y * t }];
  }
  if (a.kind === "circle" && b.kind === "circle") {
    const dx = b.center.x - a.center.x;
    const dy = b.center.y - a.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance < EPS || distance > a.radius + b.radius + EPS) return [];
    if (distance < Math.abs(a.radius - b.radius) - EPS) return [];
    const along = (a.radius * a.radius - b.radius * b.radius + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, a.radius * a.radius - along * along));
    const mid = { x: a.center.x + (dx / distance) * along, y: a.center.y + (dy / distance) * along };
    if (height < EPS) return [mid];
    const perp = { x: -dy / distance, y: dx / distance };
    return [
      { x: mid.x + perp.x * height, y: mid.y + perp.y * height },
      { x: mid.x - perp.x * height, y: mid.y - perp.y * height },
    ];
  }
  const line = (a.kind === "line" ? a : b) as Extract<Support, { kind: "line" }>;
  const circle = (a.kind === "circle" ? a : b) as Extract<Support, { kind: "circle" }>;
  const fx = line.point.x - circle.center.x;
  const fy = line.point.y - circle.center.y;
  const projection = -(fx * line.dir.x + fy * line.dir.y);
  const closestX = line.point.x + line.dir.x * projection;
  const closestY = line.point.y + line.dir.y * projection;
  const gap = Math.hypot(closestX - circle.center.x, closestY - circle.center.y);
  if (gap > circle.radius + EPS) return [];
  const half = Math.sqrt(Math.max(0, circle.radius * circle.radius - gap * gap));
  if (half < EPS) return [{ x: closestX, y: closestY }];
  return [
    { x: closestX + line.dir.x * half, y: closestY + line.dir.y * half },
    { x: closestX - line.dir.x * half, y: closestY - line.dir.y * half },
  ];
}

/** El punto de la curva de apoyo más cercano al centro: el punto de tangencia. */
function tangentPoint(support: Support, center: CadPoint2): CadPoint2 {
  if (support.kind === "line") {
    const t =
      (center.x - support.point.x) * support.dir.x + (center.y - support.point.y) * support.dir.y;
    return { x: support.point.x + support.dir.x * t, y: support.point.y + support.dir.y * t };
  }
  const dx = center.x - support.center.x;
  const dy = center.y - support.center.y;
  const length = Math.hypot(dx, dy);
  if (length < EPS) return { x: support.center.x + support.radius, y: support.center.y };
  return {
    x: support.center.x + (dx / length) * support.radius,
    y: support.center.y + (dy / length) * support.radius,
  };
}

const distance = (a: CadPoint2, b: CadPoint2) => Math.hypot(a.x - b.x, a.y - b.y);
const normalizeAngle = (value: number) => ((value % 360) + 360) % 360;

export interface CadCurveFilletGeometry {
  /** El arco de empalme, listo para dar de alta. */
  arc: CadArc;
  /** Dónde toca cada objeto. Un círculo no se recorta, pero sí se informa. */
  tangents: [CadPoint2, CadPoint2];
}

/**
 * El empalme de radio `radius` entre dos curvas, elegido por los puntos de
 * designación.
 *
 * Devuelve `{ error }` en vez de lanzar: los ocho candidatos, la tangencia
 * imposible y el radio demasiado grande son resultados normales de una orden
 * interactiva, y una excepción obligaría a envolver cada llamada.
 */
export function computeCadCurveFillet(
  first: CadCornerEntity,
  second: CadCornerEntity,
  radius: number,
  arcId: string,
  pickFirst: CadPoint2,
  pickSecond: CadPoint2,
): CadCurveFilletGeometry | { error: string } {
  if (first.id === second.id) return { error: "hay que designar dos objetos distintos." };
  if (!Number.isFinite(radius) || radius <= 0) return { error: "el radio debe ser mayor que cero." };
  const supportA = supportOf(first);
  const supportB = supportOf(second);
  if (!supportA || !supportB)
    return { error: "uno de los objetos designados es degenerado (longitud o radio cero)." };

  let best: { center: CadPoint2; a: CadPoint2; b: CadPoint2; score: number } | null = null;
  for (const offsetA of offsets(supportA, radius))
    for (const offsetB of offsets(supportB, radius))
      for (const center of intersectSupports(offsetA, offsetB)) {
        if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) continue;
        const a = tangentPoint(supportA, center);
        const b = tangentPoint(supportB, center);
        // Se COMPRUEBA que el centro está de verdad a `radius` de las dos
        // curvas. Sin este filtro, la combinación de desfases equivocada cuela
        // un centro que no es tangente a nada y el arco sale flotando.
        if (Math.abs(distance(center, a) - radius) > 1e-6) continue;
        if (Math.abs(distance(center, b) - radius) > 1e-6) continue;
        const score = distance(a, pickFirst) + distance(b, pickSecond);
        if (!best || score < best.score) best = { center, a, b, score };
      }

  if (!best)
    return {
      error: `no hay ningún empalme de radio ${radius} entre estos objetos; pruebe con un radio menor.`,
    };
  if (distance(best.a, best.b) < 1e-9)
    return { error: "los objetos ya se tocan en ese punto: no hay esquina que redondear." };

  let startAngle = normalizeAngle(
    (Math.atan2(best.a.y - best.center.y, best.a.x - best.center.x) * 180) / Math.PI,
  );
  let endAngle = normalizeAngle(
    (Math.atan2(best.b.y - best.center.y, best.b.x - best.center.x) * 180) / Math.PI,
  );
  // El empalme es el arco CORTO entre las dos tangencias: el largo daría la
  // vuelta por fuera de la esquina. Es la misma regla que ya usa `cad-fillet`.
  if (normalizeAngle(endAngle - startAngle) > 180) [startAngle, endAngle] = [endAngle, startAngle];

  const z = "start" in first ? first.start.z : first.center.z;
  const arc: CadArc = {
    id: arcId,
    type: "arc",
    center: { x: best.center.x, y: best.center.y, z } as CadPoint3,
    radius,
    startAngle,
    endAngle,
    layer: first.layer,
    context: {
      provenance: { provider: "cad-editor" },
      metadata: { sourceType: "FILLET", sourceIds: `${first.id},${second.id}`, radius },
    },
  };
  return { arc, tangents: [best.a, best.b] };
}
