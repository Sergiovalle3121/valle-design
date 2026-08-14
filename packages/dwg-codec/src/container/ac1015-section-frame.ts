/**
 * Marco de sección del contenedor R2000 (AC1015).
 *
 * Las secciones principales de un archivo R2000 no van "desnudas": cada una
 * viaja envuelta en un MARCO — centinela de apertura de 16 bytes, tamaño RL
 * del payload, el payload en sí, un CRC-16 y el centinela de cierre. Los
 * centinelas existen para que un lector pueda confirmar que el directorio de
 * la cabecera lo llevó al sitio correcto antes de creer un solo byte del
 * contenido; el CRC, para que un payload corrompido no pase por bueno.
 *
 * Este módulo VERIFICA marcos y devuelve el payload OPACO: decodificar las
 * variables de cabecera o las clases es de fases posteriores. Sus reglas son
 * las del laboratorio:
 *
 * - **Fallo cerrado**: centinela torcido, tamaño que no llena su registro del
 *   directorio, CRC que no cuadra → error tipado con el byte exacto; nunca un
 *   payload "probablemente bueno".
 * - **Presupuesto cobrado**: toda lectura pasa por el cursor acotado, incluida
 *   la relectura que alimenta el CRC.
 * - **Hechos registrados**: centinelas, disposición del marco y semilla del
 *   CRC vienen de ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER). Implementación
 *   original.
 *
 * Límite declarado: hasta la fase de intake con corpus real y derechos, la
 * evidencia de estas constantes es el round-trip contra el writer first-party
 * de la fase C, y así queda dicho en DWG0_WORKLOG.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { checkedRange } from "../binary/checked-arithmetic.js";
import { crc16Dwg } from "../codecs/crc16.js";
import { throwDwgError } from "../security/parse-error.js";

/** Pareja de centinelas de una sección: apertura y cierre, 16 bytes cada uno. */
export interface Ac1015SectionSentinelPair {
  readonly begin: readonly number[];
  readonly end: readonly number[];
}

/** Longitud fija de todo centinela de sección R2000. */
export const AC1015_SECTION_SENTINEL_LENGTH = 16;

/**
 * Centinelas de la sección de VARIABLES DE CABECERA (hecho registrado). El
 * cierre es el complemento a uno, byte a byte, de la apertura — el formato lo
 * define así y este módulo lo declara explícito en vez de calcularlo, para
 * que un error de transcripción falle en los tests y no se propague callado.
 */
export const AC1015_HEADER_VARIABLES_SENTINELS: Ac1015SectionSentinelPair =
  Object.freeze({
    begin: Object.freeze([
      0xcf, 0x7b, 0x1f, 0x23, 0xfd, 0xde, 0x38, 0xa9, 0x5f, 0x7c, 0x68, 0xb8,
      0x4e, 0x6d, 0x33, 0x5f,
    ]),
    end: Object.freeze([
      0x30, 0x84, 0xe0, 0xdc, 0x02, 0x21, 0xc7, 0x56, 0xa0, 0x83, 0x97, 0x47,
      0xb1, 0x92, 0xcc, 0xa0,
    ]),
  });

/** Centinelas de la sección de CLASES (hecho registrado; misma relación). */
export const AC1015_CLASSES_SENTINELS: Ac1015SectionSentinelPair =
  Object.freeze({
    begin: Object.freeze([
      0x8d, 0xa1, 0xc4, 0xb8, 0xc4, 0xa9, 0xf8, 0xc5, 0xc0, 0xdc, 0xf4, 0x5f,
      0xe7, 0xcf, 0xb6, 0x8a,
    ]),
    end: Object.freeze([
      0x72, 0x5e, 0x3b, 0x47, 0x3b, 0x56, 0x07, 0x3a, 0x3f, 0x23, 0x0b, 0xa0,
      0x18, 0x30, 0x49, 0x75,
    ]),
  });

/**
 * Semilla del CRC-16 de los marcos de sección y de las páginas del mapa de
 * objetos: la misma 0xC0C1 de la cabecera de archivo (hecho registrado).
 */
export const AC1015_SECTION_CRC_SEED = 0xc0c1;

/**
 * Bytes de marco que rodean al payload: apertura (16) + tamaño RL (4) +
 * CRC (2) + cierre (16). El tamaño RL declara SOLO el payload.
 */
export const AC1015_SECTION_FRAME_OVERHEAD =
  AC1015_SECTION_SENTINEL_LENGTH + 4 + 2 + AC1015_SECTION_SENTINEL_LENGTH;

/** Bytes exactos de un mapa de objetos VACÍO: página terminadora + su CRC. */
export const AC1015_EMPTY_OBJECT_MAP_SIZE = 4;

/** Extensión de una sección según el directorio: dónde empieza y cuánto ocupa. */
export interface Ac1015SectionExtent {
  readonly start: number;
  readonly size: number;
}

/** Marco verificado: tamaño declarado, payload opaco y CRC ya contrastado. */
export interface Ac1015SectionFrame {
  readonly declaredSize: number;
  /** Bytes exactos del payload. Decodificarlos es de fases posteriores. */
  readonly payload: Uint8Array;
  readonly crc: number;
}

/** Resultado de verificar un mapa de objetos vacío: su CRC de página. */
export interface Ac1015EmptyObjectMap {
  readonly crc: number;
}

/**
 * Verifica el marco de una sección R2000 y devuelve su payload OPACO.
 *
 * Recibe el cursor del ARCHIVO ENTERO más la extensión que el directorio de
 * la cabecera declaró para esta sección; el propio marco debe LLENARLA
 * exactamente. Exigir el encaje exacto es deliberado: bytes de sobra tras el
 * cierre serían datos ignorados en silencio, y este laboratorio no recupera
 * ni ignora en silencio. El cursor queda posicionado tras el marco.
 */
export function readAc1015SectionFrame(
  cursor: BoundedByteCursor,
  extent: Ac1015SectionExtent,
  sentinels: Ac1015SectionSentinelPair,
): Ac1015SectionFrame {
  assertFrameArguments(cursor, extent, sentinels);
  if (extent.size < AC1015_SECTION_FRAME_OVERHEAD) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      extent.start,
      "The section record is too small to hold a sentinel frame.",
    );
  }

  cursor.seek(extent.start);
  for (let index = 0; index < AC1015_SECTION_SENTINEL_LENGTH; index += 1) {
    if (cursor.readUint8() !== sentinels.begin[index]) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        extent.start + index,
        "The section begin sentinel is not in place.",
      );
    }
  }

  // El tamaño RL declara el payload; el marco (38 bytes) más ese payload debe
  // llenar el registro del directorio EXACTAMENTE — ni salirse ni sobrar.
  const sizeOffset = cursor.position;
  const declaredSize = cursor.readUint32LE();
  if (declaredSize !== extent.size - AC1015_SECTION_FRAME_OVERHEAD) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      sizeOffset,
      "The declared section size does not fill its directory record.",
    );
  }

  const payload = cursor.readBytes(declaredSize);

  // El CRC cubre el tamaño RL y el payload, con la semilla de sección.
  const crcOffset = cursor.position;
  const crc = cursor.readUint16LE();
  const computed = crc16Dwg(
    readBackSlice(cursor, sizeOffset, crcOffset),
    AC1015_SECTION_CRC_SEED,
  );
  if (crc !== computed) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      crcOffset,
      "The section CRC does not match its contents.",
    );
  }

  for (let index = 0; index < AC1015_SECTION_SENTINEL_LENGTH; index += 1) {
    if (cursor.readUint8() !== sentinels.end[index]) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        crcOffset + 2 + index,
        "The section end sentinel is not in place.",
      );
    }
  }

  return Object.freeze({ declaredSize, payload, crc });
}

/**
 * Verifica un mapa de objetos VACÍO: exactamente la página terminadora.
 *
 * El mapa de objetos R2000 es una lista de páginas y — a diferencia del resto
 * del archivo — sus tamaños y CRC viajan en BIG-endian. Cada página declara
 * un tamaño RS que cuenta sus propios dos bytes más los datos, y la página
 * terminadora tiene tamaño 2: sólo el campo de tamaño, sin datos, seguida de
 * su CRC. Un mapa vacío son esos 4 bytes y nada más.
 *
 * Una página con datos no es corrupción: es una fase que este lector aún no
 * implementa, y se dice tal cual con un error `unsupported` en vez de mentir.
 */
export function readAc1015EmptyObjectMap(
  cursor: BoundedByteCursor,
  extent: Ac1015SectionExtent,
): Ac1015EmptyObjectMap {
  assertCursor(cursor);
  checkedRange(extent.start, extent.size, cursor.length, extent.start);
  if (extent.size < AC1015_EMPTY_OBJECT_MAP_SIZE) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      extent.start,
      "The object map cannot hold its terminating page.",
    );
  }

  cursor.seek(extent.start);
  const pageSize = cursor.readUint16BE();
  if (pageSize < 2) {
    // El tamaño cuenta sus propios dos bytes: menos de 2 es imposible.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      extent.start,
      "An object-map page cannot be smaller than its own size field.",
    );
  }
  if (pageSize > 2) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      extent.start,
      "A populated object map is beyond this phase; only the empty terminator is read.",
    );
  }

  // El CRC de página cubre el campo de tamaño (aquí, sus únicos bytes) y se
  // almacena big-endian, como todo dentro del mapa de objetos.
  const crcOffset = cursor.position;
  const crc = cursor.readUint16BE();
  const computed = crc16Dwg(
    readBackSlice(cursor, extent.start, crcOffset),
    AC1015_SECTION_CRC_SEED,
  );
  if (crc !== computed) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      crcOffset,
      "The object-map page CRC does not match its contents.",
    );
  }

  if (extent.size !== AC1015_EMPTY_OBJECT_MAP_SIZE) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      cursor.position,
      "Trailing bytes after the object-map terminator are not accepted.",
    );
  }

  return Object.freeze({ crc });
}

function assertCursor(cursor: BoundedByteCursor): void {
  if (!(cursor instanceof BoundedByteCursor)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Reading a section frame requires a bounded byte cursor.",
    );
  }
}

function assertFrameArguments(
  cursor: BoundedByteCursor,
  extent: Ac1015SectionExtent,
  sentinels: Ac1015SectionSentinelPair,
): void {
  assertCursor(cursor);
  // Una pareja de centinelas malformada sería un error NUESTRO, no del
  // archivo: se rechaza cerrado igualmente para que no verifique nada a
  // medias con una constante truncada.
  if (
    sentinels.begin.length !== AC1015_SECTION_SENTINEL_LENGTH ||
    sentinels.end.length !== AC1015_SECTION_SENTINEL_LENGTH
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A section sentinel pair must hold sixteen bytes per side.",
    );
  }
  checkedRange(extent.start, extent.size, cursor.length, extent.start);
}

/**
 * Relee un tramo YA RECORRIDO del cursor para el CRC sin retroceder el estado
 * del llamador (mismo patrón que la cabecera de archivo): el cursor acotado
 * no expone su buffer a propósito, así que se usa seek + readBytes y se
 * restaura la posición. El presupuesto cobra la relectura — el CRC no es
 * gratis y no debe serlo.
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
