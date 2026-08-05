/**
 * Modelo de primitivas geométricas puras del CAD (VD-CAD-DEPTH-A1).
 *
 * El editor histórico modelaba TODO como una caja rectangular alineada a los
 * ejes: un círculo se guardaba como cuadrado, un arco no existía. Eso hacía que
 * el CAD se sintiera de juguete frente a AutoCAD. Este módulo introduce la
 * geometría real —línea, polilínea, círculo y arco— como datos puros, sin
 * dependencias del editor ni de React, de modo que import/export DXF, medición
 * y edición puedan operar sobre curvas de verdad.
 *
 * Convención de ángulos: GRADOS, sentido antihorario (CCW) desde el eje +X,
 * idéntica a la de DXF (códigos 50/51 de ARC), para round-trip sin pérdida.
 */

export interface CadVec2 {
  x: number;
  y: number;
}

export interface CadPrimitiveBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type CadPrimitive =
  | { kind: "line"; a: CadVec2; b: CadVec2 }
  | { kind: "polyline"; points: CadVec2[]; closed?: boolean }
  | { kind: "circle"; center: CadVec2; radius: number }
  | {
      kind: "arc";
      center: CadVec2;
      radius: number;
      /** Ángulo inicial en grados, CCW desde +X. */
      startAngle: number;
      /** Ángulo final en grados, CCW desde +X. */
      endAngle: number;
    };

const TAU = Math.PI * 2;

export function norm360(angleDeg: number): number {
  const wrapped = angleDeg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function closeEnough(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}

/** Punto sobre una circunferencia en `center`/`radius` al ángulo dado (grados). */
export function arcPoint(
  center: CadVec2,
  radius: number,
  angleDeg: number,
): CadVec2 {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radius * Math.cos(rad),
    y: center.y + radius * Math.sin(rad),
  };
}

/**
 * Barrido angular CCW de `start` a `end`, en grados (0, 360]. Un start igual a
 * end se interpreta como circunferencia completa (360), no como arco nulo: un
 * arco de barrido cero no tiene sentido para dibujar.
 */
export function arcSweepDeg(startAngle: number, endAngle: number): number {
  const sweep = norm360(endAngle - startAngle);
  return sweep === 0 ? 360 : sweep;
}

/** ¿El ángulo (grados) cae dentro del barrido CCW start→end? */
export function arcContainsAngle(
  angleDeg: number,
  startAngle: number,
  endAngle: number,
  tol = 1e-9,
): boolean {
  const sweep = arcSweepDeg(startAngle, endAngle);
  if (closeEnough(sweep, 360)) return true;
  const rel = norm360(angleDeg - startAngle);
  return rel <= sweep + tol;
}

function boundsOfPoints(points: CadVec2[]): CadPrimitiveBounds {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function mergeBounds(
  a: CadPrimitiveBounds,
  b: CadPrimitiveBounds,
): CadPrimitiveBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Caja envolvente exacta de un arco: considera los extremos y, además, los
 * puntos cardinales (0/90/180/270°) que caen dentro del barrido —donde la
 * curva alcanza sus máximos/mínimos en x/y—. Aproximar por la caja del círculo
 * completo exageraría el tamaño de un arco pequeño.
 */
function arcBounds(
  center: CadVec2,
  radius: number,
  startAngle: number,
  endAngle: number,
): CadPrimitiveBounds {
  const extremes: CadVec2[] = [
    arcPoint(center, radius, startAngle),
    arcPoint(center, radius, endAngle),
  ];
  for (const cardinal of [0, 90, 180, 270]) {
    if (arcContainsAngle(cardinal, startAngle, endAngle)) {
      extremes.push(arcPoint(center, radius, cardinal));
    }
  }
  return boundsOfPoints(extremes);
}

/** Caja envolvente de cualquier primitiva. */
export function primitiveBounds(primitive: CadPrimitive): CadPrimitiveBounds {
  switch (primitive.kind) {
    case "line":
      return boundsOfPoints([primitive.a, primitive.b]);
    case "polyline":
      return boundsOfPoints(primitive.points);
    case "circle":
      return {
        minX: primitive.center.x - primitive.radius,
        minY: primitive.center.y - primitive.radius,
        maxX: primitive.center.x + primitive.radius,
        maxY: primitive.center.y + primitive.radius,
      };
    case "arc":
      return arcBounds(
        primitive.center,
        primitive.radius,
        primitive.startAngle,
        primitive.endAngle,
      );
  }
}

/** Caja envolvente de un conjunto de primitivas (null si está vacío). */
export function primitivesBounds(
  primitives: CadPrimitive[],
): CadPrimitiveBounds | null {
  let bounds: CadPrimitiveBounds | null = null;
  for (const primitive of primitives) {
    const b = primitiveBounds(primitive);
    bounds = bounds ? mergeBounds(bounds, b) : b;
  }
  return bounds;
}

function distance(a: CadVec2, b: CadVec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Longitud (perímetro para cerrados) de una primitiva. */
export function primitiveLength(primitive: CadPrimitive): number {
  switch (primitive.kind) {
    case "line":
      return distance(primitive.a, primitive.b);
    case "polyline": {
      let total = 0;
      for (let i = 1; i < primitive.points.length; i += 1) {
        total += distance(primitive.points[i - 1], primitive.points[i]);
      }
      if (primitive.closed && primitive.points.length > 2) {
        total += distance(
          primitive.points[primitive.points.length - 1],
          primitive.points[0],
        );
      }
      return total;
    }
    case "circle":
      return TAU * primitive.radius;
    case "arc":
      return (
        primitive.radius *
        (arcSweepDeg(primitive.startAngle, primitive.endAngle) * (Math.PI / 180))
      );
  }
}

function shoelaceArea(points: CadVec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Área encerrada. Círculo → πr²; polilínea cerrada → shoelace. Curvas abiertas
 * (línea, polilínea abierta, arco) → 0: no encierran región.
 */
export function primitiveArea(primitive: CadPrimitive): number {
  switch (primitive.kind) {
    case "circle":
      return Math.PI * primitive.radius * primitive.radius;
    case "polyline":
      return primitive.closed && primitive.points.length >= 3
        ? shoelaceArea(primitive.points)
        : 0;
    default:
      return 0;
  }
}

function translatePoint(point: CadVec2, dx: number, dy: number): CadVec2 {
  return { x: point.x + dx, y: point.y + dy };
}

/** Traslada una primitiva por (dx, dy). */
export function translatePrimitive(
  primitive: CadPrimitive,
  dx: number,
  dy: number,
): CadPrimitive {
  switch (primitive.kind) {
    case "line":
      return {
        kind: "line",
        a: translatePoint(primitive.a, dx, dy),
        b: translatePoint(primitive.b, dx, dy),
      };
    case "polyline":
      return {
        kind: "polyline",
        points: primitive.points.map((p) => translatePoint(p, dx, dy)),
        closed: primitive.closed,
      };
    case "circle":
      return {
        kind: "circle",
        center: translatePoint(primitive.center, dx, dy),
        radius: primitive.radius,
      };
    case "arc":
      return {
        kind: "arc",
        center: translatePoint(primitive.center, dx, dy),
        radius: primitive.radius,
        startAngle: primitive.startAngle,
        endAngle: primitive.endAngle,
      };
  }
}

function rotatePoint(
  point: CadVec2,
  center: CadVec2,
  angleDeg: number,
): CadVec2 {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Rota una primitiva alrededor de `pivot` por `angleDeg` (CCW). */
export function rotatePrimitive(
  primitive: CadPrimitive,
  pivot: CadVec2,
  angleDeg: number,
): CadPrimitive {
  switch (primitive.kind) {
    case "line":
      return {
        kind: "line",
        a: rotatePoint(primitive.a, pivot, angleDeg),
        b: rotatePoint(primitive.b, pivot, angleDeg),
      };
    case "polyline":
      return {
        kind: "polyline",
        points: primitive.points.map((p) => rotatePoint(p, pivot, angleDeg)),
        closed: primitive.closed,
      };
    case "circle":
      return {
        kind: "circle",
        center: rotatePoint(primitive.center, pivot, angleDeg),
        radius: primitive.radius,
      };
    case "arc":
      return {
        kind: "arc",
        center: rotatePoint(primitive.center, pivot, angleDeg),
        radius: primitive.radius,
        startAngle: norm360(primitive.startAngle + angleDeg),
        endAngle: norm360(primitive.endAngle + angleDeg),
      };
  }
}

function scalePoint(point: CadVec2, base: CadVec2, factor: number): CadVec2 {
  return {
    x: base.x + (point.x - base.x) * factor,
    y: base.y + (point.y - base.y) * factor,
  };
}

/** Escala uniforme de una primitiva respecto de `base` por `factor` (>0). */
export function scalePrimitive(
  primitive: CadPrimitive,
  base: CadVec2,
  factor: number,
): CadPrimitive {
  switch (primitive.kind) {
    case "line":
      return {
        kind: "line",
        a: scalePoint(primitive.a, base, factor),
        b: scalePoint(primitive.b, base, factor),
      };
    case "polyline":
      return {
        kind: "polyline",
        points: primitive.points.map((p) => scalePoint(p, base, factor)),
        closed: primitive.closed,
      };
    case "circle":
      return {
        kind: "circle",
        center: scalePoint(primitive.center, base, factor),
        radius: primitive.radius * Math.abs(factor),
      };
    case "arc":
      return {
        kind: "arc",
        center: scalePoint(primitive.center, base, factor),
        radius: primitive.radius * Math.abs(factor),
        startAngle: primitive.startAngle,
        endAngle: primitive.endAngle,
      };
  }
}

function distancePointToSegment(p: CadVec2, a: CadVec2, b: CadVec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Distancia mínima de un punto al trazo de la primitiva (no al interior). Para
 * un círculo es |dist(centro, punto) − radio|; para un arco, si el ángulo del
 * punto cae dentro del barrido, misma fórmula, si no, la menor distancia a los
 * dos extremos del arco.
 */
export function nearestDistance(
  primitive: CadPrimitive,
  point: CadVec2,
): number {
  switch (primitive.kind) {
    case "line":
      return distancePointToSegment(point, primitive.a, primitive.b);
    case "polyline": {
      const pts = primitive.points;
      if (pts.length === 0) return Infinity;
      if (pts.length === 1) return distance(point, pts[0]);
      let best = Infinity;
      for (let i = 1; i < pts.length; i += 1) {
        best = Math.min(
          best,
          distancePointToSegment(point, pts[i - 1], pts[i]),
        );
      }
      if (primitive.closed && pts.length > 2) {
        best = Math.min(
          best,
          distancePointToSegment(point, pts[pts.length - 1], pts[0]),
        );
      }
      return best;
    }
    case "circle":
      return Math.abs(distance(point, primitive.center) - primitive.radius);
    case "arc": {
      const angle = Math.atan2(
        point.y - primitive.center.y,
        point.x - primitive.center.x,
      );
      const angleDeg = (angle * 180) / Math.PI;
      if (
        arcContainsAngle(angleDeg, primitive.startAngle, primitive.endAngle)
      ) {
        return Math.abs(distance(point, primitive.center) - primitive.radius);
      }
      const start = arcPoint(
        primitive.center,
        primitive.radius,
        primitive.startAngle,
      );
      const end = arcPoint(
        primitive.center,
        primitive.radius,
        primitive.endAngle,
      );
      return Math.min(distance(point, start), distance(point, end));
    }
  }
}

/**
 * Teselado de un arco en una polilínea de `segments` tramos (mínimo 1). Útil
 * para render en editores que sólo dibujan segmentos y para exportadores DXF
 * heredados sin ARC nativo.
 */
export function arcToPolyline(
  center: CadVec2,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments = 32,
): CadVec2[] {
  const steps = Math.max(1, Math.floor(segments));
  const sweep = arcSweepDeg(startAngle, endAngle);
  const points: CadVec2[] = [];
  for (let i = 0; i <= steps; i += 1) {
    points.push(arcPoint(center, radius, startAngle + (sweep * i) / steps));
  }
  return points;
}

/** Teselado de una circunferencia completa en un polígono de `segments` lados. */
export function circleToPolyline(
  center: CadVec2,
  radius: number,
  segments = 48,
): CadVec2[] {
  const steps = Math.max(3, Math.floor(segments));
  const points: CadVec2[] = [];
  for (let i = 0; i < steps; i += 1) {
    points.push(arcPoint(center, radius, (360 * i) / steps));
  }
  return points;
}
