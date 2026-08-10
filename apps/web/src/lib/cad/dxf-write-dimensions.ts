/**
 * Escritores DXF de las COTAS: la heredada (`measurements`, geometría alineada)
 * y la semántica del documento canónico (`semanticDimensions`, siete tipos).
 *
 * Salen de `dxf-export.ts` porque son la familia más grande que quedaba dentro
 * —geometría renderizada, bloque anónimo `*D{n}`, entidad DIMENSION y su
 * XDATA— y porque ese archivo está en su asignación exacta del trinquete: los
 * tipos del esquema 4 necesitaban sitio y la salida correcta es EXTRAER.
 *
 * Cada cota se materializa igual que en AutoCAD: una entidad DIMENSION que
 * referencia por nombre un bloque anónimo con la geometría ya dibujada.
 */
import type { CadDimensionEntity } from "./associative-dimension";
import { buildCadDimensionGeometry, type CadDimensionGeometry } from "./associative-dimension";
import {
  alignedDimension,
  DEFAULT_DIMENSION_STYLE,
  type DimensionGeometry,
} from "./dimension";
import { DXF_XDATA_APP_DIMENSION } from "@valle-design/contracts";
import type { CadDxfPoint, CadDxfPrimitive } from "./dxf-import";
import type {
  CadDxfExportMeasurement,
  CadDxfExportSemanticDimension,
} from "./dxf-export";
import {
  MEASUREMENT_LAYER,
  fmt,
  pushPair,
  pushPoint,
  safeLayerName,
  safeStyleName,
  safeText,
} from "./dxf-write-core";

/**
 * Geometría renderizada de una cota como primitivas (líneas de extensión,
 * línea de cota, flechas y texto), lista para vivir en su bloque anónimo *D.
 */
export function dimensionBlockPrimitives(
  geo: DimensionGeometry,
  layer: string,
  label: string,
): CadDxfPrimitive[] {
  const seg = (a: CadDxfPoint, b: CadDxfPoint): CadDxfPrimitive => ({
    kind: "line",
    layer,
    points: [a, b],
  });
  const arrow = (tri: CadDxfPoint[]): CadDxfPrimitive => ({
    kind: "polyline",
    layer,
    points: [...tri, tri[0]],
  });
  return [
    seg(geo.extensionA.a, geo.extensionA.b),
    seg(geo.extensionB.a, geo.extensionB.b),
    seg(geo.dimLine.a, geo.dimLine.b),
    arrow(geo.arrowA),
    arrow(geo.arrowB),
    { kind: "text", layer, points: [geo.textAnchor], text: label },
  ];
}

export interface PreparedDimension {
  measurement: CadDxfExportMeasurement;
  geo: DimensionGeometry;
  blockName: string;
  label: string;
}

/** Resuelve cada cota exportable a su geometría + bloque anónimo *D{n}. */
export function prepareDimensions(
  measurements: CadDxfExportMeasurement[],
): PreparedDimension[] {
  const prepared: PreparedDimension[] = [];
  for (const measurement of measurements) {
    const geo = alignedDimension(
      measurement.from,
      measurement.to,
      measurement.offset ?? 0,
      DEFAULT_DIMENSION_STYLE,
    );
    if (!geo) continue; // cota degenerada (from == to): no hay nada que medir
    prepared.push({
      measurement,
      geo,
      blockName: `*D${prepared.length + 1}`,
      label: safeText(measurement.label ?? fmt(geo.measurement)),
    });
  }
  return prepared;
}

/**
 * Entidad DIMENSION nativa (cota alineada) que referencia su bloque *D con la
 * geometría renderizada — el mismo esquema que escribe AutoCAD.
 */
export function pushDimension(lines: string[], layer: string, dim: PreparedDimension) {
  pushPair(lines, 0, "DIMENSION");
  pushPair(lines, 8, layer);
  pushPair(lines, 2, dim.blockName);
  // 10/20/30: punto de definición (extremo de la línea de cota).
  pushPoint(lines, dim.geo.dimLine.b);
  // 11/21/31: centro del texto.
  pushPair(lines, 11, fmt(dim.geo.textAnchor.x));
  pushPair(lines, 21, fmt(dim.geo.textAnchor.y));
  pushPair(lines, 31, "0");
  // 70: tipo 1 (alineada) + 32 (la geometría vive en un bloque referenciado).
  pushPair(lines, 70, 33);
  pushPair(lines, 1, dim.label);
  pushPair(lines, 42, fmt(dim.geo.measurement));
  // 13/23 y 14/24: orígenes de las líneas de extensión (los puntos medidos).
  pushPair(lines, 13, fmt(dim.measurement.from.x));
  pushPair(lines, 23, fmt(dim.measurement.from.y));
  pushPair(lines, 33, "0");
  pushPair(lines, 14, fmt(dim.measurement.to.x));
  pushPair(lines, 24, fmt(dim.measurement.to.y));
  pushPair(lines, 34, "0");
}


export interface PreparedSemanticDimension {
  entity: CadDxfExportSemanticDimension;
  geometry: CadDimensionGeometry;
  blockName: string;
}

export function semanticDimensionBlockPrimitives(dimension: PreparedSemanticDimension): CadDxfPrimitive[] {
  const layer = safeLayerName(dimension.entity.layer ?? MEASUREMENT_LAYER);
  return [
    // El cierre se declara con `closed`; repetir el primer punto añadía un
    // tramo nulo a la geometría del bloque de cota.
    ...dimension.geometry.paths.map((path): CadDxfPrimitive => ({
      kind: path.closed ? "rect" : path.points.length === 2 ? "line" : "polyline",
      layer,
      points: path.points,
      ...(path.closed ? { closed: true } : {}),
    })),
    { kind: "text", layer, points: [dimension.geometry.textAnchor], text: dimension.geometry.label },
  ];
}

export function prepareSemanticDimensions(
  dimensions: CadDxfExportSemanticDimension[],
  blockOffset: number,
): PreparedSemanticDimension[] {
  return dimensions.flatMap((entity, index) => {
    const canonical: CadDimensionEntity = { id: `dxf-dimension:${index}`, type: "dimension", ...entity };
    const geometry = buildCadDimensionGeometry(canonical);
    return geometry ? [{ entity, geometry, blockName: `*D${blockOffset + index + 1}` }] : [];
  });
}

function semanticDimensionType(kind: CadDxfExportSemanticDimension["dimensionKind"]): number {
  return ({ linear: 0, aligned: 1, angular: 5, radius: 4, diameter: 3, ordinate: 6, "arc-length": 8 } as const)[kind ?? "aligned"] + 32;
}

export function pushSemanticDimension(lines: string[], dimension: PreparedSemanticDimension) {
  const entity = dimension.entity;
  const pointPair = (xCode: number, yCode: number, point: CadDxfPoint) => {
    pushPair(lines, xCode, fmt(point.x));
    pushPair(lines, yCode, fmt(point.y));
    pushPair(lines, xCode + 20, "0");
  };
  pushPair(lines, 0, "DIMENSION");
  pushPair(lines, 8, safeLayerName(entity.layer ?? MEASUREMENT_LAYER));
  pushPair(lines, 2, dimension.blockName);
  pushPoint(lines, entity.b);
  pointPair(11, 21, dimension.geometry.textAnchor);
  pushPair(lines, 70, semanticDimensionType(entity.dimensionKind));
  pushPair(lines, 1, safeText(dimension.geometry.label));
  pushPair(lines, 3, safeStyleName(entity.style));
  pushPair(lines, 42, fmt(dimension.geometry.measurement));
  pointPair(13, 23, entity.a);
  pointPair(14, 24, entity.b);
  if (entity.c) pointPair(15, 25, entity.c);
  pushPair(lines, 40, fmt(entity.offset ?? entity.radius ?? 0));
  pushPair(lines, 271, Math.max(0, Math.min(8, Math.floor(entity.precision ?? 2))));
  pushPair(lines, 1001, DXF_XDATA_APP_DIMENSION);
  const metadata = [
    `kind=${entity.dimensionKind ?? "aligned"}`, `axis=${entity.axis ?? "x"}`,
    `units=${entity.units ?? entity.sourceUnit ?? "mm"}`, `sourceUnit=${entity.sourceUnit ?? "mm"}`,
    `alternateUnits=${entity.alternateUnits ?? ""}`, `prefix=${entity.prefix ?? ""}`, `suffix=${entity.suffix ?? ""}`,
    `arrowhead=${entity.arrowhead ?? "closed-filled"}`, `extensionLines=${entity.extensionLines === false ? 0 : 1}`,
    `arrowSize=${fmt(entity.arrowSize ?? DEFAULT_DIMENSION_STYLE.arrowSize)}`, `offset=${fmt(entity.offset ?? 0)}`,
    `radius=${fmt(entity.radius ?? 0)}`, `extensionGap=${fmt(entity.extensionGap ?? DEFAULT_DIMENSION_STYLE.extensionGap)}`,
    `extensionOvershoot=${fmt(entity.extensionOvershoot ?? DEFAULT_DIMENSION_STYLE.extensionOvershoot)}`,
    `textGap=${fmt(entity.textGap ?? DEFAULT_DIMENSION_STYLE.textGap)}`, `textOverride=${entity.text ?? ""}`,
  ];
  metadata.forEach((value) => pushPair(lines, 1000, safeText(value).slice(0, 240)));
}
