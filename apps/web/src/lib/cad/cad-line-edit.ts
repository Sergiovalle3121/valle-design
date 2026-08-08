import { commitChange, type CadDocument, type CadEntity, type CadPoint3 } from './cad-document';
import { executeCadEntityCommand } from './entity-runtime';
import { lineArcIntersections, lineCircleIntersections } from './intersect';

type CadLine = Extract<CadEntity, { type: 'line' }>;
/**
 * Fronteras admitidas para TRIM/EXTEND.
 *
 * Antes sólo `line`: `cad-line-edit` resolvía dos rectas paramétricas a mano y
 * rechazaba lo demás. En cualquier CAD 2D se recorta contra un arco o un
 * círculo sin pensarlo — y la matemática ya estaba en `intersect.ts`, sólo
 * faltaba cablearla.
 */
export type CadEditBoundary = Extract<CadEntity, { type: 'line' | 'circle' | 'arc' }>;
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

export function applyCadLineEdit(
  document: CadDocument,
  input: { operation: 'trim' | 'extend'; targetId: string; boundaryId: string; endpoint: CadLineEndpoint },
): CadDocument {
  const target = document.entities.find((entity): entity is CadLine => entity.id === input.targetId && entity.type === 'line');
  // La FRONTERA ya no tiene por qué ser una línea: un arco o un círculo cortan
  // igual de bien, y su matemática vive en `intersect.ts`.
  const boundary = document.entities.find(
    (entity): entity is CadEditBoundary =>
      entity.id === input.boundaryId &&
      (entity.type === 'line' || entity.type === 'circle' || entity.type === 'arc'),
  );
  if (!target) throw new Error(`${input.operation.toUpperCase()} requires an existing LINE as the target.`);
  if (!boundary) throw new Error(`${input.operation.toUpperCase()} requires an existing LINE, CIRCLE or ARC as the boundary.`);
  const next = input.operation === 'trim'
    ? computeCadLineTrim(target, boundary, input.endpoint)
    : computeCadLineExtend(target, boundary, input.endpoint);
  const changed = executeCadEntityCommand(document, {
    type: 'properties', entityId: target.id,
    patch: { startX: next.start.x, startY: next.start.y, endX: next.end.x, endY: next.end.y },
  }).document;
  return commitChange({
    ...changed,
    meta: { ...changed.meta, version: document.meta.version },
    history: [...document.history],
  }, `${input.operation}:${target.id}:${input.endpoint}:boundary:${boundary.id}`);
}
