/**
 * Spec de la fase D4, mitad de entidad: INSERT y su referencia al bloque.
 *
 * Los casos felices usan el writer real como única fuente del binario válido
 * y exigen geometría EXACTA más la referencia al BLOCK_RECORD resuelta; los
 * gemelos tristes componen cuerpos hostiles a mano con el mismo
 * `DwgBitEmitter` (formas de escala 01/10 que el writer no emite, flujos que
 * no alcanzan para el handle del bloque, truncados, descuadres del tamaño en
 * bits) y los filtros cruzados exigen que un tipo ajeno sea capacidad
 * ausente, no corrupción.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { DwgInsertEntity } from "../../src/model/entity-geometry.js";
import {
  AC1015_TYPE_INSERT,
  decodeAc1015EntityBody,
} from "../../src/objects/entities-core.js";
import { decodeAc1015LayerBody } from "../../src/objects/table-layer.js";
import {
  DwgBitEmitter,
  writeAc1015EntityBody,
} from "../../src/writer/ac1015-entity-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Un INSERT de referencia con todos los campos no triviales. */
function sampleInsert(overrides: Partial<DwgInsertEntity> = {}): DwgInsertEntity {
  return {
    kind: "insert",
    position: { x: 12.5, y: -3.25, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    attributesFollow: false,
    ...overrides,
  };
}

/** Round-trip de un cuerpo suelto con su referencia de bloque. */
function roundTrip(entity: DwgInsertEntity, blockHandle = 5, handle = 9): void {
  const body = writeAc1015EntityBody(entity, handle, {
    insertBlockHandle: blockHandle,
  });
  const decoded = decodeAc1015EntityBody(body);
  assert.deepEqual(decoded.entity, entity);
  assert.equal(decoded.common.type, AC1015_TYPE_INSERT);
  assert.equal(decoded.common.ownHandle.value, handle);
  assert.deepEqual(
    { ...decoded.references.blockRecord },
    { kind: "absolute", handle: blockHandle },
  );
}

/**
 * Cabecera común mínima a mano (espejo del writer) para los cuerpos
 * hostiles: modo 2, cero reactores, banderas a cero.
 */
function handmadeCommonTail(handle = 1): DwgBitEmitter {
  const tail = new DwgBitEmitter();
  tail.emitH(0, handle);
  tail.emitBS(0); // EED vacío
  tail.pushBit(0); // sin gráfico
  tail.pushBits(0b10, 2); // modo 2
  tail.emitBL(0); // cero reactores
  tail.pushBit(1); // sin vínculos
  tail.emitBS(256); // color ByLayer
  tail.emitBD(1); // escala de linetype
  tail.pushBits(0, 2);
  tail.pushBits(0, 2);
  tail.emitBS(0); // visible
  tail.emitRC(0x1d); // lineweight
  return tail;
}

/** Compone un cuerpo completo: tipo BS + RL (con ajuste) + tail + flujo. */
function composeBody(
  type: number,
  tail: DwgBitEmitter,
  bitSizeAdjust = 0,
  streamTail?: DwgBitEmitter,
): Uint8Array {
  const head = new DwgBitEmitter();
  head.emitBS(type);
  const bitSize = head.bitLength + 32 + tail.bitLength + bitSizeAdjust;
  const body = new DwgBitEmitter();
  body.pushEmitter(head);
  body.emitRL(bitSize);
  body.pushEmitter(tail);
  if (streamTail !== undefined) {
    body.pushEmitter(streamTail);
  }
  return body.toBytes();
}

/** El flujo mínimo de un INSERT: xdict y capa nulos + handle del bloque. */
function insertStream(blockCode = 5, blockHandle = 5): DwgBitEmitter {
  const stream = new DwgBitEmitter();
  stream.emitH(0, 0);
  stream.emitH(0, 0);
  stream.emitH(blockCode, blockHandle);
  return stream;
}

test("el código de tipo BS registrado del INSERT", () => {
  assert.equal(AC1015_TYPE_INSERT, 7);
});

test("round-trip INSERT: escala unitaria (forma 11), rotación y extrusión", () => {
  roundTrip(sampleInsert());
  roundTrip(
    sampleInsert({
      position: { x: 0, y: 0, z: -4.5 },
      rotation: 1.5707963267948966,
      extrusion: { x: 0.6, y: 0, z: 0.8 },
    }),
    0x1f0,
    0x200,
  );
});

test("round-trip INSERT: escalas generales, uniformes no unitarias y espejo", () => {
  // General: tres escalas distintas (forma 00: RD + DD contra la X).
  roundTrip(sampleInsert({ scale: { x: 2.5, y: 0.5, z: 1.25 } }));
  // Uniforme no unitaria: viaja como 00 con los DD en su atajo de defecto.
  roundTrip(sampleInsert({ scale: { x: 3.5, y: 3.5, z: 3.5 } }));
  // Espejo: escala X negativa, legítima en CAD.
  roundTrip(sampleInsert({ scale: { x: -1, y: 1, z: 1 } }));
  // Un −0.0 de rotación conserva su bit de signo.
  const body = writeAc1015EntityBody(sampleInsert({ rotation: -0 }), 3, {
    insertBlockHandle: 2,
  });
  const decoded = decodeAc1015EntityBody(body);
  assert.ok(Object.is((decoded.entity as DwgInsertEntity).rotation, -0));
});

test("las formas de escala 01 y 10 se aceptan al leer aunque no se emitan", () => {
  // Forma 10: un único RD uniforme para las tres escalas.
  const uniformTail = handmadeCommonTail();
  uniformTail.emitBD(1); // posición X
  uniformTail.emitBD(2); // posición Y
  uniformTail.emitBD(0); // posición Z
  uniformTail.pushBits(0b10, 2);
  uniformTail.emitRD(7.5);
  uniformTail.emitBD(0); // rotación
  uniformTail.pushBit(1); // extrusión canónica
  uniformTail.pushBit(0); // sin ATTRIBs
  const uniform = decodeAc1015EntityBody(
    composeBody(AC1015_TYPE_INSERT, uniformTail, 0, insertStream()),
  );
  assert.deepEqual((uniform.entity as DwgInsertEntity).scale, {
    x: 7.5,
    y: 7.5,
    z: 7.5,
  });

  // Forma 01: la X vale 1.0 y las Y/Z viajan como DD contra 1.0.
  const partialTail = handmadeCommonTail();
  partialTail.emitBD(0);
  partialTail.emitBD(0);
  partialTail.emitBD(0);
  partialTail.pushBits(0b01, 2);
  partialTail.emitDD(2.5, 1); // Y contra el defecto 1.0
  partialTail.emitDD(1, 1); // Z igual al defecto: dos bits
  partialTail.emitBD(0);
  partialTail.pushBit(1);
  partialTail.pushBit(0);
  const partial = decodeAc1015EntityBody(
    composeBody(AC1015_TYPE_INSERT, partialTail, 0, insertStream()),
  );
  assert.deepEqual((partial.entity as DwgInsertEntity).scale, {
    x: 1,
    y: 2.5,
    z: 1,
  });
});

test("la referencia relativa del bloque se resuelve contra el handle propio", () => {
  const tail = handmadeCommonTail(0x40);
  tail.emitBD(0);
  tail.emitBD(0);
  tail.emitBD(0);
  tail.pushBits(0b11, 2); // escalas unitarias
  tail.emitBD(0);
  tail.pushBit(1);
  tail.pushBit(0);
  // Código 0xA: el handle del bloque es el propio MÁS el valor (0x40 + 5).
  const decoded = decodeAc1015EntityBody(
    composeBody(AC1015_TYPE_INSERT, tail, 0, insertStream(0xa, 5)),
  );
  assert.deepEqual(
    { ...decoded.references.blockRecord },
    { kind: "relative", handle: 0x45 },
  );
  // La bandera de ATTRIBs viaja interpretada en el modelo.
  assert.equal((decoded.entity as DwgInsertEntity).attributesFollow, false);
});

test("determinista: mismo INSERT y mismos handles, mismos bytes", () => {
  const entity = sampleInsert({ scale: { x: 2, y: 3, z: 4 }, rotation: 0.75 });
  assert.deepEqual(
    writeAc1015EntityBody(entity, 6, { insertBlockHandle: 4 }),
    writeAc1015EntityBody(entity, 6, { insertBlockHandle: 4 }),
  );
});

test("el writer del INSERT falla cerrado ante specs imposibles", () => {
  // Sin el handle del bloque: un INSERT sin bloque no significa nada.
  assertDwgError(
    () => writeAc1015EntityBody(sampleInsert(), 3),
    "DWG_INPUT_INVALID",
  );
  // El handle del bloque en una entidad que no es INSERT.
  assertDwgError(
    () =>
      writeAc1015EntityBody(
        {
          kind: "circle",
          center: { x: 0, y: 0, z: 0 },
          radius: 1,
          thickness: 0,
          extrusion: { x: 0, y: 0, z: 1 },
        },
        3,
        { insertBlockHandle: 5 },
      ),
    "DWG_INPUT_INVALID",
  );
  // ATTRIBs pedidos: pendiente declarado, no una bandera que fingir.
  assertDwgError(
    () =>
      writeAc1015EntityBody(sampleInsert({ attributesFollow: true }), 3, {
        insertBlockHandle: 5,
      }),
    "DWG_INPUT_INVALID",
  );
  // Escala no finita y handles imposibles.
  assertDwgError(
    () =>
      writeAc1015EntityBody(
        sampleInsert({ scale: { x: Number.NaN, y: 1, z: 1 } }),
        3,
        { insertBlockHandle: 5 },
      ),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015EntityBody(sampleInsert(), 3, { insertBlockHandle: 0 }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015EntityBody(sampleInsert(), 3, {
        insertBlockHandle: 5,
        ownerBlockHandle: -1,
      }),
    "DWG_INPUT_INVALID",
  );
});

test("gemelo triste: un flujo que no alcanza para el handle del bloque", () => {
  const tail = handmadeCommonTail();
  tail.emitBD(0);
  tail.emitBD(0);
  tail.emitBD(0);
  tail.pushBits(0b11, 2);
  tail.emitBD(0);
  tail.pushBit(1);
  tail.pushBit(0);
  // Sólo dos handles nulos: el INSERT exige un tercero (su bloque).
  const stream = new DwgBitEmitter();
  stream.emitH(0, 0);
  stream.emitH(0, 0);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(composeBody(AC1015_TYPE_INSERT, tail, 0, stream)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: INSERT truncado y tamaño en bits que no cuadra", () => {
  const valid = writeAc1015EntityBody(sampleInsert({ scale: { x: 2, y: 3, z: 4 } }), 7, {
    insertBlockHandle: 5,
  });
  const dataBytes = Math.floor(
    decodeAc1015EntityBody(valid).common.bitSize / 8,
  );
  for (const cut of [1, 6, 12, dataBytes - 1]) {
    assertDwgError(
      () => decodeAc1015EntityBody(valid.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }

  for (const adjust of [-8, 8]) {
    const tail = handmadeCommonTail();
    tail.emitBD(0);
    tail.emitBD(0);
    tail.emitBD(0);
    tail.pushBits(0b11, 2);
    tail.emitBD(0);
    tail.pushBit(1);
    tail.pushBit(0);
    assertDwgError(
      () =>
        decodeAc1015EntityBody(
          composeBody(AC1015_TYPE_INSERT, tail, adjust, insertStream()),
        ),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("filtros cruzados: un cuerpo INSERT ante el decodificador de capas", () => {
  const body = writeAc1015EntityBody(sampleInsert(), 3, {
    insertBlockHandle: 5,
  });
  const error = assertDwgError(
    () => decodeAc1015LayerBody(body),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assert.equal(error.detail.category, "unsupported");
});

console.log(
  "entity-insert.spec: fase D4 verde — el INSERT viaja con su colocación exacta y su referencia al bloque resuelta; las formas de escala dudosas se aceptan sin emitirse y los cuerpos hostiles caen tipados.",
);
