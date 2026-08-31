/**
 * Spec del FLUJO DE HANDLES del cuerpo R2010+ (`reader/r2010-handle-stream.ts`,
 * VALLE-CORPUS-R2010-HANDLE-STREAM).
 *
 * Los cuerpos son sintéticos, construidos a mano bit a bit con `DwgBitEmitter`
 * (espejo exacto del lector). No hay bytes DWG reales aquí: la falsación
 * contra el corpus vive en `scripts/dwg/probe-r2010-handle-stream.mjs` y su
 * evidencia. Estas pruebas fijan el CONTRATO — incluido el fallo cerrado, que
 * es la mitad que de verdad importa.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DwgBitEmitter } from "../../src/writer/dwg-bit-emitter.js";
import { readR2010ObjectHeader } from "../../src/container/r2010-object-envelope.js";
import {
  deriveR2010HandleShape,
  interpretR2010HandleStream,
  readR2010HandleStream,
} from "../../src/reader/r2010-handle-stream.js";
import { assertDwgError } from "../support/assert.js";

/** La forma por defecto del corpus: sólo capa, que es lo medido 90/105. */
const SOLO_CAPA = {
  hasOwner: false,
  reactorCount: 0,
  hasXdictionary: false,
  hasLinetype: false,
  hasPlotstyle: false,
} as const;

/**
 * Cuerpo R2010+ sintético mínimo: MS + UMC + BOT + H propio, después el
 * relleno de datos que el llamador pida y por último el flujo de handles.
 * `handleStreamBits` se DECLARA aparte para poder construir a propósito un
 * cuerpo cuyo UMC miente sobre el tamaño del tramo.
 */
function buildBody(options: {
  readonly handle: number;
  readonly dataBits: number;
  readonly handleStreamBits: number;
  readonly stream: (body: DwgBitEmitter) => void;
}): Uint8Array {
  const body = new DwgBitEmitter();
  body.pushBits(0b00, 2); // BOT selector 0: RC literal
  body.emitRC(0x13); // LINE; el tipo es indiferente para este módulo
  body.emitH(0, options.handle);
  for (let index = 0; index < options.dataBits; index += 1) body.pushBit(0);
  options.stream(body);
  if (body.bitLength % 8 !== 0) {
    throw new Error(
      `test body is not byte-aligned (${body.bitLength} bits) — fix the test's bit budget`,
    );
  }
  const bodyBytes = body.toBytes();
  const objectSize = bodyBytes.length - 2 /* MS */ - 1; /* UMC */

  const withHeader = new DwgBitEmitter();
  withHeader.emitRS(objectSize);
  withHeader.emitRC(options.handleStreamBits);
  withHeader.pushEmitter(body);
  return withHeader.toBytes();
}

/** Un H de código 5 con un byte de valor ocupa 16 bits: 4 + 4 + 8. */
const H_ONE_BYTE_BITS = 16;

test("un solo handle absoluto (la capa) se lee y el relleno de byte se acepta", () => {
  // 2 (BOT) + 8 (RC) + 16 (H propio, 1 byte) = 26 bits de encabezado.
  // + 6 de datos = 32. + 16 del handle de capa = 48. + 7 de relleno = 55...
  // no cierra: se usan 6 de datos y 0 de relleno para caer en 48 (6 bytes).
  const bytes = buildBody({
    handle: 0x22,
    dataBits: 6,
    handleStreamBits: H_ONE_BYTE_BITS,
    stream: (body) => {
      body.emitH(5, 16); // capa: referencia absoluta al handle 16
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x22);
  const handles = readR2010HandleStream(bytes, header);
  assert.equal(handles.length, 1);
  assert.deepEqual(handles[0], { kind: "absolute", handle: 16 });

  const refs = interpretR2010HandleStream(handles, SOLO_CAPA);
  assert.deepEqual(refs.layer, { kind: "absolute", handle: 16 });
  assert.equal(refs.owner, undefined);
  assert.equal(refs.xdictionary, undefined);
  assert.deepEqual(refs.extra, []);
});

test("el relleno hasta el byte se tolera: 7 bits sobrantes no son un handle", () => {
  // Igual que el anterior pero con el tramo declarado 7 bits más largo, que
  // es el caso mayoritario del corpus (histograma de residuos 0..7).
  const bytes = buildBody({
    handle: 0x22,
    dataBits: 7,
    handleStreamBits: H_ONE_BYTE_BITS + 7,
    stream: (body) => {
      body.emitH(5, 16);
      for (let index = 0; index < 7; index += 1) body.pushBit(0);
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x22);
  const handles = readR2010HandleStream(bytes, header);
  assert.equal(handles.length, 1);
  assert.deepEqual(handles[0], { kind: "absolute", handle: 16 });
});

test("un TEXT con su puntero a STYLE devuelve el sobrante en `extra`, no lo descarta", () => {
  // El caso medido 15/15: la capa y UN handle adicional que el gemelo AC1015
  // no modela porque lo deja en su tramo opaco declarado.
  const bytes = buildBody({
    handle: 0x25,
    dataBits: 6,
    handleStreamBits: H_ONE_BYTE_BITS * 2,
    stream: (body) => {
      body.emitH(5, 16); // capa
      body.emitH(5, 17); // STYLE
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x25);
  const handles = readR2010HandleStream(bytes, header);
  assert.equal(handles.length, 2);

  const refs = interpretR2010HandleStream(handles, SOLO_CAPA);
  assert.deepEqual(refs.layer, { kind: "absolute", handle: 16 });
  assert.deepEqual(refs.extra, [{ kind: "absolute", handle: 17 }]);
});

test("propietario, xdictionary y capa se reparten en el orden medido", () => {
  const bytes = buildBody({
    handle: 0x30,
    dataBits: 6,
    handleStreamBits: H_ONE_BYTE_BITS * 3,
    stream: (body) => {
      body.emitH(5, 0x40); // propietario
      body.emitH(5, 0x50); // xdictionary
      body.emitH(5, 16); // capa
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x30);
  const refs = interpretR2010HandleStream(
    readR2010HandleStream(bytes, header),
    {
      hasOwner: true,
      reactorCount: 0,
      hasXdictionary: true,
      hasLinetype: false,
      hasPlotstyle: false,
    },
  );
  assert.deepEqual(refs.owner, { kind: "absolute", handle: 0x40 });
  assert.deepEqual(refs.xdictionary, { kind: "absolute", handle: 0x50 });
  assert.deepEqual(refs.layer, { kind: "absolute", handle: 16 });
  assert.deepEqual(refs.extra, []);
});

test("FALLA CERRADO: un tramo con 8 bits sobrantes es un handle sin leer, no relleno", () => {
  // Se declaran 8 bits MÁS de los que el flujo usa. Ocho bits caben en un H
  // mínimo, así que el lector no puede llamarlos relleno: debe negarse.
  const bytes = buildBody({
    handle: 0x22,
    dataBits: 6,
    handleStreamBits: H_ONE_BYTE_BITS,
    stream: (body) => {
      body.emitH(5, 16);
      // Ocho bits que el UMC declarado NO cuenta como parte del tramo, así
      // que el lector arranca 8 bits antes y sobrará exactamente un hueco.
      for (let index = 0; index < 8; index += 1) body.pushBit(0);
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x22);
  // El tramo declarado (16 bits) empieza 8 bits DESPUÉS del handle real, así
  // que lo que se lee no es el handle: el aterrizaje delata el descuadre.
  assertDwgError(
    () => readR2010HandleStream(bytes, header),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("FALLA CERRADO: una forma que pide más handles de los que el flujo trae", () => {
  const bytes = buildBody({
    handle: 0x22,
    dataBits: 6,
    handleStreamBits: H_ONE_BYTE_BITS,
    stream: (body) => {
      body.emitH(5, 16); // sólo la capa
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x22);
  const handles = readR2010HandleStream(bytes, header);
  assertDwgError(
    () =>
      interpretR2010HandleStream(handles, {
        hasOwner: true, // el flujo no trae propietario: no se inventa
        reactorCount: 0,
        hasXdictionary: true,
        hasLinetype: false,
        hasPlotstyle: false,
      }),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("FALLA CERRADO: un tramo declarado más largo que el propio cuerpo", () => {
  const bytes = buildBody({
    handle: 0x22,
    dataBits: 6,
    // Imposible: el cuerpo entero mide 48 bits. Se queda por debajo de 128
    // a propósito — a partir de ahí el bit 7 haría de continuación de UMC y
    // la prueba estaría midiendo el encabezado, no el flujo.
    handleStreamBits: 120,
    stream: (body) => {
      body.emitH(5, 16);
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x22);
  assertDwgError(
    () => readR2010HandleStream(bytes, header),
    "DWG_STRUCTURE_CORRUPT",
  );
});

/**
 * Prefijo común sintético con el orden MEDIDO: EED ausente (BS 0), sin
 * gráfico, modo BB, reactores BL, bit de xdic-missing, bit de sin-vínculos,
 * color CmC, escala BD, banderas BB de linetype y de plotstyle.
 */
function emitCommonPrefix(
  body: DwgBitEmitter,
  options: {
    readonly entityMode: number;
    readonly reactorCount: number;
    readonly xdicMissing: 0 | 1;
    readonly noLinks: 0 | 1;
    readonly linetypeFlags: number;
    readonly plotstyleFlags: number;
  },
): void {
  body.emitBS(0); // EED ausente
  body.pushBit(0); // sin gráfico de previsualización
  body.pushBits(options.entityMode, 2);
  body.emitBL(options.reactorCount);
  body.pushBit(options.xdicMissing);
  body.pushBit(options.noLinks);
  body.emitBS(0); // color
  body.emitBD(1); // escala de tipo de línea
  body.pushBits(options.linetypeFlags, 2);
  body.pushBits(options.plotstyleFlags, 2);
}

test("la forma se deduce del propio cuerpo con el orden medido (xdic-missing antes de sin-vínculos)", () => {
  const body = new DwgBitEmitter();
  emitCommonPrefix(body, {
    entityMode: 0, // lleva propietario
    reactorCount: 0,
    xdicMissing: 0, // SÍ hay xdictionary
    noLinks: 1,
    linetypeFlags: 3, // lleva linetype
    plotstyleFlags: 0,
  });
  const prefixBits = body.bitLength;

  const bytes = buildBody({
    handle: 0x30,
    dataBits: 0,
    handleStreamBits: H_ONE_BYTE_BITS * 4,
    stream: (target) => {
      target.pushEmitter(body);
      target.emitH(5, 0x40); // propietario
      target.emitH(5, 0x50); // xdictionary
      target.emitH(5, 16); // capa
      target.emitH(5, 0x60); // linetype
      // Cierre a byte: el prefijo mide `prefixBits`; se rellena lo que falte.
      const used = 26 + prefixBits + H_ONE_BYTE_BITS * 4;
      for (let index = 0; index < (8 - (used % 8)) % 8; index += 1) {
        target.pushBit(0);
      }
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x30);
  const shape = deriveR2010HandleShape(bytes, header);
  assert.equal(shape.hasOwner, true);
  assert.equal(shape.reactorCount, 0);
  assert.equal(shape.hasXdictionary, true);
  assert.equal(shape.hasLinetype, true);
  assert.equal(shape.hasPlotstyle, false);
  assert.equal(shape.noLinks, true);
});

test("FALLA CERRADO: un objeto con EED, cuya disposición no está medida", () => {
  const body = new DwgBitEmitter();
  body.emitBS(4); // EED presente: 4 bytes declarados
  const bytes = buildBody({
    handle: 0x31,
    dataBits: 0,
    handleStreamBits: H_ONE_BYTE_BITS,
    stream: (target) => {
      target.pushEmitter(body);
      target.emitH(5, 16);
      const used = 26 + body.bitLength + H_ONE_BYTE_BITS;
      for (let index = 0; index < (8 - (used % 8)) % 8; index += 1) {
        target.pushBit(0);
      }
    },
  });

  const header = readR2010ObjectHeader(bytes, 0x31);
  assertDwgError(
    () => deriveR2010HandleShape(bytes, header),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});
