import { commitChange, type CadDocument, type CadEntity, type CadPoint3 } from './cad-document';
import { executeCadEntityCommand } from './entity-runtime';

type CadLine = Extract<CadEntity, { type: 'line' }>;
type CadArc = Extract<CadEntity, { type: 'arc' }>;

export interface CadLineFilletGeometry {
  lineA: CadLine;
  lineB: CadLine;
  arc: CadArc;
  intersection: CadPoint3;
  tangentPoints: [CadPoint3, CadPoint3];
}

const EPS = 1e-9;
const point3 = (x: number, y: number, z = 0): CadPoint3 => ({ x, y, z });
const distance = (a: CadPoint3, b: CadPoint3) => Math.hypot(a.x - b.x, a.y - b.y);
const normalizeAngle = (value: number) => ((value % 360) + 360) % 360;

/**
 * El vértice de la esquina: donde se cortarían las dos rectas PROLONGADAS.
 *
 * Se exporta porque CHAMFER (`cad-chamfer.ts`) resuelve la esquina con esta
 * misma regla. Las dos órdenes se aplican sobre la misma selección de dos
 * líneas, así que responder distinto a la misma pareja sería incoherente; una
 * sola implementación evita que se separen con el tiempo. `operation` sólo
 * decide el nombre que ve el usuario en el error.
 */
export function intersectInfiniteLines(a: CadLine, b: CadLine, operation = 'FILLET'): CadPoint3 {
  const rx = a.end.x - a.start.x;
  const ry = a.end.y - a.start.y;
  const sx = b.end.x - b.start.x;
  const sy = b.end.y - b.start.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) <= EPS) throw new Error(`${operation} requires two non-parallel LINE entities.`);
  const qx = b.start.x - a.start.x;
  const qy = b.start.y - a.start.y;
  const t = (qx * sy - qy * sx) / denominator;
  return point3(a.start.x + t * rx, a.start.y + t * ry, (a.start.z + b.start.z) / 2);
}

/**
 * Cuál de los dos extremos es la esquina y qué dirección se conserva.
 *
 * Dos rectas que se cruzan dejan CUATRO esquinas posibles. La regla que las
 * desambigua sin depender de dónde pinchó el ratón: el extremo más CERCANO al
 * cruce es el que se mueve, y el lejano fija la dirección que sobrevive.
 * Exportada por el mismo motivo que `intersectInfiniteLines`.
 */
export function retainedRay(line: CadLine, intersection: CadPoint3, operation = 'FILLET') {
  const startDistance = distance(line.start, intersection);
  const endDistance = distance(line.end, intersection);
  const near: 'start' | 'end' = startDistance <= endDistance ? 'start' : 'end';
  const far = near === 'start' ? line.end : line.start;
  const available = distance(far, intersection);
  if (available <= EPS) throw new Error(`${operation} cannot use a zero-length LINE.`);
  return {
    near,
    far,
    available,
    direction: { x: (far.x - intersection.x) / available, y: (far.y - intersection.y) / available },
  };
}

/**
 * Computes the deterministic inside fillet for two LINE entities. The endpoint
 * nearest their infinite-line intersection is the corner; the opposite
 * endpoint defines the retained ray. This removes the usual four-solution
 * ambiguity without depending on transient pointer picks.
 */
export function computeCadLineFillet(
  lineA: CadLine,
  lineB: CadLine,
  radius: number,
  arcId: string,
): CadLineFilletGeometry {
  if (lineA.id === lineB.id) throw new Error('FILLET requires two different LINE entities.');
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('FILLET radius must be greater than zero.');
  if (!arcId.trim()) throw new Error('FILLET arc id is required.');

  const intersection = intersectInfiniteLines(lineA, lineB);
  const rayA = retainedRay(lineA, intersection);
  const rayB = retainedRay(lineB, intersection);
  const cosine = Math.max(-1, Math.min(1, rayA.direction.x * rayB.direction.x + rayA.direction.y * rayB.direction.y));
  const angle = Math.acos(cosine);
  if (angle <= 1e-7 || Math.PI - angle <= 1e-7) throw new Error('FILLET requires a non-collinear corner.');

  const tangentDistance = radius / Math.tan(angle / 2);
  if (tangentDistance > rayA.available + EPS || tangentDistance > rayB.available + EPS)
    throw new Error('FILLET radius is too large for the retained LINE segments.');

  const tangentA = point3(
    intersection.x + rayA.direction.x * tangentDistance,
    intersection.y + rayA.direction.y * tangentDistance,
    lineA.start.z,
  );
  const tangentB = point3(
    intersection.x + rayB.direction.x * tangentDistance,
    intersection.y + rayB.direction.y * tangentDistance,
    lineB.start.z,
  );
  const bisectorX = rayA.direction.x + rayB.direction.x;
  const bisectorY = rayA.direction.y + rayB.direction.y;
  const bisectorLength = Math.hypot(bisectorX, bisectorY);
  if (bisectorLength <= EPS) throw new Error('FILLET could not resolve the corner bisector.');
  const centerDistance = radius / Math.sin(angle / 2);
  const center = point3(
    intersection.x + (bisectorX / bisectorLength) * centerDistance,
    intersection.y + (bisectorY / bisectorLength) * centerDistance,
    (lineA.start.z + lineB.start.z) / 2,
  );
  let startAngle = normalizeAngle(Math.atan2(tangentA.y - center.y, tangentA.x - center.x) * 180 / Math.PI);
  let endAngle = normalizeAngle(Math.atan2(tangentB.y - center.y, tangentB.x - center.x) * 180 / Math.PI);
  if (normalizeAngle(endAngle - startAngle) > 180) [startAngle, endAngle] = [endAngle, startAngle];

  const trim = (line: CadLine, near: 'start' | 'end', tangent: CadPoint3): CadLine => near === 'start'
    ? { ...line, start: tangent }
    : { ...line, end: tangent };
  return {
    lineA: trim(lineA, rayA.near, tangentA),
    lineB: trim(lineB, rayB.near, tangentB),
    arc: {
      id: arcId,
      type: 'arc',
      center,
      radius,
      startAngle,
      endAngle,
      layer: lineA.layer,
      context: {
        provenance: { provider: 'cad-editor' },
        metadata: { sourceType: 'FILLET', sourceIds: `${lineA.id},${lineB.id}`, radius },
      },
    },
    intersection,
    tangentPoints: [tangentA, tangentB],
  };
}

/** Applies both trims plus the tangent ARC as one user-visible history entry. */
export function applyCadLineFillet(
  document: CadDocument,
  input: { lineAId: string; lineBId: string; radius: number; arcId: string },
): CadDocument {
  if (document.entities.some((entity) => entity.id === input.arcId)) throw new Error(`FILLET entity ${input.arcId} already exists.`);
  const lineA = document.entities.find((entity): entity is CadLine => entity.id === input.lineAId && entity.type === 'line');
  const lineB = document.entities.find((entity): entity is CadLine => entity.id === input.lineBId && entity.type === 'line');
  if (!lineA || !lineB) throw new Error('FILLET requires exactly two existing LINE entities.');
  const geometry = computeCadLineFillet(lineA, lineB, input.radius, input.arcId);

  let changed = executeCadEntityCommand(document, {
    type: 'properties', entityId: lineA.id,
    patch: { startX: geometry.lineA.start.x, startY: geometry.lineA.start.y, endX: geometry.lineA.end.x, endY: geometry.lineA.end.y },
  }).document;
  changed = executeCadEntityCommand(changed, {
    type: 'properties', entityId: lineB.id,
    patch: { startX: geometry.lineB.start.x, startY: geometry.lineB.start.y, endX: geometry.lineB.end.x, endY: geometry.lineB.end.y },
  }).document;

  return commitChange({
    ...changed,
    meta: { ...changed.meta, version: document.meta.version },
    history: [...document.history],
    entities: [...changed.entities, geometry.arc].sort((a, b) => a.id.localeCompare(b.id)),
    // El arco del fillet se dibuja AL FRENTE (final de la lista). Ordenar por
    // id lo insertaba en un punto arbitrario del z-order y, de paso,
    // reordenaba todo el espacio de modelo existente.
    modelSpace: { entityIds: [...new Set([...changed.modelSpace.entityIds, geometry.arc.id])] },
  }, `fillet:${lineA.id}:${lineB.id}:r${input.radius}`);
}
