/**
 * Envoltura de un objeto R2000 (AC1015) — fase D1.
 *
 * Cada objeto del cuerpo del dibujo viaja envuelto igual: su tamaño MS (los
 * bytes del dato del objeto), esa cantidad de bytes de datos — cuyo primer
 * campo es el TIPO BS — y un CRC-16 RS little-endian con semilla 0xC0C1 que
 * cubre tamaño y datos. Esta fase lee SOLO la envoltura: verifica el marco,
 * extrae el tipo y devuelve el cuerpo OPACO; decodificar handles, cabecera
 * común o campos del tipo es de la fase D2, y fingirlo aquí sería mentir.
 *
 * Reglas del laboratorio:
 * - **Fallo cerrado**: envoltura que se sale del archivo o pisa una sección
 *   del directorio, tamaño imposible, CRC roto o cuerpo demasiado corto para
 *   su tipo → error tipado con su byte exacto.
 * - **Presupuesto cobrado**: el tamaño, el cuerpo, el CRC y la relectura que
 *   lo verifica pasan por el cursor acotado.
 * - **Hechos registrados**: disposición y CRC de la envoltura vienen de
 *   ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER). Implementación original;
 *   validación contra corpus real pendiente (DWG0_WORKLOG).
 */
import { checkedRange } from "../binary/checked-arithmetic.js";
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import { crc16Dwg } from "../codecs/crc16.js";
import { throwDwgError, DwgParseError } from "../security/parse-error.js";
import {
  AC1015_SECTION_CRC_SEED,
  type Ac1015SectionExtent,
} from "./ac1015-section-frame.js";

/** Envoltura verificada: tipo extraído, cuerpo opaco y bytes totales. */
export interface Ac1015ObjectEnvelope {
  /** Tipo BS con que arranca el cuerpo. Su semántica es de la fase D2. */
  readonly type: number;
  /** Bytes exactos del dato del objeto, tipo incluido. Opacos en esta fase. */
  readonly bodyBytes: Uint8Array;
  /** Bytes totales de la envoltura en el archivo: tamaño MS + cuerpo + CRC. */
  readonly byteLength: number;
}

/**
 * Lee la envoltura del objeto que empieza en `offset` (un offset del mapa de
 * objetos) y extrae SOLO su tipo BS inicial.
 *
 * `reservedExtents` son las extensiones que la envoltura no puede pisar — en
 * la práctica, los registros del directorio de la cabecera: los objetos viven
 * en la región SIN mapear del archivo, y una envoltura que invade una sección
 * declarada es un mapa mentiroso, no un objeto. El cursor queda tras el CRC.
 */
export function readAc1015ObjectEnvelope(
  cursor: BoundedByteCursor,
  offset: number,
  reservedExtents: readonly Ac1015SectionExtent[],
): Ac1015ObjectEnvelope {
  assertArguments(cursor, offset, reservedExtents);

  // El offset mismo no puede caer dentro de una sección declarada: se
  // comprueba ANTES de leer el tamaño para no interpretar como MS los bytes
  // de un centinela o de una página del mapa.
  assertOutsideReserved(offset, 1, reservedExtents);

  // El tamaño MS es de granularidad de byte (palabras completas), así que el
  // cursor de bytes queda alineado justo tras él y su longitud se mide ahí.
  cursor.seek(offset);
  const size = new DwgBitReader(cursor).readMS();
  const sizeLength = cursor.position - offset;
  if (size < 1) {
    // Un dato de cero bytes no puede contener ni su tipo BS.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      offset,
      "An object data size of zero cannot hold the object type.",
    );
  }

  // La envoltura completa — tamaño + cuerpo + CRC — debe caber en el archivo
  // y no pisar ninguna sección del directorio.
  const byteLength = sizeLength + size + 2;
  checkedRange(offset, byteLength, cursor.length, offset);
  assertOutsideReserved(offset, byteLength, reservedExtents);

  const bodyBytes = cursor.readBytes(size);

  // El CRC RS cubre [tamaño + cuerpo] con la semilla de sección y viaja
  // little-endian, como los CRC de los marcos (hecho registrado).
  const crcOffset = cursor.position;
  const crc = cursor.readUint16LE();
  const computed = crc16Dwg(
    readBackSlice(cursor, offset, crcOffset),
    AC1015_SECTION_CRC_SEED,
  );
  if (crc !== computed) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      crcOffset,
      "The object envelope CRC does not match its contents.",
    );
  }

  // Del cuerpo se extrae SOLO el tipo BS inicial, sobre una copia propia para
  // no mover el cursor del archivo. Un cuerpo demasiado corto para su tipo
  // falla cerrado con el offset trasladado al archivo.
  const type = readLeadingType(bodyBytes, offset + sizeLength);

  return Object.freeze({ type, bodyBytes, byteLength });
}

/** Decodifica el BS con que arranca el cuerpo, trasladando errores al archivo. */
function readLeadingType(bodyBytes: Uint8Array, bodyStart: number): number {
  try {
    return new DwgBitReader(new BoundedByteCursor(bodyBytes)).readBS();
  } catch (error) {
    if (error instanceof DwgParseError) {
      throwDwgError(
        error.detail.code,
        error.detail.category,
        bodyStart + error.detail.offset,
        error.detail.message,
      );
    }
    throw error;
  }
}

/**
 * Rechaza cualquier solape entre [start, start+length) y las extensiones
 * reservadas. La comparación es de intervalos semiabiertos: tocar el primer
 * byte de una sección ya es pisarla.
 */
function assertOutsideReserved(
  start: number,
  length: number,
  reservedExtents: readonly Ac1015SectionExtent[],
): void {
  for (const extent of reservedExtents) {
    const overlaps =
      start < extent.start + extent.size && extent.start < start + length;
    if (overlaps) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        start,
        "An object envelope tramples a directory section.",
      );
    }
  }
}

function assertArguments(
  cursor: BoundedByteCursor,
  offset: number,
  reservedExtents: readonly Ac1015SectionExtent[],
): void {
  if (!(cursor instanceof BoundedByteCursor)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Reading an object envelope requires a bounded byte cursor.",
    );
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= cursor.length) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
      "An object offset lands outside the file.",
    );
  }
  if (!Array.isArray(reservedExtents)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The reserved extents must be an array of directory records.",
    );
  }
  for (const extent of reservedExtents) {
    // Extensiones malformadas serían un error NUESTRO (vienen del directorio
    // ya validado); se rechazan cerradas igualmente.
    checkedRange(extent.start, extent.size, cursor.length, extent.start);
  }
}

/**
 * Relee un tramo YA RECORRIDO del cursor para el CRC sin retroceder el estado
 * del llamador (mismo patrón que el resto del contenedor): seek + readBytes y
 * restauración de la posición. El presupuesto cobra la relectura.
 */
function readBackSlice(
  cursor: BoundedByteCursor,
  start: number,
  end: number,
): Uint8Array {
  const resume = cursor.position;
  cursor.seek(start);
  const bytes = cursor.readBytes(end - start);
  cursor.seek(resume);
  return bytes;
}
