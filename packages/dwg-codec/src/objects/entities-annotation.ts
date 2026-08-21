/**
 * Decodificadores de las entidades de anotación R2000 — campaña 2026-08-21.
 *
 * MTEXT, ATTRIB/ATTDEF (que abren con la misma disposición de TEXT, hecho
 * registrado), SEQEND (sin campos, como ENDBLK) y la familia DIMENSION entera
 * (siete variantes con datos comunes y cola por tipo). Hechos registrados en
 * SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC); las certezas de ORDEN de las
 * colas por variante quedan declaradas MEDIA hasta que el harness diferencial
 * del corpus las confirme o desmienta — igual que hizo el intake E2 con el
 * INSERT.
 *
 * Reglas del laboratorio (idénticas a `entities-core.ts`): fallo cerrado con
 * offset, doubles no finitos son corrupción, ausente se modela `undefined`,
 * códigos BS/RC sin semántica registrada viajan CRUDOS, y nada se ignora en
 * silencio.
 */
import type { DwgBitReader } from "../codecs/bitcodes.js";
import type {
  DwgAttdefEntity,
  DwgAttribEntity,
  DwgDimensionEntity,
  DwgDimensionKind,
  DwgMTextEntity,
  DwgPoint2,
  DwgPoint3,
  DwgSeqendEntity,
} from "../model/entity-geometry.js";
import { decodeTextFields } from "./entities-core.js";
import {
  finiteDecoded,
  frozenPoint3,
} from "./entity-common.js";

/** Códigos de tipo BS de las entidades de anotación (hechos registrados). */
export const AC1015_TYPE_ATTRIB = 0x02;
export const AC1015_TYPE_ATTDEF = 0x03;
export const AC1015_TYPE_SEQEND = 0x06;
export const AC1015_TYPE_MTEXT = 0x2c;
export const AC1015_TYPE_DIM_ORDINATE = 0x14;
export const AC1015_TYPE_DIM_LINEAR = 0x15;
export const AC1015_TYPE_DIM_ALIGNED = 0x16;
export const AC1015_TYPE_DIM_ANGULAR_3PT = 0x17;
export const AC1015_TYPE_DIM_ANGULAR_2LN = 0x18;
export const AC1015_TYPE_DIM_RADIUS = 0x19;
export const AC1015_TYPE_DIM_DIAMETER = 0x1a;

/** Variante de cota por código de tipo; null si el tipo no es una cota. */
export function dimensionKindOfType(type: number): DwgDimensionKind | null {
  switch (type) {
    case AC1015_TYPE_DIM_ORDINATE:
      return "ordinate";
    case AC1015_TYPE_DIM_LINEAR:
      return "linear";
    case AC1015_TYPE_DIM_ALIGNED:
      return "aligned";
    case AC1015_TYPE_DIM_ANGULAR_3PT:
      return "angular3pt";
    case AC1015_TYPE_DIM_ANGULAR_2LN:
      return "angular2ln";
    case AC1015_TYPE_DIM_RADIUS:
      return "radius";
    case AC1015_TYPE_DIM_DIAMETER:
      return "diameter";
    default:
      return null;
  }
}

/**
 * MTEXT (R2000): inserción 3BD, extrusión 3BD, dirección del eje X 3BD,
 * ancho de rectángulo BD, altura BD, attachment BS, dirección de dibujo BS,
 * extents (altura y ancho) BD, texto TV, estilo de interlineado BS, factor
 * BD y un bit final sin semántica registrada que viaja CRUDO.
 */
export function decodeMText(reader: DwgBitReader): DwgMTextEntity {
  const insertion = read3BDPoint(reader, "an mtext insertion");
  const extrusion = read3BDPoint(reader, "an mtext extrusion");
  const xAxisDirection = read3BDPoint(reader, "an mtext X-axis direction");
  const rectWidth = finiteDecoded(reader, reader.readBD(), "an mtext width");
  const height = finiteDecoded(reader, reader.readBD(), "an mtext height");
  const attachment = reader.readBS();
  const drawingDirection = reader.readBS();
  const extentsHeight = finiteDecoded(
    reader,
    reader.readBD(),
    "an mtext extents height",
  );
  const extentsWidth = finiteDecoded(
    reader,
    reader.readBD(),
    "an mtext extents width",
  );
  const valueBytes = readFrozenBytes(reader);
  const lineSpacingStyle = reader.readBS();
  const lineSpacingFactor = finiteDecoded(
    reader,
    reader.readBD(),
    "an mtext line spacing factor",
  );
  const trailingBit = reader.readB();
  return Object.freeze({
    kind: "mtext" as const,
    insertion,
    extrusion,
    xAxisDirection,
    rectWidth,
    height,
    attachment,
    drawingDirection,
    extentsHeight,
    extentsWidth,
    valueBytes,
    lineSpacingStyle,
    lineSpacingFactor,
    trailingBit,
  });
}

/** ATTRIB: los campos de TEXT más tag TV, field length BS y banderas RC. */
export function decodeAttrib(reader: DwgBitReader): DwgAttribEntity {
  const fields = decodeTextFields(reader);
  const tagBytes = readFrozenBytes(reader);
  const fieldLength = reader.readBS();
  const attributeFlags = reader.readRC();
  return Object.freeze({
    kind: "attrib" as const,
    ...fields,
    tagBytes,
    fieldLength,
    attributeFlags,
  });
}

/** ATTDEF: ATTRIB más el prompt TV al final. */
export function decodeAttdef(reader: DwgBitReader): DwgAttdefEntity {
  const fields = decodeTextFields(reader);
  const tagBytes = readFrozenBytes(reader);
  const fieldLength = reader.readBS();
  const attributeFlags = reader.readRC();
  const promptBytes = readFrozenBytes(reader);
  return Object.freeze({
    kind: "attdef" as const,
    ...fields,
    tagBytes,
    fieldLength,
    attributeFlags,
    promptBytes,
  });
}

/** SEQEND: sin campos propios tras el común (hecho registrado). */
export function decodeSeqend(): DwgSeqendEntity {
  return Object.freeze({ kind: "seqend" as const });
}

/**
 * Familia DIMENSION (R2000): datos comunes — extrusión 3BD, punto medio del
 * texto 2RD, elevación BD, banderas RC, texto de usuario TV, rotación del
 * texto BD, dirección horizontal BD, escala de inserción 3BD, rotación de
 * inserción BD, attachment BS, interlineado BS+BD, medida real BD y punto de
 * clonado 2RD — seguidos de la cola de la variante. El DIMSTYLE y el bloque
 * anónimo viajan en el flujo de handles (contabilizado opaco).
 */
export function decodeDimension(
  reader: DwgBitReader,
  dimensionKind: DwgDimensionKind,
): DwgDimensionEntity {
  const extrusion = read3BDPoint(reader, "a dimension extrusion");
  const textMidpoint = read2RDPoint(reader, "a dimension text midpoint");
  const elevation = finiteDecoded(
    reader,
    reader.readBD(),
    "a dimension elevation",
  );
  const flags = reader.readRC();
  const userTextBytes = readFrozenBytes(reader);
  const textRotation = finiteDecoded(
    reader,
    reader.readBD(),
    "a dimension text rotation",
  );
  const horizontalDirection = finiteDecoded(
    reader,
    reader.readBD(),
    "a dimension horizontal direction",
  );
  const insertScale = read3BDPoint(reader, "a dimension insert scale");
  const insertRotation = finiteDecoded(
    reader,
    reader.readBD(),
    "a dimension insert rotation",
  );
  const attachment = reader.readBS();
  const lineSpacingStyle = reader.readBS();
  const lineSpacingFactor = finiteDecoded(
    reader,
    reader.readBD(),
    "a dimension line spacing factor",
  );
  const actualMeasurement = finiteDecoded(
    reader,
    reader.readBD(),
    "a dimension measurement",
  );
  const clonePoint = read2RDPoint(reader, "a dimension clone point");

  let definitionPoint: DwgPoint3;
  let point13: DwgPoint3 | undefined;
  let point14: DwgPoint3 | undefined;
  let point15: DwgPoint3 | undefined;
  let point16: DwgPoint2 | undefined;
  let extensionLineRotation: number | undefined;
  let dimensionRotation: number | undefined;
  let leaderLength: number | undefined;
  let ordinateFlags: number | undefined;

  switch (dimensionKind) {
    case "ordinate": {
      definitionPoint = read3BDPoint(reader, "an ordinate definition point");
      point13 = read3BDPoint(reader, "an ordinate feature point");
      point14 = read3BDPoint(reader, "an ordinate leader endpoint");
      ordinateFlags = reader.readRC();
      break;
    }
    case "linear": {
      point13 = read3BDPoint(reader, "a linear dimension point 13");
      point14 = read3BDPoint(reader, "a linear dimension point 14");
      definitionPoint = read3BDPoint(reader, "a linear definition point");
      extensionLineRotation = finiteDecoded(
        reader,
        reader.readBD(),
        "a linear extension-line rotation",
      );
      dimensionRotation = finiteDecoded(
        reader,
        reader.readBD(),
        "a linear dimension rotation",
      );
      break;
    }
    case "aligned": {
      point13 = read3BDPoint(reader, "an aligned dimension point 13");
      point14 = read3BDPoint(reader, "an aligned dimension point 14");
      definitionPoint = read3BDPoint(reader, "an aligned definition point");
      extensionLineRotation = finiteDecoded(
        reader,
        reader.readBD(),
        "an aligned extension-line rotation",
      );
      break;
    }
    case "angular3pt": {
      definitionPoint = read3BDPoint(reader, "an angular definition point");
      point13 = read3BDPoint(reader, "an angular dimension point 13");
      point14 = read3BDPoint(reader, "an angular dimension point 14");
      point15 = read3BDPoint(reader, "an angular dimension point 15");
      break;
    }
    case "angular2ln": {
      point16 = read2RDPoint(reader, "an angular dimension point 16");
      point13 = read3BDPoint(reader, "an angular dimension point 13");
      point14 = read3BDPoint(reader, "an angular dimension point 14");
      point15 = read3BDPoint(reader, "an angular dimension point 15");
      definitionPoint = read3BDPoint(reader, "an angular definition point");
      break;
    }
    case "radius": {
      definitionPoint = read3BDPoint(reader, "a radial definition point");
      point15 = read3BDPoint(reader, "a radial dimension point 15");
      leaderLength = finiteDecoded(
        reader,
        reader.readBD(),
        "a radial leader length",
      );
      break;
    }
    case "diameter": {
      point15 = read3BDPoint(reader, "a diameter dimension point 15");
      definitionPoint = read3BDPoint(reader, "a diameter definition point");
      leaderLength = finiteDecoded(
        reader,
        reader.readBD(),
        "a diameter leader length",
      );
      break;
    }
  }

  return Object.freeze({
    kind: "dimension" as const,
    dimensionKind,
    extrusion,
    textMidpoint,
    elevation,
    flags,
    userTextBytes,
    textRotation,
    horizontalDirection,
    insertScale,
    insertRotation,
    attachment,
    lineSpacingStyle,
    lineSpacingFactor,
    actualMeasurement,
    clonePoint,
    definitionPoint,
    point13,
    point14,
    point15,
    point16,
    extensionLineRotation,
    dimensionRotation,
    leaderLength,
    ordinateFlags,
  });
}

/** Un TV como bytes congelados del modelo (misma convención que TEXT). */
function readFrozenBytes(reader: DwgBitReader): readonly number[] {
  const text = reader.readTV();
  const bytes = new Array<number>(text.bytes.length);
  for (let index = 0; index < text.bytes.length; index += 1) {
    bytes[index] = text.bytes[index]!;
  }
  return Object.freeze(bytes);
}

/** Un 3BD validado como punto finito del modelo neutral. */
function read3BDPoint(reader: DwgBitReader, what: string): DwgPoint3 {
  const { x, y, z } = reader.read3BD();
  return frozenPoint3(
    finiteDecoded(reader, x, what),
    finiteDecoded(reader, y, what),
    finiteDecoded(reader, z, what),
  );
}

/** Dos RD validados como punto 2D finito del modelo neutral. */
function read2RDPoint(reader: DwgBitReader, what: string): DwgPoint2 {
  const x = finiteDecoded(reader, reader.readRD(), what);
  const y = finiteDecoded(reader, reader.readRD(), what);
  return Object.freeze({ x, y });
}
