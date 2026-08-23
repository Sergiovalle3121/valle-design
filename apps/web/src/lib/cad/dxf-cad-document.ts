// `CadDocument` ya no se nombra aquí: los siete ensambladores de exportación
// piden `CadDxfExportSource`, que dice lo que de verdad leen —entidades,
// bloques, imágenes y opacas— en vez de exigir el documento entero con su
// historia y sus publicaciones. Un `CadDocument` lo satisface sin conversión.
import type { CadBlockDefinition, CadEntity } from "./cad-document";
import type {
  CadDxfHatch,
  CadDxfMText,
  CadDxfPrimitive,
  CadDxfSemanticBlock,
  CadDxfSemanticDimension,
  CadDxfSemanticInsert,
  CadDxfSemanticMleader,
} from "./dxf-import";
import type {
  CadDxfExportBlock,
  CadDxfExportHatch,
  CadDxfExportInsert,
  CadDxfExportMText,
  CadDxfExportMleader,
  CadDxfExportSemanticDimension,
} from "./dxf-export";
import type { CadNativeEntity } from "./entity-runtime";
// La traducción entidad→primitiva y la AUDITORÍA de lo que la exportación
// pierde viven en sus propios módulos: este archivo ENSAMBLA el modelo de
// exportación, y mezclar las tres cosas era lo que lo tenía en su techo.
import { cadEntityToDxfPrimitive } from "./dxf-entity-primitives";
import { blockEntityToDxfPrimitive } from "./dxf-block-primitive";
import { clampedKnots } from "./dxf-nurbs-knots";
import { schema4PrimitiveToEntity } from "./dxf-schema4-entities";
import { cadSchema10ScaledFields } from "./cad-entities-v10";
export { cadEntityToDxfPrimitive };
export {
  cadDocumentDxfExportLosses,
  type CadDxfExportSource,
} from "./dxf-export-loss-manifest";
import type { CadDxfExportSource } from "./dxf-export-loss-manifest";
// El contrato de proyección y sus helpers viven en su propio módulo: son una
// pieza coherente y este archivo está en su asignación de tamaño.
import {
  identityProjection,
  mappedVector,
  point3,
  projectedAngle,
  projectionOrientation,
  type CadDxfProjection,
} from "./dxf-projection";

export type { CadDxfProjection };

export interface CadDxfNativeImportOptions {
  idPrefix?: string;
  projection?: CadDxfProjection;
  provider?: string;
}

function sourceContext(
  primitive: CadDxfPrimitive,
  provider: string,
): CadNativeEntity["context"] {
  return {
    provenance: { provider },
    // Cómo se dibuja viaja con la entidad y no con su metadato: el visor, el
    // trazador y el escritor lo leen de aquí, y meterlo en `metadata` —que es
    // texto libre para la procedencia— lo habría dejado fuera del tipo.
    ...(primitive.presentation ? { presentation: primitive.presentation } : {}),
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
        majorAxis: point3(
          mappedVector(projection, center, primitive.majorAxis),
        ),
        ratio: primitive.axisRatio,
        startParameter: reflected ? end : start,
        endParameter: reflected ? start : end,
        layer: primitive.layer,
        context: sourceContext(primitive, provider),
      });
      return;
    }
    if (primitive.kind === "spline" && primitive.points.length >= 2) {
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
    (Math.hypot(
      ...Object.values(
        mappedVector(projection, { x: 0, y: 0 }, { x: 1, y: 0 }),
      ),
    ) +
      Math.hypot(
        ...Object.values(
          mappedVector(projection, { x: 0, y: 0 }, { x: 0, y: 1 }),
        ),
      )) /
    2;
  return hatches
    .map((hatch, index): CadNativeEntity | null => {
      const boundaries = hatch.boundaries
        .map((boundary) =>
          boundary.map((point) => point3(projection.point(point))),
        )
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
        ...(hatch.origin
          ? { origin: point3(projection.point(hatch.origin)) }
          : {}),
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
    (Math.hypot(
      ...Object.values(
        mappedVector(projection, { x: 0, y: 0 }, { x: 1, y: 0 }),
      ),
    ) +
      Math.hypot(
        ...Object.values(
          mappedVector(projection, { x: 0, y: 0 }, { x: 0, y: 1 }),
        ),
      )) /
    2;
  return mtexts.map((mtext, index): CadNativeEntity => ({
    id: `${prefix}:mtext:${index.toString().padStart(6, "0")}`,
    type: "mtext",
    insertion: point3(projection.point(mtext.insertion)),
    text: mtext.text,
    width: Math.max(
      1e-9,
      (mtext.width ?? (mtext.height ?? 120) * 20) * scaleFactor,
    ),
    height: Math.max(1e-9, (mtext.height ?? 120) * scaleFactor),
    rotation: projectedAngle(
      projection,
      mtext.insertion,
      1,
      mtext.rotation ?? 0,
    ),
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
    (Math.hypot(
      ...Object.values(mappedVector(projection, origin, { x: 1, y: 0 })),
    ) +
      Math.hypot(
        ...Object.values(mappedVector(projection, origin, { x: 0, y: 1 })),
      )) /
    2;
  return dimensions.map((dimension, index): CadNativeEntity => {
    const projectedA = projection.point(dimension.a);
    const projectedB = projection.point(dimension.b);
    const projectedC = dimension.c ? projection.point(dimension.c) : undefined;
    const reflected = projectionOrientation(projection, dimension.a) < 0;
    const swapAngular =
      reflected &&
      (dimension.dimensionKind === "angular" ||
        dimension.dimensionKind === "arc-length") &&
      projectedC;
    const properties = { ...dimension } as Record<string, unknown>;
    [
      "blockName",
      "a",
      "b",
      "c",
      "offset",
      "radius",
      "arrowSize",
      "extensionGap",
      "extensionOvershoot",
      "textGap", "textHeight",
      "annotativeHeightMm",
    ].forEach((key) => delete properties[key]);
    return {
      id: `${prefix}:dimension:${index.toString().padStart(6, "0")}`,
      type: "dimension",
      ...(properties as Omit<
        CadDxfSemanticDimension,
        | "blockName"
        | "a"
        | "b"
        | "c"
        | "offset"
        | "radius"
        | "arrowSize"
        | "extensionGap"
        | "extensionOvershoot"
        | "textGap" | "textHeight"
      >),
      a: point3(projectedA),
      b: point3(swapAngular ? projectedC : projectedB),
      ...(projectedC
        ? { c: point3(swapAngular ? projectedB : projectedC) }
        : {}),
      ...(dimension.offset !== undefined
        ? {
            offset:
              dimension.offset *
              scaleFactor *
              (reflected && dimension.dimensionKind === "aligned" ? -1 : 1),
          }
        : {}),
      ...(dimension.radius !== undefined
        ? { radius: dimension.radius * scaleFactor }
        : {}),
      ...(dimension.arrowSize !== undefined
        ? { arrowSize: dimension.arrowSize * scaleFactor }
        : {}),
      ...(dimension.extensionGap !== undefined
        ? { extensionGap: dimension.extensionGap * scaleFactor }
        : {}),
      ...(dimension.extensionOvershoot !== undefined
        ? { extensionOvershoot: dimension.extensionOvershoot * scaleFactor }
        : {}),
      ...(dimension.textGap !== undefined ? { textGap: dimension.textGap * scaleFactor } : {}),
      ...cadSchema10ScaledFields(dimension, scaleFactor),
      associative: false,
      associationStatus: "detached",
      context: {
        provenance: { provider },
        metadata: {
          sourceType: "DIMENSION",
          sourceLayer: dimension.layer,
          // El flag anotativo vuelve a su bolsillo. Es tamaño SOBRE PAPEL:
          // no se multiplica por el factor de proyección del modelo.
          ...(dimension.annotativeHeightMm !== undefined && dimension.annotativeHeightMm > 0
            ? { annotativeHeightMm: dimension.annotativeHeightMm }
            : {}),
        },
      },
    };
  });
}

export function cadDxfMleadersToNativeEntities(
  mleaders: CadDxfSemanticMleader[],
  options: CadDxfNativeImportOptions = {},
): CadNativeEntity[] {
  const projection = options.projection ?? identityProjection;
  const prefix = options.idPrefix ?? "dxf";
  const provider = options.provider ?? "dxf";
  const scaleFactor =
    (Math.hypot(
      ...Object.values(
        mappedVector(projection, { x: 0, y: 0 }, { x: 1, y: 0 }),
      ),
    ) +
      Math.hypot(
        ...Object.values(
          mappedVector(projection, { x: 0, y: 0 }, { x: 0, y: 1 }),
        ),
      )) /
    2;
  return mleaders.map((mleader, index): CadNativeEntity => {
    const properties = { ...mleader } as Record<string, unknown>;
    [
      "sourceOrdinal",
      "vertices",
      "leaderLines",
      "textPosition",
      "textWidth",
      "textHeight",
      "textRotation",
      "doglegLength",
      "arrowSize",
    ].forEach((key) => delete properties[key]);
    const leaderLines = (
      mleader.leaderLines?.length ? mleader.leaderLines : [mleader.vertices]
    ).map((line) => line.map((point) => point3(projection.point(point))));
    return {
      id: `${prefix}:mleader:${index.toString().padStart(6, "0")}`,
      type: "mleader",
      ...(properties as Omit<
        CadDxfSemanticMleader,
        | "sourceOrdinal"
        | "vertices"
        | "leaderLines"
        | "textPosition"
        | "textWidth"
        | "textHeight"
        | "textRotation"
        | "doglegLength"
        | "arrowSize"
      >),
      vertices: leaderLines[0],
      leaderLines,
      textPosition: point3(projection.point(mleader.textPosition)),
      ...(mleader.textWidth !== undefined
        ? { textWidth: mleader.textWidth * scaleFactor }
        : {}),
      ...(mleader.textHeight !== undefined ? { textHeight: mleader.textHeight * scaleFactor } : {}),
      textRotation: projectedAngle(
        projection,
        mleader.textPosition,
        1,
        mleader.textRotation ?? 0,
      ),
      ...(mleader.doglegLength !== undefined
        ? { doglegLength: mleader.doglegLength * scaleFactor }
        : {}),
      ...(mleader.arrowSize !== undefined
        ? { arrowSize: mleader.arrowSize * scaleFactor }
        : {}),
      associative: false,
      associationStatus: "detached",
      context: {
        provenance: { provider },
        metadata: { sourceType: "MLEADER", sourceLayer: mleader.layer },
      },
    };
  });
}

export function cadDocumentNativeDxfPrimitives(
  document: CadDxfExportSource,
  filter?: (entity: CadEntity) => boolean,
): CadDxfPrimitive[] {
  return document.entities
    .filter((entity) => (filter ? filter(entity) : true))
    .map((entity) => cadEntityToDxfPrimitive(entity, document))
    .filter((primitive): primitive is CadDxfPrimitive => primitive !== null);
}

export function cadDocumentNativeDxfHatches(
  document: CadDxfExportSource,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportHatch[] {
  return document.entities
    .filter(
      (entity) => entity.type === "hatch" && (filter ? filter(entity) : true),
    )
    .map((entity) => {
      if (entity.type !== "hatch")
        throw new Error("Unexpected non-hatch entity.");
      return {
        layer: entity.layer,
        boundaries: entity.boundaries.map((boundary) =>
          boundary.map((point) => ({ x: point.x, y: point.y })),
        ),
        pattern: entity.pattern,
        solid: entity.solid,
        scale: entity.scale,
        angle: entity.angle,
        ...(entity.origin
          ? { origin: { x: entity.origin.x, y: entity.origin.y } }
          : {}),
        islandStyle: entity.islandStyle ?? "normal",
      };
    });
}

export function cadDocumentNativeDxfMTexts(
  document: CadDxfExportSource,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportMText[] {
  return document.entities
    .filter(
      (entity) => entity.type === "mtext" && (filter ? filter(entity) : true),
    )
    .map((entity) => {
      if (entity.type !== "mtext")
        throw new Error("Unexpected non-MTEXT entity.");
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
  document: CadDxfExportSource,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportSemanticDimension[] {
  return document.entities
    .filter(
      (entity) =>
        entity.type === "dimension" &&
        !!entity.dimensionKind &&
        (filter ? filter(entity) : true),
    )
    .map((entity) => {
      if (entity.type !== "dimension" || !entity.dimensionKind)
        throw new Error("Unexpected non-semantic DIMENSION entity.");
      const dimension = { ...entity } as Record<string, unknown>;
      // La marca anotativa vive en el bolsillo de metadatos y `context` no
      // viaja: se asciende a campo del modelo de export para que la XDATA la
      // escriba y el flag sobreviva el round-trip.
      const annotative = entity.context?.metadata?.annotativeHeightMm;
      const annotativeValue =
        typeof annotative === "number" ? annotative : Number(annotative);
      if (Number.isFinite(annotativeValue) && annotativeValue > 0)
        dimension.annotativeHeightMm = annotativeValue;
      [
        "id",
        "type",
        "context",
        "references",
        "associative",
        "associationStatus",
      ].forEach((key) => delete dimension[key]);
      return dimension as unknown as CadDxfExportSemanticDimension;
    });
}

export function cadDocumentNativeDxfMleaders(
  document: CadDxfExportSource,
  filter?: (entity: CadEntity) => boolean,
): CadDxfExportMleader[] {
  return document.entities
    .filter(
      (entity) => entity.type === "mleader" && (filter ? filter(entity) : true),
    )
    .map((entity) => {
      if (entity.type !== "mleader")
        throw new Error("Unexpected non-MLEADER entity.");
      const mleader = { ...entity } as Record<string, unknown>;
      [
        "id",
        "type",
        "context",
        "references",
        "associative",
        "associationStatus",
      ].forEach((key) => delete mleader[key]);
      return mleader as unknown as CadDxfExportMleader;
    });
}

function dxfPrimitiveToBlockEntity(
  primitive: CadDxfPrimitive,
  id: string,
  projection: CadDxfProjection,
  provider: string,
): CadEntity | null {
  const context = sourceContext(primitive, provider);
  // Los tipos del esquema 4 se reconstruyen en su propio módulo: es la vuelta
  // exacta de `dxf-schema4-primitives.ts` y la simetría es el contrato.
  if (primitive.schema4) {
    const entity = schema4PrimitiveToEntity(primitive, id, projection, context);
    if (entity) return entity;
  }
  if (primitive.kind === "line" && primitive.points.length >= 2)
    return {
      id,
      type: "line",
      start: point3(projection.point(primitive.points[0])),
      end: point3(projection.point(primitive.points[1])),
      layer: primitive.layer,
      context,
    };
  if (
    (primitive.kind === "polyline" || primitive.kind === "rect") &&
    primitive.points.length >= 2
  ) {
    // El cierre lo declara la primitiva. Reinferirlo comparando el primer y el
    // último punto convertía en cerrada cualquier polilínea ABIERTA cuyos
    // extremos coincidieran por geometría, y le borraba su último vértice.
    // Sólo se recurre a la comparación cuando la primitiva no trae el dato
    // (primitivas construidas a mano por código anterior a este contrato).
    const source = primitive.points;
    const closed =
      primitive.closed ??
      (source.length > 2 &&
        source[0].x === source.at(-1)?.x &&
        source[0].y === source.at(-1)?.y);
    const redundantClosingVertex =
      closed &&
      source.length > 2 &&
      source[0].x === source.at(-1)?.x &&
      source[0].y === source.at(-1)?.y;
    // El bulge es angular y sobrevive a un giro o a una escala, pero NO a una
    // reflexión: bajo determinante negativo el arco recorre su cuerda en
    // sentido contrario y su signo va con él. El comentario que había aquí
    // decía que sobrevivía a la proyección, y es cierto para una escala y
    // falso para un espejo. Arcos y elipses ya lo tratan intercambiando sus
    // extremos; la polilínea era el hueco, y copiar el bulge tal cual dejaba
    // cada tramo curvo combado hacia el lado contrario al de la planta.
    const reflected = projectionOrientation(projection, source[0]) < 0;
    return {
      id,
      type: "polyline",
      vertices: (redundantClosingVertex ? source.slice(0, -1) : source).map((value) => ({
        ...point3(projection.point(value)),
        ...(typeof value.bulge === "number" && value.bulge !== 0
          ? { bulge: reflected ? -value.bulge : value.bulge }
          : {}),
      })),
      closed,
      layer: primitive.layer,
      context,
    };
  }
  if (primitive.kind === "text" && primitive.points[0]) {
    const insertion = projection.point(primitive.points[0]);
    return {
      id,
      type: "text",
      x: insertion.x,
      y: insertion.y,
      text: primitive.text ?? "",
      layer: primitive.layer,
      context,
    };
  }
  if (
    primitive.kind === "circle" &&
    primitive.points[0] &&
    (primitive.radius ?? 0) > 0
  ) {
    const center = primitive.points[0];
    const xAxis = mappedVector(projection, center, {
      x: primitive.radius!,
      y: 0,
    });
    const yAxis = mappedVector(projection, center, {
      x: 0,
      y: primitive.radius!,
    });
    const rx = Math.hypot(xAxis.x, xAxis.y);
    const ry = Math.hypot(yAxis.x, yAxis.y);
    if (Math.abs(rx - ry) <= Math.max(rx, ry, 1) * 1e-9)
      return {
        id,
        type: "circle",
        center: point3(projection.point(center)),
        radius: (rx + ry) / 2,
        layer: primitive.layer,
        context,
      };
    return {
      id,
      type: "ellipse",
      center: point3(projection.point(center)),
      majorAxis: point3(rx >= ry ? xAxis : yAxis),
      ratio: Math.min(rx, ry) / Math.max(rx, ry),
      startParameter: 0,
      endParameter: 360,
      layer: primitive.layer,
      context,
    };
  }
  return (
    cadDxfCurvesToNativeEntities([primitive], {
      idPrefix: id,
      projection,
      provider,
    })[0] ?? null
  );
}

/** Converts top-level DXF primitives without flattening curves to segments. */
export function cadDxfPrimitivesToCanonicalEntities(
  primitives: CadDxfPrimitive[],
  options: CadDxfNativeImportOptions = {},
): CadEntity[] {
  const projection = options.projection ?? identityProjection;
  const prefix = options.idPrefix ?? "dxf";
  const provider = options.provider ?? "dxf";
  return primitives
    .map((primitive, index) =>
      dxfPrimitiveToBlockEntity(
        primitive,
        `${prefix}:entity:${index.toString().padStart(6, "0")}`,
        projection,
        provider,
      ),
    )
    .filter((entity): entity is CadEntity => entity !== null);
}

function semanticInsertToEntity(
  insert: CadDxfSemanticInsert,
  id: string,
  blockIds: Map<string, string>,
  projection: CadDxfProjection,
  provider: string,
): Extract<CadEntity, { type: "insert" }> {
  const origin = projection.point(insert.insertion);
  const xVector = mappedVector(projection, insert.insertion, { x: insert.scaleX, y: 0 });
  const yVector = mappedVector(projection, insert.insertion, { x: 0, y: insert.scaleY });
  /**
   * El SIGNO de la escala es lo único que distingue un bloque espejado de uno
   * girado, y `Math.hypot` es una magnitud: se lo comía. Un INSERT con group
   * code 41 = −1 volvía como +1, y con `scale.z` fijado a 1 no quedaba ningún
   * canal por el que recuperar la orientación. Exportar e importar perdía el
   * espejo sin avisar, y una prueba de ida y vuelta habría pasado con el
   * espejo roto porque el signo se descartaba antes de poder comprobarlo.
   *
   * La reposición tiene dos partes. El signo que traía el archivo se devuelve
   * a su eje. Y si la PROYECCIÓN invierte el plano se niega además un eje —el
   * `y`, mismo criterio que el adaptador nativo de INSERT—, porque
   * `P·R(θ)·diag(sx,sy)` con `P` reflectante vale `R(ψ−θ)·diag(k·sx, −k·sy)`.
   * El giro que sale de ahí, `ψ−θ`, es exactamente lo que ya devuelve
   * `projectedAngle`, así que las dos mitades encajan sin más ajuste.
   */
  const flip = projectionOrientation(projection, insert.insertion) < 0 ? -1 : 1;
  return {
    id,
    type: "insert",
    block: blockIds.get(insert.block) ?? insert.block,
    insertion: point3(origin),
    scale: {
      x: Math.hypot(xVector.x, xVector.y) * (insert.scaleX < 0 ? -1 : 1),
      y: Math.hypot(yVector.x, yVector.y) * (insert.scaleY < 0 ? -1 : 1) * flip,
      z: 1,
    },
    rotation: projectedAngle(projection, insert.insertion, 1, insert.rotation),
    attributes: { ...insert.attributes },
    layer: insert.layer,
    context: {
      provenance: { provider },
      // El tipo de línea y el grosor de la INSERCIÓN no son decoración: son de
      // donde tira el BYBLOCK de la geometría de dentro.
      ...(insert.presentation ? { presentation: insert.presentation } : {}),
      metadata: { sourceType: "INSERT", sourceBlock: insert.block },
    },
  };
}

/** Restores imported BLOCK tables and INSERTs as canonical live definitions/instances. */
export function cadDxfBlocksToCadDocumentParts(
  blocks: CadDxfSemanticBlock[],
  inserts: CadDxfSemanticInsert[],
  options: CadDxfNativeImportOptions = {},
): {
  blocks: CadBlockDefinition[];
  inserts: Array<Extract<CadEntity, { type: "insert" }>>;
} {
  const projection = options.projection ?? identityProjection;
  const prefix = options.idPrefix ?? "dxf";
  const provider = options.provider ?? "dxf";
  const blockIds = new Map(
    blocks.map((block, index) => [
      block.name,
      `${prefix}:block:${index.toString().padStart(4, "0")}`,
    ]),
  );
  const definitions = blocks.map((block): CadBlockDefinition => {
    const id = blockIds.get(block.name)!;
    const entities: CadEntity[] = block.primitives
      .map((primitive, index) =>
        dxfPrimitiveToBlockEntity(
          primitive,
          `${id}:entity:${index}`,
          projection,
          provider,
        ),
      )
      .filter((entity): entity is CadEntity => entity !== null);
    block.inserts.forEach((insert, index) =>
      entities.push(
        semanticInsertToEntity(
          insert,
          `${id}:insert:${index}`,
          blockIds,
          projection,
          provider,
        ),
      ),
    );
    return {
      id,
      name: block.name,
      basePoint: point3(projection.point(block.basePoint)),
      entities,
      attributes: Object.fromEntries(
        Object.entries(block.attributes).map(([tag, attribute]) => {
          const { position, ...definition } = attribute;
          return [
            tag,
            {
              ...definition,
              ...(position
                ? { position: point3(projection.point(position)) }
                : {}),
            },
          ];
        }),
      ),
      version: block.version ?? 1,
      description: block.description,
      keywords: block.keywords,
      library: {
        scope: block.libraryScope ?? "document",
        ...(block.libraryTenantId ? { tenantId: block.libraryTenantId } : {}),
      },
      ...(block.businessEntityType && block.businessEntityId
        ? {
            businessLink: {
              entityType: block.businessEntityType,
              entityId: block.businessEntityId,
            },
          }
        : {}),
    };
  });
  return {
    blocks: definitions,
    inserts: inserts.map((insert, index) =>
      semanticInsertToEntity(
        insert,
        `${prefix}:insert:${index.toString().padStart(6, "0")}`,
        blockIds,
        projection,
        provider,
      ),
    ),
  };
}

export function cadDocumentDxfBlocks(
  document: CadDxfExportSource,
): CadDxfExportBlock[] {
  return document.blocks.map((block) => ({
    name: block.name,
    basePoint: { x: block.basePoint.x, y: block.basePoint.y },
    primitives: block.entities
      .map(blockEntityToDxfPrimitive)
      .filter((primitive): primitive is CadDxfPrimitive => primitive !== null),
    inserts: block.entities
      .filter(
        (entity): entity is Extract<CadEntity, { type: "insert" }> =>
          entity.type === "insert",
      )
      .map((entity) => ({
        block:
          document.blocks.find((candidate) => candidate.id === entity.block)
            ?.name ?? entity.block,
        x: entity.insertion.x,
        y: entity.insertion.y,
        scaleX: entity.scale.x,
        scaleY: entity.scale.y,
        rotation: entity.rotation,
        layer: entity.layer,
        attributes: entity.attributes,
        ...(entity.context?.presentation ? { presentation: entity.context.presentation } : {}),
      })),
    attributes: Object.fromEntries(
      Object.entries(block.attributes ?? {}).map(([tag, attribute]) => [
        tag,
        {
          ...attribute,
          ...(attribute.position
            ? { position: { x: attribute.position.x, y: attribute.position.y } }
            : {}),
        },
      ]),
    ),
    version: block.version,
    description: block.description,
    keywords: block.keywords,
    libraryScope: block.library?.scope,
    libraryTenantId: block.library?.tenantId,
    businessEntityType: block.businessLink?.entityType,
    businessEntityId: block.businessLink?.entityId,
  }));
}

export function cadDocumentDxfInserts(
  document: CadDxfExportSource,
  filter?: (entity: Extract<CadEntity, { type: "insert" }>) => boolean,
): CadDxfExportInsert[] {
  return document.entities
    .filter(
      (entity): entity is Extract<CadEntity, { type: "insert" }> =>
        entity.type === "insert" && (filter ? filter(entity) : true),
    )
    .map((entity) => ({
      block:
        document.blocks.find((block) => block.id === entity.block)?.name ??
        entity.block,
      x: entity.insertion.x,
      y: entity.insertion.y,
      scaleX: entity.scale.x,
      scaleY: entity.scale.y,
      rotation: entity.rotation,
      layer: entity.layer,
      attributes: entity.attributes,
      // La presentacion de la INSERCION es de donde tira el BYBLOCK de dentro:
      // sin ella el simbolo se reexporta y su geometria pierde de quien hereda.
      ...(entity.context?.presentation ? { presentation: entity.context.presentation } : {}),
      ...(entity.positionedAttributes?.length
        ? {
            positionedAttributes: entity.positionedAttributes.map((attribute) => ({
              ...attribute,
              insertion: { x: attribute.insertion.x, y: attribute.insertion.y },
            })),
          }
        : {}),
    }));
}
