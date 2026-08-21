/**
 * Decodificadores de curvas y superficies simples R2000 — campaña 2026-08-21.
 *
 * ELLIPSE, SPLINE (sus dos escenarios), RAY, XLINE, SOLID, TRACE y 3DFACE.
 * Hechos registrados en SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC); mismas
 * reglas de la casa: fallo cerrado con offset, doubles no finitos son
 * corrupción, recuentos cobrados ANTES de reservar, y lo no interpretado
 * viaja crudo.
 */
import type { DwgBitReader } from "../codecs/bitcodes.js";
import type {
  Dwg3dFaceEntity,
  DwgEllipseEntity,
  DwgPoint2,
  DwgPoint3,
  DwgRayEntity,
  DwgSolidEntity,
  DwgSplineEntity,
  DwgTraceEntity,
  DwgXlineEntity,
} from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  finiteDecoded,
  frozenPoint3,
  readFiniteExtrusion,
} from "./entity-common.js";

/** Códigos de tipo BS (hechos registrados). */
export const AC1015_TYPE_3DFACE = 0x1c;
export const AC1015_TYPE_SOLID = 0x1f;
export const AC1015_TYPE_TRACE = 0x20;
export const AC1015_TYPE_ELLIPSE = 0x23;
export const AC1015_TYPE_SPLINE = 0x24;
export const AC1015_TYPE_RAY = 0x28;
export const AC1015_TYPE_XLINE = 0x29;

/** Tope de laboratorio para nudos/puntos de una spline en un solo objeto. */
const SPLINE_MAX_COUNT = 65_536;

/** ELLIPSE: centro, eje mayor (vector), extrusión 3BD, razón y ángulos. */
export function decodeEllipse(reader: DwgBitReader): DwgEllipseEntity {
  const center = readPoint(reader, "an ellipse center");
  const majorAxisEndpoint = readPoint(reader, "an ellipse major axis");
  const extrusion = readPoint(reader, "an ellipse extrusion");
  const axisRatio = finiteDecoded(reader, reader.readBD(), "an ellipse ratio");
  if (axisRatio < 0) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "An ellipse axis ratio cannot be negative.",
    );
  }
  const startAngle = finiteDecoded(
    reader,
    reader.readBD(),
    "an ellipse start angle",
  );
  const endAngle = finiteDecoded(reader, reader.readBD(), "an ellipse end angle");
  return Object.freeze({
    kind: "ellipse" as const,
    center,
    majorAxisEndpoint,
    extrusion,
    axisRatio,
    startAngle,
    endAngle,
  });
}

/**
 * SPLINE: escenario 1 (nudos + control, pesos opcionales) o 2 (puntos de
 * ajuste con tangentes). Otro escenario es corrupción: el formato sólo
 * define esos dos y adivinar una disposición desincronizaría el cuerpo.
 */
export function decodeSpline(reader: DwgBitReader): DwgSplineEntity {
  const scenario = reader.readBL();
  const degree = reader.readBL();

  if (scenario === 2) {
    const fitTolerance = finiteDecoded(
      reader,
      reader.readBD(),
      "a spline fit tolerance",
    );
    const startTangent = readPoint(reader, "a spline start tangent");
    const endTangent = readPoint(reader, "a spline end tangent");
    const fitCount = readBoundedCount(reader, "spline fit point");
    const fitPoints: DwgPoint3[] = [];
    for (let index = 0; index < fitCount; index += 1) {
      fitPoints.push(readPoint(reader, "a spline fit point"));
    }
    return Object.freeze({
      kind: "spline" as const,
      scenario,
      degree,
      rational: undefined,
      closed: undefined,
      periodic: undefined,
      knotTolerance: undefined,
      controlTolerance: undefined,
      knots: undefined,
      controlPoints: undefined,
      weights: undefined,
      fitTolerance,
      startTangent,
      endTangent,
      fitPoints: Object.freeze(fitPoints),
    });
  }

  if (scenario === 1) {
    const rational = reader.readB() === 1;
    const closed = reader.readB() === 1;
    const periodic = reader.readB() === 1;
    const knotTolerance = finiteDecoded(
      reader,
      reader.readBD(),
      "a spline knot tolerance",
    );
    const controlTolerance = finiteDecoded(
      reader,
      reader.readBD(),
      "a spline control tolerance",
    );
    const knotCount = readBoundedCount(reader, "spline knot");
    const controlCount = readBoundedCount(reader, "spline control point");
    const weighted = reader.readB() === 1;
    const knots: number[] = [];
    for (let index = 0; index < knotCount; index += 1) {
      knots.push(finiteDecoded(reader, reader.readBD(), "a spline knot"));
    }
    const controlPoints: DwgPoint3[] = [];
    const weights: number[] = [];
    for (let index = 0; index < controlCount; index += 1) {
      controlPoints.push(readPoint(reader, "a spline control point"));
      if (weighted) {
        weights.push(
          finiteDecoded(reader, reader.readBD(), "a spline weight"),
        );
      }
    }
    return Object.freeze({
      kind: "spline" as const,
      scenario,
      degree,
      rational,
      closed,
      periodic,
      knotTolerance,
      controlTolerance,
      knots: Object.freeze(knots),
      controlPoints: Object.freeze(controlPoints),
      weights: weighted ? Object.freeze(weights) : undefined,
      fitTolerance: undefined,
      startTangent: undefined,
      endTangent: undefined,
      fitPoints: undefined,
    });
  }

  throwDwgError(
    "DWG_STRUCTURE_CORRUPT",
    "input",
    Math.floor(reader.bitPosition / 8),
    "A spline scenario other than 1 or 2 is not defined by the format.",
  );
}

/** RAY y XLINE: punto base 3BD y vector 3BD. */
export function decodeRay(reader: DwgBitReader): DwgRayEntity {
  const basePoint = readPoint(reader, "a ray base point");
  const direction = readPoint(reader, "a ray direction");
  return Object.freeze({ kind: "ray" as const, basePoint, direction });
}

export function decodeXline(reader: DwgBitReader): DwgXlineEntity {
  const basePoint = readPoint(reader, "an xline base point");
  const direction = readPoint(reader, "an xline direction");
  return Object.freeze({ kind: "xline" as const, basePoint, direction });
}

/** SOLID y TRACE comparten disposición: grosor, elevación, 4 esquinas 2RD. */
function decodeSolidFields(reader: DwgBitReader): Omit<DwgSolidEntity, "kind"> {
  const thickness = finiteDecoded(reader, reader.readBT(), "a solid thickness");
  const elevation = finiteDecoded(reader, reader.readBD(), "a solid elevation");
  const corners = [
    readPoint2RD(reader, "a solid corner"),
    readPoint2RD(reader, "a solid corner"),
    readPoint2RD(reader, "a solid corner"),
    readPoint2RD(reader, "a solid corner"),
  ] as const;
  const extrusion = readFiniteExtrusion(reader);
  return { thickness, elevation, corners: Object.freeze(corners), extrusion };
}

export function decodeSolid(reader: DwgBitReader): DwgSolidEntity {
  return Object.freeze({ kind: "solid" as const, ...decodeSolidFields(reader) });
}

export function decodeTrace(reader: DwgBitReader): DwgTraceEntity {
  return Object.freeze({ kind: "trace" as const, ...decodeSolidFields(reader) });
}

/**
 * 3DFACE R2000: bit de sin-banderas, bit de Z1-cero, primera esquina RD/RD
 * (+Z condicional) y esquinas 2–4 como 3DD contra la anterior; banderas de
 * invisibilidad BS sólo cuando el primer bit está a 0.
 */
export function decode3dFace(reader: DwgBitReader): Dwg3dFaceEntity {
  const hasNoFlags = reader.readB() === 1;
  const zIsZero = reader.readB() === 1;
  const x1 = finiteDecoded(reader, reader.readRD(), "a face corner");
  const y1 = finiteDecoded(reader, reader.readRD(), "a face corner");
  const z1 = zIsZero
    ? 0
    : finiteDecoded(reader, reader.readRD(), "a face corner");
  const corner1 = frozenPoint3(x1, y1, z1);
  const corner2 = readDDPoint(reader, corner1, "a face corner");
  const corner3 = readDDPoint(reader, corner2, "a face corner");
  const corner4 = readDDPoint(reader, corner3, "a face corner");
  const invisibilityFlags = hasNoFlags ? 0 : reader.readBS();
  return Object.freeze({
    kind: "face3d" as const,
    corners: Object.freeze([corner1, corner2, corner3, corner4] as const),
    invisibilityFlags,
  });
}

/** Un recuento BL acotado por el tope de laboratorio, cobrado antes de usar. */
function readBoundedCount(reader: DwgBitReader, what: string): number {
  const count = reader.readBL();
  if (count > SPLINE_MAX_COUNT) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      `The ${what} count exceeds the laboratory bound.`,
    );
  }
  return count;
}

function readPoint(reader: DwgBitReader, what: string): DwgPoint3 {
  const { x, y, z } = reader.read3BD();
  return frozenPoint3(
    finiteDecoded(reader, x, what),
    finiteDecoded(reader, y, what),
    finiteDecoded(reader, z, what),
  );
}

function readPoint2RD(reader: DwgBitReader, what: string): DwgPoint2 {
  const x = finiteDecoded(reader, reader.readRD(), what);
  const y = finiteDecoded(reader, reader.readRD(), what);
  return Object.freeze({ x, y });
}

/** Un punto 3DD contra el anterior, validado finito. */
function readDDPoint(
  reader: DwgBitReader,
  previous: DwgPoint3,
  what: string,
): DwgPoint3 {
  const x = finiteDecoded(reader, reader.readDD(previous.x), what);
  const y = finiteDecoded(reader, reader.readDD(previous.y), what);
  const z = finiteDecoded(reader, reader.readDD(previous.z), what);
  return frozenPoint3(x, y, z);
}
