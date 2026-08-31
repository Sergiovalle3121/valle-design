/**
 * Spec del FLUJO DE CADENAS del cuerpo R2010+
 * (`reader/r2010-string-stream.ts`, VALLE-CORPUS-R2010-STRING-STREAM).
 *
 * Cuerpos sintéticos construidos bit a bit con `DwgBitEmitter`. La falsación
 * contra el corpus vive en `scripts/dwg/probe-r2010-string-stream.mjs`; estas
 * pruebas fijan el CONTRATO, y sobre todo los fallos cerrados: que un objeto
 * con más de una cadena se niegue en vez de devolver media es la mitad que de
 * verdad importa aquí.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DwgBitEmitter } from "../../src/writer/dwg-bit-emitter.js";
import { readR2010ObjectHeader } from "../../src/container/r2010-object-envelope.js";
import {
  decodeR2010StringUnits,
  locateR2010StringStream,
  readR2010SingleString,
} from "../../src/reader/r2010-string-stream.js";
import { assertDwgError } from "../support/assert.js";

/** Un `TU`: BS con el número de caracteres y luego UTF-16LE. */
function emitTU(body: DwgBitEmitter, text: string): number {
  const before = body.bitLength;
  body.emitBS(text.length);
  for (const char of text) {
    const code = char.charCodeAt(0);
    body.emitRC(code & 0xff);
    body.emitRC((code >> 8) & 0xff);
  }
  return body.bitLength - before;
}

/**
 * Cuerpo R2010+ sintético: MS + UMC + BOT + H propio, relleno de datos, el
 * flujo de cadenas que el llamador emita, su campo de tamaño, el bit de
 * presencia y el flujo de handles.
 */
function buildBody(options: {
  readonly handle: number;
  readonly dataBits: number;
  readonly emitStrings: ((body: DwgBitEmitter) => number) | null;
  /** Permite declarar un tamaño DISTINTO del real, para probar el descuadre. */
  readonly declaredSizeBits?: number;
  readonly handleStreamBits: number;
}): Uint8Array {
  const body = new DwgBitEmitter();
  body.pushBits(0b00, 2); // BOT selector 0
  body.emitRC(0x13);
  body.emitH(0, options.handle);
  for (let index = 0; index < options.dataBits; index += 1) body.pushBit(0);

  if (options.emitStrings === null) {
    body.pushBit(0); // sin flujo de cadenas
  } else {
    const realSize = options.emitStrings(body);
    body.emitRS(options.declaredSizeBits ?? realSize);
    body.pushBit(1);
  }

  // El flujo de handles: un H de código 5 con un byte (16 bits) y relleno.
  body.emitH(5, 16);
  const pad = (8 - (body.bitLength % 8)) % 8;
  for (let index = 0; index < pad; index += 1) body.pushBit(0);

  const bodyBytes = body.toBytes();
  const objectSize = bodyBytes.length - 2 - 1;
  const withHeader = new DwgBitEmitter();
  withHeader.emitRS(objectSize);
  withHeader.emitRC(options.handleStreamBits);
  withHeader.pushEmitter(body);
  return withHeader.toBytes();
}

/** El flujo de handles que `buildBody` emite: un H de 16 bits más relleno. */
function handleStreamBitsFor(prefixBits: number): number {
  return 16 + ((8 - ((prefixBits + 16) % 8)) % 8);
}

test("una cadena se localiza contando hacia atrás y decodifica como BS + UTF-16LE", () => {
  const texto = "VALLE DESIGN";
  // 26 (encabezado) + 6 (datos) + TU + 16 (tamaño) + 1 (presencia)
  const tuBits = 10 + texto.length * 16;
  const prefix = 26 + 6 + tuBits + 16 + 1;
  const bytes = buildBody({
    handle: 0x25,
    dataBits: 6,
    emitStrings: (body) => emitTU(body, texto),
    handleStreamBits: handleStreamBitsFor(prefix),
  });

  const header = readR2010ObjectHeader(bytes, 0x25);
  const span = locateR2010StringStream(bytes, header);
  assert.equal(span.present, true);
  assert.equal(span.sizeBits, tuBits);

  const units = readR2010SingleString(bytes, span);
  assert.equal(decodeR2010StringUnits(units), texto);
});

test("un objeto sin cadenas se declara ausente, no vacío", () => {
  const prefix = 26 + 6 + 1;
  const bytes = buildBody({
    handle: 0x22,
    dataBits: 6,
    emitStrings: null,
    handleStreamBits: handleStreamBitsFor(prefix),
  });

  const header = readR2010ObjectHeader(bytes, 0x22);
  const span = locateR2010StringStream(bytes, header);
  assert.equal(span.present, false);
  assert.equal(span.sizeBits, 0);
  // Pedirle una cadena a un objeto que declara no tenerlas es un error del
  // llamador, y se dice: no se devuelve la cadena vacía como si fuera un dato.
  assertDwgError(
    () => readR2010SingleString(bytes, span),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("FALLA CERRADO: un flujo con MÁS de una cadena, que el corpus no ejercita", () => {
  // Dos TU seguidos, con el tamaño declarado cubriendo ambos: el modelo
  // medido no cubre este caso y el lector debe negarse en vez de devolver
  // sólo la primera como si fuera todo.
  const bytes = buildBody({
    handle: 0x26,
    dataBits: 6,
    emitStrings: (body) => {
      const a = emitTU(body, "MURO");
      const b = emitTU(body, "EJE");
      return a + b;
    },
    handleStreamBits: handleStreamBitsFor(
      26 + 6 + (10 + 4 * 16) + (10 + 3 * 16) + 16 + 1,
    ),
  });

  const header = readR2010ObjectHeader(bytes, 0x26);
  const span = locateR2010StringStream(bytes, header);
  assert.equal(span.present, true);
  assertDwgError(
    () => readR2010SingleString(bytes, span),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("FALLA CERRADO: un tamaño declarado mayor que el cuerpo entero", () => {
  const texto = "EJE";
  const tuBits = 10 + texto.length * 16;
  const bytes = buildBody({
    handle: 0x27,
    dataBits: 6,
    emitStrings: (body) => emitTU(body, texto),
    declaredSizeBits: 4000, // imposible: el cuerpo mide mucho menos
    handleStreamBits: handleStreamBitsFor(26 + 6 + tuBits + 16 + 1),
  });

  const header = readR2010ObjectHeader(bytes, 0x27);
  assertDwgError(
    () => locateR2010StringStream(bytes, header),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("FALLA CERRADO: un tamaño declarado que no cuadra con la cadena real", () => {
  const texto = "EJE";
  const tuBits = 10 + texto.length * 16;
  const bytes = buildBody({
    handle: 0x28,
    dataBits: 6,
    emitStrings: (body) => emitTU(body, texto),
    declaredSizeBits: tuBits - 8, // ocho bits de menos: el inicio se corre
    handleStreamBits: handleStreamBitsFor(26 + 6 + tuBits + 16 + 1),
  });

  const header = readR2010ObjectHeader(bytes, 0x28);
  const span = locateR2010StringStream(bytes, header);
  assertDwgError(
    () => readR2010SingleString(bytes, span),
    "DWG_STRUCTURE_CORRUPT",
  );
});
