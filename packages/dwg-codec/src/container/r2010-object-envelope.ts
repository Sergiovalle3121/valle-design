/**
 * Envoltura de objeto R2010+ (AC1024/AC1027/AC1032) dentro de
 * AcDb:AcDbObjects — intake 2026-08-23.
 *
 * A DIFERENCIA de R2000/AC1018 (`container/ac1015-object-envelope.ts`: tamaño
 * MS al frente + cuerpo + CRC-16), el cuerpo R2010+ NO lleva ningún campo de
 * tamaño en bytes al frente: el CRC-16 RS little-endian (semilla 0xC0C1)
 * cubre el cuerpo COMPLETO empezando en su primer byte, termina EXACTAMENTE
 * 2 bytes antes del offset del SIGUIENTE objeto según el mapa de handles (el
 * mismo mapa modular de R2000, ya confirmado para toda la familia R2004) o
 * del fin del payload de AcDb:AcDbObjects para el último objeto, y no hay
 * relleno entre objetos consecutivos. Hecho medido por búsqueda exhaustiva
 * del rango cuyo CRC-16 coincide con los 2 bytes almacenados: coincidencia
 * ÚNICA y aterrizaje EXACTO en el límite del mapa en 430/430 objetos reales
 * de tres fixtures AC1024/AC1027 — VALLE-CORPUS-INTAKE-A60EBE2 en
 * SOURCE_REGISTER.json.
 *
 * Intake 2026-08-31 (VALLE-CORPUS-R2010-OBJECT-HEADER): lo que el intake de
 * 2026-08-23 dejó BLOCKED_BY_SOURCE_GATE —la codificación BOT del tipo y la
 * posición del campo UMC del tamaño del flujo de handles— queda DERIVADO por
 * medición first-party y falsado sobre el corpus admitido. El encabezado de
 * un cuerpo R2010+ es, en este orden:
 *
 *   1. `MS`  tamaño del objeto en bytes;
 *   2. `UMC` tamaño EN BITS del flujo de handles (es un TAMAÑO, no un
 *      desplazamiento — confundirlo fue lo que hizo fracasar el sondeo de
 *      2026-08-23, que buscaba el tipo asumiéndolo al frente);
 *   3. `BOT` tipo de objeto (ver `DwgBitReader.readBOT`);
 *   4. `H`   handle propio del objeto.
 *
 * POR QUÉ ESTA MEDICIÓN SE PUEDE CREER. El handle propio viaja pegado detrás
 * del tipo, y el mapa de handles ya dice cuál debe ser cada uno. Si
 * cualquiera de los tres campos previos tuviera el ancho equivocado, el
 * handle saldría desalineado y basura. Sale EXACTO en 2893/2893 objetos de
 * los 24 fixtures AC1024/AC1027/AC1032 del corpus admitido.
 *
 * LO QUE ESTO TODAVÍA NO ES. Decodificar el ENCABEZADO no es decodificar el
 * CUERPO: el flujo de datos R2010+ separa las cadenas a un flujo propio y su
 * cabecera común de entidad difiere aún de la R2000, así que reconstruir la
 * forma R2000 y reusar los decodificadores existentes NO funciona todavía
 * (probado: ningún `bitsize` hace decodificar una LINE real). Por eso
 * `readR2004Database` SIGUE fallando cerrado para AC1024/AC1027/AC1032 —
 * ahora por una frontera distinta y más estrecha, nombrada en su mensaje.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { checkedRange, checkedSubtract } from "../binary/checked-arithmetic.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import { crc16Dwg } from "../codecs/crc16.js";
import { throwDwgError } from "../security/parse-error.js";
import { AC1015_SECTION_CRC_SEED } from "./ac1015-section-frame.js";

/** Un par ordenado {handle, offset} del mapa de handles, ya validado. */
export interface R2010ObjectMapEntry {
  readonly handle: number;
  readonly offset: number;
}

/** Límites [start, end) de un objeto dentro de AcDb:AcDbObjects. */
export interface R2010ObjectBounds {
  readonly handle: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Empareja las entradas del mapa de handles con los límites de bytes de cada
 * objeto dentro del payload de AcDb:AcDbObjects: el final de cada objeto es
 * el offset del SIGUIENTE en orden ascendente de offset, o el fin del
 * payload para el último. El orden de ENTREGA sigue siendo el del mapa
 * (mismo criterio de laboratorio que R2000/AC1018): esta función sólo ordena
 * una copia para calcular límites, no reordena la base.
 */
export function pairR2010ObjectBounds(
  mapEntries: readonly R2010ObjectMapEntry[],
  objectsPayloadLength: number,
): readonly R2010ObjectBounds[] {
  const sorted = [...mapEntries].sort((left, right) => left.offset - right.offset);
  const bounds: R2010ObjectBounds[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index]!.offset;
    const end =
      index + 1 < sorted.length ? sorted[index + 1]!.offset : objectsPayloadLength;
    if (!Number.isSafeInteger(start) || start < 0 || start >= objectsPayloadLength) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        Number.isSafeInteger(start) && start >= 0 ? start : 0,
        "An R2010+ object map offset lands outside AcDb:AcDbObjects.",
      );
    }
    if (end <= start) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        start,
        "Two R2010+ object map entries do not leave room for a body and its CRC.",
      );
    }
    bounds.push(Object.freeze({ handle: sorted[index]!.handle, start, end }));
  }
  return Object.freeze(bounds);
}

/** Cuerpo R2010+ verificado: opaco, sin tipo decodificado. */
export interface R2010ObjectBody {
  readonly bodyBytes: Uint8Array;
  readonly byteLength: number;
}

/**
 * Lee y verifica el cuerpo de UN objeto R2010+ ya delimitado por
 * `pairR2010ObjectBounds`: sin campo de tamaño al frente, CRC-16 sobre el
 * cuerpo completo en los últimos 2 bytes del rango. Falla cerrado con offset
 * relativo al payload de AcDb:AcDbObjects ante un rango imposible o un CRC
 * que no cuadra; nunca devuelve un cuerpo sin verificar.
 */
export function readR2010ObjectBody(
  objectsPayload: Uint8Array,
  bounds: R2010ObjectBounds,
): R2010ObjectBody {
  checkedRange(bounds.start, bounds.end - bounds.start, objectsPayload.length, bounds.start);
  const byteLength = checkedSubtract(bounds.end, bounds.start, bounds.start);
  if (byteLength < 3) {
    // Menos de 1 byte de cuerpo más el CRC de 2 bytes no puede contener nada.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      bounds.start,
      "An R2010+ object slot is too small to hold a body and its CRC.",
    );
  }
  const crcOffset = bounds.end - 2;
  const bodyBytes = objectsPayload.subarray(bounds.start, crcOffset);
  const crc =
    objectsPayload[crcOffset]! + objectsPayload[crcOffset + 1]! * 0x100;
  const computed = crc16Dwg(bodyBytes, AC1015_SECTION_CRC_SEED);
  if (crc !== computed) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      crcOffset,
      "The R2010+ object envelope CRC does not match its body.",
    );
  }
  return Object.freeze({ bodyBytes: Uint8Array.from(bodyBytes), byteLength });
}

/** Encabezado de un cuerpo R2010+ ya delimitado y verificado por CRC. */
export interface R2010ObjectHeader {
  /**
   * Tamaño del objeto en bytes, tal como lo declara su campo `MS`. NO incluye
   * los bytes del propio `MS` ni los de `UMC`: medido en el intake del CUERPO
   * (VALLE-CORPUS-R2010-OBJECT-BODY) que `bodyBytes.length` siempre supera
   * este valor en exactamente el ancho en bytes de esos dos campos. Cualquier
   * cálculo del límite del flujo de handles debe anclarse en
   * `bodyBytes.length`, nunca en este campo — ver `reader/r2010-entity-body.ts`.
   */
  readonly objectSize: number;
  /** Tamaño EN BITS del flujo de handles (un tamaño, no un desplazamiento). */
  readonly handleStreamBits: number;
  /** Tipo de objeto: fijo si < 0x1F0, número de clase del archivo si no. */
  readonly type: number;
  /** Handle propio declarado por el objeto. */
  readonly handle: number;
  /** Código de 4 bits del handle propio (0 = absoluto en el corpus medido). */
  readonly handleCode: number;
  /** Primer bit del flujo de datos, ya pasado el handle propio. */
  readonly dataBitOffset: number;
}

/**
 * Lee el encabezado de UN cuerpo R2010+ (ver la cabecera del módulo para la
 * secuencia y para por qué se puede creer).
 *
 * `expectedHandle` es OPCIONAL y no cambia lo que se lee: cuando el llamador
 * lo pasa, esta función exige que el handle decodificado coincida con el que
 * el mapa ya prometió. Es la comprobación cruzada que convierte un
 * desalineamiento silencioso en un fallo cerrado con offset — sin ella, un
 * encabezado mal leído produciría un objeto plausible y equivocado.
 */
export function readR2010ObjectHeader(
  bodyBytes: Uint8Array,
  expectedHandle?: number,
): R2010ObjectHeader {
  const reader = new DwgBitReader(new BoundedByteCursor(bodyBytes));
  const objectSize = reader.readMS();
  const handleStreamBits = reader.readUnsignedMC();
  const type = reader.readBOT();
  const own = reader.readH();
  const handle = own.value;
  if (expectedHandle !== undefined && handle !== expectedHandle) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0,
      "An R2010+ object header decodes a handle its own map does not promise.",
    );
  }
  return Object.freeze({
    objectSize,
    handleStreamBits,
    type,
    handle,
    handleCode: own.code,
    dataBitOffset: reader.bitPosition,
  });
}
