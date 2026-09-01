/**
 * Spec de los campos no-nombre de una entrada de tabla en R2010+
 * (`reader/r2010-table-fields.ts`, VALLE-CORPUS-R2010-LAYER-ESTADO-Y-COLOR).
 *
 * Los cuerpos son sintéticos, construidos bit a bit con `DwgBitEmitter`
 * siguiendo la estructura MEDIDA: MS + UMC + BOT + H + cabeza de anchura
 * medida + `BS` de estado + color R2004 (`BS` + `BL` + `RC`). No hay bytes
 * DWG reales aquí; el corpus lo mide la sonda, esto fija el CONTRATO.
 *
 * Lo que estas pruebas protegen de verdad es la RED: que una cabeza distinta
 * de la medida produzca `DWG_VERSION_DECODER_UNSUPPORTED` —capacidad
 * ausente— y jamás un color plausible y equivocado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readR2010ObjectHeader } from "../../src/container/r2010-object-envelope.js";
import {
  R2010_TABLE_ENTRY_HEAD_BITS,
  readR2010LayerFields,
  readR2010LinetypeFields,
} from "../../src/reader/r2010-table-fields.js";
import { DwgBitEmitter } from "../../src/writer/dwg-bit-emitter.js";
import { assertDwgError } from "../support/assert.js";

const LAYER_TYPE = 0x33;

/** Método ACI explícito del `CmC` de R2004: índice en los 24 bits bajos. */
const byIndex = (aci: number): number => (0xc3 << 24 >>> 0) + aci;

/**
 * Cuerpo sintético con la cabeza y los campos de una capa. Devuelve además
 * el bit donde TERMINA el color, que es lo que un objeto real declararía como
 * inicio de su flujo de cadenas.
 */
function buildLayer(options: {
  readonly headBits: number;
  readonly stateFlags: number;
  readonly rawColor: number;
  readonly colorByte?: number;
}): { bytes: Uint8Array; endBit: number } {
  const body = new DwgBitEmitter();
  body.pushBits(0b00, 2); // BOT selector 0: RC literal
  body.emitRC(LAYER_TYPE);
  body.emitH(0, 1);
  for (let index = 0; index < options.headBits; index += 1) body.pushBit(0);
  body.emitBS(options.stateFlags);
  body.emitBS(0); // índice del CmC, que R2004 deja en cero
  body.emitBL(options.rawColor);
  body.emitRC(options.colorByte ?? 0);
  const endBit = 16 /* MS */ + 8 /* UMC */ + body.bitLength;
  while (body.bitLength % 8 !== 0) body.pushBit(0);

  const withHeader = new DwgBitEmitter();
  withHeader.emitRS(body.toBytes().length); // MS: irrelevante para este lector
  withHeader.emitRC(0); // UMC: sin flujo de handles en la prueba
  withHeader.pushEmitter(body);
  return { bytes: withHeader.toBytes(), endBit };
}

test("AC1024: estado y color exactos con la cabeza medida de 7 bits", () => {
  const { bytes, endBit } = buildLayer({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1024,
    stateFlags: 1008,
    rawColor: byIndex(7),
  });
  const header = readR2010ObjectHeader(bytes, 1);
  assert.equal(header.type, LAYER_TYPE);
  assert.deepEqual(readR2010LayerFields(bytes, header, endBit, "AC1024"), {
    stateFlags: 1008,
    colorIndex: 7,
  });
});

test("AC1027 y AC1032 llevan un bit MÁS de cabeza que AC1024", () => {
  for (const version of ["AC1027", "AC1032"] as const) {
    assert.equal(
      R2010_TABLE_ENTRY_HEAD_BITS[version],
      R2010_TABLE_ENTRY_HEAD_BITS.AC1024 + 1,
      `${version} debe llevar exactamente un bit más que AC1024`,
    );
    const { bytes, endBit } = buildLayer({
      headBits: R2010_TABLE_ENTRY_HEAD_BITS[version],
      stateFlags: 1016,
      rawColor: byIndex(5),
    });
    const header = readR2010ObjectHeader(bytes, 1);
    assert.deepEqual(readR2010LayerFields(bytes, header, endBit, version), {
      stateFlags: 1016,
      colorIndex: 5,
    });
  }
});

test("ByLayer y ByBlock se proyectan a los índices que el modelo R2000 usa", () => {
  for (const [method, expected] of [
    [0xc0, 256],
    [0xc1, 0],
  ] as const) {
    const { bytes, endBit } = buildLayer({
      headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1024,
      stateFlags: 1008,
      rawColor: (method << 24) >>> 0,
    });
    const header = readR2010ObjectHeader(bytes, 1);
    assert.equal(
      readR2010LayerFields(bytes, header, endBit, "AC1024").colorIndex,
      expected,
    );
  }
});

test("un cuerpo de AC1027 leído como AC1024 NO cuela: falla cerrado por aterrizaje", () => {
  // La red que hace inofensiva la ambigüedad de la cabeza: leer con la
  // anchura equivocada NO devuelve un color plausible, devuelve capacidad
  // ausente. Es exactamente el modo de fallo que este intake compra.
  const { bytes, endBit } = buildLayer({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1027,
    stateFlags: 1008,
    rawColor: byIndex(7),
  });
  const header = readR2010ObjectHeader(bytes, 1);
  assertDwgError(
    () => readR2010LayerFields(bytes, header, endBit, "AC1024"),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("una cabeza más ancha que la medida (EED, reactores) falla cerrado, no miente", () => {
  const { bytes, endBit } = buildLayer({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1024 + 9,
    stateFlags: 1008,
    rawColor: byIndex(3),
  });
  const header = readR2010ObjectHeader(bytes, 1);
  assertDwgError(
    () => readR2010LayerFields(bytes, header, endBit, "AC1024"),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("un color por NOMBRE de libro es capacidad ausente, nunca un color inventado", () => {
  const { bytes, endBit } = buildLayer({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1024,
    stateFlags: 1008,
    rawColor: byIndex(7),
    colorByte: 1,
  });
  const header = readR2010ObjectHeader(bytes, 1);
  assertDwgError(
    () => readR2010LayerFields(bytes, header, endBit, "AC1024"),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("un método de color fuera del modelo de índice es capacidad ausente", () => {
  const { bytes, endBit } = buildLayer({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1024,
    stateFlags: 1008,
    rawColor: (0xc2 << 24) >>> 0, // RGB: existe en el formato, no se modela
  });
  const header = readR2010ObjectHeader(bytes, 1);
  assertDwgError(
    () => readR2010LayerFields(bytes, header, endBit, "AC1024"),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("un flujo de cadenas ANTES de la cabeza medida no revienta: capacidad ausente", () => {
  const { bytes } = buildLayer({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1024,
    stateFlags: 1008,
    rawColor: byIndex(7),
  });
  const header = readR2010ObjectHeader(bytes, 1);
  assertDwgError(
    () => readR2010LayerFields(bytes, header, header.dataBitOffset, "AC1024"),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

const LTYPE_TYPE = 0x39;

/**
 * Cuerpo sintético de un LTYPE con la cabeza medida y `dashes` trazos.
 * `withTextArea` reproduce la disposición de R2000 —con su área de texto de
 * 256 bytes— que este intake midió AUSENTE en R2010+.
 */
function buildLinetype(options: {
  readonly headBits: number;
  readonly patternLength: number;
  readonly alignment: number;
  readonly dashes: readonly number[];
  readonly withTextArea?: boolean;
}): { bytes: Uint8Array; endBit: number } {
  const body = new DwgBitEmitter();
  body.pushBits(0b00, 2);
  body.emitRC(LTYPE_TYPE);
  body.emitH(0, 1);
  for (let index = 0; index < options.headBits; index += 1) body.pushBit(0);
  body.emitBD(options.patternLength);
  body.emitRC(options.alignment);
  body.emitRC(options.dashes.length);
  for (const dash of options.dashes) {
    body.emitBD(dash);
    body.emitBS(0);
    body.emitRD(0);
    body.emitRD(0);
    body.emitBD(0);
    body.emitBD(0);
    body.emitBS(0);
  }
  if (options.withTextArea === true) {
    for (let index = 0; index < 256; index += 1) body.emitRC(0);
  }
  const endBit = 16 + 8 + body.bitLength;
  while (body.bitLength % 8 !== 0) body.pushBit(0);

  const withHeader = new DwgBitEmitter();
  withHeader.emitRS(body.toBytes().length);
  withHeader.emitRC(0);
  withHeader.pushEmitter(body);
  return { bytes: withHeader.toBytes(), endBit };
}

test("LTYPE: patrón, alineación y trazos exactos con la MISMA cabeza que la capa", () => {
  const { bytes, endBit } = buildLinetype({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1024,
    patternLength: 1,
    alignment: 65,
    dashes: [0.75, -0.25],
  });
  const header = readR2010ObjectHeader(bytes, 1);
  const fields = readR2010LinetypeFields(bytes, header, endBit, "AC1024");
  assert.equal(fields.patternLength, 1);
  assert.equal(fields.alignment, 65);
  assert.deepEqual([...fields.dashLengths], [0.75, -0.25]);
});

test("LTYPE de patrón vacío: cero trazos, sin inventar un patrón por defecto", () => {
  const { bytes, endBit } = buildLinetype({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1032,
    patternLength: 0,
    alignment: 65,
    dashes: [],
  });
  const header = readR2010ObjectHeader(bytes, 1);
  const fields = readR2010LinetypeFields(bytes, header, endBit, "AC1032");
  assert.equal(fields.patternLength, 0);
  assert.deepEqual([...fields.dashLengths], []);
});

test("LTYPE con el área de texto de R2000 no cuela: falla cerrado por aterrizaje", () => {
  // El área de 256 bytes se midió AUSENTE en R2010+. Un cuerpo que la trajera
  // declararía su flujo de cadenas DESPUÉS de ella —`locateR2010StringStream`
  // deriva ese inicio del propio archivo, no de este modelo de campos—, así
  // que el lector aterriza 2048 bits antes y lo dice en vez de devolver un
  // patrón que casualmente cuadra.
  const { bytes, endBit } = buildLinetype({
    headBits: R2010_TABLE_ENTRY_HEAD_BITS.AC1024,
    patternLength: 1,
    alignment: 65,
    dashes: [0.75, -0.25],
    withTextArea: true,
  });
  const header = readR2010ObjectHeader(bytes, 1);
  assertDwgError(
    () => readR2010LinetypeFields(bytes, header, endBit, "AC1024"),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
});

test("LTYPE con un recuento de trazos fuera de presupuesto es CORRUPCIÓN, no capacidad ausente", () => {
  // Distinguir las dos categorías importa: el llamador actúa distinto ante
  // «no sé leer esto» y ante «estos bytes están rotos».
  const body = new DwgBitEmitter();
  body.pushBits(0b00, 2);
  body.emitRC(LTYPE_TYPE);
  body.emitH(0, 1);
  for (let index = 0; index < R2010_TABLE_ENTRY_HEAD_BITS.AC1024; index += 1) {
    body.pushBit(0);
  }
  body.emitBD(1);
  body.emitRC(65);
  body.emitRC(200); // más trazos de los que este lector presupuesta
  while (body.bitLength % 8 !== 0) body.pushBit(0);
  const withHeader = new DwgBitEmitter();
  withHeader.emitRS(body.toBytes().length);
  withHeader.emitRC(0);
  withHeader.pushEmitter(body);
  const bytes = withHeader.toBytes();
  const header = readR2010ObjectHeader(bytes, 1);
  assertDwgError(
    () => readR2010LinetypeFields(bytes, header, bytes.length * 8, "AC1024"),
    "DWG_STRUCTURE_CORRUPT",
  );
});
