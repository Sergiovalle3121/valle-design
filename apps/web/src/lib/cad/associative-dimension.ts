import type { CadEntity, CadPoint2 } from './cad-document';
import { alignedDimension, DEFAULT_DIMENSION_STYLE, linearDimension, type DimensionStyle } from './dimension';
import { cadDimensionToleranceOf, cadDimensionToleranceText } from './dimension-tolerance';

export type CadDimensionEntity = Extract<CadEntity, { type: 'dimension' }>;
export type CadDimensionPathRole = 'dimension' | 'extension' | 'arrow';

export interface CadDimensionPath {
  points: CadPoint2[];
  closed: boolean;
  role: CadDimensionPathRole;
}

export interface CadDimensionGeometry {
  measurement: number;
  label: string;
  textAnchor: CadPoint2;
  textAngle: number;
  paths: CadDimensionPath[];
}

const UNIT_TO_MM = { mm: 1, cm: 10, m: 1_000, in: 25.4, ft: 304.8 } as const;

const add = (a: CadPoint2, b: CadPoint2): CadPoint2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: CadPoint2, b: CadPoint2): CadPoint2 => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: CadPoint2, factor: number): CadPoint2 => ({ x: a.x * factor, y: a.y * factor });
const length = (a: CadPoint2): number => Math.hypot(a.x, a.y);
const normalize = (a: CadPoint2): CadPoint2 | null => {
  const value = length(a);
  return value > 1e-9 ? scale(a, 1 / value) : null;
};
const midpoint = (a: CadPoint2, b: CadPoint2): CadPoint2 => scale(add(a, b), 0.5);

function dimensionStyle(entity: CadDimensionEntity): DimensionStyle {
  return {
    extensionGap: Math.max(0, entity.extensionGap ?? DEFAULT_DIMENSION_STYLE.extensionGap),
    extensionOvershoot: Math.max(0, entity.extensionOvershoot ?? DEFAULT_DIMENSION_STYLE.extensionOvershoot),
    arrowSize: Math.max(1e-6, entity.arrowSize ?? DEFAULT_DIMENSION_STYLE.arrowSize),
    textGap: Math.max(0, entity.textGap ?? DEFAULT_DIMENSION_STYLE.textGap),
  };
}

function normalizeDegrees(value: number): number {
  let normalized = value % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

function readableAngle(direction: CadPoint2): number {
  let degrees = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  while (degrees > 90) degrees -= 180;
  while (degrees <= -90) degrees += 180;
  return degrees;
}

function arrowPaths(entity: CadDimensionEntity, tip: CadPoint2, direction: CadPoint2): CadDimensionPath[] {
  const unit = normalize(direction);
  if (!unit) return [];
  const size = dimensionStyle(entity).arrowSize;
  const perpendicular = { x: -unit.y, y: unit.x };
  const base = add(tip, scale(unit, size));
  const left = add(base, scale(perpendicular, size * 0.35));
  const right = add(base, scale(perpendicular, -size * 0.35));
  if (entity.arrowhead === 'open') return [{ points: [left, tip, right], closed: false, role: 'arrow' }];
  if (entity.arrowhead === 'architectural-tick')
    return [{ points: [add(tip, scale(add(unit, perpendicular), -size * 0.45)), add(tip, scale(add(unit, perpendicular), size * 0.45))], closed: false, role: 'arrow' }];
  if (entity.arrowhead === 'dot')
    return [{
      points: Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return add(tip, { x: Math.cos(angle) * size * 0.3, y: Math.sin(angle) * size * 0.3 });
      }),
      closed: true,
      role: 'arrow',
    }];
  return [{ points: [tip, left, right], closed: true, role: 'arrow' }];
}

export function formatCadDimensionMeasurement(entity: CadDimensionEntity, measurement: number): string {
  if (entity.text?.trim()) return entity.text;
  const precision = Math.max(0, Math.min(8, Math.floor(entity.precision ?? 2)));
  const kind = entity.dimensionKind ?? 'aligned';
  // Ola I: la tolerancia de fabricación vive en `context.metadata` (mm o
  // grados) y rotula entre la medida y la unidad, en visor, lámina y DXF.
  const tolerance = cadDimensionToleranceOf(entity);
  if (kind === 'angular') {
    const body = tolerance ? cadDimensionToleranceText(measurement, precision, tolerance) : measurement.toFixed(precision);
    return `${entity.prefix ?? ''}${body}°${entity.suffix ?? ''}`;
  }
  const sourceUnit = entity.sourceUnit ?? 'mm';
  const unit = entity.units ?? sourceUnit;
  const converted = (measurement * UNIT_TO_MM[sourceUnit]) / UNIT_TO_MM[unit];
  const body = tolerance ? cadDimensionToleranceText(converted, precision, tolerance, 1 / UNIT_TO_MM[unit]) : converted.toFixed(precision);
  let label = `${entity.prefix ?? ''}${body} ${unit}${entity.suffix ?? ''}`;
  if (entity.alternateUnits) {
    const alternate = (measurement * UNIT_TO_MM[sourceUnit]) / UNIT_TO_MM[entity.alternateUnits];
    label += ` [${alternate.toFixed(precision)} ${entity.alternateUnits}]`;
  }
  return label;
}

function fromLinearGeometry(entity: CadDimensionEntity, geometry: NonNullable<ReturnType<typeof alignedDimension>>): CadDimensionGeometry {
  const paths: CadDimensionPath[] = [
    { points: [geometry.dimLine.a, geometry.dimLine.b], closed: false, role: 'dimension' },
  ];
  if (entity.extensionLines !== false) {
    paths.push(
      { points: [geometry.extensionA.a, geometry.extensionA.b], closed: false, role: 'extension' },
      { points: [geometry.extensionB.a, geometry.extensionB.b], closed: false, role: 'extension' },
    );
  }
  paths.push(
    ...arrowPaths(entity, geometry.dimLine.a, sub(geometry.dimLine.b, geometry.dimLine.a)),
    ...arrowPaths(entity, geometry.dimLine.b, sub(geometry.dimLine.a, geometry.dimLine.b)),
  );
  return {
    measurement: geometry.measurement,
    label: formatCadDimensionMeasurement(entity, geometry.measurement),
    textAnchor: entity.textPosition ?? geometry.textAnchor,
    textAngle: geometry.textAngle,
    paths,
  };
}

function arcPoints(center: CadPoint2, radius: number, start: number, sweep: number, count = 48): CadPoint2[] {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + (sweep * index) / count;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

export function buildCadDimensionGeometry(entity: CadDimensionEntity): CadDimensionGeometry | null {
  const kind = entity.dimensionKind ?? 'aligned';
  const style = dimensionStyle(entity);
  if (kind === 'aligned' || kind === 'linear') {
    const geometry = kind === 'aligned'
      ? alignedDimension(entity.a, entity.b, entity.offset ?? style.arrowSize * 1.5, style)
      : linearDimension(entity.a, entity.b, entity.offset ?? style.arrowSize * 1.5, entity.axis ?? 'x', style);
    return geometry ? fromLinearGeometry(entity, geometry) : null;
  }
  if (kind === 'angular' || kind === 'arc-length') {
    if (!entity.c) return null;
    const first = normalize(sub(entity.b, entity.a));
    const second = normalize(sub(entity.c, entity.a));
    if (!first || !second) return null;
    const radius = Math.max(1e-6, Math.abs(entity.radius ?? entity.offset ?? Math.min(length(sub(entity.b, entity.a)), length(sub(entity.c, entity.a)))));
    const start = Math.atan2(first.y, first.x);
    let sweep = normalizeDegrees(((Math.atan2(second.y, second.x) - start) * 180) / Math.PI) * Math.PI / 180;
    if (sweep > Math.PI * 2 - 1e-9) sweep = 0;
    if (sweep <= 1e-9) return null;
    const arc = arcPoints(entity.a, radius, start, sweep);
    const measurement = kind === 'angular' ? (sweep * 180) / Math.PI : radius * sweep;
    const middleAngle = start + sweep / 2;
    const textAnchor = entity.textPosition ?? add(entity.a, {
      x: Math.cos(middleAngle) * (radius + style.textGap),
      y: Math.sin(middleAngle) * (radius + style.textGap),
    });
    const paths: CadDimensionPath[] = [{ points: arc, closed: false, role: 'dimension' }];
    if (entity.extensionLines !== false)
      paths.push(
        { points: [entity.a, arc[0]], closed: false, role: 'extension' },
        { points: [entity.a, arc.at(-1)!], closed: false, role: 'extension' },
      );
    const startTangent = { x: -Math.sin(start), y: Math.cos(start) };
    const endAngle = start + sweep;
    const endTangent = { x: Math.sin(endAngle), y: -Math.cos(endAngle) };
    paths.push(...arrowPaths(entity, arc[0], startTangent), ...arrowPaths(entity, arc.at(-1)!, endTangent));
    return {
      measurement,
      label: formatCadDimensionMeasurement(entity, measurement),
      textAnchor,
      textAngle: readableAngle({ x: -Math.sin(middleAngle), y: Math.cos(middleAngle) }),
      paths,
    };
  }
  if (kind === 'radius' || kind === 'diameter') {
    const radial = sub(entity.b, entity.a);
    const radius = entity.radius ?? length(radial);
    const direction = normalize(radial);
    if (!direction || !(radius > 0)) return null;
    const edge = add(entity.a, scale(direction, radius));
    const other = add(entity.a, scale(direction, -radius));
    const measurement = kind === 'diameter' ? radius * 2 : radius;
    const start = kind === 'diameter' ? other : entity.a;
    const paths: CadDimensionPath[] = [{ points: [start, edge], closed: false, role: 'dimension' }];
    paths.push(...arrowPaths(entity, edge, scale(direction, -1)));
    if (kind === 'diameter') paths.push(...arrowPaths(entity, other, direction));
    return {
      measurement,
      label: formatCadDimensionMeasurement({ ...entity, prefix: entity.prefix ?? (kind === 'diameter' ? 'Ø' : 'R') }, measurement),
      textAnchor: entity.textPosition ?? add(midpoint(start, edge), scale({ x: -direction.y, y: direction.x }, style.textGap)),
      textAngle: readableAngle(direction),
      paths,
    };
  }
  if (kind === 'ordinate') {
    const axis = entity.axis ?? 'x';
    const measurement = axis === 'x' ? entity.b.x - entity.a.x : entity.b.y - entity.a.y;
    const elbow = entity.c ?? (axis === 'x'
      ? { x: entity.b.x, y: entity.b.y + (entity.offset ?? style.arrowSize) }
      : { x: entity.b.x + (entity.offset ?? style.arrowSize), y: entity.b.y });
    const tail = axis === 'x'
      ? { x: elbow.x + style.arrowSize * 2, y: elbow.y }
      : { x: elbow.x, y: elbow.y + style.arrowSize * 2 };
    return {
      measurement,
      label: formatCadDimensionMeasurement(entity, measurement),
      textAnchor: entity.textPosition ?? tail,
      textAngle: axis === 'x' ? 0 : 90,
      paths: [
        { points: [entity.b, elbow, tail], closed: false, role: 'dimension' },
        ...arrowPaths(entity, entity.b, sub(elbow, entity.b)),
      ],
    };
  }
  return null;
}

export function cadEntityAssociationAnchor(
  entity: CadEntity,
  reference: NonNullable<CadDimensionEntity['references']>[number],
): CadPoint2 | null {
  if (reference.anchor === 'insertion' && entity.type === 'mtext') return entity.insertion;
  if (reference.anchor === 'start') {
    if (entity.type === 'line') return entity.start;
    if (entity.type === 'spline') return entity.controlPoints[0] ?? null;
  }
  if (reference.anchor === 'end') {
    if (entity.type === 'line') return entity.end;
    if (entity.type === 'spline') return entity.controlPoints.at(-1) ?? null;
  }
  if (reference.anchor === 'center') {
    if (entity.type === 'circle' || entity.type === 'arc' || entity.type === 'ellipse') return entity.center;
  }
  if ((reference.anchor === 'arc-start' || reference.anchor === 'arc-end') && (entity.type === 'arc' || entity.type === 'circle')) {
    const angle = entity.type === 'circle' ? (reference.anchor === 'arc-start' ? 0 : 180) : reference.anchor === 'arc-start' ? entity.startAngle : entity.endAngle;
    return { x: entity.center.x + Math.cos((angle * Math.PI) / 180) * entity.radius, y: entity.center.y + Math.sin((angle * Math.PI) / 180) * entity.radius };
  }
  if ((reference.anchor === 'major-start' || reference.anchor === 'major-end') && entity.type === 'ellipse') {
    const sign = reference.anchor === 'major-start' ? 1 : -1;
    return { x: entity.center.x + entity.majorAxis.x * sign, y: entity.center.y + entity.majorAxis.y * sign };
  }
  if (reference.anchor === 'control' && entity.type === 'spline') return entity.controlPoints[reference.index ?? 0] ?? null;
  return null;
}

function requiredReferenceCount(kind: CadDimensionEntity['dimensionKind']): number {
  return kind === 'angular' || kind === 'arc-length' ? 3 : 2;
}

export function regenerateAssociativeDimensions(
  entities: readonly CadEntity[],
  changedEntityIds: readonly string[],
): { entities: CadEntity[]; regeneratedIds: string[]; brokenIds: string[] } {
  const changed = new Set(changedEntityIds);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const regeneratedIds: string[] = [];
  const brokenIds: string[] = [];
  const next = entities.map((entity): CadEntity => {
    if (entity.type !== 'dimension' || !entity.dimensionKind || !entity.associative || !entity.references?.some((reference) => changed.has(reference.entityId))) return entity;
    const points = entity.references.map((reference) => {
      const source = byId.get(reference.entityId);
      return source ? cadEntityAssociationAnchor(source, reference) : null;
    });
    if (points.length < requiredReferenceCount(entity.dimensionKind) || points.some((point) => !point)) {
      brokenIds.push(entity.id);
      return { ...entity, associationStatus: 'broken' };
    }
    regeneratedIds.push(entity.id);
    // Los puntos de definición de una cota son 2D en el esquema canónico. Los
    // anclajes salen de la geometría de origen, que SÍ es 3D (`line.start` lleva
    // `z`), así que copiarlos tal cual le añadía una `z` a la cota en la primera
    // regeneración: el documento cambiaba de forma —y de hash— sin que nadie
    // hubiera editado nada, y la misma cota se serializaba distinto según si
    // había pasado por aquí. El adaptador ya descartaba la `z` al transformar;
    // esto es la otra mitad de la misma regla.
    const flat = (point: CadPoint2): CadPoint2 => ({ x: point.x, y: point.y });
    return {
      ...entity,
      a: flat(points[0]!),
      b: flat(points[1]!),
      ...(points[2] ? { c: flat(points[2]) } : {}),
      // El radio se REDERIVA de los dos primeros puntos de definición. En
      // `radius` y `diameter` son centro y borde; en `arc-length` son el centro
      // y el arranque del arco, así que la distancia entre ambos vuelve a ser el
      // radio — y sin recalcularlo, alargar el arco cambiaba el barrido pero
      // conservaba el radio viejo, de modo que la longitud de arco quedaba mal
      // sin que nada avisara.
      ...(entity.dimensionKind === 'radius' || entity.dimensionKind === 'diameter' || entity.dimensionKind === 'arc-length'
        ? { radius: length(sub(points[1]!, points[0]!)) }
        : {}),
      associationStatus: 'associated',
    };
  });
  return { entities: next, regeneratedIds, brokenIds };
}
