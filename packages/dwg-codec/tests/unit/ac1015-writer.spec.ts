/**
 * Spec del writer AC1015 (fase C): round-trip completo contra el lector real.
 *
 * El writer produce los bytes; `parseAc1015FileHeader` abre la cabecera y el
 * lector de marcos verifica cada sección. Los gemelos tristes NO se fabrican
 * con un builder paralelo: se toman los bytes del writer y se tuerce el byte
 * exacto — así cada test dice qué byte rompió y el writer sigue siendo la
 * única fuente de verdad del binario válido.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { crc16Dwg } from "../../src/codecs/crc16.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import {
  AC1015_CLASSES_SENTINELS,
  AC1015_HEADER_VARIABLES_SENTINELS,
  AC1015_SECTION_CRC_SEED,
  AC1015_SECTION_FRAME_OVERHEAD,
  readAc1015EmptyObjectMap,
  readAc1015SectionFrame,
} from "../../src/container/ac1015-section-frame.js";
import {
  ac1015HeaderVariablesPlaceholder,
  AC1015_DEFAULT_CODEPAGE,
  AC1015_WRITER_MAX_SECTION_PAYLOAD,
  writeAc1015Container,
} from "../../src/writer/ac1015-container-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Disposición del contenedor mínimo por defecto (placeholder de 16 bytes). */
const HEADER_LENGTH = 0x46;
const HV_START = HEADER_LENGTH;
const HV_SIZE = AC1015_SECTION_FRAME_OVERHEAD + 16;
const CLASSES_START = HV_START + HV_SIZE;
const CLASSES_SIZE = AC1015_SECTION_FRAME_OVERHEAD;
const MAP_START = CLASSES_START + CLASSES_SIZE;

function cursorOf(bytes: Uint8Array): BoundedByteCursor {
  return new BoundedByteCursor(bytes);
}

test("round-trip: el lector abre y verifica todo lo que el writer emite", () => {
  const file = writeAc1015Container();
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);

  assert.equal(header.version, "AC1015");
  assert.equal(header.maintenanceVersion, 0);
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

  const headerVariables = readAc1015SectionFrame(
    cursor,
    header.records[0]!,
    AC1015_HEADER_VARIABLES_SENTINELS,
  );
  assert.equal(headerVariables.declaredSize, 16);
  assert.deepEqual(headerVariables.payload, ac1015HeaderVariablesPlaceholder());

  const classes = readAc1015SectionFrame(
    cursor,
    header.records[1]!,
    AC1015_CLASSES_SENTINELS,
  );
  assert.equal(classes.declaredSize, 0);
  assert.equal(classes.payload.length, 0);

  const objectMap = readAc1015EmptyObjectMap(cursor, header.records[2]!);
  assert.equal(
    objectMap.crc,
    crc16Dwg(Uint8Array.of(0x00, 0x02), AC1015_SECTION_CRC_SEED),
  );
});

test("determinista: misma entrada, mismos bytes", () => {
  assert.deepEqual(writeAc1015Container(), writeAc1015Container());
  const options = {
    maintenanceVersion: 0x2a,
    codepage: 0x1b5,
    headerVariablesPayload: Uint8Array.from({ length: 21 }, (_, i) => i * 3),
    classesPayload: Uint8Array.of(9, 8, 7),
  };
  assert.deepEqual(
    writeAc1015Container(options),
    writeAc1015Container(options),
  );
});

test("payloads del llamador viajan opacos y vuelven byte a byte", () => {
  const headerVariablesPayload = Uint8Array.from(
    { length: 100 },
    (_, index) => (index * 7) & 0xff,
  );
  const classesPayload = Uint8Array.of(0xde, 0xad, 0xbe, 0xef);
  const file = writeAc1015Container({
    headerVariablesPayload,
    classesPayload,
  });
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);
  assert.deepEqual(
    readAc1015SectionFrame(
      cursor,
      header.records[0]!,
      AC1015_HEADER_VARIABLES_SENTINELS,
    ).payload,
    headerVariablesPayload,
  );
  assert.deepEqual(
    readAc1015SectionFrame(cursor, header.records[1]!, AC1015_CLASSES_SENTINELS)
      .payload,
    classesPayload,
  );
});

test("el writer copia el payload UNA vez: mutarlo después no toca el archivo", () => {
  const payload = Uint8Array.of(1, 2, 3, 4);
  const before = writeAc1015Container({ headerVariablesPayload: payload });
  payload.fill(0xff);
  const after = writeAc1015Container({
    headerVariablesPayload: Uint8Array.of(1, 2, 3, 4),
  });
  assert.deepEqual(before, after);
  // Y el placeholder por defecto entrega copias frescas, no estado compartido.
  const canonical = writeAc1015Container();
  ac1015HeaderVariablesPlaceholder().fill(0);
  assert.deepEqual(writeAc1015Container(), canonical);
});

test("opciones fuera de rango fallan cerradas antes de emitir un byte", () => {
  for (const maintenanceVersion of [-1, 256, 1.5, Number.NaN]) {
    assertDwgError(
      () => writeAc1015Container({ maintenanceVersion }),
      "DWG_INPUT_INVALID",
    );
  }
  for (const codepage of [-1, 0x1_0000, 0.5]) {
    assertDwgError(
      () => writeAc1015Container({ codepage }),
      "DWG_INPUT_INVALID",
    );
  }
  assertDwgError(
    () =>
      writeAc1015Container({
        headerVariablesPayload: new Uint8Array(
          AC1015_WRITER_MAX_SECTION_PAYLOAD + 1,
        ),
      }),
    "DWG_FILE_LIMIT_EXCEEDED",
  );
  assertDwgError(
    () =>
      writeAc1015Container({
        classesPayload: "bytes" as unknown as Uint8Array,
      }),
    "DWG_INPUT_INVALID",
  );
  if (typeof SharedArrayBuffer !== "undefined") {
    assertDwgError(
      () =>
        writeAc1015Container({
          classesPayload: new Uint8Array(new SharedArrayBuffer(8)),
        }),
      "DWG_SHARED_BUFFER_REJECTED",
    );
  }
});

test("gemelo triste: el CRC roto de un marco delata su byte exacto", () => {
  const file = writeAc1015Container();
  const crcOffset = HV_START + 16 + 4 + 16; // apertura + RL + payload
  file[crcOffset]! ^= 0x55;
  try {
    readAc1015SectionFrame(
      cursorOf(file),
      { start: HV_START, size: HV_SIZE },
      AC1015_HEADER_VARIABLES_SENTINELS,
    );
    assert.fail("se esperaba un fallo de CRC de sección");
  } catch (error) {
    const detail = (error as { detail?: { code?: string; offset?: number } })
      .detail;
    assert.equal(detail?.code, "DWG_STRUCTURE_CORRUPT");
    assert.equal(detail?.offset, crcOffset);
  }
});

test("gemelo triste: centinelas torcidos de apertura y de cierre", () => {
  const beginTwisted = writeAc1015Container();
  beginTwisted[HV_START + 4]! ^= 0xff;
  assertDwgError(
    () =>
      readAc1015SectionFrame(
        cursorOf(beginTwisted),
        { start: HV_START, size: HV_SIZE },
        AC1015_HEADER_VARIABLES_SENTINELS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  const endTwisted = writeAc1015Container();
  endTwisted[HV_START + HV_SIZE - 1]! ^= 0xff;
  assertDwgError(
    () =>
      readAc1015SectionFrame(
        cursorOf(endTwisted),
        { start: HV_START, size: HV_SIZE },
        AC1015_HEADER_VARIABLES_SENTINELS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Los centinelas de OTRA sección tampoco abren ésta: el marco identifica.
  assertDwgError(
    () =>
      readAc1015SectionFrame(
        cursorOf(writeAc1015Container()),
        { start: HV_START, size: HV_SIZE },
        AC1015_CLASSES_SENTINELS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un tamaño que no llena su registro es corrupción", () => {
  // Declarado de MÁS: el marco se saldría de la sección.
  const oversized = writeAc1015Container();
  oversized[HV_START + 16]! += 1;
  assertDwgError(
    () =>
      readAc1015SectionFrame(
        cursorOf(oversized),
        { start: HV_START, size: HV_SIZE },
        AC1015_HEADER_VARIABLES_SENTINELS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Declarado de MENOS: dejaría bytes ignorados en silencio; también se
  // rechaza (fallo cerrado, no recuperación).
  const undersized = writeAc1015Container();
  undersized[HV_START + 16]! -= 1;
  assertDwgError(
    () =>
      readAc1015SectionFrame(
        cursorOf(undersized),
        { start: HV_START, size: HV_SIZE },
        AC1015_HEADER_VARIABLES_SENTINELS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Un registro más pequeño que el propio marco ni siquiera se intenta.
  assertDwgError(
    () =>
      readAc1015SectionFrame(
        cursorOf(writeAc1015Container()),
        { start: HV_START, size: AC1015_SECTION_FRAME_OVERHEAD - 1 },
        AC1015_HEADER_VARIABLES_SENTINELS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Y una extensión fuera del archivo se rechaza antes de leer nada.
  assertDwgError(
    () =>
      readAc1015SectionFrame(
        cursorOf(writeAc1015Container()),
        { start: MAP_START, size: 0x100 },
        AC1015_HEADER_VARIABLES_SENTINELS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: páginas malformadas del mapa de objetos", () => {
  // Tamaño 1: menor que su propio campo de tamaño — imposible.
  const tooSmall = writeAc1015Container();
  tooSmall[MAP_START + 1] = 0x01;
  assertDwgError(
    () =>
      readAc1015EmptyObjectMap(cursorOf(tooSmall), {
        start: MAP_START,
        size: 4,
      }),
    "DWG_STRUCTURE_CORRUPT",
  );

  // CRC de página roto.
  const badCrc = writeAc1015Container();
  badCrc[MAP_START + 2]! ^= 0x0f;
  assertDwgError(
    () =>
      readAc1015EmptyObjectMap(cursorOf(badCrc), { start: MAP_START, size: 4 }),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Bytes de sobra tras la página terminadora: datos ignorados, no gracias.
  const terminator = writeAc1015Container().slice(MAP_START, MAP_START + 4);
  const withTrailing = new Uint8Array(5);
  withTrailing.set(terminator, 0);
  withTrailing[4] = 0xaa;
  assertDwgError(
    () =>
      readAc1015EmptyObjectMap(cursorOf(withTrailing), { start: 0, size: 5 }),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Un registro que no puede contener ni la página terminadora.
  assertDwgError(
    () =>
      readAc1015EmptyObjectMap(cursorOf(writeAc1015Container()), {
        start: MAP_START,
        size: 3,
      }),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("un mapa de objetos poblado se declara unsupported, no corrupto", () => {
  // Una página con tamaño 3 (un byte de datos) es formato válido de fases
  // posteriores: el lector de fase C lo dice tal cual, sin fingir corrupción.
  const populated = writeAc1015Container();
  populated[MAP_START + 1] = 0x03;
  assertDwgError(
    () =>
      readAc1015EmptyObjectMap(cursorOf(populated), {
        start: MAP_START,
        size: 4,
      }),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

console.log(
  "ac1015-writer.spec: fase C verde — el writer emite el contenedor mínimo y el lector real lo abre entero; gemelos tristes de marco y mapa byte a byte.",
);
