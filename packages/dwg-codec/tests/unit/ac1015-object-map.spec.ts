/**
 * Spec del mapa de objetos poblado y de las envolturas (fase D1).
 *
 * La fuente única del binario válido sigue siendo el writer real: los casos
 * felices emiten N objetos con `writeAc1015Container` y verifican que el
 * lector del mapa devuelve EXACTAMENTE los handles y offsets emitidos, y que
 * cada envoltura se abre en su offset con su tipo. Los gemelos tristes
 * tuercen el byte exacto de esos bytes o COMPONEN páginas hostiles a mano
 * (con el CRC correcto, para que falle lo que debe fallar y no el CRC).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createDwgLimits, DEFAULT_DWG_LIMITS } from "../../src/api/limits.js";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { crc16Dwg } from "../../src/codecs/crc16.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import { readAc1015ObjectEnvelope } from "../../src/container/ac1015-object-envelope.js";
import {
  AC1015_OBJECT_MAP_MAX_PAGE_SIZE,
  readAc1015ObjectMap,
} from "../../src/container/ac1015-object-map.js";
import {
  AC1015_SECTION_CRC_SEED,
  AC1015_SECTION_FRAME_OVERHEAD,
  readAc1015EmptyObjectMap,
} from "../../src/container/ac1015-section-frame.js";
import { writeAc1015Container } from "../../src/writer/ac1015-container-writer.js";
import {
  buildAc1015ObjectMapSection,
  encodeDwgSignedModularChar,
  encodeDwgUnsignedModularChar,
  writeAc1015ObjectEnvelope,
} from "../../src/writer/ac1015-object-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Disposición del contenedor por defecto (mismas cuentas que fases B/C). */
const HEADER_LENGTH = 0x46;
const HV_SIZE = AC1015_SECTION_FRAME_OVERHEAD + 16;
const CLASSES_SIZE = AC1015_SECTION_FRAME_OVERHEAD;
const OBJECTS_START = HEADER_LENGTH + HV_SIZE + CLASSES_SIZE;

function cursorOf(bytes: Uint8Array): BoundedByteCursor {
  return new BoundedByteCursor(bytes);
}

/** Página del mapa compuesta a mano: tamaño BE + datos + CRC BE correcto. */
function mapPage(data: readonly number[]): number[] {
  const size = 2 + data.length;
  const bytes = [(size >> 8) & 0xff, size & 0xff, ...data];
  const crc = crc16Dwg(Uint8Array.from(bytes), AC1015_SECTION_CRC_SEED);
  return [...bytes, (crc >> 8) & 0xff, crc & 0xff];
}

const TERMINATOR = mapPage([]);

/** Lee un mapa compuesto a mano que ocupa el buffer entero. */
function readHandMap(bytes: readonly number[]) {
  const buffer = Uint8Array.from(bytes);
  return readAc1015ObjectMap(
    cursorOf(buffer),
    { start: 0, size: buffer.length },
    DEFAULT_DWG_LIMITS,
  );
}

test("round-trip N=0: el mapa vacío devuelve cero entradas", () => {
  // Sin objetos, el writer D1 emite byte a byte el contenedor de la fase C.
  assert.deepEqual(writeAc1015Container({ objects: [] }), writeAc1015Container());

  const file = writeAc1015Container();
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);
  const entries = readAc1015ObjectMap(
    cursor,
    header.records[2]!,
    DEFAULT_DWG_LIMITS,
  );
  assert.deepEqual(entries, []);
});

test("round-trip N=1: handle, offset, tipo y cuerpo exactos", () => {
  const file = writeAc1015Container({ objects: [{ type: 42 }] });
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);

  const entries = readAc1015ObjectMap(
    cursor,
    header.records[2]!,
    DEFAULT_DWG_LIMITS,
  );
  assert.deepEqual(
    entries.map((entry) => ({ ...entry })),
    [{ handle: 1, offset: OBJECTS_START }],
  );

  const envelope = readAc1015ObjectEnvelope(
    cursor,
    entries[0]!.offset,
    header.records,
  );
  assert.equal(envelope.type, 42);
  // Envoltura por defecto: MS (2) + [BS del tipo (2) + relleno (8)] + CRC (2).
  assert.equal(envelope.byteLength, 14);
  assert.deepEqual(envelope.bodyBytes, file.slice(OBJECTS_START + 2, OBJECTS_START + 12));
  // Y la envoltura del archivo es byte a byte la del emisor de objetos.
  assert.deepEqual(
    file.slice(OBJECTS_START, OBJECTS_START + 14),
    writeAc1015ObjectEnvelope({ type: 42 }),
  );
});

test("round-trip N=3: handles explícitos con deltas multibyte", () => {
  const specs = [
    { type: 0, handle: 5, bodyFillLength: 0 },
    { type: 42, handle: 0x90, bodyFillLength: 3 },
    { type: 0x1234, handle: 0x4321, bodyFillLength: 5 },
  ];
  const file = writeAc1015Container({ objects: specs });
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);

  // Tamaños de envoltura: MS(2) + [BS(1|2|3) + relleno] + CRC(2).
  const expected = [
    { handle: 5, offset: OBJECTS_START }, // tipo 0 → BS de 1 byte → 5 bytes
    { handle: 0x90, offset: OBJECTS_START + 5 }, // BS de 2 bytes + 3 → 9 bytes
    { handle: 0x4321, offset: OBJECTS_START + 14 }, // BS de 3 bytes + 5 → 12
  ];
  const entries = readAc1015ObjectMap(
    cursor,
    header.records[2]!,
    DEFAULT_DWG_LIMITS,
  );
  assert.deepEqual(
    entries.map((entry) => ({ ...entry })),
    expected,
  );

  const types = entries.map(
    (entry) => readAc1015ObjectEnvelope(cursor, entry.offset, header.records).type,
  );
  assert.deepEqual(types, [0, 42, 0x1234]);
});

test("round-trip N=100: la cadena de envolturas cierra con el mapa", () => {
  const specs = Array.from({ length: 100 }, (_, index) => ({
    type: (index * 3) % 0x120,
    bodyFillLength: index % 7,
  }));
  const file = writeAc1015Container({ objects: specs });
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);
  const entries = readAc1015ObjectMap(
    cursor,
    header.records[2]!,
    DEFAULT_DWG_LIMITS,
  );

  assert.equal(entries.length, 100);
  // Los handles por defecto son 1..N y cada offset es el fin de la envoltura
  // anterior: la cadena entera se verifica leyendo cada envoltura REAL.
  let expectedOffset = OBJECTS_START;
  entries.forEach((entry, index) => {
    assert.equal(entry.handle, index + 1);
    assert.equal(entry.offset, expectedOffset);
    const envelope = readAc1015ObjectEnvelope(cursor, entry.offset, header.records);
    assert.equal(envelope.type, specs[index]!.type);
    expectedOffset += envelope.byteLength;
  });
  // La cadena muere exactamente donde el directorio declara el mapa.
  assert.equal(expectedOffset, header.records[2]!.start);
});

test("paginación real: 1200 objetos fuerzan más de una página", () => {
  const specs = Array.from({ length: 1200 }, () => ({ type: 7 }));
  const file = writeAc1015Container({ objects: specs });
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);
  const mapExtent = header.records[2]!;
  assert.ok(mapExtent.size > AC1015_OBJECT_MAP_MAX_PAGE_SIZE);

  // Se recorren los tamaños BE de página directamente sobre los bytes.
  const pageSizes: number[] = [];
  let position = mapExtent.start;
  for (;;) {
    const size = file[position]! * 0x100 + file[position + 1]!;
    pageSizes.push(size);
    position += size + 2;
    if (size === 2) break;
  }
  assert.ok(pageSizes.length >= 3, "se esperaban ≥2 páginas de datos + terminadora");
  assert.equal(pageSizes.at(-1), 2);
  for (const size of pageSizes) {
    assert.ok(size <= AC1015_OBJECT_MAP_MAX_PAGE_SIZE);
  }
  assert.equal(position, mapExtent.start + mapExtent.size);

  // Y los acumuladores SOBREVIVEN al corte de página: la lista completa
  // vuelve exacta, con la envoltura del último objeto abriéndose en su sitio.
  const entries = readAc1015ObjectMap(cursor, mapExtent, DEFAULT_DWG_LIMITS);
  assert.equal(entries.length, 1200);
  assert.deepEqual(
    { ...entries[0]! },
    { handle: 1, offset: OBJECTS_START },
  );
  assert.deepEqual(
    { ...entries.at(-1)! },
    { handle: 1200, offset: OBJECTS_START + 1199 * 14 },
  );
  const last = readAc1015ObjectEnvelope(cursor, entries.at(-1)!.offset, header.records);
  assert.equal(last.type, 7);
});

test("determinista: mismos objetos, mismos bytes", () => {
  const options = {
    objects: [
      { type: 3, handle: 2, bodyFillLength: 4 },
      { type: 256, handle: 9 },
    ],
  };
  assert.deepEqual(writeAc1015Container(options), writeAc1015Container(options));
});

test("un delta de offset negativo válido viaja y vuelve", () => {
  // Los objetos no tienen por qué estar en orden de handle: el segundo vive
  // ANTES que el primero en el archivo y el delta con signo lo cuenta.
  const section = buildAc1015ObjectMapSection([
    { handle: 1, offset: 100 },
    { handle: 2, offset: 40 },
  ]);
  const buffer = new Uint8Array(200);
  buffer.set(section, 0);
  const entries = readAc1015ObjectMap(
    cursorOf(buffer),
    { start: 0, size: section.length },
    DEFAULT_DWG_LIMITS,
  );
  assert.deepEqual(
    entries.map((entry) => ({ ...entry })),
    [
      { handle: 1, offset: 100 },
      { handle: 2, offset: 40 },
    ],
  );
});

test("la fase C sigue en pie: un mapa poblado es unsupported para su lector", () => {
  const file = writeAc1015Container({ objects: [{ type: 1 }] });
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);
  assertDwgError(
    () => readAc1015EmptyObjectMap(cursor, header.records[2]!),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("gemelo triste: el CRC roto de una página delata su byte exacto", () => {
  const file = writeAc1015Container({ objects: [{ type: 1 }, { type: 2 }, { type: 3 }] });
  const header = parseAc1015FileHeader(cursorOf(file));
  const mapExtent = header.records[2]!;
  // Primera página: pares [MC(1)+MC±(162)] (3) + 2×[MC(1)+MC±(14)] (4) = 7
  // bytes de datos → tamaño 9; su CRC vive en mapStart+9.
  const crcOffset = mapExtent.start + 9;
  file[crcOffset]! ^= 0x55;
  try {
    readAc1015ObjectMap(cursorOf(file), mapExtent, DEFAULT_DWG_LIMITS);
    assert.fail("se esperaba un fallo de CRC de página");
  } catch (error) {
    const detail = (error as { detail?: { code?: string; offset?: number } }).detail;
    assert.equal(detail?.code, "DWG_STRUCTURE_CORRUPT");
    assert.equal(detail?.offset, crcOffset);
  }

  // El CRC de la TERMINADORA también cuenta.
  const twisted = writeAc1015Container({ objects: [{ type: 1 }, { type: 2 }, { type: 3 }] });
  twisted[mapExtent.start + mapExtent.size - 1]! ^= 0xff;
  assertDwgError(
    () => readAc1015ObjectMap(cursorOf(twisted), mapExtent, DEFAULT_DWG_LIMITS),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un delta de handle nulo repetiría el handle", () => {
  // Par (delta handle 0, delta offset 1) con CRC correcto: la corrupción es
  // el delta, no el CRC — así el test señala la regla que defiende.
  assertDwgError(
    () => readHandMap([...mapPage([0x00, 0x01]), ...TERMINATOR]),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: offsets fuera del archivo, negativos o duplicados", () => {
  // Offset 100 con un buffer de ~12 bytes: fuera del archivo.
  assertDwgError(
    () =>
      readHandMap([
        ...mapPage([
          ...encodeDwgUnsignedModularChar(1),
          ...encodeDwgSignedModularChar(100),
        ]),
        ...TERMINATOR,
      ]),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Delta -1 desde 0: offset negativo.
  assertDwgError(
    () => readHandMap([...mapPage([0x01, 0x41]), ...TERMINATOR]),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Dos entradas sobre el MISMO offset (delta de offset 0 en la segunda).
  assertDwgError(
    () =>
      readHandMap([
        ...mapPage([0x01, 0x03, 0x01, 0x00]),
        ...TERMINATOR,
      ]),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un delta que desborda el rango seguro falla cerrado", () => {
  const overflowing = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f];
  assertDwgError(
    () => readHandMap([...mapPage([...overflowing, 0x00]), ...TERMINATOR]),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un mapa sin terminadora no es un mapa", () => {
  assertDwgError(
    () => readHandMap(mapPage([0x01, 0x02])),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Y bytes de sobra tras la terminadora tampoco se aceptan.
  assertDwgError(
    () => readHandMap([...TERMINATOR, 0xaa]),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: páginas imposibles — tamaño <2, tope de 2032, fuera de sección", () => {
  // Tamaño 1: menor que su propio campo.
  assertDwgError(() => readHandMap([0x00, 0x01, 0x00, 0x00]), "DWG_STRUCTURE_CORRUPT");
  // Tamaño 2033: por encima del tope del formato.
  assertDwgError(() => readHandMap([0x07, 0xf1, 0x00, 0x00]), "DWG_STRUCTURE_CORRUPT");
  // Tamaño que se sale de la sección declarada.
  assertDwgError(() => readHandMap([0x00, 0x30, 0x01, 0x02, 0x00, 0x00]), "DWG_STRUCTURE_CORRUPT");
});

test("topes de límites: maxObjects y maxHandles cortan el mapa a tiempo", () => {
  const file = writeAc1015Container({ objects: [{ type: 1 }, { type: 2 }, { type: 3 }] });
  const header = parseAc1015FileHeader(cursorOf(file));
  const mapExtent = header.records[2]!;
  for (const overrides of [{ maxObjects: 2 }, { maxHandles: 2 }] as const) {
    assertDwgError(
      () =>
        readAc1015ObjectMap(
          cursorOf(file),
          mapExtent,
          createDwgLimits(overrides),
        ),
      "DWG_FILE_LIMIT_EXCEEDED",
    );
  }
  // Con el tope justo, el mismo mapa pasa: el límite corta, no recorta.
  const entries = readAc1015ObjectMap(
    cursorOf(file),
    mapExtent,
    createDwgLimits({ maxObjects: 3, maxHandles: 3 }),
  );
  assert.equal(entries.length, 3);
});

test("gemelo triste: envoltura truncada por el final del archivo", () => {
  const file = writeAc1015Container({ objects: [{ type: 42 }] });
  // El archivo cortado ANTES del CRC de la envoltura: el rango declarado por
  // el MS ya no cabe.
  const truncated = file.slice(0, OBJECTS_START + 13);
  assertDwgError(
    () => readAc1015ObjectEnvelope(cursorOf(truncated), OBJECTS_START, []),
    "DWG_STRUCTURE_CORRUPT",
  );
  // Cortado DENTRO del propio MS.
  const stub = file.slice(0, OBJECTS_START + 1);
  assertDwgError(
    () => readAc1015ObjectEnvelope(cursorOf(stub), OBJECTS_START, []),
    "DWG_STRUCTURE_CORRUPT",
  );
  // Y un offset directamente fuera del archivo.
  assertDwgError(
    () => readAc1015ObjectEnvelope(cursorOf(file), file.length, []),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: el CRC roto de una envoltura delata su byte exacto", () => {
  const file = writeAc1015Container({ objects: [{ type: 42 }] });
  // CRC de la envoltura: MS (2) + cuerpo (10) → vive en OBJECTS_START+12.
  const crcOffset = OBJECTS_START + 12;
  file[crcOffset]! ^= 0x01;
  try {
    readAc1015ObjectEnvelope(cursorOf(file), OBJECTS_START, []);
    assert.fail("se esperaba un fallo de CRC de envoltura");
  } catch (error) {
    const detail = (error as { detail?: { code?: string; offset?: number } }).detail;
    assert.equal(detail?.code, "DWG_STRUCTURE_CORRUPT");
    assert.equal(detail?.offset, crcOffset);
  }

  // Torcer un byte del CUERPO también rompe el CRC en ese mismo offset.
  const bodyTwisted = writeAc1015Container({ objects: [{ type: 42 }] });
  bodyTwisted[OBJECTS_START + 5]! ^= 0x80;
  assertDwgError(
    () => readAc1015ObjectEnvelope(cursorOf(bodyTwisted), OBJECTS_START, []),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: una envoltura no puede pisar secciones del directorio", () => {
  const file = writeAc1015Container({ objects: [{ type: 42 }] });
  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);

  // Un offset DENTRO de la sección de clases se rechaza antes de leer nada.
  assertDwgError(
    () =>
      readAc1015ObjectEnvelope(
        cursor,
        header.records[1]!.start + 1,
        header.records,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Y una envoltura que EMPIEZA fuera pero invade una extensión reservada
  // también: el rango completo cuenta, no sólo su primer byte.
  assertDwgError(
    () =>
      readAc1015ObjectEnvelope(cursor, OBJECTS_START, [
        { start: OBJECTS_START + 2, size: 2 },
      ]),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un dato de tamaño cero no puede contener su tipo", () => {
  // Envoltura compuesta a mano: MS(0) + CRC. El tamaño es corrupción ANTES
  // de mirar el CRC.
  const buffer = Uint8Array.of(0x00, 0x00, 0xaa, 0xbb);
  assertDwgError(
    () => readAc1015ObjectEnvelope(cursorOf(buffer), 0, []),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("el writer falla cerrado ante objetos inválidos", () => {
  // Handles no crecientes o fuera de rango.
  assertDwgError(
    () =>
      writeAc1015Container({
        objects: [
          { type: 1, handle: 5 },
          { type: 2, handle: 5 },
        ],
      }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015Container({ objects: [{ type: 1, handle: 0 }] }),
    "DWG_INPUT_INVALID",
  );
  // Tipos fuera del BS y rellenos imposibles.
  assertDwgError(
    () => writeAc1015Container({ objects: [{ type: 0x1_0000 }] }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015Container({ objects: [{ type: 1, bodyFillLength: -1 }] }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015Container({
        objects: [{ type: 1, bodyFillLength: 0x8000 }],
      }),
    "DWG_FILE_LIMIT_EXCEEDED",
  );
  // Más objetos que el tope de laboratorio.
  assertDwgError(
    () =>
      writeAc1015Container({
        objects: Array.from({ length: 10_001 }, () => ({ type: 1 })),
      }),
    "DWG_FILE_LIMIT_EXCEEDED",
  );
  // El constructor del mapa tampoco acepta offsets compartidos.
  assertDwgError(
    () =>
      buildAc1015ObjectMapSection([
        { handle: 1, offset: 50 },
        { handle: 2, offset: 50 },
      ]),
    "DWG_INPUT_INVALID",
  );
});

console.log(
  "ac1015-object-map.spec: fase D1 verde — el mapa poblado y las envolturas hacen round-trip exacto contra el writer; páginas hostiles, CRC rotos, deltas imposibles y topes cortan cerrado.",
);
