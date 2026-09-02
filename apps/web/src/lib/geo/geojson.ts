/**
 * Lectura de GeoJSON como si fuera un shapefile con su tabla (Ola G,
 * 2026-09-02).
 *
 * ## Por qué a la forma del shapefile
 *
 * Todo lo que el producto sabe hacer con un conjunto GIS —colocarlo con
 * origen local, convertir unidades, rotular por atributo, reproyectar,
 * declarar pérdidas— está escrito contra `GeoShapefile` y `GeoDbfTable`.
 * Un GeoJSON es la misma información con otra sintaxis: geometrías con
 * partes y una fila de propiedades por rasgo. Traducirlo a esa forma deja
 * UN camino de importación en vez de dos que se separan con el tiempo.
 *
 * ## Lo que decide la especificación (RFC 7946)
 *
 * Las coordenadas son SIEMPRE longitud y latitud en WGS 84, en ese orden
 * (`[lon, lat]`); un `crs` antiguo se ignora y se declara. Los anillos de un
 * polígono se cierran repitiendo el primer vértice, como en el shapefile.
 *
 * ## Lo que se rechaza diciéndolo
 *
 * Un texto que no es JSON, un JSON que no es Feature/FeatureCollection/
 * geometría, una geometría de tipo desconocido o `GeometryCollection`
 * anidada: cada caso con su mensaje. Propiedades anidadas (objetos, arrays)
 * entran como su JSON en texto, porque la tabla es plana.
 *
 * Un rasgo SIN geometría no se salta: entra como geometría nula con su fila,
 * igual que un registro nulo de shapefile. Así la tabla sigue siendo
 * posicional —la fila 3 es de la geometría 3— y nadie hereda los atributos
 * del vecino.
 */
import type { GeoDbfField, GeoDbfTable, GeoDbfValue } from "./dbf";
import { GEO_CRS_WGS84 } from "./crs";
import { GeoError } from "./errors";
import type { GeoBoundingBox, GeoShape, GeoShapeKind, GeoShapefile, GeoVertex } from "./shapefile";

export interface GeoJsonReadResult {
  shapefile: GeoShapefile;
  attributes: GeoDbfTable;
  /** Qué rasgos no traen geometría (nula o vacía); entran como nulos con su fila. */
  skipped: string[];
}

type Position = [number, number] | [number, number, number];

interface Geometry {
  type: string;
  coordinates?: unknown;
  geometries?: Geometry[];
}

interface Feature {
  type: "Feature";
  geometry: Geometry | null;
  properties?: Record<string, unknown> | null;
}

/** `true` si el texto parece un GeoJSON (sin analizarlo entero). */
export function looksLikeGeoJson(text: string): boolean {
  const head = text.trimStart().slice(0, 400);
  return head.startsWith("{") && /"type"\s*:\s*"(FeatureCollection|Feature|Point|MultiPoint|LineString|MultiLineString|Polygon|MultiPolygon)"/.test(head);
}

const SHAPE_TYPE: Record<Exclude<GeoShapeKind, "null">, number> = { point: 1, polyline: 3, polygon: 5, multipoint: 8 };

export function readGeoJson(text: string, name = "(sin nombre)"): GeoJsonReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GeoError("variante-no-soportada", `«${name}» no es JSON válido: ${error instanceof Error ? error.message : String(error)}.`, { source: name, detail: {} });
  }
  const features = featuresOf(parsed, name);
  const shapes: GeoShape[] = [];
  const records: Array<Record<string, GeoDbfValue>> = [];
  const skipped: string[] = [];
  const fields = new Map<string, GeoDbfField>();
  let vertexCount = 0;
  const bounds: GeoBoundingBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  features.forEach((feature, index) => {
    const shape = shapeOf(feature.geometry, index + 1, name) ?? { recordNumber: index + 1, kind: "null" as const, vertices: [], parts: [] };
    if (shape.kind === "null") skipped.push(`Rasgo ${index + 1}: sin geometría.`);
    for (const vertex of shape.vertices) {
      vertexCount += 1;
      bounds.minX = Math.min(bounds.minX, vertex.x);
      bounds.minY = Math.min(bounds.minY, vertex.y);
      bounds.maxX = Math.max(bounds.maxX, vertex.x);
      bounds.maxY = Math.max(bounds.maxY, vertex.y);
    }
    shapes.push(shape);
    const record: Record<string, GeoDbfValue> = {};
    for (const [key, raw] of Object.entries(feature.properties ?? {})) {
      const value = flatten(raw);
      record[key] = value;
      const field = fields.get(key) ?? { name: key, type: fieldType(value), length: 0, decimals: 0 };
      field.length = Math.max(field.length, String(value ?? "").length);
      if (field.type !== fieldType(value) && value !== null) field.type = "C";
      fields.set(key, field);
    }
    records.push(record);
  });
  const kind = shapes.find((shape) => shape.kind !== "null")?.kind as Exclude<GeoShapeKind, "null"> | undefined;
  if (!kind) throw new GeoError("geometria-invalida", `«${name}» no trae ninguna geometría dibujable.`, { source: name, detail: {} });
  return {
    shapefile: {
      shapeType: SHAPE_TYPE[kind],
      kind,
      declaredBounds: bounds,
      measuredBounds: bounds,
      shapes,
      vertexCount,
      crs: { ...GEO_CRS_WGS84 },
      indexVerified: true,
    },
    attributes: { fields: [...fields.values()], records, declaredRecordCount: records.length, deletedCount: 0, encoding: "utf-8", encodingDeclared: true } as GeoDbfTable,
    skipped,
  };
}

function featuresOf(parsed: unknown, name: string): Feature[] {
  const object = parsed as { type?: unknown; features?: unknown } | null;
  if (!object || typeof object !== "object" || typeof object.type !== "string")
    throw new GeoError("variante-no-soportada", `«${name}» no es un GeoJSON: no tiene "type".`, { source: name, detail: {} });
  if (object.type === "FeatureCollection") {
    if (!Array.isArray(object.features)) throw new GeoError("variante-no-soportada", `«${name}»: la FeatureCollection no trae "features".`, { source: name, detail: {} });
    return object.features as Feature[];
  }
  if (object.type === "Feature") return [object as unknown as Feature];
  if (object.type in SHAPE_TYPE_OF_GEOMETRY) return [{ type: "Feature", geometry: object as Geometry, properties: {} }];
  throw new GeoError("variante-no-soportada", `«${name}»: tipo "${object.type}" no es Feature, FeatureCollection ni geometría.`, { source: name, detail: {} });
}

const SHAPE_TYPE_OF_GEOMETRY: Record<string, GeoShapeKind> = {
  Point: "point",
  MultiPoint: "multipoint",
  LineString: "polyline",
  MultiLineString: "polyline",
  Polygon: "polygon",
  MultiPolygon: "polygon",
};

function vertex(position: unknown, name: string): GeoVertex {
  if (!Array.isArray(position) || position.length < 2 || typeof position[0] !== "number" || typeof position[1] !== "number")
    throw new GeoError("coordenada-invalida", `«${name}»: una coordenada no es [longitud, latitud].`, { source: name, detail: {} });
  const [x, y, z] = position as Position;
  return typeof z === "number" ? { x, y, z } : { x, y };
}

function shapeOf(geometry: Geometry | null, recordNumber: number, name: string): GeoShape | null {
  if (!geometry) return null;
  const kind = SHAPE_TYPE_OF_GEOMETRY[geometry.type];
  if (!kind) {
    if (geometry.type === "GeometryCollection") throw new GeoError("variante-no-soportada", `«${name}»: GeometryCollection no se importa; exporte cada geometría como rasgo.`, { source: name, detail: {} });
    throw new GeoError("variante-no-soportada", `«${name}»: geometría "${geometry.type}" desconocida.`, { source: name, detail: {} });
  }
  const coordinates = geometry.coordinates;
  const vertices: GeoVertex[] = [];
  const parts: number[] = [];
  const pushPart = (positions: unknown) => {
    if (!Array.isArray(positions) || positions.length === 0) return;
    parts.push(vertices.length);
    for (const position of positions) vertices.push(vertex(position, name));
  };
  if (geometry.type === "Point") vertices.push(vertex(coordinates, name));
  else if (geometry.type === "MultiPoint") for (const position of (coordinates as unknown[]) ?? []) vertices.push(vertex(position, name));
  else if (geometry.type === "LineString") pushPart(coordinates);
  else if (geometry.type === "MultiLineString") for (const line of (coordinates as unknown[]) ?? []) pushPart(line);
  else if (geometry.type === "Polygon") for (const ring of (coordinates as unknown[]) ?? []) pushPart(ring);
  else if (geometry.type === "MultiPolygon") for (const polygon of (coordinates as unknown[][]) ?? []) for (const ring of polygon) pushPart(ring);
  if (vertices.length === 0) return null;
  return { recordNumber, kind, vertices, parts };
}

function flatten(value: unknown): GeoDbfValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function fieldType(value: GeoDbfValue): GeoDbfField["type"] {
  if (typeof value === "number") return Number.isInteger(value) ? "N" : "F";
  if (typeof value === "boolean") return "L";
  return "C";
}
