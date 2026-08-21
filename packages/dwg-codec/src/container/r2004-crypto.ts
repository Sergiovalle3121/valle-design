/**
 * Criptografía del contenedor de la familia R2004 (AC1018/AC1024/AC1027/AC1032).
 *
 * La cabecera de archivo R2004 guarda en 0x80 un bloque de 0x6C bytes CIFRADOS
 * con un XOR pseudoaleatorio. El generador es el congruencial
 * `seed = seed * 0x343FD + 0x269EC3` con semilla inicial 1, y cada byte del
 * flujo es `(seed >> 16) & 0xFF`. El bloque descifrado abre con la cadena de
 * identificación "AcFssFcAJMB" y cierra con un CRC32 (semilla 0, tabla
 * reflejada estándar) calculado sobre los 0x6C bytes con el campo CRC a cero.
 *
 * Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (§4.1, §2.14.2 — SOURCE_REGISTER) y
 * mediciones first-party sobre los 32 DWG reales de la familia (bundles
 * valle.fundacional.ac1018/ac1024/ac1027/ac1032.001 del corpus admitido):
 *
 * - El byte del flujo es `(seed >> 16) & 0xFF` — los 8 bits BAJOS de la
 *   palabra ALTA. El resumen previo del registro decía "los 8 bits altos de la
 *   palabra baja" (bits 8–15): DESMENTIDO por corpus — con bits 16–23 la magia
 *   "AcFssFcAJMB" aparece en los 32 archivos; con bits 8–15 sale ruido.
 * - El generador reproduce byte a byte el prefijo de la secuencia mágica que
 *   publica la ODS, y los 0x14 bytes en claro 0xEC–0x100 de los 32 archivos
 *   coinciden con los índices 0xEC–0xFF del mismo flujo.
 * - El CRC32 con el campo a cero cuadra con el guardado en los 32 archivos.
 *
 * Reglas del laboratorio: fallo cerrado (magia torcida, campos fijos ajenos o
 * CRC que no cuadra → error tipado con su byte, relativo al bloque), y una
 * sola fuente de verdad (el writer de una fase futura cifrará con ESTE mismo
 * generador). Implementación original desde hechos registrados (ADR-0007).
 */
import {
  assertNonNegativeSafeInteger,
  checkedAdd,
  checkedMultiply,
} from "../binary/checked-arithmetic.js";
import { throwDwgError } from "../security/parse-error.js";

/** Longitud fija del bloque cifrado de la cabecera R2004. */
export const R2004_ENCRYPTED_BLOCK_LENGTH = 0x6c;

/**
 * Cadena de identificación del bloque descifrado, en ASCII con su terminador:
 * "AcFssFcAJMB\0" (hecho registrado, confirmado en los 32 archivos reales).
 */
export const R2004_HEADER_MAGIC = [
  0x41, 0x63, 0x46, 0x73, 0x73, 0x46, 0x63, 0x41, 0x4a, 0x4d, 0x42, 0x00,
] as const;

/** Offset del CRC32 dentro del bloque descifrado. */
const CRC_OFFSET = 0x68;
/** Campo fijo 0x6C en +0x10 del bloque descifrado. */
const HEADER_SIZE_OFFSET = 0x10;
/** Campo fijo 0x04 en +0x14 del bloque descifrado. */
const FIXED_FOUR_OFFSET = 0x14;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

/**
 * CRC32 reflejado estándar (polinomio 0xEDB88320): `~semilla` de arranque e
 * inversión final. Con semilla 0 coincide con el CRC-32 clásico; la ODS §2.14.2
 * lo define así para R2004+ y el corpus lo confirma.
 */
export function crc32R2004(bytes: Uint8Array, seed: number): number {
  let crc = ~seed >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[index]!) & 0xff]!;
  }
  return ~crc >>> 0;
}

/**
 * Genera `length` bytes del flujo pseudoaleatorio R2004. El mismo flujo cifra
 * la cabecera (índices 0–0x6B), rellena los 0x14 bytes finales de la cabecera
 * de archivo (índices 0xEC–0xFF) y el hueco entre páginas — por eso se expone
 * entero en vez de un descifrador opaco: lector, writer y specs comparten el
 * generador o fallan juntos.
 */
export function r2004Keystream(length: number): Uint8Array {
  assertNonNegativeSafeInteger(length);
  const out = new Uint8Array(length);
  let seed = 1;
  for (let index = 0; index < length; index += 1) {
    seed = (Math.imul(seed, 0x343fd) + 0x269ec3) >>> 0;
    out[index] = (seed >>> 16) & 0xff;
  }
  return out;
}

/** Bloque descifrado y validado de la cabecera R2004. */
export interface R2004DecryptedHeader {
  /** Puntero raíz del árbol de huecos. */
  readonly rootTreeNodeGap: number;
  /** Puntero al hueco más bajo por la izquierda. */
  readonly lowermostLeftGap: number;
  /** Puntero al hueco más bajo por la derecha. */
  readonly lowermostRightGap: number;
  /** Id de la última página de sección. */
  readonly lastSectionPageId: number;
  /** Dirección de fin de la última página de sección (u64 declarado). */
  readonly lastSectionPageEndAddress: number;
  /** Dirección de la copia de esta cabecera al final del archivo (u64). */
  readonly secondHeaderAddress: number;
  /** Recuento de huecos. */
  readonly gapAmount: number;
  /** Recuento de páginas de sección (sin contar huecos). */
  readonly sectionPageAmount: number;
  /** Número de página del MAPA DE PÁGINAS de sección. */
  readonly sectionPageMapId: number;
  /** Dirección ABSOLUTA del mapa de páginas (el archivo guarda valor−0x100). */
  readonly sectionPageMapAddress: number;
  /** Número de página del MAPA DE SECCIONES, a resolver en el mapa de páginas. */
  readonly sectionMapId: number;
  /** Tamaño del array de páginas de sección. */
  readonly sectionPageArraySize: number;
  /** Tamaño del array de huecos. */
  readonly gapArraySize: number;
  /** CRC32 leído del bloque, ya verificado contra el calculado. */
  readonly crc: number;
}

/**
 * Descifra y valida el bloque de 0x6C bytes de la cabecera R2004.
 *
 * Recibe EXACTAMENTE los 0x6C bytes cifrados que viajan en 0x80; los offsets
 * de sus errores son relativos al bloque (el llamador que conozca la posición
 * en el archivo los traslada). Fallo cerrado: magia equivocada, campos fijos
 * ajenos o CRC32 que no cuadra → error tipado; jamás una cabecera "a medias".
 */
export function decryptR2004HeaderBlock(
  bytes: Uint8Array,
): R2004DecryptedHeader {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== R2004_ENCRYPTED_BLOCK_LENGTH
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The R2004 encrypted header block must be exactly 0x6C bytes.",
    );
  }

  const keystream = r2004Keystream(R2004_ENCRYPTED_BLOCK_LENGTH);
  const plain = new Uint8Array(R2004_ENCRYPTED_BLOCK_LENGTH);
  for (let index = 0; index < R2004_ENCRYPTED_BLOCK_LENGTH; index += 1) {
    plain[index] = bytes[index]! ^ keystream[index]!;
  }

  for (let index = 0; index < R2004_HEADER_MAGIC.length; index += 1) {
    if (plain[index] !== R2004_HEADER_MAGIC[index]) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        index,
        "The decrypted R2004 header does not carry the AcFssFcAJMB id string.",
      );
    }
  }
  if (readUint32(plain, HEADER_SIZE_OFFSET) !== R2004_ENCRYPTED_BLOCK_LENGTH) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      HEADER_SIZE_OFFSET,
      "The decrypted R2004 header size field must be 0x6C.",
    );
  }
  if (readUint32(plain, FIXED_FOUR_OFFSET) !== 0x04) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      FIXED_FOUR_OFFSET,
      "The fixed 0x04 field of the decrypted R2004 header is not in place.",
    );
  }

  // El CRC32 cubre los 0x6C bytes con su propio campo a cero (semilla 0).
  const crc = readUint32(plain, CRC_OFFSET);
  const zeroed = Uint8Array.from(plain);
  zeroed[CRC_OFFSET] = 0;
  zeroed[CRC_OFFSET + 1] = 0;
  zeroed[CRC_OFFSET + 2] = 0;
  zeroed[CRC_OFFSET + 3] = 0;
  if (crc32R2004(zeroed, 0) !== crc) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      CRC_OFFSET,
      "The R2004 header CRC32 does not match its decrypted contents.",
    );
  }

  return Object.freeze({
    rootTreeNodeGap: readUint32(plain, 0x18),
    lowermostLeftGap: readUint32(plain, 0x1c),
    lowermostRightGap: readUint32(plain, 0x20),
    lastSectionPageId: readUint32(plain, 0x28),
    lastSectionPageEndAddress: readUint64(plain, 0x2c),
    secondHeaderAddress: readUint64(plain, 0x34),
    gapAmount: readUint32(plain, 0x3c),
    sectionPageAmount: readUint32(plain, 0x40),
    sectionPageMapId: readUint32(plain, 0x50),
    sectionPageMapAddress: checkedAdd(readUint64(plain, 0x54), 0x100, 0x54),
    sectionMapId: readUint32(plain, 0x5c),
    sectionPageArraySize: readUint32(plain, 0x60),
    gapArraySize: readUint32(plain, 0x64),
    crc,
  });
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! +
    bytes[offset + 1]! * 0x100 +
    bytes[offset + 2]! * 0x1_0000 +
    bytes[offset + 3]! * 0x100_0000
  );
}

/**
 * Entero de 64 bits little-endian dentro del bloque ya copiado. La parte alta
 * pasa por la aritmética comprobada: un valor fuera del rango seguro de JS es
 * corrupción declarada, no una pérdida de precisión silenciosa.
 */
function readUint64(bytes: Uint8Array, offset: number): number {
  const low = readUint32(bytes, offset);
  const high = readUint32(bytes, offset + 4);
  return checkedAdd(
    checkedMultiply(high, 0x1_0000_0000, offset),
    low,
    offset,
  );
}
