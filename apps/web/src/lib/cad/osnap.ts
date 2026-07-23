/**
 * Referencia a objetos (OSNAP) del CAD (AXOS-CAD-DEPTH-A9).
 *
 * El OSNAP —enganchar el cursor al extremo, al punto medio, al centro, al
 * cuadrante, a una intersección, a lo más cercano o al pie de la perpendicular—
 * es la característica que hace que dibujar en AutoCAD sea PRECISO en vez de "a
 * ojo". La caja rectangular no lo tenía. Este módulo resuelve, dado un cursor y
 * un conjunto de primitivas, el mejor punto de enganche dentro de una
 * tolerancia, con la prioridad clásica de AutoCAD. Geometría pura.
 */
import {
  arcContainsAngle,
  arcPoint,
  arcSweepDeg,
  type CadPrimitive,
  type CadVec2,
} from "./primitives";
import {
  circleCircleIntersections,
  lineArcIntersections,
  lineCircleIntersections,
  lineLineIntersection,
} from "./intersect";

export type OsnapType =
  | "endpoint"
  | "intersection"
  | "midpoint"
  | "center"
  | "quadrant"
  | "perpendicular"
  | "nearest";

export interface OsnapCandidate {
  type: OsnapType;
  point: CadVec2;
  distance: number;
}

// Prioridad clásica: menor número gana ante empates de cercanía.
const PRIORITY: Record<OsnapType, number> = {
  endpoint: 1,
  intersection: 2,
  midpoint: 3,
  center: 4,
  quadrant: 5,
  perpendicular: 6,
  nearest: 7,
};

function dist(a: CadVec2, b: CadVec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function sub(a: CadVec2, b: CadVec2): CadVec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: CadVec2, b: CadVec2): CadVec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(a: CadVec2, k: number): CadVec2 {
  return { x: a.x * k, y: a.y * k };
}
function dot(a: CadVec2, b: CadVec2): number {
  return a.x * b.x + a.y * b.y;
}

function nearestOnSegment(p: CadVec2, a: CadVec2, b: CadVec2): CadVec2 {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq));
  return add(a, scale(ab, t));
}
function footOnLine(p: CadVec2, a: CadVec2, b: CadVec2): CadVec2 | null {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  if (lenSq === 0) return null;
  const t = dot(sub(p, a), ab) / lenSq;
  return add(a, scale(ab, t));
}
function angleDeg(center: CadVec2, point: CadVec2): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

/** Segmentos rectos que componen una primitiva (polilínea → varios). */
function primitiveSegments(primitive: CadPrimitive): [CadVec2, CadVec2][] {
  if (primitive.kind === "line") return [[primitive.a, primitive.b]];
  if (primitive.kind === "polyline") {
    const segs: [CadVec2, CadVec2][] = [];
    const pts = primitive.points;
    for (let i = 0; i + 1 < pts.length; i += 1) segs.push([pts[i], pts[i + 1]]);
    if (primitive.closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]);
    return segs;
  }
  return [];
}

/** Puntos de enganche que ofrece una sola primitiva (sin intersecciones). */
export function primitiveOsnaps(
  primitive: CadPrimitive,
  cursor: CadVec2,
): OsnapCandidate[] {
  const out: OsnapCandidate[] = [];
  const push = (type: OsnapType, point: CadVec2) =>
    out.push({ type, point, distance: dist(cursor, point) });

  if (primitive.kind === "line" || primitive.kind === "polyline") {
    const segs = primitiveSegments(primitive);
    const verts =
      primitive.kind === "line"
        ? [primitive.a, primitive.b]
        : primitive.points;
    for (const v of verts) push("endpoint", v);
    for (const [a, b] of segs) {
      push("midpoint", { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      push("nearest", nearestOnSegment(cursor, a, b));
      const foot = footOnLine(cursor, a, b);
      if (foot) push("perpendicular", foot);
    }
    return out;
  }

  if (primitive.kind === "circle") {
    push("center", primitive.center);
    for (const q of [0, 90, 180, 270])
      push("quadrant", arcPoint(primitive.center, primitive.radius, q));
    const d = dist(cursor, primitive.center);
    if (d > 1e-9) {
      const dir = scale(sub(cursor, primitive.center), primitive.radius / d);
      push("nearest", add(primitive.center, dir));
    }
    return out;
  }

  // arco
  push("center", primitive.center);
  push("endpoint", arcPoint(primitive.center, primitive.radius, primitive.startAngle));
  push("endpoint", arcPoint(primitive.center, primitive.radius, primitive.endAngle));
  const mid = primitive.startAngle + arcSweepDeg(primitive.startAngle, primitive.endAngle) / 2;
  push("midpoint", arcPoint(primitive.center, primitive.radius, mid));
  for (const q of [0, 90, 180, 270]) {
    if (arcContainsAngle(q, primitive.startAngle, primitive.endAngle))
      push("quadrant", arcPoint(primitive.center, primitive.radius, q));
  }
  const da = dist(cursor, primitive.center);
  if (da > 1e-9) {
    const ca = angleDeg(primitive.center, cursor);
    if (arcContainsAngle(ca, primitive.startAngle, primitive.endAngle)) {
      const dir = scale(sub(cursor, primitive.center), primitive.radius / da);
      push("nearest", add(primitive.center, dir));
    }
  }
  return out;
}

function pairIntersections(x: CadPrimitive, y: CadPrimitive): CadVec2[] {
  const points: CadVec2[] = [];
  const segsX = primitiveSegments(x);
  const segsY = primitiveSegments(y);
  const isCircle = (p: CadPrimitive) => p.kind === "circle";
  const isArc = (p: CadPrimitive) => p.kind === "arc";

  // segmento-segmento
  for (const [a1, a2] of segsX)
    for (const [b1, b2] of segsY) {
      const hit = lineLineIntersection(a1, a2, b1, b2, true);
      if (hit) points.push(hit);
    }
  // segmento-círculo / segmento-arco (en ambos sentidos)
  const segCircle = (segs: [CadVec2, CadVec2][], c: CadPrimitive) => {
    if (c.kind === "circle")
      for (const [a, b] of segs)
        points.push(...lineCircleIntersections(a, b, c.center, c.radius, true));
    if (c.kind === "arc")
      for (const [a, b] of segs)
        points.push(
          ...lineArcIntersections(a, b, c.center, c.radius, c.startAngle, c.endAngle, true),
        );
  };
  segCircle(segsX, y);
  segCircle(segsY, x);
  // círculo/arco-círculo/arco
  if ((isCircle(x) || isArc(x)) && (isCircle(y) || isArc(y))) {
    const rx = x as Extract<CadPrimitive, { kind: "circle" | "arc" }>;
    const ry = y as Extract<CadPrimitive, { kind: "circle" | "arc" }>;
    const raw = circleCircleIntersections(rx.center, rx.radius, ry.center, ry.radius);
    for (const p of raw) {
      const okX = rx.kind === "circle" || arcContainsAngle(angleDeg(rx.center, p), rx.startAngle, rx.endAngle);
      const okY = ry.kind === "circle" || arcContainsAngle(angleDeg(ry.center, p), ry.startAngle, ry.endAngle);
      if (okX && okY) points.push(p);
    }
  }
  return points;
}

/**
 * Resuelve el mejor enganche para el cursor sobre el conjunto de primitivas,
 * dentro de `tolerance`. Respeta la prioridad clásica (extremo > intersección >
 * medio > centro > cuadrante > perpendicular > cercano) y, a igual prioridad,
 * el más cercano. `enabled` limita los tipos activos. Null si nada cae dentro.
 */
export function resolveOsnap(
  primitives: CadPrimitive[],
  cursor: CadVec2,
  tolerance: number,
  enabled?: OsnapType[],
): OsnapCandidate | null {
  const allow = enabled ? new Set(enabled) : null;
  const candidates: OsnapCandidate[] = [];
  for (const primitive of primitives) candidates.push(...primitiveOsnaps(primitive, cursor));
  for (let i = 0; i < primitives.length; i += 1)
    for (let j = i + 1; j < primitives.length; j += 1)
      for (const p of pairIntersections(primitives[i], primitives[j]))
        candidates.push({ type: "intersection", point: p, distance: dist(cursor, p) });

  let best: OsnapCandidate | null = null;
  for (const c of candidates) {
    if (c.distance > tolerance) continue;
    if (allow && !allow.has(c.type)) continue;
    if (
      !best ||
      PRIORITY[c.type] < PRIORITY[best.type] ||
      (PRIORITY[c.type] === PRIORITY[best.type] && c.distance < best.distance)
    )
      best = c;
  }
  return best;
}
