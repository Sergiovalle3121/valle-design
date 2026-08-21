/**
 * Decodificadores de la familia POLYLINE clásica R2000 — campaña 2026-08-21.
 *
 * Las polilíneas clásicas viajan en PIEZAS: una cabecera (POLYLINE 2D/3D,
 * MESH o PFACE), sus VERTEX como entidades independientes propiedad de la
 * cabecera, y un SEQEND que cierra la secuencia. Este módulo decodifica cada
 * pieza; atarlas es papel del lector de base (`ac1015-database-reader.ts`),
 * que resuelve la pertenencia por el propietario del común — la misma
 * disciplina que ATTRIB/INSERT.
 *
 * Hechos registrados en SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC). Las
 * banderas RC/BS viajan CRUDAS al modelo: su semántica bit a bit es la del
 * grupo 70 del dibujo y no se interpreta aquí.
 */
import type { DwgBitReader } from "../codecs/bitcodes.js";
import type {
  DwgPfaceFaceEntity,
  DwgPoint3,
  DwgPolyfaceMeshEntity,
  DwgPolyline2dEntity,
  DwgPolyline3dEntity,
  DwgPolylineMeshEntity,
  DwgVertex2dEntity,
  DwgVertex3dEntity,
  DwgVertexMeshEntity,
  DwgVertexPfaceEntity,
} from "../model/entity-geometry.js";
import {
  finiteDecoded,
  frozenPoint3,
  readFiniteExtrusion,
} from "./entity-common.js";

/** Códigos de tipo BS de la familia (hechos registrados). */
export const AC1015_TYPE_VERTEX_2D = 0x0a;
export const AC1015_TYPE_VERTEX_3D = 0x0b;
export const AC1015_TYPE_VERTEX_MESH = 0x0c;
export const AC1015_TYPE_VERTEX_PFACE = 0x0d;
export const AC1015_TYPE_VERTEX_PFACE_FACE = 0x0e;
export const AC1015_TYPE_POLYLINE_2D = 0x0f;
export const AC1015_TYPE_POLYLINE_3D = 0x10;
export const AC1015_TYPE_POLYLINE_PFACE = 0x1d;
export const AC1015_TYPE_POLYLINE_MESH = 0x1e;

/**
 * POLYLINE 2D: banderas BS, tipo de curva BS, anchos inicial/final BD,
 * grosor BT, elevación BD y extrusión BE. Los punteros a sus VERTEX y SEQEND
 * viven en el flujo de handles (contabilizado opaco; el lector de base ata
 * por propietario).
 */
export function decodePolyline2d(reader: DwgBitReader): DwgPolyline2dEntity {
  const flags = reader.readBS();
  const curveType = reader.readBS();
  const startWidth = finiteDecoded(
    reader,
    reader.readBD(),
    "a polyline start width",
  );
  const endWidth = finiteDecoded(
    reader,
    reader.readBD(),
    "a polyline end width",
  );
  const thickness = finiteDecoded(
    reader,
    reader.readBT(),
    "a polyline thickness",
  );
  const elevation = finiteDecoded(
    reader,
    reader.readBD(),
    "a polyline elevation",
  );
  const extrusion = readFiniteExtrusion(reader);
  return Object.freeze({
    kind: "polyline2d" as const,
    flags,
    curveType,
    startWidth,
    endWidth,
    thickness,
    elevation,
    extrusion,
  });
}

/** POLYLINE 3D: dos RC de banderas crudas — spline y cierre. */
export function decodePolyline3d(reader: DwgBitReader): DwgPolyline3dEntity {
  const splineFlags = reader.readRC();
  const closedFlags = reader.readRC();
  return Object.freeze({
    kind: "polyline3d" as const,
    splineFlags,
    closedFlags,
  });
}

/** POLYLINE MESH: banderas, tipo de curva, recuentos M/N y densidades M/N. */
export function decodePolylineMesh(
  reader: DwgBitReader,
): DwgPolylineMeshEntity {
  const flags = reader.readBS();
  const curveType = reader.readBS();
  const mVertexCount = reader.readBS();
  const nVertexCount = reader.readBS();
  const mDensity = reader.readBS();
  const nDensity = reader.readBS();
  return Object.freeze({
    kind: "polymesh" as const,
    flags,
    curveType,
    mVertexCount,
    nVertexCount,
    mDensity,
    nDensity,
  });
}

/** POLYLINE PFACE: recuentos de vértices y caras BS. */
export function decodePolyfaceMesh(
  reader: DwgBitReader,
): DwgPolyfaceMeshEntity {
  const vertexCount = reader.readBS();
  const faceCount = reader.readBS();
  return Object.freeze({
    kind: "polyfaceMesh" as const,
    vertexCount,
    faceCount,
  });
}

/**
 * VERTEX 2D: banderas RC, punto 3BD, anchos BD (un inicial NEGATIVO declara
 * ambos anchos con su valor absoluto y el final no viaja — compresión del
 * formato, hecho registrado), bulge BD y dirección tangente BD.
 */
export function decodeVertex2d(reader: DwgBitReader): DwgVertex2dEntity {
  const flags = reader.readRC();
  const position = readPoint(reader, "a vertex position");
  const rawStart = finiteDecoded(
    reader,
    reader.readBD(),
    "a vertex start width",
  );
  let startWidth = rawStart;
  let endWidth: number;
  if (rawStart < 0) {
    startWidth = Math.abs(rawStart);
    endWidth = startWidth;
  } else {
    endWidth = finiteDecoded(reader, reader.readBD(), "a vertex end width");
  }
  const bulge = finiteDecoded(reader, reader.readBD(), "a vertex bulge");
  const tangentDirection = finiteDecoded(
    reader,
    reader.readBD(),
    "a vertex tangent direction",
  );
  return Object.freeze({
    kind: "vertex2d" as const,
    flags,
    position,
    startWidth,
    endWidth,
    bulge,
    tangentDirection,
  });
}

/** VERTEX 3D / de malla / de polyface: banderas RC y punto 3BD. */
export function decodeVertex3d(reader: DwgBitReader): DwgVertex3dEntity {
  const flags = reader.readRC();
  const position = readPoint(reader, "a vertex position");
  return Object.freeze({ kind: "vertex3d" as const, flags, position });
}

export function decodeVertexMesh(reader: DwgBitReader): DwgVertexMeshEntity {
  const flags = reader.readRC();
  const position = readPoint(reader, "a vertex position");
  return Object.freeze({ kind: "vertexMesh" as const, flags, position });
}

export function decodeVertexPface(reader: DwgBitReader): DwgVertexPfaceEntity {
  const flags = reader.readRC();
  const position = readPoint(reader, "a vertex position");
  return Object.freeze({ kind: "vertexPface" as const, flags, position });
}

/** Cara polyface: cuatro índices BS crudos (negativo = arista invisible). */
export function decodePfaceFace(reader: DwgBitReader): DwgPfaceFaceEntity {
  const index1 = reader.readBS();
  const index2 = reader.readBS();
  const index3 = reader.readBS();
  const index4 = reader.readBS();
  return Object.freeze({
    kind: "pfaceFace" as const,
    index1,
    index2,
    index3,
    index4,
  });
}

function readPoint(reader: DwgBitReader, what: string): DwgPoint3 {
  const { x, y, z } = reader.read3BD();
  return frozenPoint3(
    finiteDecoded(reader, x, what),
    finiteDecoded(reader, y, what),
    finiteDecoded(reader, z, what),
  );
}
