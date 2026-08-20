/**
 * Spec del contenedor AC1015: cabecera de archivo y directorio de secciones.
 *
 * Desde la fase C, la fuente única del binario válido es el writer real
 * (`writeAc1015Container`): los casos felices parsean sus bytes tal cual y
 * cada gemelo triste TUERCE el byte exacto de esos mismos bytes. Sólo el caso
 * de seis registros recompone quirúrgicamente el directorio — reutilizando la
 * cabecera y el centinela del writer — porque el contenedor mínimo emite
 * exactamente tres. El CRC además se valida con una respuesta CONOCIDA
 * independiente (CRC-16/ARC de "123456789" = 0xBB3D), no sólo consigo mismo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { crc16Dwg } from "../../src/codecs/crc16.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import { AC1015_SECTION_FRAME_OVERHEAD } from "../../src/container/ac1015-section-frame.js";
import {
  AC1015_DEFAULT_CODEPAGE,
  writeAc1015Container,
} from "../../src/writer/ac1015-container-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Offsets fijos de la cabecera con tres registros (disposición del formato). */
const FIXED_BYTE_OFFSET = 0x0c;
const RECORD_COUNT_OFFSET = 0x15;
const RECORDS_OFFSET = 0x19;
const CRC_OFFSET = 0x34;
const SENTINEL_OFFSET = 0x36;
const HEADER_LENGTH = 0x46;

/** Disposición del contenedor mínimo por defecto del writer. */
const HV_START = HEADER_LENGTH;
const HV_SIZE = AC1015_SECTION_FRAME_OVERHEAD + 16;
const CLASSES_START = HV_START + HV_SIZE;
const CLASSES_SIZE = AC1015_SECTION_FRAME_OVERHEAD;
const MAP_START = CLASSES_START + CLASSES_SIZE;

function parse(bytes: Uint8Array) {
  return parseAc1015FileHeader(new BoundedByteCursor(bytes));
}

/** Bytes frescos del writer real, listos para torcerles el byte del caso. */
function written(): Uint8Array {
  return writeAc1015Container({ maintenanceVersion: 0x11 });
}

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

/** Escribe un entero LE de 32 bits SOBRE los bytes ya emitidos por el writer. */
function patchUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

test("crc16Dwg reproduce la respuesta conocida de CRC-16/ARC", () => {
  const digits = Uint8Array.from("123456789", (char) => char.charCodeAt(0));
  assert.equal(crc16Dwg(digits, 0), 0xbb3d);
});

test("una cabecera del writer real entrega su directorio completo y verificado", () => {
  const header = parse(written());
  assert.equal(header.version, "AC1015");
  assert.equal(header.maintenanceVersion, 0x11);
  assert.equal(header.previewSeeker, 0);
  assert.equal(header.codepage, AC1015_DEFAULT_CODEPAGE);
  assert.deepEqual(
    header.records.map((record) => ({ ...record })),
    [
      { id: 0, start: HV_START, size: HV_SIZE },
      { id: 1, start: CLASSES_START, size: CLASSES_SIZE },
      { id: 2, start: MAP_START, size: 4 },
    ],
  );
});

test("seis registros validan con el CRC crudo, como los archivos reales", () => {
  // El writer mínimo emite tres registros; el caso de seis se recompone
  // quirúrgicamente REUTILIZANDO su cabecera fija y su centinela, con el CRC
  // recalculado por los mismos primitivos first-party que usa el lector.
  // SIN máscara XOR: los 8 AC1015 reales del corpus llevan 6 registros y
  // guardan el CRC crudo (VALLE-CORPUS-AC1015-HEADER-CRC-2026-08-20); la
  // máscara 0x8461 que la ODS declaraba para este recuento quedó desmentida.
  const base = written();
  const head: number[] = [...base.slice(0, RECORD_COUNT_OFFSET)];
  pushUint32LE(head, 6);
  const records = Array.from({ length: 6 }, (_, index) => ({
    id: index,
    start: 0x100 + index * 0x20,
    size: 0x10,
  }));
  for (const record of records) {
    head.push(record.id);
    pushUint32LE(head, record.start);
    pushUint32LE(head, record.size);
  }
  const crc = crc16Dwg(Uint8Array.from(head), 0xc0c1);
  pushUint16LE(head, crc);
  head.push(...base.slice(SENTINEL_OFFSET, HEADER_LENGTH));

  const file = new Uint8Array(0x100 + 5 * 0x20 + 0x10);
  file.set(Uint8Array.from(head), 0);
  const header = parse(file);
  assert.equal(header.records.length, 6);
});

test("otra firma no abre este contenedor", () => {
  const file = written();
  file[5] = 0x38; // "AC1015" → "AC1018"
  assertDwgError(() => parse(file), "DWG_SIGNATURE_INVALID");
});

test("el byte fijo previo al preview debe ser 0x01", () => {
  const file = written();
  file[FIXED_BYTE_OFFSET] = 0x02;
  assertDwgError(() => parse(file), "DWG_STRUCTURE_CORRUPT");
});

test("un recuento de registros fuera de 3-6 es corrupción, no una promesa", () => {
  for (const count of [2, 7]) {
    const file = written();
    patchUint32LE(file, RECORD_COUNT_OFFSET, count);
    assertDwgError(() => parse(file), "DWG_STRUCTURE_CORRUPT");
  }
});

test("secciones solapadas o fuera del archivo fallan cerradas", () => {
  // El arranque del registro 1 se retrasa hasta invadir la sección 0. El
  // solape se detecta DURANTE la lectura del directorio, antes del CRC, así
  // que no hace falta recalcularlo.
  const overlapping = written();
  patchUint32LE(overlapping, RECORDS_OFFSET + 9 + 1, HV_START + 8);
  assertDwgError(() => parse(overlapping), "DWG_STRUCTURE_CORRUPT");

  // El tamaño del registro 2 se dispara más allá del final del archivo.
  const beyond = written();
  patchUint32LE(beyond, RECORDS_OFFSET + 18 + 5, 0x1000);
  assertDwgError(() => parse(beyond), "DWG_STRUCTURE_CORRUPT");
});

test("una sección no puede empezar dentro de la propia cabecera", () => {
  const file = written();
  patchUint32LE(file, RECORDS_OFFSET + 1, 0x10);
  assertDwgError(() => parse(file), "DWG_STRUCTURE_CORRUPT");
});

test("un CRC que no cuadra delata el byte exacto donde se comprobó", () => {
  const file = written();
  file[CRC_OFFSET]! ^= 0x55;
  try {
    parse(file);
    assert.fail("se esperaba un fallo de CRC");
  } catch (error) {
    const detail = (error as { detail?: { code?: string; offset?: number } })
      .detail;
    assert.equal(detail?.code, "DWG_STRUCTURE_CORRUPT");
    // 0x15 (cabecera fija) + 4 (recuento) + 3×9 (registros) = 0x34.
    assert.equal(detail?.offset, CRC_OFFSET);
  }
});

test("el centinela final se comprueba byte a byte", () => {
  const file = written();
  file[SENTINEL_OFFSET + 3]! ^= 0xff;
  assertDwgError(() => parse(file), "DWG_STRUCTURE_CORRUPT");
});

test("una cabecera truncada en cualquier punto falla con el error tipado", () => {
  // Un corte SIEMPRE es el error estructural del cursor acotado: distinguir
  // «firma truncada» es papel de probeDwg, que mira antes de abrir nada.
  for (const cut of [3, 0x0c, 0x15, 0x18, 0x20, 0x30, 0x33]) {
    assertDwgError(
      () => parse(written().slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("el recuento declarado por encima de los registros presentes no lee de más", () => {
  // Se declara 4 pero sólo viajan 3 registros: la lectura del cuarto invade
  // CRC/centinela y apunta fuera del archivo. Da igual DÓNDE explote: debe
  // ser el error estructural tipado, no un valor.
  const file = written();
  patchUint32LE(file, RECORD_COUNT_OFFSET, 4);
  assertDwgError(() => parse(file), "DWG_STRUCTURE_CORRUPT");
});

console.log(
  "ac1015-header.spec: contenedor R2000 verde — el writer real es la fuente del binario y los gemelos tristes tuercen sus bytes byte a byte.",
);
