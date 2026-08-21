/**
 * Spec del contenedor R2004: criptografía, descompresión LZ77 y mapas.
 *
 * Los vectores de descifrado se anclan a la RESPUESTA CONOCIDA independiente
 * que publica la ODS (el prefijo de la secuencia mágica) y al CRC-32/ISO-HDLC
 * de "123456789"; los de descompresión se construyen opcode a opcode A MANO.
 * Para los mapas, un contenedor sintético mínimo cuyos payloads comprime un
 * compresor TRIVIAL de tiradas literales que el decompresor real acepta; cada
 * gemelo triste tuerce el byte o el campo exacto de esos mismos bytes.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createDwgLimits } from "../../src/api/limits.js";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import {
  crc32R2004,
  decryptR2004HeaderBlock,
  r2004Keystream,
  R2004_ENCRYPTED_BLOCK_LENGTH,
  R2004_HEADER_MAGIC,
} from "../../src/container/r2004-crypto.js";
import { decompressR2004 } from "../../src/container/r2004-decompress.js";
import {
  parseR2004FileHeader,
  readR2004PageMap,
  r2004SectionPageChecksum,
  R2004_FILE_HEADER_LENGTH,
  R2004_SECTION_MAP_TYPE,
  R2004_SECTION_PAGE_MAP_TYPE,
} from "../../src/container/r2004-pages.js";
import {
  findR2004Section,
  readR2004SectionMap,
  readR2004SectionPayload,
  R2004_DATA_PAGE_TYPE,
  R2004_DATA_PAGE_XOR_BASE,
} from "../../src/container/r2004-sections.js";
import { ascii, assertDwgError } from "../support/assert.js";

const LIMITS = createDwgLimits();

/**
 * Prefijo de la secuencia mágica publicado por la ODS §4.1 (hecho registrado
 * en SOURCE_REGISTER): respuesta conocida INDEPENDIENTE del generador.
 */
const PUBLISHED_KEYSTREAM_PREFIX = [
  0x29, 0x23, 0xbe, 0x84, 0xe1, 0x6c, 0xd6, 0xae, 0x52, 0x90, 0x49, 0xf1,
  0xf1, 0xbb, 0xe9, 0xeb, 0xb3, 0xa6, 0xdb, 0x3c, 0x87, 0x0c, 0x3e, 0x99,
  0x24, 0x5e, 0x0d, 0x1c, 0x06, 0xb7, 0x47, 0xde, 0xb3, 0x12, 0x4d, 0xc8,
  0x43, 0xbb, 0x8b, 0xa6, 0x1f, 0x03, 0x5a, 0x7d, 0x09, 0x38, 0x25, 0x1f,
  0x5d, 0xd4, 0xcb, 0xfc, 0x96, 0xf5, 0x45, 0x3b, 0x13, 0x0d, 0x89, 0x0a,
  0x1c, 0xdb, 0xae, 0x32, 0x20, 0x9a, 0x50, 0xee, 0x40, 0x78, 0x36, 0xfd,
  0x12, 0x49, 0x32, 0xf6, 0x9e, 0x7d, 0x49, 0xdc, 0xad, 0x4f, 0x14, 0xf2,
  0x44, 0x40, 0x66, 0xd0, 0x6b, 0xc4, 0x30, 0xb7,
];

function pushUint16LE(into: number[], value: number): void {
  into.push(value & 0xff, (value >> 8) & 0xff);
}

function pushUint32LE(into: number[], value: number): void {
  into.push(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  );
}

function pushUint64LE(into: number[], value: number): void {
  pushUint32LE(into, value % 0x1_0000_0000);
  pushUint32LE(into, Math.floor(value / 0x1_0000_0000));
}

function patchUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

/**
 * Compresor TRIVIAL: una única tirada literal (corta, 0x0F exacta o larga) y
 * el terminador con sus dos bytes. Es la forma más simple que el decompresor
 * real acepta; los fixtures de mapas se comprimen con esto.
 */
function trivialCompress(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  const length = bytes.length;
  if (length !== 0) {
    assert.ok(length >= 4, "el compresor trivial pide tiradas de 4+ bytes");
    if (length <= 0x12) {
      out.push(length - 3);
    } else {
      out.push(0x00);
      let remainder = length - 0x12;
      while (remainder > 0xff) {
        out.push(0x00);
        remainder -= 0xff;
      }
      out.push(remainder);
    }
    for (const byte of bytes) out.push(byte);
  }
  out.push(0x11, 0x00, 0x00);
  return Uint8Array.from(out);
}

function decompress(stream: number[], declared: number): Uint8Array {
  return decompressR2004(Uint8Array.from(stream), declared, LIMITS);
}

const alignTo32 = (value: number) => Math.ceil(value / 0x20) * 0x20;

/** Página de SISTEMA: cabecera 0x14 con checksum en dos etapas + payload. */
function buildSystemPage(type: number, payload: Uint8Array): Uint8Array {
  const compressed = trivialCompress(payload);
  const header: number[] = [];
  pushUint32LE(header, type);
  pushUint32LE(header, payload.length);
  pushUint32LE(header, compressed.length);
  pushUint32LE(header, 2);
  pushUint32LE(header, 0);
  const stage = r2004SectionPageChecksum(0, Uint8Array.from(header));
  const checksum = r2004SectionPageChecksum(stage, compressed);
  const bytes = new Uint8Array(alignTo32(header.length + compressed.length));
  bytes.set(Uint8Array.from(header), 0);
  patchUint32LE(bytes, 16, checksum);
  bytes.set(compressed, header.length);
  return bytes;
}

/** Página de DATOS: cabecera de 32 bytes cifrada con su máscara + payload. */
function buildDataPage(
  address: number,
  sectionId: number,
  decompressed: Uint8Array,
  startOffset: number,
): Uint8Array {
  const compressed = trivialCompress(decompressed);
  const rawSize = alignTo32(0x20 + compressed.length);
  const header: number[] = [];
  pushUint32LE(header, R2004_DATA_PAGE_TYPE);
  pushUint32LE(header, sectionId);
  pushUint32LE(header, compressed.length);
  pushUint32LE(header, rawSize);
  pushUint64LE(header, startOffset);
  pushUint32LE(header, 0); // checksum de cabecera, se parchea después
  pushUint32LE(header, 0); // checksum de datos, se parchea después
  const headerBytes = Uint8Array.from(header);
  const dataChecksum = r2004SectionPageChecksum(0, compressed);
  patchUint32LE(headerBytes, 28, dataChecksum);
  patchUint32LE(headerBytes, 24, 0);
  const headerChecksum = r2004SectionPageChecksum(dataChecksum, headerBytes);
  patchUint32LE(headerBytes, 24, headerChecksum);
  const mask = (R2004_DATA_PAGE_XOR_BASE ^ address) >>> 0;
  const bytes = new Uint8Array(rawSize);
  for (let index = 0; index < 0x20; index += 4) {
    const word =
      (headerBytes[index]! +
        headerBytes[index + 1]! * 0x100 +
        headerBytes[index + 2]! * 0x1_0000 +
        headerBytes[index + 3]! * 0x100_0000) ^
      mask;
    patchUint32LE(bytes, index, word >>> 0);
  }
  bytes.set(compressed, 0x20);
  return bytes;
}

interface ContainerOverrides {
  readonly signature?: string;
  readonly fixedByte?: number;
  readonly eightyConstant?: number;
  readonly sectionPageAmount?: number;
  readonly pageMapPayload?: Uint8Array;
  readonly sectionMapPayload?: Uint8Array;
  readonly encryption?: number;
  readonly pageEntryNumber?: number;
  readonly pageEntryCompressedSize?: number;
  readonly pageEntryStart?: number;
  readonly gapBeforeData?: number;
  readonly sectionMapTrailer?: readonly number[];
}

interface BuiltContainer {
  readonly bytes: Uint8Array;
  readonly content: Uint8Array;
  readonly dataPageAddress: number;
  readonly dataCompressedLength: number;
  readonly sectionMapAddress: number;
  readonly pageMapAddress: number;
}

const SECTION_SIZE = 0x28;
const MAX_DECOMPRESSED = 0x40;

/**
 * Contenedor sintético mínimo: cabecera de 0x100 bytes, una página de datos
 * de la sección AcDb:Header (página 1), el mapa de secciones (página 2) y el
 * mapa de páginas (página 3), con hueco opcional delante de la página de
 * datos. Cada override tuerce UN campo para su gemelo triste.
 */
function buildContainer(overrides: ContainerOverrides = {}): BuiltContainer {
  const content = Uint8Array.from(
    { length: SECTION_SIZE },
    (_, index) => (index * 7 + 1) & 0xff,
  );
  const pageDecompressed = new Uint8Array(MAX_DECOMPRESSED);
  pageDecompressed.set(content, 0);

  const gap = overrides.gapBeforeData ?? 0;
  const dataPageAddress = R2004_FILE_HEADER_LENGTH + gap;
  const dataPage = buildDataPage(dataPageAddress, 1, pageDecompressed, 0);
  const dataCompressedLength = trivialCompress(pageDecompressed).length;

  // Mapa de secciones: cabecera fija + una descripción con su página.
  const sectionMap: number[] = [];
  pushUint32LE(sectionMap, 1);
  pushUint32LE(sectionMap, 0x02);
  pushUint32LE(sectionMap, 0x7400);
  pushUint32LE(sectionMap, 0);
  pushUint32LE(sectionMap, 1);
  pushUint64LE(sectionMap, SECTION_SIZE);
  pushUint32LE(sectionMap, 1);
  pushUint32LE(sectionMap, MAX_DECOMPRESSED);
  pushUint32LE(sectionMap, 0);
  pushUint32LE(sectionMap, 2);
  pushUint32LE(sectionMap, 1);
  pushUint32LE(sectionMap, overrides.encryption ?? 0);
  const name = ascii("AcDb:Header");
  for (let index = 0; index < 64; index += 1) {
    sectionMap.push(index < name.length ? name[index]! : 0);
  }
  pushUint32LE(sectionMap, overrides.pageEntryNumber ?? 1);
  pushUint32LE(
    sectionMap,
    overrides.pageEntryCompressedSize ?? dataCompressedLength,
  );
  pushUint64LE(sectionMap, overrides.pageEntryStart ?? 0);
  sectionMap.push(...(overrides.sectionMapTrailer ?? []));
  const sectionMapPayload =
    overrides.sectionMapPayload ?? Uint8Array.from(sectionMap);
  const sectionMapPage = buildSystemPage(
    R2004_SECTION_MAP_TYPE,
    sectionMapPayload,
  );
  const sectionMapAddress = dataPageAddress + dataPage.length;

  // Mapa de páginas: hueco opcional + las tres páginas en orden de archivo.
  const pageMapAddress = sectionMapAddress + sectionMapPage.length;
  const pairs: number[] = [];
  if (gap > 0) {
    pushUint32LE(pairs, -9 >>> 0);
    pushUint32LE(pairs, gap);
    pushUint32LE(pairs, 0);
    pushUint32LE(pairs, 0);
    pushUint32LE(pairs, 0);
    pushUint32LE(pairs, 0);
  }
  pushUint32LE(pairs, 1);
  pushUint32LE(pairs, dataPage.length);
  pushUint32LE(pairs, 2);
  pushUint32LE(pairs, sectionMapPage.length);
  pushUint32LE(pairs, 3);
  // El tamaño de la página del propio mapa depende de su payload comprimido:
  // el payload es de longitud fija, así que se calcula con un ensayo previo.
  const probeSize = buildSystemPage(
    R2004_SECTION_PAGE_MAP_TYPE,
    Uint8Array.from([...pairs, 0, 0, 0, 0]),
  ).length;
  pushUint32LE(pairs, probeSize);
  const pageMapPayload = overrides.pageMapPayload ?? Uint8Array.from(pairs);
  const pageMapPage = buildSystemPage(
    R2004_SECTION_PAGE_MAP_TYPE,
    pageMapPayload,
  );
  assert.equal(pageMapPage.length, probeSize);
  const fileEnd = pageMapAddress + pageMapPage.length;

  // Bloque cifrado: campos fijos, ids y direcciones, CRC32 con el campo a 0.
  const plain: number[] = [...R2004_HEADER_MAGIC];
  pushUint32LE(plain, 0);
  pushUint32LE(plain, R2004_ENCRYPTED_BLOCK_LENGTH);
  pushUint32LE(plain, 0x04);
  pushUint32LE(plain, 0);
  pushUint32LE(plain, 0);
  pushUint32LE(plain, 0);
  pushUint32LE(plain, 1);
  pushUint32LE(plain, 3);
  pushUint64LE(plain, fileEnd - 0x100);
  pushUint64LE(plain, fileEnd);
  pushUint32LE(plain, gap > 0 ? 1 : 0);
  pushUint32LE(plain, overrides.sectionPageAmount ?? 3);
  pushUint32LE(plain, 0x20);
  pushUint32LE(plain, 0x80);
  pushUint32LE(plain, 0x40);
  pushUint32LE(plain, 3);
  pushUint64LE(plain, pageMapAddress - 0x100);
  pushUint32LE(plain, 2);
  pushUint32LE(plain, 3);
  pushUint32LE(plain, 0);
  pushUint32LE(plain, 0);
  const plainBytes = Uint8Array.from(plain);
  patchUint32LE(plainBytes, 0x68, crc32R2004(plainBytes, 0));
  const keystream = r2004Keystream(R2004_FILE_HEADER_LENGTH);
  const encrypted = plainBytes.map((byte, index) => byte ^ keystream[index]!);

  // Cabecera en claro de 0x100 bytes.
  const head: number[] = [...ascii(overrides.signature ?? "AC1018")];
  head.push(0, 0, 0, 0, 0);
  head.push(0x11); // versión de mantenimiento
  head.push(overrides.fixedByte ?? 0x03);
  pushUint32LE(head, 0); // preview
  head.push(0x21, 0x06); // versión y mantenimiento de la aplicación
  pushUint16LE(head, 0x1e); // codepage
  head.push(0, 0, 0);
  pushUint32LE(head, 0); // banderas de seguridad
  pushUint32LE(head, 0); // long desconocido
  pushUint32LE(head, 0); // summary info
  pushUint32LE(head, 0); // VBA
  pushUint32LE(head, overrides.eightyConstant ?? 0x80);
  while (head.length < 0x80) head.push(0);
  head.push(...encrypted);
  for (let index = 0xec; index < 0x100; index += 1) {
    head.push(keystream[index]!);
  }

  const bytes = new Uint8Array(fileEnd);
  bytes.set(Uint8Array.from(head), 0);
  bytes.set(dataPage, dataPageAddress);
  if (gap > 0) {
    // El hueco lleva bytes ajenos a las páginas; el lector no debe leerlos.
    bytes.fill(0xee, R2004_FILE_HEADER_LENGTH, dataPageAddress);
  }
  bytes.set(sectionMapPage, sectionMapAddress);
  bytes.set(pageMapPage, pageMapAddress);
  return {
    bytes,
    content,
    dataPageAddress,
    dataCompressedLength,
    sectionMapAddress,
    pageMapAddress,
  };
}

/** Abre el contenedor completo y devuelve el payload de AcDb:Header. */
function openAndAssemble(bytes: Uint8Array): Uint8Array {
  const cursor = new BoundedByteCursor(bytes);
  const fileHeader = parseR2004FileHeader(cursor);
  const pages = readR2004PageMap(cursor, fileHeader, LIMITS);
  const sections = readR2004SectionMap(cursor, fileHeader, pages, LIMITS);
  const section = findR2004Section(sections, "AcDb:Header");
  assert.ok(section, "la sección AcDb:Header debe estar en el mapa");
  return readR2004SectionPayload(cursor, section, pages, LIMITS);
}

// ---------------------------------------------------------------------------
// Generador, CRC32 y suma de páginas
// ---------------------------------------------------------------------------

test("el generador reproduce el prefijo publicado de la secuencia mágica", () => {
  const keystream = r2004Keystream(PUBLISHED_KEYSTREAM_PREFIX.length);
  assert.deepEqual([...keystream], PUBLISHED_KEYSTREAM_PREFIX);
});

test("crc32R2004 reproduce la respuesta conocida de CRC-32/ISO-HDLC", () => {
  assert.equal(crc32R2004(ascii("123456789"), 0), 0xcbf43926);
});

test("la suma de páginas responde a los vectores calculados a mano", () => {
  assert.equal(r2004SectionPageChecksum(0, Uint8Array.from([1])), 0x0001_0001);
  assert.equal(
    r2004SectionPageChecksum(0, Uint8Array.from([1, 2])),
    0x0004_0003,
  );
  assert.equal(
    r2004SectionPageChecksum(0x0002_0001, Uint8Array.from([1])),
    0x0004_0002,
  );
});

// ---------------------------------------------------------------------------
// Descifrado de la cabecera
// ---------------------------------------------------------------------------

/** Bloque cifrado válido, listo para torcerle bytes en los gemelos. */
function encryptedHeaderFixture(): Uint8Array {
  const plain: number[] = [...R2004_HEADER_MAGIC];
  pushUint32LE(plain, 0);
  pushUint32LE(plain, R2004_ENCRYPTED_BLOCK_LENGTH);
  pushUint32LE(plain, 0x04);
  while (plain.length < 0x50) pushUint32LE(plain, 0);
  pushUint32LE(plain, 7); // id del mapa de páginas
  pushUint64LE(plain, 0x1000); // dirección guardada (real 0x1100)
  pushUint32LE(plain, 5); // id del mapa de secciones
  pushUint32LE(plain, 0);
  pushUint32LE(plain, 0);
  pushUint32LE(plain, 0);
  const bytes = Uint8Array.from(plain);
  patchUint32LE(bytes, 0x68, crc32R2004(bytes, 0));
  const keystream = r2004Keystream(R2004_ENCRYPTED_BLOCK_LENGTH);
  return bytes.map((byte, index) => byte ^ keystream[index]!);
}

test("un bloque cifrado válido entrega sus campos con la dirección +0x100", () => {
  const header = decryptR2004HeaderBlock(encryptedHeaderFixture());
  assert.equal(header.sectionPageMapId, 7);
  assert.equal(header.sectionPageMapAddress, 0x1100);
  assert.equal(header.sectionMapId, 5);
});

test("un bloque que no mide 0x6C es un error del llamador", () => {
  assertDwgError(
    () => decryptR2004HeaderBlock(new Uint8Array(0x6b)),
    "DWG_INPUT_INVALID",
  );
});

test("una magia descifrada torcida falla cerrada", () => {
  const block = encryptedHeaderFixture();
  block[3]! ^= 0xff;
  assertDwgError(() => decryptR2004HeaderBlock(block), "DWG_STRUCTURE_CORRUPT");
});

test("un CRC32 que no cuadra delata el byte exacto del campo", () => {
  const block = encryptedHeaderFixture();
  block[0x68]! ^= 0x55;
  const caught = assertDwgError(
    () => decryptR2004HeaderBlock(block),
    "DWG_STRUCTURE_CORRUPT",
  );
  assert.equal(caught.detail.offset, 0x68);
});

// ---------------------------------------------------------------------------
// Descompresión: vectores construidos opcode a opcode
// ---------------------------------------------------------------------------

test("una tirada literal corta descomprime tal cual", () => {
  const out = decompress(
    [0x05, 1, 2, 3, 4, 5, 6, 7, 8, 0x11, 0x00, 0x00],
    8,
  );
  assert.deepEqual([...out], [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("la forma larga de la tirada literal suma como el ejemplo de la ODS", () => {
  // 0x00 0x02 → 0x0F + 2 + 3 = 0x14 literales (ejemplo registrado).
  const literals = Array.from({ length: 0x14 }, (_, index) => index + 1);
  const out = decompress([0x00, 0x02, ...literals, 0x11, 0x00, 0x00], 0x14);
  assert.deepEqual([...out], literals);
});

test("una copia corta 0x40-0xFF copia hacia atrás con offset +1", () => {
  // 4 literales y copia de 3 con offset 4: opcode 0x4C (bits de offset 3).
  const out = decompress(
    [0x01, 10, 20, 30, 40, 0x4c, 0x00, 0x11, 0x00, 0x00],
    7,
  );
  assert.deepEqual([...out], [10, 20, 30, 40, 10, 20, 30]);
});

test("una copia solapada repite el último byte producido", () => {
  // Longitud 6 > offset 1: el rasgo LZ77 de la tirada repetida.
  const out = decompress(
    [0x01, 7, 8, 9, 4, 0x70, 0x00, 0x11, 0x00, 0x00],
    10,
  );
  assert.deepEqual([...out], [7, 8, 9, 4, 4, 4, 4, 4, 4, 4]);
});

test("una copia con literales inmediatos los toma del flujo", () => {
  // opcode 0x4D: longitud 3, offset 4, UN literal inmediato tras la copia.
  const out = decompress(
    [0x01, 1, 2, 3, 4, 0x4d, 0x00, 99, 0x11, 0x00, 0x00],
    8,
  );
  assert.deepEqual([...out], [1, 2, 3, 4, 1, 2, 3, 99]);
});

test("la familia 0x21-0x3F usa el offset de dos bytes", () => {
  // 8 literales y opcode 0x23 (longitud 5) con offset 8 (guardado 7<<2).
  const out = decompress(
    [0x05, 1, 2, 3, 4, 5, 6, 7, 8, 0x23, 0x1c, 0x00, 0x11, 0x00, 0x00],
    13,
  );
  assert.deepEqual([...out], [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5]);
});

test("el opcode 0x20 extiende la longitud con el valor largo", () => {
  // Valor largo 0x01 → longitud 0x22 con offset 4 sobre 4 literales.
  const expected = [5, 6, 7, 8];
  for (let index = 0; index < 0x22; index += 1) {
    expected.push(expected[index]!);
  }
  const out = decompress(
    [0x01, 5, 6, 7, 8, 0x20, 0x01, 0x0c, 0x00, 0x11, 0x00, 0x00],
    4 + 0x22,
  );
  assert.deepEqual([...out], expected);
});

test("la familia 0x12-0x1F desplaza el offset 0x3FFF para llegar lejos", () => {
  // 0x4000 literales (forma larga) y copia de 4 desde el principio del
  // buffer: offset guardado 0 + 1 + 0x3FFF = 0x4000 exacto.
  const literals = Array.from(
    { length: 0x4000 },
    (_, index) => (index * 13 + 5) & 0xff,
  );
  const stream = [0x00];
  let remainder = 0x4000 - 0x12;
  while (remainder > 0xff) {
    stream.push(0x00);
    remainder -= 0xff;
  }
  stream.push(remainder, ...literals, 0x12, 0x00, 0x00, 0x11, 0x00, 0x00);
  const out = decompress(stream, 0x4004);
  assert.deepEqual([...out.subarray(0x4000)], literals.slice(0, 4));
});

test("una tirada literal desnuda en posición de opcode es corrupción", () => {
  assertDwgError(
    () => decompress([0x01, 1, 2, 3, 4, 0x05, 1, 2, 3, 4, 5, 6, 7, 8], 20),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("un tamaño declarado mentiroso falla cerrado en ambos sentidos", () => {
  // Declarado de más: el flujo termina antes de llenar la salida.
  assertDwgError(
    () => decompress([0x05, 1, 2, 3, 4, 5, 6, 7, 8, 0x11, 0x00, 0x00], 9),
    "DWG_STRUCTURE_CORRUPT",
  );
  // Declarado de menos: la copia desbordaría la salida.
  assertDwgError(
    () => decompress([0x01, 1, 2, 3, 4, 0x4c, 0x00, 0x11, 0x00, 0x00], 5),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("un offset que alcanza detrás del inicio es corrupción", () => {
  // Offset 5 con sólo 4 bytes producidos: opcode 0x40 + byte 0x01.
  assertDwgError(
    () => decompress([0x01, 1, 2, 3, 4, 0x40, 0x01, 0x11, 0x00, 0x00], 7),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("un flujo sin terminador jamás entra en bucle: error tipado", () => {
  assertDwgError(
    () => decompress([0x01, 1, 2, 3, 4], 4),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("el terminador exige sus dos bytes y prohíbe sobras", () => {
  assertDwgError(
    () => decompress([0x01, 1, 2, 3, 4, 0x11, 0x00], 4),
    "DWG_STRUCTURE_CORRUPT",
  );
  assertDwgError(
    () => decompress([0x01, 1, 2, 3, 4, 0x11, 0x00, 0x00, 0xaa], 4),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("el tamaño declarado paga el presupuesto ANTES de reservar", () => {
  const small = createDwgLimits({ maxExpandedBytes: 1024 });
  const caught = assertDwgError(
    () => decompressR2004(Uint8Array.from([0x11, 0, 0]), 2048, small),
    "DWG_FILE_LIMIT_EXCEEDED",
  );
  assert.equal(caught.detail.category, "resource");
});

// ---------------------------------------------------------------------------
// Contenedor sintético: cabecera, mapas y ensamblado
// ---------------------------------------------------------------------------

test("un contenedor sintético completo entrega el payload de AcDb:Header", () => {
  const built = buildContainer();
  const cursor = new BoundedByteCursor(built.bytes);
  const fileHeader = parseR2004FileHeader(cursor);
  assert.equal(fileHeader.version, "AC1018");
  assert.equal(fileHeader.maintenanceVersion, 0x11);
  assert.equal(fileHeader.codepage, 0x1e);
  assert.equal(fileHeader.header.sectionPageMapAddress, built.pageMapAddress);
  const pages = readR2004PageMap(cursor, fileHeader, LIMITS);
  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map((page) => page.address),
    [built.dataPageAddress, built.sectionMapAddress, built.pageMapAddress],
  );
  const sections = readR2004SectionMap(cursor, fileHeader, pages, LIMITS);
  assert.equal(sections.length, 1);
  assert.equal(sections[0]!.name, "AcDb:Header");
  assert.equal(sections[0]!.size, SECTION_SIZE);
  const payload = readR2004SectionPayload(cursor, sections[0]!, pages, LIMITS);
  assert.deepEqual([...payload], [...built.content]);
});

test("un hueco del mapa de páginas desplaza las direcciones sin perderlas", () => {
  const built = buildContainer({ gapBeforeData: 0x40 });
  assert.equal(built.dataPageAddress, R2004_FILE_HEADER_LENGTH + 0x40);
  const payload = openAndAssemble(built.bytes);
  assert.deepEqual([...payload], [...built.content]);
});

test("otra firma no abre este contenedor", () => {
  const built = buildContainer({ signature: "AC1015" });
  assertDwgError(
    () => parseR2004FileHeader(new BoundedByteCursor(built.bytes)),
    "DWG_SIGNATURE_INVALID",
  );
});

test("el byte fijo tras el mantenimiento sólo admite 0x00, 0x01 o 0x03", () => {
  const built = buildContainer({ fixedByte: 0x02 });
  assertDwgError(
    () => parseR2004FileHeader(new BoundedByteCursor(built.bytes)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("la constante 0x00000080 de la cabecera se comprueba", () => {
  const built = buildContainer({ eightyConstant: 0x81 });
  assertDwgError(
    () => parseR2004FileHeader(new BoundedByteCursor(built.bytes)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("el remate de flujo pseudoaleatorio se comprueba byte a byte", () => {
  const built = buildContainer();
  built.bytes[0xf0]! ^= 0xff;
  assertDwgError(
    () => parseR2004FileHeader(new BoundedByteCursor(built.bytes)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("un byte torcido del bloque cifrado rompe magia o CRC32", () => {
  const built = buildContainer();
  built.bytes[0x90]! ^= 0x01;
  assertDwgError(
    () => parseR2004FileHeader(new BoundedByteCursor(built.bytes)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("una cabecera truncada en cualquier punto falla con el error tipado", () => {
  const built = buildContainer();
  for (const cut of [3, 0x0c, 0x40, 0x90, 0xf0]) {
    assertDwgError(
      () => parseR2004FileHeader(new BoundedByteCursor(built.bytes.slice(0, cut))),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("el checksum de una página de sistema se comprueba en dos etapas", () => {
  const built = buildContainer();
  const cursor = new BoundedByteCursor(built.bytes);
  const fileHeader = parseR2004FileHeader(cursor);
  built.bytes[built.pageMapAddress + 0x18]! ^= 0xff;
  assertDwgError(
    () =>
      readR2004PageMap(new BoundedByteCursor(built.bytes), fileHeader, LIMITS),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("el recuento del mapa de páginas debe cuadrar con la cabecera", () => {
  const built = buildContainer({ sectionPageAmount: 4 });
  const cursor = new BoundedByteCursor(built.bytes);
  const fileHeader = parseR2004FileHeader(cursor);
  assertDwgError(
    () => readR2004PageMap(cursor, fileHeader, LIMITS),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("un número de página repetido es corrupción, no una preferencia", () => {
  const pairs: number[] = [];
  pushUint32LE(pairs, 1);
  pushUint32LE(pairs, 0x40);
  pushUint32LE(pairs, 1);
  pushUint32LE(pairs, 0x40);
  pushUint32LE(pairs, 3);
  pushUint32LE(pairs, 0x40);
  const built = buildContainer({ pageMapPayload: Uint8Array.from(pairs) });
  const cursor = new BoundedByteCursor(built.bytes);
  const fileHeader = parseR2004FileHeader(cursor);
  assertDwgError(
    () => readR2004PageMap(cursor, fileHeader, LIMITS),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("el tope de secciones acota el mapa de páginas antes de acumular", () => {
  const built = buildContainer();
  const tight = createDwgLimits({ maxSections: 2 });
  const cursor = new BoundedByteCursor(built.bytes);
  const fileHeader = parseR2004FileHeader(cursor);
  const caught = assertDwgError(
    () => readR2004PageMap(cursor, fileHeader, tight),
    "DWG_FILE_LIMIT_EXCEEDED",
  );
  assert.equal(caught.detail.category, "resource");
});

test("las sobras tras la última descripción del mapa de secciones acusan", () => {
  const built = buildContainer({ sectionMapTrailer: [0xaa] });
  const cursor = new BoundedByteCursor(built.bytes);
  const fileHeader = parseR2004FileHeader(cursor);
  const pages = readR2004PageMap(cursor, fileHeader, LIMITS);
  assertDwgError(
    () => readR2004SectionMap(cursor, fileHeader, pages, LIMITS),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("una página que el mapa de páginas no conoce falla al ensamblar", () => {
  const built = buildContainer({ pageEntryNumber: 99 });
  assertDwgError(() => openAndAssemble(built.bytes), "DWG_STRUCTURE_CORRUPT");
});

test("un tamaño comprimido desacorde entre mapa y página falla cerrado", () => {
  const honest = buildContainer();
  const lied = buildContainer({
    pageEntryCompressedSize: honest.dataCompressedLength + 1,
  });
  assertDwgError(() => openAndAssemble(lied.bytes), "DWG_STRUCTURE_CORRUPT");
});

test("un offset de arranque en o más allá del tamaño de la sección acusa", () => {
  const built = buildContainer({ pageEntryStart: SECTION_SIZE });
  assertDwgError(() => openAndAssemble(built.bytes), "DWG_STRUCTURE_CORRUPT");
});

test("una cabecera de página de datos torcida rompe tipo o checksum", () => {
  const built = buildContainer();
  built.bytes[built.dataPageAddress + 1]! ^= 0x40;
  assertDwgError(() => openAndAssemble(built.bytes), "DWG_STRUCTURE_CORRUPT");
});

test("un byte torcido en los datos comprimidos rompe el checksum de datos", () => {
  const built = buildContainer();
  built.bytes[built.dataPageAddress + 0x20]! ^= 0xff;
  assertDwgError(() => openAndAssemble(built.bytes), "DWG_STRUCTURE_CORRUPT");
});

test("una sección cifrada queda fuera de este decodificador, con su código", () => {
  const built = buildContainer({ encryption: 1 });
  const caught = assertDwgError(
    () => openAndAssemble(built.bytes),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assert.equal(caught.detail.category, "unsupported");
});

console.log(
  "r2004-container.spec: contenedor R2004 verde — vectores a mano, respuesta conocida de la ODS y gemelos tristes byte a byte.",
);
