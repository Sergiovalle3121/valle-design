/**
 * Cabecera de archivo y mapa de páginas del contenedor R2004
 * (AC1018/AC1024/AC1027/AC1032).
 *
 * La cabecera en claro ocupa 0x100 bytes: firma, byte de mantenimiento, campos
 * fijos, punteros informativos (preview, summary info, VBA), la constante
 * 0x00000080, el bloque cifrado de 0x6C bytes en 0x80 (r2004-crypto) y un
 * remate de 0x14 bytes copiado del flujo pseudoaleatorio (índices 0xEC–0xFF).
 * Tras ella el archivo es una sucesión de PÁGINAS; dos páginas de SISTEMA
 * — el mapa de páginas (tipo 0x41630E3B) y el mapa de secciones (0x4163003B) —
 * son el índice de todas las demás.
 *
 * Una página de sistema lleva 0x14 bytes de cabecera {tipo, tamaño
 * descomprimido, tamaño comprimido, método (2), checksum} y su payload
 * comprimido. El checksum es la suma Fletcher módulo 0xFFF1 en trozos de
 * 0x15B0 (ODS §4.2) en dos etapas: primero la cabecera con su campo a cero y
 * semilla 0, después los datos comprimidos con la primera etapa como semilla.
 * El mapa de páginas descomprimido es una lista de pares {número, tamaño}
 * — número negativo = hueco, con 16 bytes extra {parent, left, right, 0} — y
 * la dirección de cada página se acumula sumando tamaños desde 0x100.
 *
 * Hechos de ODA-ODS-DWG-5.4.1-PUBLIC §4.1–§4.4 (SOURCE_REGISTER), verificados
 * contra los 32 DWG reales de la familia: el CRC32 de la cabecera, los dos
 * checksums de las 6 páginas de sistema medidas, el remate 0xEC–0x100 y la
 * autoconsistencia del mapa (la página con el id del mapa aterriza EXACTAMENTE
 * en la dirección que declara la cabecera, y el recuento de páginas coincide
 * con el campo sectionPageAmount) cuadran 32/32.
 *
 * Reglas del laboratorio: fallo cerrado con el byte exacto del ARCHIVO,
 * presupuesto cobrado por el cursor acotado, topes de `DwgLimits` ANTES de
 * acumular. Implementación original (ADR-0007).
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import {
  assertNonNegativeSafeInteger,
  checkedAdd,
} from "../binary/checked-arithmetic.js";
import { throwDwgError, DwgParseError } from "../security/parse-error.js";
import type { DwgLimits } from "../api/limits.js";
import {
  decryptR2004HeaderBlock,
  r2004Keystream,
  R2004_ENCRYPTED_BLOCK_LENGTH,
  type R2004DecryptedHeader,
} from "./r2004-crypto.js";
import { decompressR2004 } from "./r2004-decompress.js";

/** Versiones DWG cuya capa de contenedor es la familia R2004. */
export const R2004_FAMILY_VERSIONS = [
  "AC1018",
  "AC1024",
  "AC1027",
  "AC1032",
] as const;

export type R2004VersionCode = (typeof R2004_FAMILY_VERSIONS)[number];

/** Longitud de la cabecera de archivo en claro. */
export const R2004_FILE_HEADER_LENGTH = 0x100;
/** Tipo de la página de sistema del MAPA DE PÁGINAS. */
export const R2004_SECTION_PAGE_MAP_TYPE = 0x41630e3b;
/** Tipo de la página de sistema del MAPA DE SECCIONES. */
export const R2004_SECTION_MAP_TYPE = 0x4163003b;
/** Longitud de la cabecera de una página de sistema. */
export const R2004_SYSTEM_PAGE_HEADER_LENGTH = 0x14;

/** Offset del bloque cifrado dentro de la cabecera. */
const ENCRYPTED_BLOCK_OFFSET = 0x80;
/** Offset del remate de flujo pseudoaleatorio que cierra la cabecera. */
const HEADER_TRAILER_OFFSET = 0xec;
/** Bytes extra que arrastra una entrada de hueco del mapa de páginas. */
const GAP_ENTRY_EXTRA_LENGTH = 16;

/**
 * Suma de comprobación de páginas R2004 (ODS §4.2): dos acumuladores Fletcher
 * módulo 0xFFF1 reducidos cada 0x15B0 bytes, sembrados con `seed` (palabra
 * baja y alta). Exportada porque páginas de sistema y de datos la comparten, y
 * el writer de una fase futura debe emitir EXACTAMENTE esta suma.
 */
export function r2004SectionPageChecksum(
  seed: number,
  bytes: Uint8Array,
): number {
  let sum1 = seed & 0xffff;
  let sum2 = seed >>> 16;
  let index = 0;
  let remaining = bytes.length;
  while (remaining !== 0) {
    const chunk = Math.min(0x15b0, remaining);
    remaining -= chunk;
    for (let step = 0; step < chunk; step += 1) {
      sum1 += bytes[index]!;
      sum2 += sum1;
      index += 1;
    }
    sum1 %= 0xfff1;
    sum2 %= 0xfff1;
  }
  return (((sum2 << 16) >>> 0) | (sum1 & 0xffff)) >>> 0;
}

/** Cabecera de archivo R2004 validada. */
export interface R2004FileHeader {
  readonly version: R2004VersionCode;
  readonly maintenanceVersion: number;
  /** Dirección de la página de preview (0 cuando no hay). */
  readonly previewAddress: number;
  /** Versión y mantenimiento de la aplicación escritora (informativos). */
  readonly applicationVersion: number;
  readonly applicationMaintenance: number;
  readonly codepage: number;
  /** Banderas de seguridad (0x01 cifra datos, 0x02 cifra propiedades…). */
  readonly securityFlags: number;
  readonly summaryInfoAddress: number;
  readonly vbaProjectAddress: number;
  /** Bloque cifrado ya descifrado y validado (magia + CRC32). */
  readonly header: R2004DecryptedHeader;
}

/**
 * Abre la cabecera R2004 de un archivo completo: firma de la familia, campos
 * fijos, bloque cifrado validado y remate del flujo pseudoaleatorio. El cursor
 * queda en 0x100, el primer byte de la primera página.
 */
export function parseR2004FileHeader(
  cursor: BoundedByteCursor,
): R2004FileHeader {
  assertCursor(cursor);
  if (cursor.position !== 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      cursor.position,
      "The R2004 file header starts at offset zero.",
    );
  }

  const signature = cursor.readBytes(6);
  let version: R2004VersionCode | null = null;
  for (const candidate of R2004_FAMILY_VERSIONS) {
    if (
      signature[0] === candidate.charCodeAt(0) &&
      signature[1] === candidate.charCodeAt(1) &&
      signature[2] === candidate.charCodeAt(2) &&
      signature[3] === candidate.charCodeAt(3) &&
      signature[4] === candidate.charCodeAt(4) &&
      signature[5] === candidate.charCodeAt(5)
    ) {
      version = candidate;
      break;
    }
  }
  if (version === null) {
    throwDwgError(
      "DWG_SIGNATURE_INVALID",
      "input",
      0,
      "The file does not carry an R2004-family signature this container opens.",
    );
  }

  // Cinco bytes reservados: se contabilizan, no se juzgan (escritores varían).
  cursor.skip(5);
  const maintenanceVersion = cursor.readUint8();
  const fixedByte = cursor.readUint8();
  if (fixedByte !== 0x00 && fixedByte !== 0x01 && fixedByte !== 0x03) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0x0c,
      "The fixed byte before the preview address must be 0x00, 0x01 or 0x03.",
    );
  }
  const previewAddress = cursor.readUint32LE();
  const applicationVersion = cursor.readUint8();
  const applicationMaintenance = cursor.readUint8();
  const codepage = cursor.readUint16LE();
  cursor.skip(3);
  const securityFlags = cursor.readUint32LE();
  cursor.skip(4); // long desconocido en 0x1C
  const summaryInfoAddress = cursor.readUint32LE();
  const vbaProjectAddress = cursor.readUint32LE();
  const eightyConstant = cursor.readUint32LE();
  if (eightyConstant !== 0x80) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      0x28,
      "The fixed 0x00000080 field of the R2004 file header is not in place.",
    );
  }
  // 0x2C–0x7F: la ODS los declara ceros pero las versiones 2010+ reales del
  // corpus llevan punteros propios ahí. Se contabilizan sin juzgarlos.
  cursor.seek(ENCRYPTED_BLOCK_OFFSET);
  const encrypted = cursor.readBytes(R2004_ENCRYPTED_BLOCK_LENGTH);
  const header = decryptBlockAt(encrypted, ENCRYPTED_BLOCK_OFFSET);

  // El remate 0xEC–0xFF es el flujo pseudoaleatorio en sus índices 0xEC–0xFF
  // (medición 32/32 del corpus): un remate ajeno delata cabecera corrupta.
  const trailerLength = R2004_FILE_HEADER_LENGTH - HEADER_TRAILER_OFFSET;
  const trailer = cursor.readBytes(trailerLength);
  const keystream = r2004Keystream(R2004_FILE_HEADER_LENGTH);
  for (let index = 0; index < trailerLength; index += 1) {
    if (trailer[index] !== keystream[HEADER_TRAILER_OFFSET + index]) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        HEADER_TRAILER_OFFSET + index,
        "The R2004 file-header trailer does not match the magic sequence.",
      );
    }
  }

  if (header.sectionPageMapAddress >= cursor.length) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      ENCRYPTED_BLOCK_OFFSET + 0x54,
      "The section page map address lands outside the file.",
    );
  }

  return Object.freeze({
    version,
    maintenanceVersion,
    previewAddress,
    applicationVersion,
    applicationMaintenance,
    codepage,
    securityFlags,
    summaryInfoAddress,
    vbaProjectAddress,
    header,
  });
}

/** Una página del mapa: número único, dirección absoluta y tamaño en disco. */
export interface R2004PageMapEntry {
  readonly pageNumber: number;
  readonly address: number;
  readonly size: number;
}

/** Payload descomprimido y verificado de una página de sistema. */
export interface R2004SystemPagePayload {
  readonly bytes: Uint8Array;
  /** Dirección de la página en el archivo, para trasladar errores. */
  readonly address: number;
}

/**
 * Lee y verifica una página de SISTEMA: tipo esperado, método de compresión,
 * checksum en dos etapas y descompresión exacta al tamaño declarado. El
 * cursor recibe el ARCHIVO ENTERO; los errores llevan el byte del archivo.
 */
export function readR2004SystemPage(
  cursor: BoundedByteCursor,
  address: number,
  expectedType: number,
  limits: DwgLimits,
): R2004SystemPagePayload {
  assertCursor(cursor);
  assertNonNegativeSafeInteger(address);
  cursor.seek(address);
  const header = cursor.readBytes(R2004_SYSTEM_PAGE_HEADER_LENGTH);
  const type = readUint32(header, 0);
  if (type !== expectedType) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      address,
      "A system page does not carry the section-map page type it should.",
    );
  }
  const decompressedSize = readUint32(header, 4);
  const compressedSize = readUint32(header, 8);
  const method = readUint32(header, 12);
  if (method !== 2) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      address + 12,
      "A system page declares a compression method other than 2.",
    );
  }
  const storedChecksum = readUint32(header, 16);
  const compressed = cursor.readBytes(compressedSize);

  // Dos etapas: cabecera con su campo a cero (semilla 0) y luego los datos
  // comprimidos con la primera suma como semilla (ODS §4.3; corpus 32/32).
  const zeroed = Uint8Array.from(header);
  zeroed[16] = 0;
  zeroed[17] = 0;
  zeroed[18] = 0;
  zeroed[19] = 0;
  const headerStage = r2004SectionPageChecksum(0, zeroed);
  if (r2004SectionPageChecksum(headerStage, compressed) !== storedChecksum) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      address + 16,
      "The system page checksum does not match its contents.",
    );
  }

  const bytes = decompressAt(
    compressed,
    decompressedSize,
    limits,
    address + R2004_SYSTEM_PAGE_HEADER_LENGTH,
  );
  return Object.freeze({ bytes, address });
}

/**
 * Lee el mapa de páginas completo: localiza su página de sistema con la
 * dirección de la cabecera descifrada, la descomprime y acumula direcciones
 * desde 0x100. Valida números únicos, tamaños con sentido, páginas dentro del
 * archivo, el tope `maxSections` y la autoconsistencia con la cabecera (la
 * página del propio mapa debe aterrizar donde la cabecera dijo).
 */
export function readR2004PageMap(
  cursor: BoundedByteCursor,
  fileHeader: R2004FileHeader,
  limits: DwgLimits,
): readonly R2004PageMapEntry[] {
  assertCursor(cursor);
  const { header } = fileHeader;
  const system = readR2004SystemPage(
    cursor,
    header.sectionPageMapAddress,
    R2004_SECTION_PAGE_MAP_TYPE,
    limits,
  );
  const map = system.bytes;
  const entries: R2004PageMapEntry[] = [];
  const seenNumbers = new Set<number>();
  let address = R2004_FILE_HEADER_LENGTH;
  let offset = 0;
  while (offset < map.length) {
    const entryOffset = system.address + R2004_SYSTEM_PAGE_HEADER_LENGTH;
    if (map.length - offset < 8) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        entryOffset,
        "The page map ends in the middle of a page entry.",
      );
    }
    const pageNumber = readInt32(map, offset);
    const size = readUint32(map, offset + 4);
    offset += 8;
    if (size === 0) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        entryOffset,
        "A page map entry declares a zero-byte page.",
      );
    }
    if (pageNumber < 0) {
      // Hueco: consume dirección y arrastra {parent, left, right, 0}.
      if (map.length - offset < GAP_ENTRY_EXTRA_LENGTH) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          entryOffset,
          "A page map gap entry is missing its tree fields.",
        );
      }
      offset += GAP_ENTRY_EXTRA_LENGTH;
      address = checkedAdd(address, size, entryOffset);
      continue;
    }
    if (pageNumber === 0 || seenNumbers.has(pageNumber)) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        entryOffset,
        "A page map entry repeats or nullifies a page number.",
      );
    }
    if (entries.length >= limits.maxSections) {
      throwDwgError(
        "DWG_FILE_LIMIT_EXCEEDED",
        "resource",
        entryOffset,
        "The page map exceeds the configured section limit.",
      );
    }
    const end = checkedAdd(address, size, entryOffset);
    if (end > cursor.length) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        entryOffset,
        "A page map entry extends outside the file.",
      );
    }
    seenNumbers.add(pageNumber);
    entries.push(Object.freeze({ pageNumber, address, size }));
    address = end;
  }

  if (entries.length !== header.sectionPageAmount) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      system.address,
      "The page map count disagrees with the decrypted header amount.",
    );
  }
  const self = entries.find(
    (entry) => entry.pageNumber === header.sectionPageMapId,
  );
  if (self === undefined || self.address !== header.sectionPageMapAddress) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      system.address,
      "The page map does not place itself where the header declares.",
    );
  }
  return Object.freeze(entries);
}

/** Resuelve un número de página, o falla cerrado con el offset del llamador. */
export function lookupR2004Page(
  pages: readonly R2004PageMapEntry[],
  pageNumber: number,
  errorOffset: number,
): R2004PageMapEntry {
  for (const page of pages) {
    if (page.pageNumber === pageNumber) return page;
  }
  throwDwgError(
    "DWG_STRUCTURE_CORRUPT",
    "input",
    errorOffset,
    "A referenced page number is not present in the page map.",
  );
}

/**
 * Descomprime trasladando los offsets RELATIVOS del decompresor al byte real
 * del archivo — mismo código, misma categoría, el byte verdadero.
 */
function decompressAt(
  compressed: Uint8Array,
  declaredSize: number,
  limits: DwgLimits,
  fileOffset: number,
): Uint8Array {
  try {
    return decompressR2004(compressed, declaredSize, limits);
  } catch (error) {
    throw translateError(error, fileOffset);
  }
}

/** Traslada el offset de un DwgParseError sumándole una base del archivo. */
export function translateError(error: unknown, base: number): unknown {
  if (error instanceof DwgParseError) {
    try {
      throwDwgError(
        error.detail.code,
        error.detail.category,
        checkedAdd(base, error.detail.offset, base),
        error.detail.message,
      );
    } catch (translated) {
      return translated;
    }
  }
  return error;
}

function decryptBlockAt(encrypted: Uint8Array, base: number) {
  try {
    return decryptR2004HeaderBlock(encrypted);
  } catch (error) {
    throw translateError(error, base);
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! +
    bytes[offset + 1]! * 0x100 +
    bytes[offset + 2]! * 0x1_0000 +
    bytes[offset + 3]! * 0x100_0000
  );
}

function readInt32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) |
    0
  );
}

function assertCursor(cursor: BoundedByteCursor): void {
  if (!(cursor instanceof BoundedByteCursor)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The R2004 container requires a bounded byte cursor.",
    );
  }
}
