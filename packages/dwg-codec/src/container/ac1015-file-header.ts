/**
 * Cabecera de archivo del contenedor R2000 (AC1015).
 *
 * Es la puerta del formato binario: la versión en claro, unos campos fijos,
 * el puntero a la imagen de previsualización, la página de códigos y el
 * directorio de SECCIONES — registros localizadores {id, seeker, size} —
 * cerrado por un CRC-16 CRUDO (semilla 0xC0C1, sin máscara).
 *
 * Este módulo LOCALIZA; no decodifica el contenido de ninguna sección. Sus
 * reglas son las del laboratorio:
 *
 * - **Fallo cerrado**: magia equivocada, recuento fuera de lo definido,
 *   secciones fuera del archivo o solapadas, o CRC que no cuadra → error
 *   tipado con su byte exacto; jamás un contenedor "a medias".
 * - **Presupuesto cobrado**: todas las lecturas pasan por el cursor acotado.
 * - **Hechos registrados**: disposición y constantes de
 *   ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER). Implementación original.
 *
 * Intake 2026-08-20 (`VALLE-CORPUS-AC1015-INTAKE-DAE5E77`): el corpus
 * real DESMINTIÓ la máscara XOR del CRC que la ODS declaraba por recuento de
 * registros — los 8 AC1015 independientes guardan el CRC crudo — y CONFIRMÓ
 * byte a byte el centinela final. Este módulo valida el CRC sin máscara; el
 * rango 3–6 del recuento se conserva (hecho no contradicho).
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { RangeTable, type BoundedRange } from "../binary/range-table.js";
import { crc16Dwg } from "../codecs/crc16.js";
import { throwDwgError } from "../security/parse-error.js";

/**
 * "AC1015" en ASCII: la única versión que esta fase del contenedor abre. Se
 * exporta para que el writer de la fase C escriba EXACTAMENTE lo que este
 * lector exige — una sola fuente de verdad, sin constantes gemelas.
 */
export const AC1015_MAGIC = [0x41, 0x43, 0x31, 0x30, 0x31, 0x35] as const;

/**
 * Centinela de 16 bytes que cierra la cabecera, inmediatamente después del
 * CRC. Constante del formato (hecho registrado; validación con corpus real
 * pendiente — ver cabecera del módulo). Exportado por la misma razón que la
 * magia: lector y writer deben compartir el mismo byte o fallar juntos.
 */
export const AC1015_FILE_HEADER_END_SENTINEL = [
  0x95, 0xa0, 0x4e, 0x28, 0x99, 0x82, 0x1a, 0xe5, 0x5e, 0x41, 0xe0, 0x5f, 0x9d,
  0x3a, 0x4d, 0x00,
] as const;

/** Offset donde empieza el puntero de previsualización. */
const PREVIEW_SEEKER_OFFSET = 0x0d;
/** Offset de la página de códigos. */
const CODEPAGE_OFFSET = 0x13;
/** Offset del recuento de registros localizadores. */
const RECORD_COUNT_OFFSET = 0x15;
/**
 * Rango definido del recuento de registros localizadores (hecho de la ODS no
 * contradicho por el corpus; los 8 AC1015 reales llevan 6). Fuera de 3–6 el
 * contenedor falla cerrado, no adivina.
 */
const MIN_RECORD_COUNT = 3;
const MAX_RECORD_COUNT = 6;

/** Un registro localizador: qué sección, dónde empieza y cuánto ocupa. */
export interface Ac1015SectionRecord {
  /** Identificador crudo del registro (0 = header vars, 1 = classes, 2 = object map…). */
  readonly id: number;
  readonly start: number;
  readonly size: number;
}

export interface Ac1015FileHeader {
  /** Siempre "AC1015" aquí; queda por si una capa superior mezcla versiones. */
  readonly version: "AC1015";
  readonly maintenanceVersion: number;
  /** Seeker de la imagen de previsualización (0 cuando no hay). */
  readonly previewSeeker: number;
  readonly codepage: number;
  readonly records: readonly Ac1015SectionRecord[];
  /** CRC leído del archivo, ya verificado contra el calculado. */
  readonly crc: number;
}

/**
 * Abre la cabecera AC1015 de un archivo completo y devuelve su directorio de
 * secciones validado (dentro del archivo, sin solapes, con CRC correcto).
 *
 * Recibe el cursor del ARCHIVO ENTERO posicionado al inicio; el llamador es
 * dueño de los límites y del presupuesto con que construyó el cursor.
 */
export function parseAc1015FileHeader(
  cursor: BoundedByteCursor,
): Ac1015FileHeader {
  if (!(cursor instanceof BoundedByteCursor)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The AC1015 container requires a bounded byte cursor.",
    );
  }
  if (cursor.position !== 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      cursor.position,
      "The AC1015 file header starts at offset zero.",
    );
  }

  // La magia, byte a byte y con su offset exacto en el error.
  for (let index = 0; index < AC1015_MAGIC.length; index += 1) {
    const byte = cursor.readUint8();
    if (byte !== AC1015_MAGIC[index]) {
      throwDwgError(
        "DWG_SIGNATURE_INVALID",
        "input",
        index,
        "The file does not carry the AC1015 signature this container opens.",
      );
    }
  }

  // Seis bytes reservados/de mantenimiento: el formato fija ceros en cinco y
  // la versión de mantenimiento en el sexto. No se rechazan valores ajenos en
  // los reservados —los escritores reales varían—, pero sí se contabilizan.
  cursor.skip(5);
  const maintenanceVersion = cursor.readUint8();
  const oneByte = cursor.readUint8();
  if (oneByte !== 0x01) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      PREVIEW_SEEKER_OFFSET - 1,
      "The fixed byte before the preview seeker must be 0x01.",
    );
  }
  const previewSeeker = cursor.readUint32LE();
  // Versión y mantenimiento de la aplicación escritora: informativos.
  cursor.skip(2);
  const codepage = cursor.readUint16LE();

  const recordCount = cursor.readUint32LE();
  if (recordCount < MIN_RECORD_COUNT || recordCount > MAX_RECORD_COUNT) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      RECORD_COUNT_OFFSET,
      "The section-locator record count is outside the defined 3-6 range.",
    );
  }

  // El directorio: cada registro contra los límites del ARCHIVO y contra los
  // demás (solapes y duplicados los rechaza la tabla de rangos).
  const table = new RangeTable(cursor.length, recordCount);
  const records: Ac1015SectionRecord[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const id = cursor.readUint8();
    const start = cursor.readUint32LE();
    const size = cursor.readUint32LE();
    const recordOffset = cursor.position - 9;
    if (start < RECORD_COUNT_OFFSET) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        recordOffset,
        "A section cannot start inside the file header.",
      );
    }
    let range: BoundedRange;
    try {
      range = table.add(`section-${id}`, start, size);
    } catch (error) {
      // La tabla ya lanza el error tipado correcto; se relanza tal cual.
      throw error;
    }
    records.push(Object.freeze({ id, start: range.start, size: range.length }));
  }

  // El CRC cubre TODO lo anterior: desde el byte 0 hasta el último registro.
  // CRUDO, sin máscara XOR: así lo guardan los 8 AC1015 reales del corpus
  // (VALLE-CORPUS-AC1015-INTAKE-DAE5E77).
  const crcEnd = cursor.position;
  const crc = cursor.readUint16LE();
  const computed = crc16Dwg(readBackSlice(cursor, 0, crcEnd), 0xc0c1);
  if (crc !== computed) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      crcEnd,
      "The file-header CRC does not match its contents.",
    );
  }

  for (
    let index = 0;
    index < AC1015_FILE_HEADER_END_SENTINEL.length;
    index += 1
  ) {
    const byte = cursor.readUint8();
    if (byte !== AC1015_FILE_HEADER_END_SENTINEL[index]) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        crcEnd + 2 + index,
        "The file-header end sentinel is not in place.",
      );
    }
  }

  return Object.freeze({
    version: "AC1015" as const,
    maintenanceVersion,
    previewSeeker,
    codepage,
    records: Object.freeze(records),
    crc,
  });
}

/**
 * Relee un tramo YA RECORRIDO del cursor para el CRC sin retroceder el estado
 * del llamador: el cursor acotado no expone su buffer (a propósito), así que
 * se usa seek + readBytes y se restaura la posición. El presupuesto cobra la
 * relectura — el CRC no es gratis y no debe serlo.
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
