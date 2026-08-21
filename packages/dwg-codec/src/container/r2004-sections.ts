/**
 * Mapa de secciones y ensamblado de payloads del contenedor R2004
 * (AC1018/AC1024/AC1027/AC1032).
 *
 * El mapa de secciones (página de sistema tipo 0x4163003B) descomprimido lleva
 * una cabecera {recuento, 0x02, tamaño de página, 0, desconocido} y por cada
 * sección: tamaño u64, recuento de páginas, tamaño máximo descomprimido por
 * página, un long desconocido, bandera de compresión (1 = no, 2 = sí), id de
 * sección, bandera de cifrado y un NOMBRE de 64 bytes terminado en NUL
 * ("AcDb:Header", "AcDb:Classes", "AcDb:Handles", "AcDb:AcDbObjects"…);
 * después, por página: {número, tamaño comprimido, offset de arranque u64}.
 *
 * Cada página de DATOS abre con 32 bytes cifrados con XOR de palabra
 * `0x4164536B ^ dirección` (ODS §4.6) que descifran a {tipo 0x4163043B,
 * número de sección, tamaño comprimido, tamaño de página en disco, offset de
 * arranque u64, checksum de cabecera, checksum de datos}.
 *
 * MEDICIONES first-party sobre los 32 DWG reales (41 páginas de datos
 * comprimidas y 25 sin comprimir) que corrigen la tabla de la ODS §4.6:
 *
 * - El campo +0x0C no es el "tamaño descomprimido": es el TAMAÑO DE LA PÁGINA
 *   EN DISCO (cabecera + datos + relleno), igual al del mapa de páginas en
 *   todas las páginas medidas. El tamaño descomprimido real de una página
 *   comprimida es EXACTAMENTE el `maxDecompressedSize` de su sección (0x7400
 *   en las grandes) — las 41 páginas producen ese valor exacto.
 * - El offset de arranque es u64 (+0x10 bajo, +0x14 alto, alto observado 0),
 *   el checksum de CABECERA viaja en +0x18 y el de DATOS en +0x1C — un campo
 *   más tarde de lo que la tabla ODS declara. El de datos es la suma R2004 de
 *   los bytes comprimidos con semilla 0; el de cabecera es la misma suma sobre
 *   los 32 bytes descifrados con su propio campo a cero y el checksum de datos
 *   como semilla. Con esa disposición cuadran 66/66; con la de la ODS, 0/66.
 *
 * El contenido lógico de la sección son sus primeros `size` bytes: cada página
 * aporta `min(producido, size − offset)` bytes en su offset y los huecos
 * quedan a cero (las "páginas cero" omitidas del archivo, ODS §4.5).
 *
 * Reglas del laboratorio: fallo cerrado con el byte del archivo, presupuesto
 * cobrado por el cursor, topes ANTES de reservar. Implementación original
 * (ADR-0007).
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import {
  checkedAdd,
  checkedMultiply,
} from "../binary/checked-arithmetic.js";
import { throwDwgError } from "../security/parse-error.js";
import type { DwgLimits } from "../api/limits.js";
import { decompressR2004 } from "./r2004-decompress.js";
import {
  lookupR2004Page,
  r2004SectionPageChecksum,
  readR2004SystemPage,
  translateError,
  R2004_SECTION_MAP_TYPE,
  R2004_SYSTEM_PAGE_HEADER_LENGTH,
  type R2004FileHeader,
  type R2004PageMapEntry,
} from "./r2004-pages.js";

/** Tipo de toda página de datos de sección. */
export const R2004_DATA_PAGE_TYPE = 0x4163043b;
/** Longitud de la cabecera cifrada de una página de datos. */
export const R2004_DATA_PAGE_HEADER_LENGTH = 0x20;
/** Palabra base de la máscara XOR de las cabeceras de página de datos. */
export const R2004_DATA_PAGE_XOR_BASE = 0x4164536b;
/** Longitud fija del campo de nombre de una sección. */
export const R2004_SECTION_NAME_LENGTH = 64;

/** Los cuatro nombres que el lector de bases de datos necesita localizar. */
export const R2004_CORE_SECTION_NAMES = [
  "AcDb:Header",
  "AcDb:Classes",
  "AcDb:Handles",
  "AcDb:AcDbObjects",
] as const;

/** Una página de una sección, tal como la declara el mapa de secciones. */
export interface R2004SectionPage {
  /** Número de página, a resolver en el mapa de páginas. */
  readonly pageNumber: number;
  /** Tamaño comprimido de los datos de la página. */
  readonly compressedSize: number;
  /** Offset de arranque dentro del buffer descomprimido de la sección. */
  readonly startOffset: number;
}

/** Una sección con nombre del mapa de secciones. */
export interface R2004Section {
  /** Nombre NUL-terminado del campo de 64 bytes ("" en la sección vacía). */
  readonly name: string;
  /** Tamaño lógico total de la sección en bytes descomprimidos. */
  readonly size: number;
  readonly pageCount: number;
  /** Tamaño descomprimido EXACTO de cada página comprimida de la sección. */
  readonly maxDecompressedSize: number;
  /** Bandera de compresión: 1 = sin comprimir, 2 = comprimida. */
  readonly compression: number;
  readonly sectionId: number;
  /** Bandera de cifrado declarada (0 = no, 1 = sí, 2 = desconocido). */
  readonly encryption: number;
  readonly pages: readonly R2004SectionPage[];
}

/**
 * Lee el mapa de secciones completo: resuelve su página con el id de la
 * cabecera descifrada, verifica la página de sistema y decodifica todas las
 * descripciones con sus páginas. El consumo debe cuadrar EXACTAMENTE con el
 * payload descomprimido; sobras o cortes son corrupción.
 */
export function readR2004SectionMap(
  cursor: BoundedByteCursor,
  fileHeader: R2004FileHeader,
  pages: readonly R2004PageMapEntry[],
  limits: DwgLimits,
): readonly R2004Section[] {
  const mapPage = lookupR2004Page(
    pages,
    fileHeader.header.sectionMapId,
    fileHeader.header.sectionPageMapAddress,
  );
  const system = readR2004SystemPage(
    cursor,
    mapPage.address,
    R2004_SECTION_MAP_TYPE,
    limits,
  );
  const map = system.bytes;
  const base = system.address + R2004_SYSTEM_PAGE_HEADER_LENGTH;
  const need = (offset: number, length: number): void => {
    if (map.length - offset < length) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        base,
        "The section map ends in the middle of a declared field.",
      );
    }
  };

  need(0, 0x14);
  const descriptionCount = readUint32(map, 0);
  if (descriptionCount > limits.maxSections) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      base,
      "The section map exceeds the configured section limit.",
    );
  }
  if (readUint32(map, 4) !== 0x02) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      base + 4,
      "The fixed 0x02 field of the section map header is not in place.",
    );
  }

  const sections: R2004Section[] = [];
  let offset = 0x14;
  for (let index = 0; index < descriptionCount; index += 1) {
    need(offset, 0x60);
    const size = readUint64(map, offset, base);
    const pageCount = readUint32(map, offset + 0x08);
    const maxDecompressedSize = readUint32(map, offset + 0x0c);
    const compression = readUint32(map, offset + 0x14);
    const sectionId = readUint32(map, offset + 0x18);
    const encryption = readUint32(map, offset + 0x1c);
    if (size > limits.maxExpandedBytes) {
      throwDwgError(
        "DWG_FILE_LIMIT_EXCEEDED",
        "resource",
        base + offset,
        "A section declares more bytes than the expansion budget allows.",
      );
    }
    if (compression !== 1 && compression !== 2) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        base + offset + 0x14,
        "A section declares a compression flag other than 1 or 2.",
      );
    }
    if (pageCount > limits.maxSections) {
      throwDwgError(
        "DWG_FILE_LIMIT_EXCEEDED",
        "resource",
        base + offset + 0x08,
        "A section declares more pages than the configured section limit.",
      );
    }
    if (pageCount > 0 && (maxDecompressedSize === 0 ||
      maxDecompressedSize > limits.maxExpandedBytes)) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        base + offset + 0x0c,
        "A section page size is zero or exceeds the expansion budget.",
      );
    }
    const name = readSectionName(map, offset + 0x20, base + offset + 0x20);
    offset += 0x60;

    const sectionPages: R2004SectionPage[] = [];
    for (let page = 0; page < pageCount; page += 1) {
      need(offset, 16);
      sectionPages.push(
        Object.freeze({
          pageNumber: readUint32(map, offset),
          compressedSize: readUint32(map, offset + 4),
          startOffset: readUint64(map, offset + 8, base + offset + 8),
        }),
      );
      offset += 16;
    }
    sections.push(
      Object.freeze({
        name,
        size,
        pageCount,
        maxDecompressedSize,
        compression,
        sectionId,
        encryption,
        pages: Object.freeze(sectionPages),
      }),
    );
  }
  if (offset !== map.length) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      base + offset,
      "Trailing bytes after the last section description are not accepted.",
    );
  }
  return Object.freeze(sections);
}

/** Busca una sección por nombre exacto; null si el mapa no la lleva. */
export function findR2004Section(
  sections: readonly R2004Section[],
  name: string,
): R2004Section | null {
  for (const section of sections) {
    if (section.name === name) return section;
  }
  return null;
}

/**
 * Ensambla el payload COMPLETO de una sección: resuelve cada página en el
 * mapa, descifra y valida su cabecera (tipo, sección, tamaños, offset y los
 * dos checksums), descomprime si procede y coloca los bytes en su offset.
 * Los huecos no cubiertos quedan a cero (páginas cero omitidas del archivo).
 */
export function readR2004SectionPayload(
  cursor: BoundedByteCursor,
  section: R2004Section,
  pages: readonly R2004PageMapEntry[],
  limits: DwgLimits,
): Uint8Array {
  if (section.encryption === 1) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "Encrypted R2004 sections are outside this laboratory decoder.",
    );
  }
  if (section.size > limits.maxExpandedBytes) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "The section payload exceeds the expansion budget.",
    );
  }
  const payload = new Uint8Array(section.size);
  for (const page of section.pages) {
    const entry = lookupR2004Page(pages, page.pageNumber, 0);
    if (page.startOffset >= section.size) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        entry.address,
        "A section page starts at or beyond the section size.",
      );
    }
    const chunk = readDataPage(cursor, entry, section, page, limits);
    const logicalLength = Math.min(
      chunk.length,
      section.size - page.startOffset,
    );
    payload.set(chunk.subarray(0, logicalLength), page.startOffset);
  }
  return payload;
}

/**
 * Lee, descifra y valida UNA página de datos, devolviendo sus bytes
 * descomprimidos (o crudos si la sección no comprime). Todo desacuerdo entre
 * la cabecera de la página y el mapa de secciones falla cerrado.
 */
function readDataPage(
  cursor: BoundedByteCursor,
  entry: R2004PageMapEntry,
  section: R2004Section,
  page: R2004SectionPage,
  limits: DwgLimits,
): Uint8Array {
  if (entry.size < R2004_DATA_PAGE_HEADER_LENGTH) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address,
      "A data page is smaller than its own encrypted header.",
    );
  }
  cursor.seek(entry.address);
  const raw = cursor.readBytes(R2004_DATA_PAGE_HEADER_LENGTH);
  const mask = (R2004_DATA_PAGE_XOR_BASE ^ entry.address) >>> 0;
  const header = new Uint8Array(R2004_DATA_PAGE_HEADER_LENGTH);
  for (let index = 0; index < R2004_DATA_PAGE_HEADER_LENGTH; index += 4) {
    const value = (readUint32(raw, index) ^ mask) >>> 0;
    header[index] = value & 0xff;
    header[index + 1] = (value >>> 8) & 0xff;
    header[index + 2] = (value >>> 16) & 0xff;
    header[index + 3] = (value >>> 24) & 0xff;
  }

  if (readUint32(header, 0) !== R2004_DATA_PAGE_TYPE) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address,
      "A data page does not carry the data-page type after decryption.",
    );
  }
  if (readUint32(header, 4) !== section.sectionId) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address + 4,
      "A data page belongs to a section other than the one that lists it.",
    );
  }
  const compressedSize = readUint32(header, 8);
  if (compressedSize !== page.compressedSize) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address + 8,
      "A data page compressed size disagrees with the section map.",
    );
  }
  if (
    checkedAdd(R2004_DATA_PAGE_HEADER_LENGTH, compressedSize, entry.address) >
    entry.size
  ) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address + 8,
      "A data page declares more compressed bytes than the page holds.",
    );
  }
  if (readUint32(header, 12) !== entry.size) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address + 12,
      "A data page on-disk size disagrees with the page map.",
    );
  }
  const startOffset = readUint64(header, 16, entry.address + 16);
  if (startOffset !== page.startOffset) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address + 16,
      "A data page start offset disagrees with the section map.",
    );
  }

  const data = cursor.readBytes(compressedSize);
  // Checksums medidos en corpus: datos con semilla 0 en +0x1C, y cabecera con
  // su campo +0x18 a cero y el checksum de datos como semilla en +0x18.
  const dataChecksum = r2004SectionPageChecksum(0, data);
  if (readUint32(header, 28) !== dataChecksum) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address + 28,
      "The data page data checksum does not match its compressed bytes.",
    );
  }
  const zeroed = Uint8Array.from(header);
  zeroed[24] = 0;
  zeroed[25] = 0;
  zeroed[26] = 0;
  zeroed[27] = 0;
  if (
    readUint32(header, 24) !== r2004SectionPageChecksum(dataChecksum, zeroed)
  ) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      entry.address + 24,
      "The data page header checksum does not match its decrypted header.",
    );
  }

  if (section.compression !== 2) return data;
  try {
    return decompressR2004(data, section.maxDecompressedSize, limits);
  } catch (error) {
    throw translateError(
      error,
      entry.address + R2004_DATA_PAGE_HEADER_LENGTH,
    );
  }
}

/**
 * Nombre de sección: campo fijo de 64 bytes, se corta en el primer NUL y se
 * exige ASCII imprimible — un nombre con bytes de control sería un mapa
 * corrupto hablando en otro idioma.
 */
function readSectionName(
  map: Uint8Array,
  offset: number,
  errorOffset: number,
): string {
  let name = "";
  for (let index = 0; index < R2004_SECTION_NAME_LENGTH; index += 1) {
    const byte = map[offset + index]!;
    if (byte === 0) break;
    if (byte < 0x20 || byte > 0x7e) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        errorOffset + index,
        "A section name carries bytes outside printable ASCII.",
      );
    }
    name += String.fromCharCode(byte);
  }
  return name;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! +
    bytes[offset + 1]! * 0x100 +
    bytes[offset + 2]! * 0x1_0000 +
    bytes[offset + 3]! * 0x100_0000
  );
}

function readUint64(
  bytes: Uint8Array,
  offset: number,
  errorOffset: number,
): number {
  const low = readUint32(bytes, offset);
  const high = readUint32(bytes, offset + 4);
  return checkedAdd(
    checkedMultiply(high, 0x1_0000_0000, errorOffset),
    low,
    errorOffset,
  );
}
