import { commitChange, type CadDocument, type CadEntity, type CadPoint3 } from './cad-document';
import { executeCadEntityCommand } from './entity-runtime';

type CadLine = Extract<CadEntity, { type: 'line' }>;
export type CadLineEndpoint = 'start' | 'end';

const EPS = 1e-9;

function intersection(target: CadLine, boundary: CadLine): { point: CadPoint3; targetParameter: number; boundaryParameter: number } {
  const rx = target.end.x - target.start.x;
  const ry = target.end.y - target.start.y;
  const sx = boundary.end.x - boundary.start.x;
  const sy = boundary.end.y - boundary.start.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) <= EPS) throw new Error('TRIM/EXTEND requires non-parallel LINE entities.');
  const qx = boundary.start.x - target.start.x;
  const qy = boundary.start.y - target.start.y;
  const targetParameter = (qx * sy - qy * sx) / denominator;
  const boundaryParameter = (qx * ry - qy * rx) / denominator;
  return {
    point: {
      x: target.start.x + targetParameter * rx,
      y: target.start.y + targetParameter * ry,
      z: target.start.z + targetParameter * (target.end.z - target.start.z),
    },
    targetParameter,
    boundaryParameter,
  };
}

function assertBoundaryHit(parameter: number) {
  if (parameter < -EPS || parameter > 1 + EPS) throw new Error('The cutting/boundary LINE does not reach the target intersection.');
}

export function computeCadLineTrim(target: CadLine, cutter: CadLine, keep: CadLineEndpoint): CadLine {
  if (target.id === cutter.id) throw new Error('TRIM requires two different LINE entities.');
  const hit = intersection(target, cutter);
  assertBoundaryHit(hit.boundaryParameter);
  if (hit.targetParameter <= EPS || hit.targetParameter >= 1 - EPS) throw new Error('TRIM intersection must fall inside the target LINE.');
  return keep === 'start' ? { ...target, end: hit.point } : { ...target, start: hit.point };
}

export function computeCadLineExtend(target: CadLine, boundary: CadLine, endpoint: CadLineEndpoint): CadLine {
  if (target.id === boundary.id) throw new Error('EXTEND requires two different LINE entities.');
  const hit = intersection(target, boundary);
  assertBoundaryHit(hit.boundaryParameter);
  if (endpoint === 'start' && hit.targetParameter >= -EPS) throw new Error('EXTEND start requires a boundary beyond the start endpoint.');
  if (endpoint === 'end' && hit.targetParameter <= 1 + EPS) throw new Error('EXTEND end requires a boundary beyond the end endpoint.');
  return endpoint === 'start' ? { ...target, start: hit.point } : { ...target, end: hit.point };
}

export function applyCadLineEdit(
  document: CadDocument,
  input: { operation: 'trim' | 'extend'; targetId: string; boundaryId: string; endpoint: CadLineEndpoint },
): CadDocument {
  const target = document.entities.find((entity): entity is CadLine => entity.id === input.targetId && entity.type === 'line');
  const boundary = document.entities.find((entity): entity is CadLine => entity.id === input.boundaryId && entity.type === 'line');
  if (!target || !boundary) throw new Error(`${input.operation.toUpperCase()} requires two existing LINE entities.`);
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
