/* eslint-disable @typescript-eslint/no-explicit-any */
import DxfParser from "dxf-parser";
import type { CadDimensionEntity } from "./associative-dimension";

export type CadDxfPrimitiveKind =
  | "line"
  | "polyline"
  | "rect"
  | "text"
  | "circle"
  | "arc"
  | "ellipse"
  | "spline";
export interface CadDxfPoint {
  x: number;
  y: number;
}
export interface CadDxfPrimitive {
  kind: CadDxfPrimitiveKind;
  layer: string;
  points: CadDxfPoint[];
  text?: string;
  /** Radio, sólo para kind "circle" y "arc". */
  radius?: number;
  /** Ángulo inicial en grados (CCW desde +X), sólo para kind "arc" y "ellipse". */
  startAngle?: number;
  /** Ángulo final en grados (CCW desde +X), sólo para kind "arc" y "ellipse". */
  endAngle?: number;
  /** Extremo del eje mayor RELATIVO al centro, sólo para kind "ellipse". */
  majorAxis?: CadDxfPoint;
  /** Razón eje menor / eje mayor (0..1], sólo para kind "ellipse". */
  axisRatio?: number;
  /** Grado de la curva, sólo para kind "spline" (points = puntos de control). */
  degree?: number;
  /** Vector de nudos, sólo para kind "spline". */
  knots?: number[];
}
export interface CadDxfHatch {
  layer: string;
  pattern: string;
  solid: boolean;
  boundaries: CadDxfPoint[][];
  scale?: number;
  angle?: number;
  origin?: CadDxfPoint;
  islandStyle?: "normal" | "outer" | "ignore";
}
export interface CadDxfMText {
  layer: string;
  insertion: CadDxfPoint;
  text: string;
  width?: number;
  height?: number;
  rotation?: number;
  alignment?: "top-left" | "top-center" | "top-right" | "middle-left" | "middle-center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";
  paragraphAlignment?: "left" | "center" | "right" | "justify";
  style?: string;
  fontFamily?: string;
  lineSpacing?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  backgroundMask?: boolean;
  backgroundColor?: string;
  backgroundPadding?: number;
  columns?: number;
}
export type CadDxfSemanticDimension = Omit<
  CadDimensionEntity,
  "id" | "type" | "context" | "references" | "associative" | "associationStatus"
> & { blockName: string };
export interface CadDxfImportWarning {
  code: string;
  message: string;
  entityType?: string;
  layer?: string;
}
export interface CadDxfImportResult {
  primitives: CadDxfPrimitive[];
  hatches: CadDxfHatch[];
  mtexts: CadDxfMText[];
  semanticDimensions: CadDxfSemanticDimension[];
  warnings: CadDxfImportWarning[];
  layers: string[];
}

export interface CadDxfWarningSummary {
  key: string;
  code: string;
  entityType?: string;
  layer?: string;
  count: number;
  message: string;
}

export function summarizeDxfImportWarnings(
  warnings: CadDxfImportWarning[],
): CadDxfWarningSummary[] {
  const groups = new Map<string, CadDxfWarningSummary>();
  for (const warning of warnings) {
    const key = [
      warning.code,
      warning.entityType ?? "",
      warning.layer ?? "",
      warning.message,
    ].join("|");
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else
      groups.set(key, {
        key,
        code: warning.code,
        entityType: warning.entityType,
        layer: warning.layer,
        count: 1,
        message: warning.message,
      });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

const DEFAULT_LAYER = "0";
const MAX_DXF_ENTITIES = 50000;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
const pt = (v: any): CadDxfPoint | null => {
  const x = num(v?.x);
  const y = num(v?.y);
  return x == null || y == null ? null : { x, y };
};

function closeEnough(a: number, b: number, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}
function samePoint(a: CadDxfPoint, b: CadDxfPoint) {
  return closeEnough(a.x, b.x) && closeEnough(a.y, b.y);
}
function isAxisAlignedRect(points: CadDxfPoint[]): boolean {
  const pts =
    points.length === 5 && samePoint(points[0], points[4])
      ? points.slice(0, 4)
      : points;
  if (pts.length !== 4) return false;
  const xs = [...new Set(pts.map((p) => p.x))];
  const ys = [...new Set(pts.map((p) => p.y))];
  return xs.length === 2 && ys.length === 2;
}

export function mapDxfEntityToPrimitive(entity: any): {
  primitive?: CadDxfPrimitive;
  warning?: CadDxfImportWarning;
} {
  const type = String(entity?.type || "").toUpperCase();
  const layer = String(entity?.layer || DEFAULT_LAYER);
  if (type === "LINE") {
    const verts = Array.isArray(entity.vertices)
      ? (entity.vertices.map(pt).filter(Boolean) as CadDxfPoint[])
      : ([
          pt(entity.startPoint ?? entity.start),
          pt(entity.endPoint ?? entity.end),
        ].filter(Boolean) as CadDxfPoint[]);
    if (verts.length >= 2)
      return { primitive: { kind: "line", layer, points: verts.slice(0, 2) } };
    return {
      warning: {
        code: "invalid_line",
        message: "LINE sin dos puntos válidos.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "LWPOLYLINE" || type === "POLYLINE") {
    const points = (Array.isArray(entity.vertices) ? entity.vertices : [])
      .map(pt)
      .filter(Boolean) as CadDxfPoint[];
    if (points.length < 2)
      return {
        warning: {
          code: "invalid_polyline",
          message: "Polyline sin suficientes vértices.",
          entityType: type,
          layer,
        },
      };
    const closed = !!(entity.closed || entity.shape);
    const closedPoints =
      closed && !samePoint(points[0], points[points.length - 1])
        ? [...points, points[0]]
        : points;
    return {
      primitive: {
        kind: closed && isAxisAlignedRect(closedPoints) ? "rect" : "polyline",
        layer,
        points: closedPoints,
      },
    };
  }
  if (type === "CIRCLE") {
    const center = pt(entity.center);
    const radius = num(entity.radius);
    if (center && radius != null && radius > 0)
      return {
        primitive: { kind: "circle", layer, points: [center], radius },
      };
    return {
      warning: {
        code: "invalid_circle",
        message: "CIRCLE sin centro o radio válido.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "ARC") {
    const center = pt(entity.center);
    const radius = num(entity.radius);
    // dxf-parser entrega startAngle/endAngle en RADIANES (códigos 50/51 del DXF
    // llegan en grados y la librería los convierte). Los normalizamos a grados
    // para conservar la convención del modelo de primitivas.
    const startRad = num(entity.startAngle);
    const endRad = num(entity.endAngle);
    if (
      center &&
      radius != null &&
      radius > 0 &&
      startRad != null &&
      endRad != null
    )
      return {
        primitive: {
          kind: "arc",
          layer,
          points: [center],
          radius,
          startAngle: (startRad * 180) / Math.PI,
          endAngle: (endRad * 180) / Math.PI,
        },
      };
    return {
      warning: {
        code: "invalid_arc",
        message: "ARC sin centro, radio o ángulos válidos.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "ELLIPSE") {
    const center = pt(entity.center);
    const major = pt(entity.majorAxisEndPoint ?? entity.majorAxisEndpoint);
    const ratio = num(entity.axisRatio);
    // dxf-parser entrega los parámetros 41/42 en RADIANES (así van en el DXF);
    // los normalizamos a grados como el resto del modelo. Elipse completa =
    // 0..360 (2π en el archivo).
    const startRad = num(entity.startAngle) ?? 0;
    const endRad = num(entity.endAngle) ?? Math.PI * 2;
    if (center && major && ratio != null && ratio > 0) {
      return {
        primitive: {
          kind: "ellipse",
          layer,
          points: [center],
          majorAxis: major,
          axisRatio: ratio,
          startAngle: (startRad * 180) / Math.PI,
          endAngle: (endRad * 180) / Math.PI,
        },
      };
    }
    return {
      warning: {
        code: "invalid_ellipse",
        message: "ELLIPSE sin centro, eje mayor o razón válidos.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "SPLINE") {
    const control = (Array.isArray(entity.controlPoints) ? entity.controlPoints : [])
      .map(pt)
      .filter(Boolean) as CadDxfPoint[];
    const degree = num(entity.degree) ?? 3;
    const knots = (Array.isArray(entity.knotValues) ? entity.knotValues : [])
      .map((k: unknown) => Number(k))
      .filter((k: number) => Number.isFinite(k));
    if (control.length >= 2 && degree >= 1) {
      return {
        primitive: {
          kind: "spline",
          layer,
          points: control,
          degree,
          ...(knots.length ? { knots } : {}),
        },
      };
    }
    return {
      warning: {
        code: "invalid_spline",
        message: "SPLINE sin suficientes puntos de control.",
        entityType: type,
        layer,
      },
    };
  }
  if (type === "TEXT" || type === "MTEXT") {
    const pos = pt(entity.position ?? entity.startPoint ?? entity.insert);
    const text = String(
      entity.text ?? entity.string ?? entity.value ?? "",
    ).trim();
    if (pos && text)
      return { primitive: { kind: "text", layer, points: [pos], text } };
    return {
      warning: {
        code: "invalid_text",
        message: "Texto DXF sin posición o contenido.",
        entityType: type,
        layer,
      },
    };
  }
  return {
    warning: {
      code: "unsupported_entity",
      message: `Entidad DXF no soportada: ${type || "UNKNOWN"}.`,
      entityType: type || "UNKNOWN",
      layer,
    },
  };
}

/** Transformación de un INSERT: posición + rotación (grados) + escala. */
interface InsertTransform {
  x: number;
  y: number;
  rotationDeg: number;
  sx: number;
  sy: number;
}

function transformPoint(p: CadDxfPoint, t: InsertTransform): CadDxfPoint {
  const rad = (t.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = p.x * t.sx;
  const y = p.y * t.sy;
  return { x: t.x + x * cos - y * sin, y: t.y + x * sin + y * cos };
}
function transformVector(v: CadDxfPoint, t: InsertTransform): CadDxfPoint {
  const rad = (t.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = v.x * t.sx;
  const y = v.y * t.sy;
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** Aplica la transformación del INSERT a una primitiva ya mapeada. */
function transformPrimitive(
  primitive: CadDxfPrimitive,
  t: InsertTransform,
): CadDxfPrimitive {
  const out: CadDxfPrimitive = {
    ...primitive,
    points: primitive.points.map((p) => transformPoint(p, t)),
  };
  if (primitive.majorAxis) out.majorAxis = transformVector(primitive.majorAxis, t);
  if (typeof primitive.radius === "number") {
    // Escala uniforme esperada; ante anisotropía se usa el promedio (avisado).
    out.radius = primitive.radius * ((Math.abs(t.sx) + Math.abs(t.sy)) / 2);
  }
  if (primitive.kind === "arc") {
    // El arco gira con el bloque; la elipse no (sus params son relativos al
    // eje mayor, que ya rotó como vector).
    out.startAngle = (primitive.startAngle ?? 0) + t.rotationDeg;
    out.endAngle = (primitive.endAngle ?? 0) + t.rotationDeg;
  }
  return out;
}

const MAX_INSERT_DEPTH = 4;

/**
 * Expande un INSERT a las primitivas de su bloque, transformadas (posición +
 * rotación + escala). Los INSERT anidados se expanden recursivamente hasta
 * `MAX_INSERT_DEPTH`; un bloque desconocido o la anisotropía sobre entidades
 * circulares generan advertencia honesta en vez de geometría silenciosamente
 * mala (CAD-NEXT-063).
 */
function expandInsert(
  entity: any,
  blocks: Record<string, any>,
  warnings: CadDxfImportWarning[],
  depth: number,
): CadDxfPrimitive[] {
  const name = String(entity?.name ?? "");
  const layer = String(entity?.layer || DEFAULT_LAYER);
  const block = blocks[name];
  if (!block || !Array.isArray(block.entities)) {
    warnings.push({
      code: "unknown_block",
      message: `INSERT de bloque desconocido: "${name || "(sin nombre)"}".`,
      entityType: "INSERT",
      layer,
    });
    return [];
  }
  if (depth >= MAX_INSERT_DEPTH) {
    warnings.push({
      code: "insert_depth",
      message: `INSERT anidado más allá de ${MAX_INSERT_DEPTH} niveles: "${name}" no se expande.`,
      entityType: "INSERT",
      layer,
    });
    return [];
  }
  const t: InsertTransform = {
    x: Number(entity?.position?.x) || 0,
    y: Number(entity?.position?.y) || 0,
    rotationDeg: Number(entity?.rotation) || 0,
    sx: Number(entity?.xScale) || 1,
    sy: Number(entity?.yScale) || 1,
  };
  const anisotropic = Math.abs(Math.abs(t.sx) - Math.abs(t.sy)) > 1e-9;
  let warnedAnisotropy = false;
  const expanded: CadDxfPrimitive[] = [];
  for (const child of block.entities) {
    const childType = String(child?.type || "").toUpperCase();
    const nested =
      childType === "INSERT"
        ? expandInsert(child, blocks, warnings, depth + 1)
        : (() => {
            const mapped = mapDxfEntityToPrimitive(child);
            if (mapped.warning) warnings.push(mapped.warning);
            return mapped.primitive ? [mapped.primitive] : [];
          })();
    for (const primitive of nested) {
      if (anisotropic && typeof primitive.radius === "number" && !warnedAnisotropy) {
        warnedAnisotropy = true;
        warnings.push({
          code: "anisotropic_insert",
          message: `INSERT "${name}" con escala no uniforme sobre geometría circular: el radio se aproxima por el promedio.`,
          entityType: "INSERT",
          layer,
        });
      }
      expanded.push(transformPrimitive(primitive, t));
    }
  }
  return expanded;
}

/**
 * Expande una entidad DIMENSION a la geometría de su bloque anónimo *D
 * (líneas de extensión, línea de cota, flechas y texto). Si el archivo no
 * trae el bloque renderizado, cae honestamente al texto de la medición en el
 * ancla del texto, con advertencia (CAD-NEXT-066).
 */
function expandDimension(
  entity: any,
  blocks: Record<string, any>,
  warnings: CadDxfImportWarning[],
): CadDxfPrimitive[] {
  const layer = String(entity?.layer || DEFAULT_LAYER);
  const blockName = String(entity?.block ?? "");
  const block = blockName ? blocks[blockName] : undefined;
  if (block && Array.isArray(block.entities) && block.entities.length) {
    const expanded: CadDxfPrimitive[] = [];
    for (const child of block.entities) {
      const mapped = mapDxfEntityToPrimitive(child);
      if (mapped.warning) warnings.push(mapped.warning);
      if (mapped.primitive) expanded.push(mapped.primitive);
    }
    if (expanded.length) return expanded;
  }
  const anchor = pt(entity?.middleOfText) ?? pt(entity?.anchorPoint);
  const measured = num(entity?.actualMeasurement);
  const label =
    String(entity?.text ?? "").trim() ||
    (measured != null && measured > 0 ? String(Number(measured.toFixed(2))) : "");
  warnings.push({
    code: "dimension_without_block",
    message: `DIMENSION sin bloque de geometría ("${blockName || "(sin nombre)"}"): se conserva sólo el texto de la cota.`,
    entityType: "DIMENSION",
    layer,
  });
  return anchor && label
    ? [{ kind: "text", layer, points: [anchor], text: label }]
    : [];
}

interface RawDxfPair {
  code: number;
  value: string;
}

function rawDxfPairs(text: string): RawDxfPair[] {
  const lines = text.split(/\r?\n/);
  const pairs: RawDxfPair[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index].trim());
    if (Number.isInteger(code)) pairs.push({ code, value: lines[index + 1].trim() });
  }
  return pairs;
}

function mtextAlignment(value: number): NonNullable<CadDxfMText["alignment"]> {
  return [
    "top-left", "top-center", "top-right",
    "middle-left", "middle-center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right",
  ][Math.max(1, Math.min(9, value)) - 1] as NonNullable<CadDxfMText["alignment"]>;
}

function decodeMTextContent(value: string): Pick<CadDxfMText, "text" | "fontFamily" | "bold" | "italic" | "underline" | "paragraphAlignment"> {
  const font = /\\f([^|;]+)\|b([01])\|i([01]);/i.exec(value);
  const paragraph = /\\p([crj]);/i.exec(value)?.[1]?.toLowerCase();
  const underline = /\\L/.test(value);
  const text = value
    .replace(/\\p[crj];/gi, "")
    .replace(/\{?\\f[^;]+;/gi, "")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/\\P/g, "\n")
    .replace(/[{}]/g, "")
    .replace(/\\\\/g, "\\")
    .trim();
  return {
    text,
    ...(font?.[1] ? { fontFamily: font[1] } : {}),
    ...(font ? { bold: font[2] === "1", italic: font[3] === "1" } : {}),
    underline,
    paragraphAlignment: paragraph === "c" ? "center" : paragraph === "r" ? "right" : paragraph === "j" ? "justify" : "left",
  };
}

export function parseRawDxfMTexts(text: string): CadDxfMText[] {
  const pairs = rawDxfPairs(text);
  const result: CadDxfMText[] = [];
  for (let start = 0; start < pairs.length && result.length < MAX_DXF_ENTITIES; start += 1) {
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "MTEXT") continue;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const first = (code: number) => entityPairs.find((pair) => pair.code === code)?.value;
    const x = num(first(10));
    const y = num(first(20));
    const content = entityPairs.filter((pair) => pair.code === 1 || pair.code === 3).map((pair) => pair.value).join("");
    const decoded = decodeMTextContent(content);
    if (x !== null && y !== null && decoded.text) {
      const trueColor = num(first(420));
      const backgroundPadding = num(first(45));
      result.push({
        layer: first(8) || DEFAULT_LAYER,
        insertion: { x, y },
        ...decoded,
        ...(num(first(41)) !== null ? { width: num(first(41))! } : {}),
        ...(num(first(40)) !== null ? { height: num(first(40))! } : {}),
        ...(num(first(50)) !== null ? { rotation: num(first(50))! } : {}),
        alignment: mtextAlignment(Number(first(71) ?? 1)),
        style: first(7) || "Standard",
        ...(num(first(44)) !== null ? { lineSpacing: num(first(44))! } : {}),
        backgroundMask: (Number(first(90) ?? 0) & 1) === 1,
        ...(trueColor !== null ? { backgroundColor: `#${Math.max(0, trueColor).toString(16).padStart(6, "0").slice(-6)}` } : {}),
        ...(backgroundPadding !== null ? { backgroundPadding: Math.max(0, backgroundPadding - 1) } : {}),
        columns: Math.max(1, Math.min(8, Number(first(76) ?? 1) || 1)),
      });
    }
    start = end - 1;
  }
  return result;
}

const DIMENSION_KINDS = new Set<CadDxfSemanticDimension["dimensionKind"]>([
  "linear", "aligned", "angular", "radius", "diameter", "ordinate", "arc-length",
]);
const DIMENSION_UNITS = new Set<NonNullable<CadDxfSemanticDimension["units"]>>(["mm", "cm", "m", "in", "ft"]);
const DIMENSION_ARROWS = new Set<NonNullable<CadDxfSemanticDimension["arrowhead"]>>([
  "closed-filled", "open", "architectural-tick", "dot",
]);

/**
 * AXOS dimensions use ordinary DIMENSION entities plus registered XDATA. The
 * metadata retains semantic formatting while the anonymous *D block keeps the
 * drawing visible in CAD readers that do not understand AXOS_DIM.
 */
export function parseRawDxfSemanticDimensions(text: string): CadDxfSemanticDimension[] {
  const pairs = rawDxfPairs(text);
  const dimensions: CadDxfSemanticDimension[] = [];
  for (let start = 0; start < pairs.length && dimensions.length < MAX_DXF_ENTITIES; start += 1) {
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "DIMENSION") continue;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const applicationIndex = entityPairs.findIndex((pair) => pair.code === 1001 && pair.value === "AXOS_DIM");
    if (applicationIndex < 0) { start = end - 1; continue; }
    const first = (code: number) => entityPairs.find((pair) => pair.code === code)?.value;
    const point = (xCode: number, yCode: number): CadDxfPoint | null => {
      const x = num(first(xCode));
      const y = num(first(yCode));
      return x === null || y === null ? null : { x, y };
    };
    const metadata = new Map<string, string>();
    for (const pair of entityPairs.slice(applicationIndex + 1)) {
      if (pair.code !== 1000) continue;
      const separator = pair.value.indexOf("=");
      if (separator > 0) metadata.set(pair.value.slice(0, separator), pair.value.slice(separator + 1));
    }
    const rawKind = metadata.get("kind") as CadDxfSemanticDimension["dimensionKind"] | undefined;
    const kind = rawKind && DIMENSION_KINDS.has(rawKind) ? rawKind : null;
    const a = point(13, 23);
    const b = point(14, 24) ?? point(10, 20);
    const blockName = first(2) ?? "";
    if (!kind || !a || !b || !blockName) { start = end - 1; continue; }
    const numericMetadata = (key: string) => num(metadata.get(key));
    const rawUnits = metadata.get("units") as NonNullable<CadDxfSemanticDimension["units"]> | undefined;
    const rawSourceUnit = metadata.get("sourceUnit") as NonNullable<CadDxfSemanticDimension["sourceUnit"]> | undefined;
    const rawAlternate = metadata.get("alternateUnits") as NonNullable<CadDxfSemanticDimension["alternateUnits"]> | undefined;
    const rawArrow = metadata.get("arrowhead") as NonNullable<CadDxfSemanticDimension["arrowhead"]> | undefined;
    const c = point(15, 25);
    const precision = num(first(271));
    const offset = numericMetadata("offset");
    const radius = numericMetadata("radius");
    const arrowSize = numericMetadata("arrowSize");
    const extensionGap = numericMetadata("extensionGap");
    const extensionOvershoot = numericMetadata("extensionOvershoot");
    const textGap = numericMetadata("textGap");
    const textOverride = metadata.get("textOverride") ?? "";
    dimensions.push({
      blockName,
      layer: first(8) || DEFAULT_LAYER,
      dimensionKind: kind,
      a,
      b,
      ...(c ? { c } : {}),
      axis: metadata.get("axis") === "y" ? "y" : "x",
      ...(offset !== null ? { offset } : {}),
      ...(radius !== null && radius > 0 ? { radius } : {}),
      style: first(3) || "Standard",
      ...(precision !== null ? { precision: Math.max(0, Math.min(8, Math.floor(precision))) } : {}),
      ...(rawUnits && DIMENSION_UNITS.has(rawUnits) ? { units: rawUnits } : {}),
      ...(rawSourceUnit && DIMENSION_UNITS.has(rawSourceUnit) ? { sourceUnit: rawSourceUnit } : {}),
      ...(rawAlternate && DIMENSION_UNITS.has(rawAlternate) ? { alternateUnits: rawAlternate } : {}),
      prefix: metadata.get("prefix") ?? "",
      suffix: metadata.get("suffix") ?? "",
      extensionLines: metadata.get("extensionLines") !== "0",
      ...(rawArrow && DIMENSION_ARROWS.has(rawArrow) ? { arrowhead: rawArrow } : {}),
      ...(arrowSize !== null && arrowSize > 0 ? { arrowSize } : {}),
      ...(extensionGap !== null && extensionGap >= 0 ? { extensionGap } : {}),
      ...(extensionOvershoot !== null && extensionOvershoot >= 0 ? { extensionOvershoot } : {}),
      ...(textGap !== null && textGap >= 0 ? { textGap } : {}),
      ...(textOverride ? { text: textOverride } : {}),
    });
    start = end - 1;
  }
  return dimensions;
}

/**
 * dxf-parser currently drops HATCH. Parse polyline boundary paths directly
 * from ASCII group codes so solid and predefined-pattern hatches survive the
 * same import pipeline. Edge paths (arc/spline loops) remain explicit warnings.
 */
export function parseRawDxfHatches(text: string): {
  hatches: CadDxfHatch[];
  warnings: CadDxfImportWarning[];
} {
  const pairs = rawDxfPairs(text);
  const hatches: CadDxfHatch[] = [];
  const warnings: CadDxfImportWarning[] = [];
  let scannedHatches = 0;
  for (let start = 0; start < pairs.length && scannedHatches < MAX_DXF_ENTITIES; start += 1) {
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "HATCH") continue;
    scannedHatches += 1;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const first = (code: number) => entityPairs.find((pair) => pair.code === code)?.value;
    const layer = first(8) || DEFAULT_LAYER;
    const pattern = first(2) || "SOLID";
    const solid = Number(first(70) ?? 0) === 1 || pattern.toUpperCase() === "SOLID";
    const scale = num(first(41));
    const angle = num(first(52));
    const islandCode = Number(first(75) ?? 0);
    const islandStyle: CadDxfHatch["islandStyle"] = islandCode === 1 ? "outer" : islandCode === 2 ? "ignore" : "normal";
    const seedCountIndex = entityPairs.findIndex((pair) => pair.code === 98);
    const seedX = seedCountIndex >= 0
      ? num(entityPairs.find((pair, index) => index > seedCountIndex && pair.code === 10)?.value)
      : null;
    const seedY = seedCountIndex >= 0
      ? num(entityPairs.find((pair, index) => index > seedCountIndex && pair.code === 20)?.value)
      : null;
    const patternOriginX = num(first(43));
    const patternOriginY = num(first(44));
    const origin = seedX !== null && seedY !== null
      ? { x: seedX, y: seedY }
      : patternOriginX !== null && patternOriginY !== null
        ? { x: patternOriginX, y: patternOriginY }
        : undefined;
    const boundaries: CadDxfPoint[][] = [];
    let unsupportedEdgePath = false;
    for (let cursor = 0; cursor < entityPairs.length; cursor += 1) {
      if (entityPairs[cursor].code !== 92) continue;
      const pathFlags = Number(entityPairs[cursor].value) || 0;
      const nextPath = entityPairs.findIndex((pair, index) => index > cursor && pair.code === 92);
      const pathEnd = nextPath >= 0 ? nextPath : entityPairs.length;
      if ((pathFlags & 2) === 0) {
        unsupportedEdgePath = true;
        cursor = pathEnd - 1;
        continue;
      }
      const countIndex = entityPairs.findIndex((pair, index) => index > cursor && index < pathEnd && pair.code === 93);
      const vertexCount = countIndex >= 0 ? Number(entityPairs[countIndex].value) : 0;
      const boundary: CadDxfPoint[] = [];
      let pendingX: number | null = null;
      for (let index = countIndex + 1; index < pathEnd && boundary.length < vertexCount; index += 1) {
        const pair = entityPairs[index];
        if (pair.code === 10) pendingX = num(pair.value);
        else if (pair.code === 20 && pendingX !== null) {
          const y = num(pair.value);
          if (y !== null) boundary.push({ x: pendingX, y });
          pendingX = null;
        }
      }
      if (boundary.length >= 3) boundaries.push(boundary);
      cursor = pathEnd - 1;
    }
    if (boundaries.length) {
      hatches.push({
        layer,
        pattern,
        solid,
        boundaries,
        ...(scale !== null && scale > 0 ? { scale } : {}),
        ...(angle !== null ? { angle } : {}),
        ...(origin ? { origin } : {}),
        islandStyle,
      });
      if (unsupportedEdgePath)
        warnings.push({
          code: "hatch_edge_path_partial",
          message: "HATCH conserva sus contornos poligonales; un contorno curvo no soportado fue omitido.",
          entityType: "HATCH",
          layer,
        });
    } else {
      warnings.push({
        code: "hatch_unsupported_boundary",
        message: "HATCH sin contorno poligonal compatible; no se importó el relleno.",
        entityType: "HATCH",
        layer,
      });
    }
    start = end - 1;
  }
  return { hatches, warnings };
}

export function importDxfPrimitives(text: string): CadDxfImportResult {
  const rawHatchResult = parseRawDxfHatches(text);
  const rawMTexts = parseRawDxfMTexts(text);
  const semanticDimensions = parseRawDxfSemanticDimensions(text);
  const warnings: CadDxfImportWarning[] = [...rawHatchResult.warnings];
  let parsed: any;
  try {
    parsed = new (DxfParser as any)().parseSync(text);
  } catch {
    return {
      primitives: [],
      hatches: rawHatchResult.hatches,
      mtexts: rawMTexts,
      semanticDimensions,
      layers: [...new Set([...rawHatchResult.hatches.map((hatch) => hatch.layer), ...rawMTexts.map((mtext) => mtext.layer), ...semanticDimensions.map((dimension) => dimension.layer)])].sort(),
      warnings: [
        ...warnings,
        { code: "parse_failed", message: "No se pudo parsear el DXF." },
      ],
    };
  }
  const remainingEntityCapacity = Math.max(0, MAX_DXF_ENTITIES - rawHatchResult.hatches.length - rawMTexts.length - semanticDimensions.length);
  const entities: any[] = Array.isArray(parsed?.entities)
    ? parsed.entities.slice(0, remainingEntityCapacity)
    : [];
  const blocks: Record<string, any> =
    parsed?.blocks && typeof parsed.blocks === "object" ? parsed.blocks : {};
  const primitives: CadDxfPrimitive[] = [];
  const layers = new Set<string>();
  const semanticDimensionBlocks = new Set(semanticDimensions.map((dimension) => dimension.blockName));
  for (const entity of entities) {
    if (primitives.length >= remainingEntityCapacity) break;
    const type = String(entity?.type || "").toUpperCase();
    if (type === "MTEXT") continue;
    if (type === "INSERT") {
      // Expansión de bloques (CAD-NEXT-063): las puertas/luminarias/mobiliario
      // insertados dejan de perderse como "no soportados".
      for (const primitive of expandInsert(entity, blocks, warnings, 0)) {
        if (primitives.length >= remainingEntityCapacity) break;
        primitives.push(primitive);
        layers.add(primitive.layer);
      }
      continue;
    }
    if (type === "DIMENSION") {
      if (semanticDimensionBlocks.has(String(entity?.block ?? entity?.blockName ?? ""))) continue;
      // Cotas nativas (CAD-NEXT-066): la geometría renderizada vive en el
      // bloque anónimo *D que referencia la entidad.
      for (const primitive of expandDimension(entity, blocks, warnings)) {
        if (primitives.length >= remainingEntityCapacity) break;
        primitives.push(primitive);
        layers.add(primitive.layer);
      }
      continue;
    }
    const mapped = mapDxfEntityToPrimitive(entity);
    if (mapped.primitive) {
      primitives.push(mapped.primitive);
      layers.add(mapped.primitive.layer);
    }
    if (mapped.warning) warnings.push(mapped.warning);
  }
  if (
    Array.isArray(parsed?.entities) &&
    parsed.entities.length > remainingEntityCapacity
  )
    warnings.push({
      code: "entity_limit",
      message: `DXF recortado a ${MAX_DXF_ENTITIES} entidades incluyendo HATCH.`,
    });
  for (const hatch of rawHatchResult.hatches) layers.add(hatch.layer);
  for (const mtext of rawMTexts) layers.add(mtext.layer);
  for (const dimension of semanticDimensions) layers.add(dimension.layer);
  return { primitives, hatches: rawHatchResult.hatches, mtexts: rawMTexts, semanticDimensions, warnings, layers: [...layers].sort() };
}
