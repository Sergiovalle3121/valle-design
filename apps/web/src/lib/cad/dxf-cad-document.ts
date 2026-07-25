import type {
  CadDocument,
  CadEntity,
  CadPoint2,
  CadPoint3,
} from "./cad-document";
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import type { CadNativeEntity } from "./entity-runtime";

export interface CadDxfProjection {
  point(point: CadDxfPoint): CadPoint2;
}

export interface CadDxfNativeImportOptions {
  idPrefix?: string;
  projection?: CadDxfProjection;
  provider?: string;
}

const identityProjection: CadDxfProjection = {
  point: (point) => ({ ...point }),
};

function point3(point: CadPoint2): CadPoint3 {
  return { x: point.x, y: point.y, z: 0 };
}

function mappedVector(
  projection: CadDxfProjection,
  origin: CadDxfPoint,
  vector: CadDxfPoint,
): CadPoint2 {
  const start = projection.point(origin);
  const end = projection.point({
    x: origin.x + vector.x,
    y: origin.y + vector.y,
  });
  return { x: end.x - start.x, y: end.y - start.y };
}

function projectionOrientation(
  projection: CadDxfProjection,
  origin: CadDxfPoint,
): number {
  const x = mappedVector(projection, origin, { x: 1, y: 0 });
  const y = mappedVector(projection, origin, { x: 0, y: 1 });
  return x.x * y.y - x.y * y.x;
}

function projectedAngle(
  projection: CadDxfProjection,
  center: CadDxfPoint,
  radius: number,
  angleDeg: number,
): number {
  const angle = (angleDeg * Math.PI) / 180;
  const projectedCenter = projection.point(center);
  const projectedPoint = projection.point({
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  });
  return (
    (Math.atan2(
      projectedPoint.y - projectedCenter.y,
      projectedPoint.x - projectedCenter.x,
    ) *
      180) /
    Math.PI
  );
}

function sourceContext(
  primitive: CadDxfPrimitive,
  provider: string,
): CadNativeEntity["context"] {
  return {
    provenance: { provider },
    metadata: {
      sourceType: primitive.kind.toUpperCase(),
      sourceLayer: primitive.layer,
    },
  };
}

/**
 * Converts supported DXF curve primitives into first-class canonical entities.
 * The optional projection may translate/rotate/reflect/scale the drawing into
 * editor world coordinates without degrading curves to line segments.
 */
export function cadDxfCurvesToNativeEntities(
  primitives: CadDxfPrimitive[],
  options: CadDxfNativeImportOptions = {},
): CadNativeEntity[] {
  const projection = options.projection ?? identityProjection;
  const prefix = options.idPrefix ?? "dxf";
  const provider = options.provider ?? "dxf";
  const entities: CadNativeEntity[] = [];

  primitives.forEach((primitive, index) => {
    const id = `${prefix}:${index.toString().padStart(6, "0")}`;
    if (
      primitive.kind === "arc" &&
      primitive.points[0] &&
      typeof primitive.radius === "number" &&
      primitive.radius > 0
    ) {
      const center = primitive.points[0];
      const projectedCenter = projection.point(center);
      const radiusX = Math.hypot(
        ...Object.values(
          mappedVector(projection, center, { x: primitive.radius, y: 0 }),
        ),
      );
      const radiusY = Math.hypot(
        ...Object.values(
          mappedVector(projection, center, { x: 0, y: primitive.radius }),
        ),
      );
      const start = projectedAngle(
        projection,
        center,
        primitive.radius,
        primitive.startAngle ?? 0,
      );
      const end = projectedAngle(
        projection,
        center,
        primitive.radius,
        primitive.endAngle ?? 360,
      );
      const reflected = projectionOrientation(projection, center) < 0;
      entities.push({
        id,
        type: "arc",
        center: point3(projectedCenter),
        radius: (radiusX + radiusY) / 2,
        startAngle: reflected ? end : start,
        endAngle: reflected ? start : end,
        layer: primitive.layer,
        context: sourceContext(primitive, provider),
      });
      return;
    }
    if (
      primitive.kind === "ellipse" &&
      primitive.points[0] &&
      primitive.majorAxis &&
      typeof primitive.axisRatio === "number" &&
      primitive.axisRatio > 0
    ) {
      const center = primitive.points[0];
      const reflected = projectionOrientation(projection, center) < 0;
      const start = primitive.startAngle ?? 0;
      const end = primitive.endAngle ?? 360;
      entities.push({
        id,
        type: "ellipse",
        center: point3(projection.point(center)),
        majorAxis: point3(mappedVector(projection, center, primitive.majorAxis)),
        ratio: primitive.axisRatio,
        startParameter: reflected ? end : start,
        endParameter: reflected ? start : end,
        layer: primitive.layer,
        context: sourceContext(primitive, provider),
      });
      return;
    }
    if (
      primitive.kind === "spline" &&
      primitive.points.length >= 2
    ) {
      const degree = Math.max(
        1,
        Math.min(
          primitive.points.length - 1,
          Math.floor(primitive.degree ?? 3),
        ),
      );
      entities.push({
        id,
        type: "spline",
        degree,
        controlPoints: primitive.points.map((point) =>
          point3(projection.point(point)),
        ),
        knots:
          primitive.knots?.length === primitive.points.length + degree + 1
            ? [...primitive.knots]
            : clampedKnots(primitive.points.length, degree),
        layer: primitive.layer,
        context: sourceContext(primitive, provider),
      });
    }
  });
  return entities;
}

function clampedKnots(controlCount: number, degree: number): number[] {
  const knots: number[] = [];
  const spans = controlCount - degree;
  for (let index = 0; index <= degree; index += 1) knots.push(0);
  for (let index = 1; index < spans; index += 1) knots.push(index / spans);
  for (let index = 0; index <= degree; index += 1) knots.push(1);
  return knots;
}

export function cadEntityToDxfPrimitive(
  entity: CadEntity,
): CadDxfPrimitive | null {
  if (entity.type === "arc") {
    return {
      kind: "arc",
      layer: entity.layer,
      points: [{ x: entity.center.x, y: entity.center.y }],
      radius: entity.radius,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle,
    };
  }
  if (entity.type === "ellipse") {
    return {
      kind: "ellipse",
      layer: entity.layer,
      points: [{ x: entity.center.x, y: entity.center.y }],
      majorAxis: { x: entity.majorAxis.x, y: entity.majorAxis.y },
      axisRatio: entity.ratio,
      startAngle: entity.startParameter,
      endAngle: entity.endParameter,
    };
  }
  if (entity.type === "spline") {
    return {
      kind: "spline",
      layer: entity.layer,
      points: entity.controlPoints.map((point) => ({ x: point.x, y: point.y })),
      degree: entity.degree,
      knots: [...entity.knots],
    };
  }
  if (entity.type === "line") {
    return {
      kind: "line",
      layer: entity.layer,
      points: [
        { x: entity.start.x, y: entity.start.y },
        { x: entity.end.x, y: entity.end.y },
      ],
    };
  }
  if (entity.type === "polyline") {
    const points = entity.vertices.map((point) => ({ x: point.x, y: point.y }));
    return {
      kind: "polyline",
      layer: entity.layer,
      points:
        entity.closed && points.length && points[0] !== points.at(-1)
          ? [...points, { ...points[0] }]
          : points,
    };
  }
  if (entity.type === "circle" && !entity.legacy) {
    return {
      kind: "circle",
      layer: entity.layer,
      points: [{ x: entity.center.x, y: entity.center.y }],
      radius: entity.radius,
    };
  }
  return null;
}

export function cadDocumentNativeDxfPrimitives(
  document: CadDocument,
  filter?: (entity: CadEntity) => boolean,
): CadDxfPrimitive[] {
  return document.entities
    .filter((entity) => (filter ? filter(entity) : true))
    .map(cadEntityToDxfPrimitive)
    .filter((primitive): primitive is CadDxfPrimitive => primitive !== null);
}
