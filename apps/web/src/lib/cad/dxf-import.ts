/* eslint-disable @typescript-eslint/no-explicit-any */
import DxfParser from "dxf-parser";

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
export interface CadDxfImportWarning {
  code: string;
  message: string;
  entityType?: string;
  layer?: string;
}
export interface CadDxfImportResult {
  primitives: CadDxfPrimitive[];
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

/**
 * Cuenta entidades HATCH en el texto crudo. dxf-parser las DESCARTA en
 * silencio (ni siquiera llegan al bucle de entidades), así que sin este
 * pre-escaneo un plano achurado importaría con los rellenos perdidos y CERO
 * avisos — pérdida silenciosa, lo contrario del contrato honesto del import.
 */
function countRawHatchEntities(text: string): number {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (lines[i].trim() === "0" && lines[i + 1].trim().toUpperCase() === "HATCH")
      count += 1;
  }
  return count;
}

export function importDxfPrimitives(text: string): CadDxfImportResult {
  const warnings: CadDxfImportWarning[] = [];
  const hatchCount = countRawHatchEntities(text);
  if (hatchCount > 0)
    warnings.push({
      code: "hatch_dropped",
      message: `El archivo trae ${hatchCount} achurado(s) HATCH; el relleno aún no se importa (la geometría restante sí).`,
      entityType: "HATCH",
    });
  let parsed: any;
  try {
    parsed = new (DxfParser as any)().parseSync(text);
  } catch {
    return {
      primitives: [],
      layers: [],
      warnings: [
        { code: "parse_failed", message: "No se pudo parsear el DXF." },
      ],
    };
  }
  const entities: any[] = Array.isArray(parsed?.entities)
    ? parsed.entities.slice(0, MAX_DXF_ENTITIES)
    : [];
  const blocks: Record<string, any> =
    parsed?.blocks && typeof parsed.blocks === "object" ? parsed.blocks : {};
  const primitives: CadDxfPrimitive[] = [];
  const layers = new Set<string>();
  for (const entity of entities) {
    if (primitives.length >= MAX_DXF_ENTITIES) break;
    const type = String(entity?.type || "").toUpperCase();
    if (type === "INSERT") {
      // Expansión de bloques (CAD-NEXT-063): las puertas/luminarias/mobiliario
      // insertados dejan de perderse como "no soportados".
      for (const primitive of expandInsert(entity, blocks, warnings, 0)) {
        if (primitives.length >= MAX_DXF_ENTITIES) break;
        primitives.push(primitive);
        layers.add(primitive.layer);
      }
      continue;
    }
    if (type === "DIMENSION") {
      // Cotas nativas (CAD-NEXT-066): la geometría renderizada vive en el
      // bloque anónimo *D que referencia la entidad.
      for (const primitive of expandDimension(entity, blocks, warnings)) {
        if (primitives.length >= MAX_DXF_ENTITIES) break;
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
    parsed.entities.length > MAX_DXF_ENTITIES
  )
    warnings.push({
      code: "entity_limit",
      message: `DXF recortado a ${MAX_DXF_ENTITIES} entidades.`,
    });
  return { primitives, warnings, layers: [...layers].sort() };
}
