/* eslint-disable @typescript-eslint/no-explicit-any */
import DxfParser from "dxf-parser";

export type CadDxfPrimitiveKind = "line" | "polyline" | "rect" | "text";
export interface CadDxfPoint {
  x: number;
  y: number;
}
export interface CadDxfPrimitive {
  kind: CadDxfPrimitiveKind;
  layer: string;
  points: CadDxfPoint[];
  text?: string;
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

export function importDxfPrimitives(text: string): CadDxfImportResult {
  const warnings: CadDxfImportWarning[] = [];
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
  const primitives: CadDxfPrimitive[] = [];
  const layers = new Set<string>();
  for (const entity of entities) {
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
