/**
 * Spec de la envoltura de objeto R2010+: sin campo de tamaño al frente, CRC-16
 * sobre el cuerpo completo, límites derivados del mapa de handles ordenado
 * por offset (hecho medido VALLE-CORPUS-INTAKE-A60EBE2, intake 2026-08-23).
 *
 * Desde el intake 2026-08-31 el módulo TAMBIÉN decodifica el encabezado del
 * cuerpo (MS tamaño, UMC bits de handles, BOT tipo, H handle propio). Estas
 * pruebas cubren la delimitación, el CRC y ese encabezado; el CUERPO sigue
 * sin decodificarse.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AC1015_SECTION_CRC_SEED } from "../../src/container/ac1015-section-frame.js";
import {
  pairR2010ObjectBounds,
  readR2010ObjectBody,
  readR2010ObjectHeader,
  type R2010ObjectMapEntry,
} from "../../src/container/r2010-object-envelope.js";
import { crc16Dwg } from "../../src/codecs/crc16.js";
import { assertDwgError } from "../support/assert.js";

/** Construye un payload de AcDb:AcDbObjects con N cuerpos [body|CRC16LE]. */
function buildObjectsPayload(
  bodies: readonly number[][],
): { payload: Uint8Array; entries: R2010ObjectMapEntry[] } {
  const bytes: number[] = [];
  const entries: R2010ObjectMapEntry[] = [];
  let handle = 1;
  for (const body of bodies) {
    const start = bytes.length;
    bytes.push(...body);
    const crc = crc16Dwg(Uint8Array.from(body), AC1015_SECTION_CRC_SEED);
    bytes.push(crc & 0xff, (crc >> 8) & 0xff);
    entries.push({ handle, offset: start });
    handle += 1;
  }
  return { payload: Uint8Array.from(bytes), entries };
}

test("los límites se derivan del offset del SIGUIENTE objeto, no de un tamaño declarado", () => {
  const { payload, entries } = buildObjectsPayload([
    [1, 2, 3, 4, 5],
    [9, 8, 7],
    [0xaa, 0xbb, 0xcc, 0xdd],
  ]);
  const bounds = pairR2010ObjectBounds(entries, payload.length);
  assert.equal(bounds.length, 3);
  assert.deepEqual(
    bounds.map((b) => [b.handle, b.start, b.end]),
    [
      [1, 0, 7],
      [2, 7, 12],
      [3, 12, 18],
    ],
  );
  assert.equal(bounds[2]!.end, payload.length);
});

test("el orden de ENTREGA de pairR2010ObjectBounds sigue el offset ascendente, no el orden del mapa", () => {
  const { payload, entries } = buildObjectsPayload([
    [1, 1, 1, 1],
    [2, 2, 2, 2],
  ]);
  // El mapa llega en orden de HANDLE, no de offset: se invierte a propósito.
  const shuffled = [...entries].reverse();
  const bounds = pairR2010ObjectBounds(shuffled, payload.length);
  assert.deepEqual(
    bounds.map((b) => b.handle),
    [1, 2],
  );
});

test("readR2010ObjectBody devuelve el cuerpo exacto cuando el CRC cuadra", () => {
  const { payload, entries } = buildObjectsPayload([[0x11, 0x22, 0x33, 0x44]]);
  const bounds = pairR2010ObjectBounds(entries, payload.length);
  const body = readR2010ObjectBody(payload, bounds[0]!);
  assert.deepEqual([...body.bodyBytes], [0x11, 0x22, 0x33, 0x44]);
  assert.equal(body.byteLength, 6);
});

test("gemelo triste: un CRC roto falla cerrado sin devolver cuerpo alguno", () => {
  const { payload, entries } = buildObjectsPayload([[1, 2, 3]]);
  const bounds = pairR2010ObjectBounds(entries, payload.length);
  const corrupted = Uint8Array.from(payload);
  corrupted[0]! ^= 0xff; // el primer byte del cuerpo cambia; el CRC deja de cuadrar
  assertDwgError(() => readR2010ObjectBody(corrupted, bounds[0]!), "DWG_STRUCTURE_CORRUPT");
});

test("gemelo triste: un slot demasiado pequeño para cuerpo+CRC falla cerrado", () => {
  const payload = Uint8Array.from([0xaa, 0xbb]);
  assertDwgError(
    () => readR2010ObjectBody(payload, { handle: 1, start: 0, end: 2 }),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: dos entradas del mapa con el mismo offset no dejan hueco para un cuerpo", () => {
  const entries: R2010ObjectMapEntry[] = [
    { handle: 1, offset: 4 },
    { handle: 2, offset: 4 },
  ];
  assertDwgError(() => pairR2010ObjectBounds(entries, 10), "DWG_STRUCTURE_CORRUPT");
});

test("gemelo triste: un offset del mapa fuera del payload falla cerrado", () => {
  const entries: R2010ObjectMapEntry[] = [{ handle: 1, offset: 100 }];
  assertDwgError(() => pairR2010ObjectBounds(entries, 10), "DWG_STRUCTURE_CORRUPT");
});

test("determinismo: el mismo payload produce exactamente los mismos límites y cuerpo", () => {
  const { payload, entries } = buildObjectsPayload([
    [5, 4, 3, 2, 1],
    [7, 7, 7],
  ]);
  const boundsA = pairR2010ObjectBounds(entries, payload.length);
  const boundsB = pairR2010ObjectBounds(entries, payload.length);
  assert.deepEqual(boundsA, boundsB);
  const bodyA = readR2010ObjectBody(payload, boundsA[0]!);
  const bodyB = readR2010ObjectBody(payload, boundsB[0]!);
  assert.deepEqual([...bodyA.bodyBytes], [...bodyB.bodyBytes]);
});

/**
 * Empaqueta una cadena de bits ("0110…", los espacios se ignoran) en bytes
 * MSB-first, rellenando el último byte con ceros. El vector se escribe a mano
 * en la prueba para que el lector pueda comprobar campo por campo qué se
 * espera; empaquetarlo con el emisor del laboratorio probaría el emisor, no
 * el lector.
 */
function packBits(bits: string): Uint8Array {
  const clean = bits.replace(/\s+/g, "");
  const bytes = new Uint8Array(Math.ceil(clean.length / 8));
  for (let index = 0; index < clean.length; index += 1) {
    if (clean[index] === "1") bytes[index >> 3]! |= 0x80 >> (index & 7);
  }
  return bytes;
}

/** MS(36) UMC(23) BOT(sel 0 → 0x13) H(código 0, contador 1, 0x22) — una LINE. */
const LINE_HEADER_BITS =
  "00100100 00000000" + // MS: palabra LE 0x0024 = 36, sin continuación
  "00010111" + //          UMC: 0x17 = 23 bits de flujo de handles
  "00 00010011" + //       BOT: selector 0 + RC 0x13
  "0000 0001 00100010"; // H: código 0, contador 1, valor 0x22 = 34

test("el encabezado R2010+ es MS tamaño, UMC bits de handles, BOT tipo y H handle propio", () => {
  const header = readR2010ObjectHeader(packBits(LINE_HEADER_BITS));
  assert.equal(header.objectSize, 36);
  assert.equal(header.handleStreamBits, 23);
  assert.equal(header.type, 0x13);
  assert.equal(header.handle, 34);
  assert.equal(header.handleCode, 0);
  // 16 bits de MS + 8 de UMC + 10 de BOT + 16 de H.
  assert.equal(header.dataBitOffset, 50);
});

test("el selector 1 del BOT nombra un tipo desplazado 0x1F0", () => {
  const header = readR2010ObjectHeader(
    packBits(
      "00100100 00000000" + "00010111" + "01 00001110" + "0000 0001 00100010",
    ),
  );
  // 0x1F0 + 0x0E = 0x1FE, el tipo con que R2010+ nombra lo que R2000 dejaba
  // en su sección de clases.
  assert.equal(header.type, 0x1fe);
});

test("los selectores 2 y 3 del BOT fallan cerrados: nunca se observaron", () => {
  // Ninguno de los 2893 objetos medidos usa estas dos formas. Sin una sola
  // observación no se puede saber su ancho, y un ancho inventado produciría
  // un tipo plausible Y desalinearía todo lo que viene detrás.
  for (const selector of ["10", "11"]) {
    assertDwgError(
      () =>
        readR2010ObjectHeader(
          packBits(
            "00100100 00000000" +
              "00010111" +
              `${selector} 00000010` +
              "0000 0001 00100010",
          ),
        ),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("un handle que el mapa no promete es fallo cerrado, no un objeto plausible", () => {
  // El mismo vector válido, contrastado contra un handle distinto: sin esta
  // comprobación cruzada un encabezado desalineado produciría un objeto que
  // parece correcto y no lo es.
  assertDwgError(
    () => readR2010ObjectHeader(packBits(LINE_HEADER_BITS), 35),
    "DWG_STRUCTURE_CORRUPT",
  );
  assert.equal(readR2010ObjectHeader(packBits(LINE_HEADER_BITS), 34).handle, 34);
});
