import { commitChange, type CadDocument, type CadEntity, type CadPoint3 } from './cad-document';
import { executeCadEntityCommand } from './entity-commands';
import { lineArcIntersections, lineCircleIntersections, arcArcIntersections } from './intersect';
import { arcSweepDeg, type CadVec2 } from './primitives';

type CadLine = Extract<CadEntity, { type: 'line' }>;
/**
 * Fronteras admitidas para TRIM/EXTEND.
 *
 * Antes sólo `line`: `cad-line-edit` resolvía dos rectas paramétricas a mano y
 * rechazaba lo demás. En cualquier CAD 2D se recorta contra un arco o un
 * círculo sin pensarlo — y la matemática ya estaba en `intersect.ts`, sólo
 * faltaba cablearla.
 */
export type CadEditBoundary = Extract<CadEntity, { type: 'line' | 'circle' | 'arc' | 'polyline' }>;
export type CadLineEndpoint = 'start' | 'end';

const EPS = 1e-9;

/** Un cruce, expresado como parámetro sobre la recta INFINITA del objetivo. */
interface BoundaryHit {
  point: CadPoint3;
  targetParameter: number;
}

/** Punto del objetivo en el parámetro dado, con su cota interpolada. */
function pointAt(target: CadLine, t: number): CadPoint3 {
  return {
    x: target.start.x + t * (target.end.x - target.start.x),
    y: target.start.y + t * (target.end.y - target.start.y),
    z: target.start.z + t * (target.end.z - target.start.z),
  };
}

/** Parámetro sobre la recta del objetivo del punto 2D dado. */
function parameterOf(target: CadLine, point: { x: number; y: number }): number {
  const rx = target.end.x - target.start.x;
  const ry = target.end.y - target.start.y;
  const lengthSquared = rx * rx + ry * ry;
  if (lengthSquared <= EPS) throw new Error('TRIM/EXTEND requires a target LINE with length.');
  return ((point.x - target.start.x) * rx + (point.y - target.start.y) * ry) / lengthSquared;
}

/**
 * Los tramos RECTOS de una polilínea, como pares de puntos.
 *
 * Una polilínea con `bulge` describe ARCOS. Aplanarlos a cuerdas daría cortes
 * en el sitio equivocado —la frontera se ve cruzar por un punto y el recorte
 * cae en otro—, que es peor que negarse. Se rechaza en bloque, igual que hace
 * OFFSET con el mismo caso.
 */
function polylineSegments(boundary: Extract<CadEntity, { type: 'polyline' }>): [CadVec2, CadVec2][] {
  if (boundary.vertices.some((vertex) => (vertex.bulge ?? 0) !== 0))
    throw new Error('TRIM/EXTEND no admite todavía una polilínea con tramos en arco (bulge): aplanarlos cortaría en el sitio equivocado.');
  const points = boundary.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));
  const segments: [CadVec2, CadVec2][] = [];
  const count = boundary.closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1)
    segments.push([points[index], points[(index + 1) % points.length]]);
  return segments;
}

/** Cruce de dos SEGMENTOS, o null si no se tocan. Sin excepciones: en una
 *  polilínea es normal que un tramo concreto no cruce. */
function segmentHit(target: CadLine, a: CadVec2, b: CadVec2): number | null {
  const rx = target.end.x - target.start.x;
  const ry = target.end.y - target.start.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) <= EPS) return null;
  const qx = a.x - target.start.x;
  const qy = a.y - target.start.y;
  const boundaryParameter = (qx * ry - qy * rx) / denominator;
  if (boundaryParameter < -EPS || boundaryParameter > 1 + EPS) return null;
  return (qx * sy - qy * sx) / denominator;
}

/**
 * Todos los cruces del objetivo con la frontera.
 *
 * El objetivo se trata como recta INFINITA a propósito: TRIM filtrará después
 * los que caen dentro del segmento y EXTEND los que quedan más allá. La
 * frontera, en cambio, se respeta como es — un arco sólo corta dentro de su
 * barrido, y un segmento sólo dentro de su longitud.
 */
function boundaryHits(target: CadLine, boundary: CadEditBoundary): BoundaryHit[] {
  const a = { x: target.start.x, y: target.start.y };
  const b = { x: target.end.x, y: target.end.y };

  if (boundary.type === 'line') {
    const rx = target.end.x - target.start.x;
    const ry = target.end.y - target.start.y;
    const sx = boundary.end.x - boundary.start.x;
    const sy = boundary.end.y - boundary.start.y;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) <= EPS) throw new Error('TRIM/EXTEND requires a non-parallel boundary: these LINE entities never intersect.');
    const qx = boundary.start.x - target.start.x;
    const qy = boundary.start.y - target.start.y;
    const targetParameter = (qx * sy - qy * sx) / denominator;
    const boundaryParameter = (qx * ry - qy * rx) / denominator;
    // La frontera es un SEGMENTO: un cruce fuera de ella no la toca.
    if (boundaryParameter < -EPS || boundaryParameter > 1 + EPS)
      throw new Error('The cutting/boundary entity does not reach the target intersection.');
    return [{ point: pointAt(target, targetParameter), targetParameter }];
  }

  if (boundary.type === 'polyline') {
    // Cada tramo se respeta como SEGMENTO; que uno concreto no cruce es normal.
    return polylineSegments(boundary)
      .map(([from, to]) => segmentHit(target, from, to))
      .filter((value): value is number => value !== null)
      .map((targetParameter) => ({ point: pointAt(target, targetParameter), targetParameter }))
      .sort((left, right) => left.targetParameter - right.targetParameter);
  }

  const points =
    boundary.type === 'circle'
      ? lineCircleIntersections(a, b, boundary.center, boundary.radius, false)
      : lineArcIntersections(
          a,
          b,
          boundary.center,
          boundary.radius,
          boundary.startAngle,
          boundary.endAngle,
          false,
        );

  return points
    .map((point) => {
      const targetParameter = parameterOf(target, point);
      return { point: pointAt(target, targetParameter), targetParameter };
    })
    .sort((left, right) => left.targetParameter - right.targetParameter);
}

/**
 * TRIM: recorta el objetivo en un cruce que caiga DENTRO del segmento.
 *
 * Una recta corta a un círculo en DOS puntos, así que elegir es parte del
 * problema: conservando el inicio se recorta en el PRIMER cruce avanzando desde
 * él —cortar en el más lejano se comería trabajo que el usuario quería
 * conservar— y conservando el fin, en el ÚLTIMO, por simetría.
 */
export function computeCadLineTrim(target: CadLine, cutter: CadEditBoundary, keep: CadLineEndpoint): CadLine {
  if (target.id === cutter.id) throw new Error('TRIM requires two different entities.');
  const inside = boundaryHits(target, cutter).filter(
    (hit) => hit.targetParameter > EPS && hit.targetParameter < 1 - EPS,
  );
  if (!inside.length)
    throw new Error('TRIM intersection must fall inside the target LINE: this boundary does not cross it there.');
  const hit = keep === 'start' ? inside[0] : inside[inside.length - 1];
  return keep === 'start' ? { ...target, end: hit.point } : { ...target, start: hit.point };
}

/**
 * EXTEND: alarga el objetivo hasta el cruce MÁS CERCANO al extremo que se
 * estira. Pasar al segundo cruce atravesaría la frontera de lado a lado, que es
 * justo lo que EXTEND no debe hacer.
 */
export function computeCadLineExtend(target: CadLine, boundary: CadEditBoundary, endpoint: CadLineEndpoint): CadLine {
  if (target.id === boundary.id) throw new Error('EXTEND requires two different entities.');
  const hits = boundaryHits(target, boundary);
  if (endpoint === 'start') {
    // Más allá del inicio son los parámetros NEGATIVOS; el más cercano es el
    // mayor de ellos.
    const beyond = hits.filter((hit) => hit.targetParameter < -EPS);
    if (!beyond.length) throw new Error('EXTEND start requires a boundary beyond the start endpoint.');
    return { ...target, start: beyond[beyond.length - 1].point };
  }
  const beyond = hits.filter((hit) => hit.targetParameter > 1 + EPS);
  if (!beyond.length) throw new Error('EXTEND end requires a boundary beyond the end endpoint.');
  return { ...target, end: beyond[0].point };
}

type CadArc = Extract<CadEntity, { type: 'arc' }>;

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;
const angleDegOf = (center: { x: number; y: number }, point: { x: number; y: number }) =>
  norm360((Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI);

/**
 * Cruces de un ARCO objetivo con la frontera, ordenados por AVANCE DEL BARRIDO.
 *
 * El avance relativo —`norm360(ángulo − startAngle)`— hace aquí el mismo papel
 * que el parámetro sobre la recta en el caso de la línea: 0 en el inicio y
 * `sweep` en el final. Con él, «el primer cruce» y «el más cercano al extremo»
 * significan lo mismo para un arco que para un segmento.
 *
 * El objetivo se considera CIRCUNFERENCIA COMPLETA a propósito: TRIM se queda
 * después con los cruces dentro del barrido y EXTEND con los de fuera. La
 * frontera, en cambio, se respeta como es.
 */
function arcHits(target: CadArc, boundary: CadEditBoundary): { angle: number; advance: number }[] {
  const center = { x: target.center.x, y: target.center.y };
  const points =
    boundary.type === 'polyline'
      ? polylineSegments(boundary).flatMap(([from, to]) =>
          lineCircleIntersections(from, to, center, target.radius, true),
        )
      : boundary.type === 'line'
      ? lineCircleIntersections(
          { x: boundary.start.x, y: boundary.start.y },
          { x: boundary.end.x, y: boundary.end.y },
          center,
          target.radius,
          true,
        )
      : boundary.type === 'circle'
        ? arcArcIntersections(center, target.radius, 0, 360, boundary.center, boundary.radius, 0, 360)
        : arcArcIntersections(
            center,
            target.radius,
            0,
            360,
            boundary.center,
            boundary.radius,
            boundary.startAngle,
            boundary.endAngle,
          );

  return points
    .map((point) => {
      const angle = angleDegOf(center, point);
      return { angle, advance: norm360(angle - target.startAngle) };
    })
    .sort((left, right) => left.advance - right.advance);
}

/**
 * TRIM de un ARCO: mueve el extremo ANGULAR, no los puntos.
 *
 * Conservando el inicio se corta en el PRIMER cruce del barrido y se mueve
 * `endAngle`; conservando el fin, en el ÚLTIMO, moviendo `startAngle`. Es la
 * misma regla que para la línea, expresada en avance de barrido.
 */
export function computeCadArcTrim(target: CadArc, cutter: CadEditBoundary, keep: CadLineEndpoint): CadArc {
  if (target.id === cutter.id) throw new Error('TRIM requires two different entities.');
  const sweep = arcSweepDeg(target.startAngle, target.endAngle);
  const inside = arcHits(target, cutter).filter(
    (hit) => hit.advance > EPS && hit.advance < sweep - EPS,
  );
  if (!inside.length)
    throw new Error('TRIM intersection must fall inside the target ARC sweep: this boundary does not cross it there.');
  return keep === 'start'
    ? { ...target, endAngle: inside[0].angle }
    : { ...target, startAngle: inside[inside.length - 1].angle };
}

/**
 * EXTEND de un ARCO: crece por el extremo pedido hasta el cruce inmediato.
 *
 * Los cruces de FUERA del barrido son los candidatos. Para crecer por delante
 * vale el de menor avance por encima de `sweep`; para crecer hacia atrás, el de
 * mayor avance (el que queda justo antes del inicio yendo en sentido horario).
 * Pasar de largo daría la vuelta al arco entero.
 */
export function computeCadArcExtend(target: CadArc, boundary: CadEditBoundary, endpoint: CadLineEndpoint): CadArc {
  if (target.id === boundary.id) throw new Error('EXTEND requires two different entities.');
  const sweep = arcSweepDeg(target.startAngle, target.endAngle);
  const outside = arcHits(target, boundary).filter((hit) => hit.advance > sweep + EPS);
  if (!outside.length)
    throw new Error(`EXTEND ${endpoint} requires a boundary beyond the ARC ${endpoint} endpoint.`);
  return endpoint === 'end'
    ? { ...target, endAngle: outside[0].angle }
    : { ...target, startAngle: outside[outside.length - 1].angle };
}

export function applyCadLineEdit(
  document: CadDocument,
  input: { operation: 'trim' | 'extend'; targetId: string; boundaryId: string; endpoint: CadLineEndpoint },
): CadDocument {
  const target = document.entities.find(
    (entity): entity is CadLine | CadArc =>
      entity.id === input.targetId && (entity.type === 'line' || entity.type === 'arc'),
  );
  // La FRONTERA ya no tiene por qué ser una línea: un arco o un círculo cortan
  // igual de bien, y su matemática vive en `intersect.ts`.
  const boundary = document.entities.find(
    (entity): entity is CadEditBoundary =>
      entity.id === input.boundaryId &&
      (entity.type === 'line' ||
        entity.type === 'circle' ||
        entity.type === 'arc' ||
        entity.type === 'polyline'),
  );
  if (!target) throw new Error(`${input.operation.toUpperCase()} requires an existing LINE or ARC as the target.`);
  if (!boundary) throw new Error(`${input.operation.toUpperCase()} requires an existing LINE, CIRCLE, ARC or POLYLINE as the boundary.`);
  // El parcheo depende del tipo: una línea mueve extremos, un arco mueve
  // ÁNGULOS. Son propiedades distintas del mismo adaptador.
  const patch =
    target.type === 'arc'
      ? (() => {
          const next = input.operation === 'trim'
            ? computeCadArcTrim(target, boundary, input.endpoint)
            : computeCadArcExtend(target, boundary, input.endpoint);
          return { startAngle: next.startAngle, endAngle: next.endAngle };
        })()
      : (() => {
          const next = input.operation === 'trim'
            ? computeCadLineTrim(target, boundary, input.endpoint)
            : computeCadLineExtend(target, boundary, input.endpoint);
          return { startX: next.start.x, startY: next.start.y, endX: next.end.x, endY: next.end.y };
        })();
  const changed = executeCadEntityCommand(document, {
    type: 'properties', entityId: target.id, patch,
  }).document;
  return commitChange({
    ...changed,
    meta: { ...changed.meta, version: document.meta.version },
    history: [...document.history],
  }, `${input.operation}:${target.id}:${input.endpoint}:boundary:${boundary.id}`);
}
