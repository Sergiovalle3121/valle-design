import type { CadEntity, CadPoint2 } from './cad-document';
import { DEFAULT_MLEADER_STYLE } from './mleader';

export type CadMleaderEntity = Extract<CadEntity, { type: 'mleader' }>;
export type CadMleaderReference = NonNullable<CadMleaderEntity['references']>[number];

export interface CadMleaderPath {
  points: CadPoint2[];
  closed: boolean;
  role: 'leader' | 'landing' | 'arrow';
}

export interface CadMleaderGeometry {
  paths: CadMleaderPath[];
  leaderLines: CadPoint2[][];
  textAnchor: CadPoint2;
  textDirection: 1 | -1;
}

const add = (a: CadPoint2, b: CadPoint2): CadPoint2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: CadPoint2, b: CadPoint2): CadPoint2 => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (point: CadPoint2, factor: number): CadPoint2 => ({ x: point.x * factor, y: point.y * factor });
const normalize = (point: CadPoint2): CadPoint2 | null => {
  const length = Math.hypot(point.x, point.y);
  return length > 1e-9 ? { x: point.x / length, y: point.y / length } : null;
};
const midpoint = (a: CadPoint2, b: CadPoint2): CadPoint2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function cadMleaderLines(entity: CadMleaderEntity): CadPoint2[][] {
  const lines = entity.leaderLines?.length ? entity.leaderLines : [entity.vertices];
  return lines.filter((line) => line.length >= 2).map((line) => line.map((point) => ({ x: point.x, y: point.y })));
}

function arrowPaths(entity: CadMleaderEntity, tip: CadPoint2, next: CadPoint2): CadMleaderPath[] {
  const arrowhead = entity.arrowhead ?? 'closed-filled';
  if (arrowhead === 'none') return [];
  const direction = normalize(sub(next, tip));
  if (!direction) return [];
  const size = Math.max(1e-6, entity.arrowSize ?? DEFAULT_MLEADER_STYLE.arrowSize);
  const perpendicular = { x: -direction.y, y: direction.x };
  const base = add(tip, scale(direction, size));
  const left = add(base, scale(perpendicular, size * 0.35));
  const right = add(base, scale(perpendicular, -size * 0.35));
  if (arrowhead === 'open') return [
    { points: [left, tip, right], closed: false, role: 'arrow' },
  ];
  if (arrowhead === 'architectural-tick') return [
    { points: [add(tip, scale(add(direction, perpendicular), -size * 0.45)), add(tip, scale(add(direction, perpendicular), size * 0.45))], closed: false, role: 'arrow' },
  ];
  if (arrowhead === 'dot') return [{
    points: Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2;
      return { x: tip.x + Math.cos(angle) * size * 0.3, y: tip.y + Math.sin(angle) * size * 0.3 };
    }),
    closed: true,
    role: 'arrow',
  }];
  return [{ points: [tip, left, right], closed: true, role: 'arrow' }];
}

export function buildCadMleaderGeometry(entity: CadMleaderEntity): CadMleaderGeometry | null {
  const leaderLines = cadMleaderLines(entity);
  if (!leaderLines.length) return null;
  const paths: CadMleaderPath[] = [];
  for (const line of leaderLines) {
    paths.push({ points: line, closed: false, role: 'leader' });
    paths.push(...arrowPaths(entity, line[0], line[1]));
  }
  const primaryElbow = leaderLines[0].at(-1)!;
  const textAnchor = { x: entity.textPosition.x, y: entity.textPosition.y };
  if (entity.landing !== false && Math.hypot(primaryElbow.x - textAnchor.x, primaryElbow.y - textAnchor.y) > 1e-9)
    paths.push({ points: [primaryElbow, textAnchor], closed: false, role: 'landing' });
  return {
    paths,
    leaderLines,
    textAnchor,
    textDirection: textAnchor.x >= primaryElbow.x ? 1 : -1,
  };
}

function rotatedCorner(entity: Extract<CadEntity, { type: 'box' | 'station' }>): CadPoint2 {
  const center = { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 };
  const radians = entity.rotation * Math.PI / 180;
  const local = { x: entity.w / 2, y: -entity.h / 2 };
  return {
    x: center.x + local.x * Math.cos(radians) - local.y * Math.sin(radians),
    y: center.y + local.x * Math.sin(radians) + local.y * Math.cos(radians),
  };
}

export function cadMleaderAssociationAnchor(entity: CadEntity, reference: CadMleaderReference): CadPoint2 | null {
  if (reference.anchor === 'corner-ne' && (entity.type === 'box' || entity.type === 'station')) return rotatedCorner(entity);
  if (reference.anchor === 'insertion') {
    if (entity.type === 'mtext' || entity.type === 'insert') return entity.insertion;
    if (entity.type === 'text') return { x: entity.x, y: entity.y };
  }
  if (reference.anchor === 'start') {
    if (entity.type === 'line') return entity.start;
    if (entity.type === 'polyline') return entity.vertices[0] ?? null;
    if (entity.type === 'spline') return entity.controlPoints[0] ?? null;
  }
  if (reference.anchor === 'end') {
    if (entity.type === 'line') return entity.end;
    if (entity.type === 'polyline') return entity.vertices.at(-1) ?? null;
    if (entity.type === 'spline') return entity.controlPoints.at(-1) ?? null;
  }
  if (reference.anchor === 'control' && entity.type === 'spline') return entity.controlPoints[reference.index ?? 0] ?? null;
  if (reference.anchor === 'center') {
    if (entity.type === 'box' || entity.type === 'station') return { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 };
    if (entity.type === 'line') return midpoint(entity.start, entity.end);
    if (entity.type === 'circle' || entity.type === 'arc' || entity.type === 'ellipse') return entity.center;
    if (entity.type === 'polyline' && entity.vertices.length) {
      const sum = entity.vertices.reduce((value, point) => add(value, point), { x: 0, y: 0 });
      return scale(sum, 1 / entity.vertices.length);
    }
    if (entity.type === 'hatch' && entity.boundaries.flat().length) {
      const points = entity.boundaries.flat();
      return { x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2, y: (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2 };
    }
    if (entity.type === 'dimension') return midpoint(entity.a, entity.b);
    if (entity.type === 'mleader') return entity.textPosition;
  }
  if ((reference.anchor === 'arc-start' || reference.anchor === 'arc-end') && (entity.type === 'arc' || entity.type === 'circle')) {
    const angle = entity.type === 'circle' ? (reference.anchor === 'arc-start' ? 0 : 180) : reference.anchor === 'arc-start' ? entity.startAngle : entity.endAngle;
    return { x: entity.center.x + Math.cos(angle * Math.PI / 180) * entity.radius, y: entity.center.y + Math.sin(angle * Math.PI / 180) * entity.radius };
  }
  if ((reference.anchor === 'major-start' || reference.anchor === 'major-end') && entity.type === 'ellipse') {
    const sign = reference.anchor === 'major-start' ? 1 : -1;
    return { x: entity.center.x + entity.majorAxis.x * sign, y: entity.center.y + entity.majorAxis.y * sign };
  }
  return null;
}

export function regenerateAssociativeMleaders(
  entities: readonly CadEntity[],
  changedEntityIds: readonly string[],
): { entities: CadEntity[]; regeneratedIds: string[]; brokenIds: string[] } {
  const changed = new Set(changedEntityIds);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const regeneratedIds: string[] = [];
  const brokenIds: string[] = [];
  const next = entities.map((entity): CadEntity => {
    if (entity.type !== 'mleader' || !entity.associative || !entity.references?.some((reference) => changed.has(reference.entityId))) return entity;
    const lines = cadMleaderLines(entity);
    if (!lines.length || entity.references.length !== lines.length) {
      brokenIds.push(entity.id);
      return { ...entity, associationStatus: 'broken' };
    }
    const tips = entity.references.map((reference) => {
      const source = byId.get(reference.entityId);
      return source ? cadMleaderAssociationAnchor(source, reference) : null;
    });
    if (tips.some((tip) => !tip)) {
      brokenIds.push(entity.id);
      return { ...entity, associationStatus: 'broken' };
    }
    const leaderLines = lines.map((line, index) => [{ ...tips[index]!, z: 0 }, ...line.slice(1).map((point) => ({ ...point, z: 0 }))]);
    regeneratedIds.push(entity.id);
    return { ...entity, vertices: leaderLines[0], leaderLines, associationStatus: 'associated' };
  });
  return { entities: next, regeneratedIds, brokenIds };
}
