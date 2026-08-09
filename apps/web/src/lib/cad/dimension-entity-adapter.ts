import type { CadPoint2 } from './cad-document';
import { buildCadDimensionGeometry, type CadDimensionEntity } from './associative-dimension';
import type { CadEntityAdapter, CadEntityTransform, CadNativeEntity, CadPropertyValue } from './entity-runtime';
// Se importan de `transform2d` y no de `entity-runtime` a propósito:
// `entity-runtime` importa este módulo, así que ir por él cerraría un ciclo que
// revienta al cargar («Cannot access X before initialization»). Ya pasó con el
// adaptador de sombreado.
import { cadTransformIsReflecting, cadTransformPoint3, cadTransformScaleFactor } from './transform2d';

type NativeDimension = Extract<CadNativeEntity, { type: 'dimension' }>;

const finite = (value: CadPropertyValue | undefined, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const positive = (value: CadPropertyValue | undefined, fallback: number): number => Math.max(1e-9, finite(value, fallback));
const points = (entity: NativeDimension) => buildCadDimensionGeometry(entity)?.paths.flatMap((path) => path.points) ?? [entity.a, entity.b];
const bounds = (entity: NativeDimension) => {
  const values = points(entity);
  return { minX: Math.min(...values.map((point) => point.x)), minY: Math.min(...values.map((point) => point.y)), maxX: Math.max(...values.map((point) => point.x)), maxY: Math.max(...values.map((point) => point.y)) };
};
/**
 * Delega en la implementación compartida. Aquí había una copia que leía SÓLO
 * `{origin, rotationDeg, scale, translation}`: bajo `{ mirror: … }` —donde no
 * existe ninguno de esos cuatro campos— evaluaba la identidad, así que espejar
 * una selección movía toda su geometría y dejaba la cota clavada en su sitio,
 * midiendo dos puntos que ya no estaban ahí. Sin error y con dibujo plausible.
 *
 * Los puntos de definición de una cota son 2D en el esquema canónico, así que
 * la `z` del helper se descarta en vez de materializarse: escribirla cambiaría
 * la forma de la entidad y con ella su versión.
 */
const transformPoint = (point: CadPoint2, transform: CadEntityTransform): CadPoint2 => {
  const moved = cadTransformPoint3({ ...point, z: 0 }, transform);
  return { x: moved.x, y: moved.y };
};
const distanceToSegment = (point: CadPoint2, a: CadPoint2, b: CadPoint2) => {
  const dx = b.x - a.x; const dy = b.y - a.y; const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-18) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
};

function validKind(value: CadPropertyValue | undefined): CadDimensionEntity['dimensionKind'] | undefined {
  return typeof value === 'string' && ['linear', 'aligned', 'angular', 'radius', 'diameter', 'ordinate', 'arc-length'].includes(value)
    ? value as CadDimensionEntity['dimensionKind']
    : undefined;
}

export const dimensionAdapter: CadEntityAdapter<NativeDimension> = {
  type: 'dimension',
  renderer: { paths: (entity) => (buildCadDimensionGeometry(entity)?.paths ?? []).map((path) => ({ points: path.points, closed: path.closed })) },
  bounds: { bounds },
  hitTester: {
    hitTest: (entity, point, tolerance) => (buildCadDimensionGeometry(entity)?.paths ?? []).some((path) => path.points.some((current, index) => index > 0 && distanceToSegment(point, path.points[index - 1], current) <= tolerance)),
    intersectsWindow: (entity, window, crossing) => {
      const value = bounds(entity);
      return crossing ? value.minX <= window.maxX && value.maxX >= window.minX && value.minY <= window.maxY && value.maxY >= window.minY : value.minX >= window.minX && value.maxX <= window.maxX && value.minY >= window.minY && value.maxY <= window.maxY;
    },
  },
  grips: {
    grips: (entity) => [
      { id: 'a', kind: 'endpoint', point: entity.a, label: 'Definición A' },
      { id: 'b', kind: 'endpoint', point: entity.b, label: 'Definición B' },
      ...(entity.c ? [{ id: 'c', kind: 'endpoint' as const, point: entity.c, label: 'Definición C' }] : []),
      ...(buildCadDimensionGeometry(entity) ? [{ id: 'text', kind: 'control' as const, point: buildCadDimensionGeometry(entity)!.textAnchor, label: 'Texto' }] : []),
    ],
    moveGrip: (entity, gripId, point) => gripId === 'text'
      ? { ...entity, textPosition: point }
      : gripId === 'a' || gripId === 'b' || gripId === 'c'
        ? { ...entity, [gripId]: point, associative: false, associationStatus: 'detached' }
        : entity,
  },
  snaps: { snaps: (entity) => [
    { kind: 'endpoint', point: entity.a, label: 'Definición A' },
    { kind: 'endpoint', point: entity.b, label: 'Definición B' },
    ...(entity.c ? [{ kind: 'endpoint' as const, point: entity.c, label: 'Definición C' }] : []),
  ] },
  properties: {
    read: (entity) => {
      const geometry = buildCadDimensionGeometry(entity);
      return {
        dimensionKind: entity.dimensionKind ?? 'aligned', measurement: geometry?.measurement ?? 0, label: geometry?.label ?? '',
        offset: entity.offset ?? 0, axis: entity.axis ?? 'x', style: entity.style ?? 'Standard', precision: entity.precision ?? 2,
        units: entity.units ?? entity.sourceUnit ?? 'mm', prefix: entity.prefix ?? '', suffix: entity.suffix ?? '', alternateUnits: entity.alternateUnits ?? '',
        extensionLines: entity.extensionLines !== false, arrowhead: entity.arrowhead ?? 'closed-filled', arrowSize: entity.arrowSize ?? 180,
        associative: entity.associative ?? false, associationStatus: entity.associationStatus ?? (entity.associative ? 'associated' : 'detached'),
        referenceCount: entity.references?.length ?? 0, textOverride: entity.text ?? '', layer: entity.layer,
      };
    },
    write: (entity, patch) => ({
      ...entity,
      dimensionKind: validKind(patch.dimensionKind) ?? entity.dimensionKind ?? 'aligned',
      offset: finite(patch.offset, entity.offset ?? 0), axis: patch.axis === 'y' ? 'y' : patch.axis === 'x' ? 'x' : entity.axis,
      style: typeof patch.style === 'string' ? patch.style.slice(0, 128) : entity.style,
      precision: Math.max(0, Math.min(8, Math.floor(finite(patch.precision, entity.precision ?? 2)))),
      units: typeof patch.units === 'string' && ['mm', 'cm', 'm', 'in', 'ft'].includes(patch.units) ? patch.units as NativeDimension['units'] : entity.units,
      prefix: typeof patch.prefix === 'string' ? patch.prefix.slice(0, 64) : entity.prefix,
      suffix: typeof patch.suffix === 'string' ? patch.suffix.slice(0, 64) : entity.suffix,
      alternateUnits: typeof patch.alternateUnits === 'string' && ['mm', 'cm', 'm', 'in', 'ft'].includes(patch.alternateUnits) ? patch.alternateUnits as NativeDimension['alternateUnits'] : undefined,
      extensionLines: typeof patch.extensionLines === 'boolean' ? patch.extensionLines : entity.extensionLines,
      arrowhead: typeof patch.arrowhead === 'string' && ['closed-filled', 'open', 'architectural-tick', 'dot'].includes(patch.arrowhead) ? patch.arrowhead as NativeDimension['arrowhead'] : entity.arrowhead,
      arrowSize: positive(patch.arrowSize, entity.arrowSize ?? 180),
      text: typeof patch.textOverride === 'string' ? patch.textOverride.slice(0, 256) || undefined : entity.text,
      layer: typeof patch.layer === 'string' ? patch.layer : entity.layer,
    }),
  },
  commands: { transform: (entity, transform) => {
    // `Math.abs(transform.scale ?? 1)` valía 1 bajo `scaleXY`, `mirror` o
    // `affine` —donde `scale` no existe—, así que la cota se movía sin cambiar
    // de tamaño. `cadTransformScaleFactor` es √|det|, definido para CUALQUIER
    // afín, y coincide con `|scale|` en el vocabulario histórico.
    const factor = cadTransformScaleFactor(transform);
    // El desfase de una cota ALINEADA es una proyección sobre la NORMAL del
    // tramo, y su signo es el que elige de qué lado sale la línea de cota. Una
    // reflexión invierte la mano del par (dirección, normal): la normal que
    // `alignedDimension` recalcula del tramo espejado apunta al lado CONTRARIO,
    // así que conservar el signo mandaba la cota al otro lado de la pieza —el
    // texto seguía diciendo la verdad y el dibujo estaba mal.
    //
    // Sólo `aligned` se corrige. En una cota LINEAL el desfase se mide desde el
    // extremo MAYOR del eje (`Math.max`), y bajo una reflexión el mayor pasa a
    // ser el menor: eso no se puede expresar cambiándole el signo al desfase, y
    // arreglarlo pide un campo que el esquema no tiene. Queda anotado.
    const alignedFlip = (entity.dimensionKind ?? 'aligned') === 'aligned' && cadTransformIsReflecting(transform) ? -1 : 1;
    return {
      ...entity, a: transformPoint(entity.a, transform), b: transformPoint(entity.b, transform), c: entity.c ? transformPoint(entity.c, transform) : undefined,
      textPosition: entity.textPosition ? transformPoint(entity.textPosition, transform) : undefined,
      offset: (entity.offset ?? 0) * factor * alignedFlip, radius: entity.radius === undefined ? undefined : entity.radius * factor,
      associative: false, associationStatus: 'detached', context: entity.context ? structuredClone(entity.context) : undefined,
    };
  } },
};
