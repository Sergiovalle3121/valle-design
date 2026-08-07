import type { CadEntity, CadPoint2, CadPoint3 } from './cad-document';
import { tessellateArc } from './curve-tessellate';
import type { CadEntityAdapter, CadEntityTransform, CadNativeEntity, CadPropertyValue } from './entity-runtime';

type LineEntity = Extract<CadNativeEntity, { type: 'line' }>;
type CircleEntity = Extract<CadNativeEntity, { type: 'circle' }>;

const point3 = (point: CadPoint2, z = 0): CadPoint3 => ({ x: point.x, y: point.y, z });
const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const positive = (value: CadPropertyValue | undefined, fallback: number): number => Math.max(1e-9, finite(value, fallback));

function transformPoint(point: CadPoint3, transform: CadEntityTransform): CadPoint3 {
  const origin = transform.origin ?? { x: 0, y: 0 };
  const scale = transform.scale ?? 1;
  const radians = ((transform.rotationDeg ?? 0) * Math.PI) / 180;
  const dx = (point.x - origin.x) * scale;
  const dy = (point.y - origin.y) * scale;
  return {
    x: origin.x + dx * Math.cos(radians) - dy * Math.sin(radians) + (transform.translation?.x ?? 0),
    y: origin.y + dx * Math.sin(radians) + dy * Math.cos(radians) + (transform.translation?.y ?? 0),
    z: point.z,
  };
}

function distanceToSegment(point: CadPoint2, start: CadPoint2, end: CadPoint2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-18) return Math.hypot(point.x - start.x, point.y - start.y);
  const factor = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - start.x - factor * dx, point.y - start.y - factor * dy);
}

export const lineAdapter: CadEntityAdapter<LineEntity> = {
  type: 'line',
  renderer: { paths: (entity) => [{ points: [entity.start, entity.end], closed: false }] },
  bounds: { bounds: (entity) => ({ minX: Math.min(entity.start.x, entity.end.x), minY: Math.min(entity.start.y, entity.end.y), maxX: Math.max(entity.start.x, entity.end.x), maxY: Math.max(entity.start.y, entity.end.y) }) },
  hitTester: {
    hitTest: (entity, point, tolerance) => distanceToSegment(point, entity.start, entity.end) <= tolerance,
    intersectsWindow: (entity, window, crossing) => crossing
      ? Math.max(entity.start.x, entity.end.x) >= window.minX && Math.min(entity.start.x, entity.end.x) <= window.maxX && Math.max(entity.start.y, entity.end.y) >= window.minY && Math.min(entity.start.y, entity.end.y) <= window.maxY
      : [entity.start, entity.end].every((point) => point.x >= window.minX && point.x <= window.maxX && point.y >= window.minY && point.y <= window.maxY),
  },
  grips: {
    grips: (entity) => [
      { id: 'start', kind: 'endpoint', point: entity.start, label: 'Inicio' },
      { id: 'end', kind: 'endpoint', point: entity.end, label: 'Fin' },
      { id: 'midpoint', kind: 'center', point: { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 }, label: 'Punto medio' },
    ],
    moveGrip: (entity, gripId, point) => gripId === 'start'
      ? { ...entity, start: point3(point, entity.start.z) }
      : gripId === 'end'
        ? { ...entity, end: point3(point, entity.end.z) }
        : gripId === 'midpoint'
          ? lineAdapter.commands.transform(entity, { translation: { x: point.x - (entity.start.x + entity.end.x) / 2, y: point.y - (entity.start.y + entity.end.y) / 2 } })
          : entity,
  },
  snaps: { snaps: (entity) => [
    { kind: 'endpoint', point: entity.start, label: 'Inicio' },
    { kind: 'endpoint', point: entity.end, label: 'Fin' },
    { kind: 'center', point: { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 }, label: 'Punto medio' },
  ] },
  properties: {
    read: (entity) => ({ startX: entity.start.x, startY: entity.start.y, endX: entity.end.x, endY: entity.end.y, length: Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y), layer: entity.layer }),
    write: (entity, patch) => ({
      ...entity,
      start: { x: finite(patch.startX, entity.start.x), y: finite(patch.startY, entity.start.y), z: entity.start.z },
      end: { x: finite(patch.endX, entity.end.x), y: finite(patch.endY, entity.end.y), z: entity.end.z },
      layer: typeof patch.layer === 'string' ? patch.layer : entity.layer,
    }),
  },
  commands: { transform: (entity, transform) => ({ ...entity, start: transformPoint(entity.start, transform), end: transformPoint(entity.end, transform), context: entity.context ? structuredClone(entity.context) : undefined }) },
};

export const circleAdapter: CadEntityAdapter<CircleEntity> = {
  type: 'circle',
  renderer: { paths: (entity, segments = 96) => [{ points: tessellateArc(entity.center, entity.radius, 0, 360, segments), closed: true }] },
  bounds: { bounds: (entity) => ({ minX: entity.center.x - entity.radius, minY: entity.center.y - entity.radius, maxX: entity.center.x + entity.radius, maxY: entity.center.y + entity.radius }) },
  hitTester: {
    hitTest: (entity, point, tolerance) => Math.abs(Math.hypot(point.x - entity.center.x, point.y - entity.center.y) - entity.radius) <= tolerance,
    intersectsWindow: (entity, window, crossing) => crossing
      ? entity.center.x + entity.radius >= window.minX && entity.center.x - entity.radius <= window.maxX && entity.center.y + entity.radius >= window.minY && entity.center.y - entity.radius <= window.maxY
      : entity.center.x - entity.radius >= window.minX && entity.center.x + entity.radius <= window.maxX && entity.center.y - entity.radius >= window.minY && entity.center.y + entity.radius <= window.maxY,
  },
  grips: {
    grips: (entity) => [
      { id: 'center', kind: 'center', point: entity.center, label: 'Centro' },
      ...[0, 90, 180, 270].map((angle) => ({ id: `quadrant:${angle}`, kind: 'quadrant' as const, point: { x: entity.center.x + Math.cos(angle * Math.PI / 180) * entity.radius, y: entity.center.y + Math.sin(angle * Math.PI / 180) * entity.radius }, label: `Cuadrante ${angle}°` })),
    ],
    moveGrip: (entity, gripId, point) => gripId === 'center'
      ? { ...entity, center: point3(point, entity.center.z) }
      : gripId.startsWith('quadrant:')
        ? { ...entity, radius: Math.max(1e-9, Math.hypot(point.x - entity.center.x, point.y - entity.center.y)) }
        : entity,
  },
  snaps: { snaps: (entity) => [
    { kind: 'center', point: entity.center, label: 'Centro' },
    ...[0, 90, 180, 270].map((angle) => ({ kind: 'quadrant' as const, point: { x: entity.center.x + Math.cos(angle * Math.PI / 180) * entity.radius, y: entity.center.y + Math.sin(angle * Math.PI / 180) * entity.radius }, label: `Cuadrante ${angle}°` })),
  ] },
  properties: {
    read: (entity) => ({ centerX: entity.center.x, centerY: entity.center.y, radius: entity.radius, diameter: entity.radius * 2, layer: entity.layer }),
    write: (entity, patch) => ({
      ...entity,
      center: { x: finite(patch.centerX, entity.center.x), y: finite(patch.centerY, entity.center.y), z: entity.center.z },
      radius: patch.diameter !== undefined ? positive(patch.diameter, entity.radius * 2) / 2 : positive(patch.radius, entity.radius),
      layer: typeof patch.layer === 'string' ? patch.layer : entity.layer,
    }),
  },
  commands: { transform: (entity, transform) => ({ ...entity, center: transformPoint(entity.center, transform), radius: entity.radius * Math.abs(transform.scale ?? 1), context: entity.context ? structuredClone(entity.context) : undefined }) },
};

export function isLegacyCircle(entity: CadEntity): boolean {
  return entity.type === 'circle' && !!entity.legacy;
}

/**
 * ¿Es una cota del sistema HEREDADO de anotaciones?
 *
 * Las que crea la herramienta de medir no traen `dimensionKind`. Importa porque
 * `replaceEditorProjection` sólo preserva las que SÍ lo traen: la heredada se
 * reconstruye desde `annotationsRef` en cada guardado, así que el registro
 * nativo no puede reclamarla — mutarla, borrarla o copiarla por la vía nativa se
 * revertía en la siguiente reproyección, en silencio y con respuesta 200.
 *
 * Simétrico a `isLegacyCircle`: un solo dueño por entidad.
 */
export function isLegacyDimension(entity: CadEntity): boolean {
  return entity.type === 'dimension' && !entity.dimensionKind;
}
