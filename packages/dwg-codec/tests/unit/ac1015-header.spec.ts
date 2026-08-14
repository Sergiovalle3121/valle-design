/**
 * Spec del contenedor AC1015: cabecera de archivo y directorio de secciones.
 *
 * El constructor de cabeceras es FIRST-PARTY y vive aquí: es la semilla del
 * escritor de la fase C, y construir el binario a mano es lo que permite que
 * cada gemelo triste diga exactamente qué byte se torció. El CRC además se
 * valida con una respuesta CONOCIDA independiente (CRC-16/ARC de
 * "123456789" = 0xBB3D), no sólo consigo mismo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import {
  crc16Dwg,
  FILE_HEADER_CRC_XOR_BY_RECORD_COUNT,
} from "../../src/codecs/crc16.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import { assertDwgError } from "../support/assert.js";

const SENTINEL = [
  0x95, 0xa0, 0x4e, 0x28, 0x99, 0x82, 0x1a, 0xe5, 0x5e, 0x41, 0xe0, 0x5f,
  0x9d, 0x3a, 0x4d, 0x00,
];

interface BuiltRecord {
  id: number;
  start: number;
  size: number;
}

/** Construye un archivo AC1015 mínimo: cabecera válida + relleno de secciones. */
function buildFile(options?: {
  records?: BuiltRecord[];
  magic?: string;
  fixedByte?: number;
  breakCrc?: boolean;
  breakSentinel?: boolean;
  recordCountOverride?: number;
  truncateTo?: number;
}): Uint8Array {
  const records = options?.records ?? [
    { id: 0, start: 0x60, size: 0x40 },
    { id: 1, start: 0xa0, size: 0x30 },
    { id: 2, start: 0xd0, size: 0x20 },
  ];
  const head: number[] = [];
  const magic = options?.magic ?? "AC1015";
  for (const char of magic) head.push(char.charCodeAt(0));
  head.push(0, 0, 0, 0, 0); // reservados
  head.push(0x11); // versión de mantenimiento
  head.push(options?.fixedByte ?? 0x01);
  pushUint32LE(head, 0); // preview seeker
  head.push(0x1d, 0x00); // versión/mantenimiento del escritor
  pushUint16LE(head, 0x4e4); // codepage ANSI_1252
  pushUint32LE(head, options?.recordCountOverride ?? records.length);
  for (const record of records) {
    head.push(record.id & 0xff);
    pushUint32LE(head, record.start);
    pushUint32LE(head, record.size);
  }
  const xor =
    FILE_HEADER_CRC_XOR_BY_RECORD_COUNT.get(records.length) ?? 0;
  let crc = crc16Dwg(Uint8Array.from(head), 0xc0c1) ^ xor;
  if (options?.breakCrc) crc ^= 0x5555;
  pushUint16LE(head, crc);
  const sentinel = [...SENTINEL];
  if (options?.breakSentinel) sentinel[3] = (sentinel[3] ?? 0) ^ 0xff;
  head.push(...sentinel);

  const fileEnd = Math.max(
    head.length,
    ...records.map((record) => record.start + record.size),
  );
  const file = new Uint8Array(fileEnd);
  file.set(Uint8Array.from(head), 0);
  const truncateTo = options?.truncateTo;
  return truncateTo === undefined ? file : file.slice(0, truncateTo);
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

test("crc16Dwg reproduce la respuesta conocida de CRC-16/ARC", () => {
  const digits = Uint8Array.from("123456789", (char) => char.charCodeAt(0));
  assert.equal(crc16Dwg(digits, 0), 0xbb3d);
});

test("una cabecera válida entrega su directorio completo y verificado", () => {
  const header = parseAc1015FileHeader(new BoundedByteCursor(buildFile()));
  assert.equal(header.version, "AC1015");
  assert.equal(header.maintenanceVersion, 0x11);
  assert.equal(header.previewSeeker, 0);
  assert.equal(header.codepage, 0x4e4);
  assert.equal(header.records.length, 3);
  assert.deepEqual(
    header.records.map((record) => ({ ...record })),
    [
      { id: 0, start: 0x60, size: 0x40 },
      { id: 1, start: 0xa0, size: 0x30 },
      { id: 2, start: 0xd0, size: 0x20 },
    ],
  );
});

test("seis registros usan su propia máscara de CRC", () => {
  const records = Array.from({ length: 6 }, (_, index) => ({
    id: index,
    start: 0x100 + index * 0x20,
    size: 0x10,
  }));
  const header = parseAc1015FileHeader(
    new BoundedByteCursor(buildFile({ records })),
  );
  assert.equal(header.records.length, 6);
});

test("otra firma no abre este contenedor", () => {
  assertDwgError(
    () =>
      parseAc1015FileHeader(new BoundedByteCursor(buildFile({ magic: "AC1018" }))),
    "DWG_SIGNATURE_INVALID",
  );
});

test("el byte fijo previo al preview debe ser 0x01", () => {
  assertDwgError(
    () =>
      parseAc1015FileHeader(new BoundedByteCursor(buildFile({ fixedByte: 0x02 }))),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("un recuento de registros fuera de 3-6 es corrupción, no una promesa", () => {
  for (const records of [
    [
      { id: 0, start: 0x40, size: 0x10 },
      { id: 1, start: 0x50, size: 0x10 },
    ],
    Array.from({ length: 7 }, (_, index) => ({
      id: index,
      start: 0x100 + index * 0x20,
      size: 0x10,
    })),
  ]) {
    assertDwgError(
      () => parseAc1015FileHeader(new BoundedByteCursor(buildFile({ records }))),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("secciones solapadas o fuera del archivo fallan cerradas", () => {
  const overlapping = [
    { id: 0, start: 0x60, size: 0x40 },
    { id: 1, start: 0x80, size: 0x40 },
    { id: 2, start: 0x200, size: 0x10 },
  ];
  assertDwgError(
    () =>
      parseAc1015FileHeader(
        new BoundedByteCursor(buildFile({ records: overlapping })),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Más allá del final: el builder dimensiona el archivo para contener las
  // secciones declaradas, así que se declara una y luego se TRUNCA.
  const beyond = buildFile();
  assertDwgError(
    () =>
      parseAc1015FileHeader(
        new BoundedByteCursor(beyond.slice(0, 0xd0 + 0x10)),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("una sección no puede empezar dentro de la propia cabecera", () => {
  const inside = [
    { id: 0, start: 0x10, size: 0x10 },
    { id: 1, start: 0x60, size: 0x10 },
    { id: 2, start: 0x80, size: 0x10 },
  ];
  assertDwgError(
    () =>
      parseAc1015FileHeader(new BoundedByteCursor(buildFile({ records: inside }))),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("un CRC que no cuadra delata el byte exacto donde se comprobó", () => {
  try {
    parseAc1015FileHeader(new BoundedByteCursor(buildFile({ breakCrc: true })));
    assert.fail("se esperaba un fallo de CRC");
  } catch (error) {
    const detail = (error as { detail?: { code?: string; offset?: number } })
      .detail;
    assert.equal(detail?.code, "DWG_STRUCTURE_CORRUPT");
    // 0x15 (cabecera fija) + 4 (recuento) + 3×9 (registros) = 0x30.
    assert.equal(detail?.offset, 0x15 + 4 + 27);
  }
});

test("el centinela final se comprueba byte a byte", () => {
  assertDwgError(
    () =>
      parseAc1015FileHeader(
        new BoundedByteCursor(buildFile({ breakSentinel: true })),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("una cabecera truncada en cualquier punto falla con el error tipado", () => {
  // Un corte SIEMPRE es el error estructural del cursor acotado: distinguir
  // «firma truncada» es papel de probeDwg, que mira antes de abrir nada.
  for (const cut of [3, 0x0c, 0x15, 0x18, 0x20, 0x30, 0x33]) {
    assertDwgError(
      () =>
        parseAc1015FileHeader(
          new BoundedByteCursor(buildFile({ truncateTo: cut })),
        ),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("el recuento declarado por encima de los registros presentes no lee de más", () => {
  // recordCountOverride declara 4 pero sólo viajan 3 registros: la lectura
  // del cuarto invade CRC/centinela y el CRC final no puede cuadrar. Da
  // igual DÓNDE explote: debe ser el error estructural tipado, no un valor.
  assertDwgError(
    () =>
      parseAc1015FileHeader(
        new BoundedByteCursor(buildFile({ recordCountOverride: 4 })),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

console.log(
  "ac1015-header.spec: contenedor R2000 verde — directorio validado (límites, solapes, CRC con respuesta conocida, centinela) y gemelos tristes byte a byte.",
);
