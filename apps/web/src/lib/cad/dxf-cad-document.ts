import type {
  CadDocument,
  CadEntity,
  CadPoint2,
  CadPoint3,
} from "./cad-document";
import type { CadDxfHatch, CadDxfMText, CadDxfPoint, CadDxfPrimitive, CadDxfSemanticDimension } from "./dxf-import";
import type { CadDxfExportHatch, CadDxfExportMText, CadDxfExportSemanticDimension } from "./dxf-export";
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

export function cadDxfHatchesToNativeEntities(
  hatches: CadDxfHatch[],
  options: CadDxfNativeImportOptions = {},
): CadNativeEntity[] {
  const projection = options.projection ?? identityProjection;
  const prefix = options.idPrefix ?? "dxf";
  const provider = options.provider ?? "dxf";
  const scaleFactor =
    (Math.hypot(...Object.values(mappedVector(projection, { x: 0, y: 0 }, { x: 1, y: 0 }))) +
      Math.hypot(...Object.values(mappedVector(projection, { x: 0, y: 0 }, { x: 0, y: 1 })))) /
    2;
  return hatches
    .map((hatch, index): CadNativeEntity | null => {
      const boundaries = hatch.boundaries
        .map((boundary) => boundary.map((point) => point3(projection.point(point))))
        .filter((boundary) => boundary.length >= 3);
      if (!boundaries.length) return null;
      return {
        id: `${prefix}:hatch:${index.toString().padStart(6, "0")}`,
        type: "hatch",
        pattern: hatch.pattern,
        solid: hatch.solid,
        boundaries,
        scale: Math.max(1e-9, (hatch.scale ?? 1) * scaleFactor),
        angle: projectedAngle(projection, { x: 0, y: 0 }, 1, hatch.angle ?? 0),
        ...(hatch.origin ? { origin: point3(projection.point(hatch.origin)) } : {}),
        islandStyle: hatch.islandStyle ?? "normal",
        associative: false,
        associationStatus: "detached",
        layer: hatch.layer,
        context: {
          provenance: { provider },
          metadata: {
            sourceType: "HATCH",
            sourceLayer: hatch.layer,
          },
        },
      };
    })
    .filter((entity): entity is CadNativeEntity => entity !== null);
}

export function cadDxfMTextsToNativeEntities(
  mtexts: CadDxfMText[],
  options: CadDxfNativeImportOptions = {},
): CadNativeEntity[] {
  const projection = options.projection ?? identityProjection;
  const prefix = options.idPrefix ?? "dxf";
  const provider = options.provider ?? "dxf";
  const scaleFactor =
    (Math.hypot(...Object.values(mappedVector(projection, { x: 0, y: 0 }, { x: 1, y: 0 }))) +
      Math.hypot(...Object.values(mappedVector(projection, { x: 0, y: 0 }, { x: 0, y: 1 })))) /
    2;
  return mtexts.map((mtext, index): CadNativeEntity => ({
    id: `${prefix}:mtext:${index.toString().padStart(6, "0")}`,
    type: "mtext",
    insertion: point3(projection.point(mtext.insertion)),
    text: mtext.text,
    width: Math.max(1e-9, (mtext.width ?? (mtext.height ?? 120) * 20) * scaleFactor),
    height: Math.max(1e-9, (mtext.height ?? 120) * scaleFactor),
    rotation: projectedAngle(projection, mtext.insertion, 1, mtext.rotation ?? 0),
    alignment: mtext.alignment ?? "top-left",
    paragraphAlignment: mtext.paragraphAlignment ?? "left",
    style: mtext.style ?? "Standard",
    fontFamily: mtext.fontFamily ?? "Arial",
    lineSpacing: mtext.lineSpacing ?? 1.2,
    bold: mtext.bold ?? false,
    italic: mtext.italic ?? false,
    underline: mtext.underline ?? false,
    backgroundMask: mtext.backgroundMask ?? false,
    backgroundColor: mtext.backgroundColor,
    backgroundPadding: mtext.backgroundPadding ?? 0.15,
    columns: mtext.columns ?? 1,
    layer: mtext.layer,
    context: {
      provenance: { provider },
      metadata: { sourceType: "MTEXT", sourceLayer: mtext.layer },
    },
  }));
}

export function cadDxfSemanticDimensionsToNativeEntities(
  dimensions: CadDxfSemanticDimension[],
  options: CadDxfNativeImportOptions = {},
): CadNativeEntity[] {
  const projection = options.projection ?? identityProjection;
  const prefix = options.idPrefix ?? "dxf";
  const provider = options.provider ?? "dxf";
  const origin = { x: 0, y: 0 };
  const scaleFactor =
    (Math.hypot(...Object.values(mappedVector(projection, origin, { x: 1, y: 0 }))) +
      Math.hypot(...Object.values(mappedVector(projection, origin, { x: 0, y: 1 })))) /
    2;
  return dimensions.map((dimension, index): CadNativeEntity => {
    const projectedA = projection.point(dimension.a);
    const projectedB = projection.point(dimension.b);
    const projectedC = dimension.c ? projection.point(dimension.c) : undefined;
    const reflected = projectionOrientation(projection, dimension.a) < 0;
    const swapAngular = reflected && (dimension.dimensionKind === "angular" || dimension.dimensionKind === "arc-length") && projectedC;
    const properties = { ...dimension } as Record<string, unknown>;
    ["blockName", "a", "b", "c", "offset", "radius", "arrowSize", "extensionGap", "extensionOvershoot", "textGap"].forEach((key) => delete properties[key]);
    return {
      id: `${prefix}:dimension:${index.toString().padStart(6, "0")}`,
      type: "dimension",
      ...(properties as Omit<CadDxfSemanticDimension, "blockName" | "a" | "b" | "c" | "offset" | "radius" | "arrowSize" | "extensionGap" | "extensionOvershoot" | "textGap">),
      a: point3(projectedA),
      b: point3(swapAngular ? projectedC : projectedB),
      ...(projectedC ? { c: point3(swapAngular ? projectedB : projectedC) } : {}),
      ...(dimension.offset !== undefined ? { offset: dimension.offset * scaleFactor * (reflected && dimension.dimensionKind === "aligned" ? -1 : 1) } : {}),
      ...(dimension.radius !== undefined ? { radius: dimension.radius * scaleFactor } : {}),
      ...(dimension.arrowSize !== undefined ? { arrowSize: dimension.arrowSize * scaleFactor } : {}),
      ...(dimension.extensionGap !== undefined ? { extensionGap: dimension.extensionGap * scaleFactor } : {}),
      ...(dimension.extensionOvershoot !== undefined ? { extensionOvershoot: dimension.extensionOvershoot * scaleFactor } : {}),
      ...(dimension.textGap !== undefined ? { textGap: dimension.textGap * scaleFactor } : {}),
      associative: false,
      associationStatus: "detached",
      context: {
        provenance: { provider },
        metadata: { sourceType: "DIMENSION", sourceLayer: dimension.layer },
      },
    };
  });
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

export function cadDocumentNativeDxfHatches(
  document: CadDocument,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportHatch[] {
  return document.entities
    .filter((entity) => entity.type === "hatch" && (filter ? filter(entity) : true))
    .map((entity) => {
      if (entity.type !== "hatch") throw new Error("Unexpected non-hatch entity.");
      return {
        layer: entity.layer,
        boundaries: entity.boundaries.map((boundary) =>
          boundary.map((point) => ({ x: point.x, y: point.y })),
        ),
        pattern: entity.pattern,
        solid: entity.solid,
        scale: entity.scale,
        angle: entity.angle,
        ...(entity.origin ? { origin: { x: entity.origin.x, y: entity.origin.y } } : {}),
        islandStyle: entity.islandStyle ?? "normal",
      };
    });
}

export function cadDocumentNativeDxfMTexts(
  document: CadDocument,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportMText[] {
  return document.entities
    .filter((entity) => entity.type === "mtext" && (filter ? filter(entity) : true))
    .map((entity) => {
      if (entity.type !== "mtext") throw new Error("Unexpected non-MTEXT entity.");
      return {
        layer: entity.layer,
        insertion: { x: entity.insertion.x, y: entity.insertion.y },
        text: entity.text,
        width: entity.width,
        height: entity.height,
        rotation: entity.rotation,
        alignment: entity.alignment,
        paragraphAlignment: entity.paragraphAlignment,
        style: entity.style,
        fontFamily: entity.fontFamily,
        lineSpacing: entity.lineSpacing,
        bold: entity.bold,
        italic: entity.italic,
        underline: entity.underline,
        backgroundMask: entity.backgroundMask,
        backgroundColor: entity.backgroundColor,
        backgroundPadding: entity.backgroundPadding,
        columns: entity.columns,
      };
    });
}

export function cadDocumentNativeDxfSemanticDimensions(
  document: CadDocument,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportSemanticDimension[] {
  return document.entities
    .filter((entity) => entity.type === "dimension" && !!entity.dimensionKind && (filter ? filter(entity) : true))
    .map((entity) => {
      if (entity.type !== "dimension" || !entity.dimensionKind) throw new Error("Unexpected non-semantic DIMENSION entity.");
      const dimension = { ...entity } as Record<string, unknown>;
      ["id", "type", "context", "references", "associative", "associationStatus"].forEach((key) => delete dimension[key]);
      return dimension as unknown as CadDxfExportSemanticDimension;
    });
}
