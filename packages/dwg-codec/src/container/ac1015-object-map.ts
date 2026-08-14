/**
 * Mapa de objetos POBLADO del contenedor R2000 (AC1015) — fase D1.
 *
 * El mapa de objetos es el índice del cuerpo del dibujo: una lista de pares
 * {handle, offset} que dice dónde vive cada objeto dentro del archivo. Para
 * ahorrar bytes el formato no guarda los valores absolutos sino DELTAS en
 * enteros modulares — el delta de handle sin signo (los handles del mapa son
 * estrictamente crecientes) y el delta de offset CON signo (los objetos no
 * tienen por qué estar en el mismo orden que sus handles) — y trocea la lista
 * en PÁGINAS, cada una con su tamaño RS big-endian (que cuenta sus propios
 * dos bytes) y su CRC-16 big-endian con semilla 0xC0C1 sobre la página
 * completa, tamaño incluido. Una página terminadora de tamaño 2 cierra el
 * mapa.
 *
 * Hecho DECLARADO de esta fase (registrado en SOURCE_REGISTER): los dos
 * acumuladores arrancan de 0 una sola vez al INICIO DE LA SECCIÓN y continúan
 * a través de las páginas — las páginas cortan la lista, no la reinician — y
 * ningún par se parte entre dos páginas. Hasta la fase de intake con corpus
 * real y derechos, la evidencia de esa lectura es el round-trip contra el
 * writer first-party, y así queda dicho en DWG0_WORKLOG.
 *
 * Reglas del laboratorio:
 * - **Fallo cerrado**: página malformada o de más de 2032 bytes, CRC roto,
 *   delta nulo (handle duplicado), offset fuera del archivo, offset duplicado,
 *   deltas que desbordan el rango seguro o mapa sin terminadora → error tipado
 *   con su byte; jamás una lista "probablemente buena".
 * - **Presupuesto cobrado**: toda lectura pasa por el cursor acotado y por el
 *   `DwgBitReader`; la relectura del CRC también paga.
 * - **Topes respetados**: `DwgLimits.maxHandles` y `maxObjects` acotan la
 *   lista ANTES de acumularla, no después.
 */
import { checkedAdd, checkedRange } from "../binary/checked-arithmetic.js";
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import { crc16Dwg } from "../codecs/crc16.js";
import { throwDwgError, DwgParseError } from "../security/parse-error.js";
import type { DwgLimits } from "../api/limits.js";
import {
  AC1015_SECTION_CRC_SEED,
  type Ac1015SectionExtent,
} from "./ac1015-section-frame.js";

/**
 * Tope de bytes de una página del mapa, contando su campo de tamaño (hecho
 * registrado). Una página mayor no es "generosa": es formato roto, y el
 * writer de esta misma fase pagina contra ESTA constante — una sola fuente
 * de verdad, sin números gemelos.
 */
export const AC1015_OBJECT_MAP_MAX_PAGE_SIZE = 2032;

/** Una entrada validada del mapa: el handle y el offset ABSOLUTOS. */
export interface Ac1015ObjectMapEntry {
  readonly handle: number;
  /** Offset del objeto desde el byte 0 del archivo. */
  readonly offset: number;
}

/**
 * Lee el mapa de objetos completo — vacío o poblado — y devuelve la lista de
 * entradas validada: handles estrictamente crecientes, offsets dentro del
 * archivo y sin duplicados, y recuento dentro de los topes de `limits`.
 *
 * Recibe el cursor del ARCHIVO ENTERO más la extensión que el directorio
 * declaró para el mapa; el mapa debe llenarla exactamente (páginas de datos +
 * terminadora, sin bytes de sobra). El cursor queda tras la terminadora.
 */
export function readAc1015ObjectMap(
  cursor: BoundedByteCursor,
  extent: Ac1015SectionExtent,
  limits: DwgLimits,
): readonly Ac1015ObjectMapEntry[] {
  assertCursor(cursor);
  const entryCap = resolveEntryCap(limits);
  checkedRange(extent.start, extent.size, cursor.length, extent.start);
  const sectionEnd = extent.start + extent.size;
  if (extent.size < 4) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      extent.start,
      "The object map cannot hold its terminating page.",
    );
  }

  // Los acumuladores del mapa: arrancan de 0 al inicio de la SECCIÓN y
  // sobreviven a los cortes de página (hecho declarado en la cabecera del
  // módulo). Reiniciarlos por página desincronizaría la lista en silencio.
  let lastHandle = 0;
  let lastOffset = 0;
  const entries: Ac1015ObjectMapEntry[] = [];
  const seenOffsets = new Set<number>();

  cursor.seek(extent.start);
  let sawTerminator = false;
  while (cursor.position < sectionEnd) {
    const pageStart = cursor.position;
    if (sectionEnd - pageStart < 4) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        pageStart,
        "An object-map page cannot hold its size field and CRC.",
      );
    }
    const pageSize = cursor.readUint16BE();
    if (pageSize < 2) {
      // El tamaño cuenta sus propios dos bytes: menos de 2 es imposible.
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        pageStart,
        "An object-map page cannot be smaller than its own size field.",
      );
    }
    if (pageSize > AC1015_OBJECT_MAP_MAX_PAGE_SIZE) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        pageStart,
        "An object-map page exceeds the 2032-byte format cap.",
      );
    }
    // La página en disco ocupa su tamaño declarado MÁS los 2 bytes del CRC.
    if (checkedAdd(pageStart, pageSize + 2, pageStart) > sectionEnd) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        pageStart,
        "An object-map page extends outside the map section.",
      );
    }

    if (pageSize === 2) {
      // Terminadora: sólo su campo de tamaño; el CRC la cubre y cierra el mapa.
      verifyPageCrc(cursor, pageStart, pageStart + 2);
      sawTerminator = true;
      break;
    }

    // Página de datos: se copia UNA vez su región de pares y se decodifica
    // con el DwgBitReader sobre un cursor propio — así un modular que se sale
    // de la página falla cerrado en vez de comerse el CRC o la página vecina.
    const dataStart = pageStart + 2;
    const dataLength = pageSize - 2;
    const dataBytes = cursor.readBytes(dataLength);
    const pairs = new DwgBitReader(new BoundedByteCursor(dataBytes));
    while (pairs.bitsRemaining > 0) {
      // El offset del par en el ARCHIVO, para que cada error diga su byte.
      const pairOffset = dataStart + Math.floor(pairs.bitPosition / 8);
      const { handleDelta, offsetDelta } = readPairDeltas(pairs, dataStart);

      if (entries.length >= entryCap) {
        throwDwgError(
          "DWG_FILE_LIMIT_EXCEEDED",
          "resource",
          pairOffset,
          "The object map exceeds the configured handle and object limits.",
        );
      }
      if (handleDelta === 0) {
        // Un delta nulo sería un handle repetido (o "decreciente": el delta
        // sin signo no puede codificar retrocesos). Fallo cerrado.
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          pairOffset,
          "A zero handle delta would repeat the previous handle.",
        );
      }
      const handle = checkedAdd(lastHandle, handleDelta, pairOffset);
      const offset = lastOffset + offsetDelta;
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset >= cursor.length
      ) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          pairOffset,
          "An object-map offset lands outside the file.",
        );
      }
      if (seenOffsets.has(offset)) {
        // Dos handles no pueden compartir envoltura: sería un mapa mentiroso.
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          pairOffset,
          "Two object-map entries share the same file offset.",
        );
      }
      seenOffsets.add(offset);
      entries.push(Object.freeze({ handle, offset }));
      lastHandle = handle;
      lastOffset = offset;
    }

    verifyPageCrc(cursor, pageStart, dataStart + dataLength);
  }

  if (!sawTerminator) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      cursor.position,
      "The object map ends without its terminating page.",
    );
  }
  if (cursor.position !== sectionEnd) {
    // Bytes tras la terminadora serían datos ignorados en silencio: no.
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      cursor.position,
      "Trailing bytes after the object-map terminator are not accepted.",
    );
  }
  return Object.freeze(entries);
}

/**
 * Lee el par de deltas de una entrada. Los errores del lector de bits llevan
 * offsets relativos a la página copiada; aquí se TRASLADAN al archivo — mismo
 * código, misma categoría, el byte verdadero — para que el diagnóstico apunte
 * al sitio real y no a un buffer interno.
 */
function readPairDeltas(
  pairs: DwgBitReader,
  dataStart: number,
): { handleDelta: number; offsetDelta: number } {
  try {
    const handleDelta = pairs.readUnsignedMC();
    const offsetDelta = pairs.readSignedMC();
    return { handleDelta, offsetDelta };
  } catch (error) {
    if (error instanceof DwgParseError) {
      throwDwgError(
        error.detail.code,
        error.detail.category,
        dataStart + error.detail.offset,
        error.detail.message,
      );
    }
    throw error;
  }
}

/**
 * Verifica el CRC big-endian de una página: semilla 0xC0C1 sobre la página
 * completa desde su campo de tamaño. El cursor debe estar posicionado en el
 * CRC y queda tras él.
 */
function verifyPageCrc(
  cursor: BoundedByteCursor,
  pageStart: number,
  crcStart: number,
): void {
  const crc = cursor.readUint16BE();
  const computed = crc16Dwg(
    readBackSlice(cursor, pageStart, crcStart),
    AC1015_SECTION_CRC_SEED,
  );
  if (crc !== computed) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      crcStart,
      "The object-map page CRC does not match its contents.",
    );
  }
}

/**
 * Los dos topes que acotan el mapa son recuentos de entradas (una entrada =
 * un handle = un objeto), así que gobierna el MENOR. Se valida aquí porque un
 * límite roto sería un error del LLAMADOR, no del archivo, y debe sonar como
 * tal antes de tocar un solo byte.
 */
function resolveEntryCap(limits: DwgLimits): number {
  const { maxHandles, maxObjects } = limits;
  if (
    !Number.isSafeInteger(maxHandles) ||
    maxHandles < 1 ||
    !Number.isSafeInteger(maxObjects) ||
    maxObjects < 1
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The object-map limits must be positive safe integers.",
    );
  }
  return Math.min(maxHandles, maxObjects);
}

function assertCursor(cursor: BoundedByteCursor): void {
  if (!(cursor instanceof BoundedByteCursor)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Reading the object map requires a bounded byte cursor.",
    );
  }
}

/**
 * Relee un tramo YA RECORRIDO del cursor para el CRC sin retroceder el estado
 * del llamador (mismo patrón que los marcos de sección): el cursor acotado no
 * expone su buffer a propósito, así que se usa seek + readBytes y se restaura
 * la posición. El presupuesto cobra la relectura — el CRC no es gratis.
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
