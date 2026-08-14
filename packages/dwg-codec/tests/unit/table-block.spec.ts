/**
 * Spec de la fase D4, mitad de tablas: BLOCK_RECORD, su CONTROL y las
 * entidades BLOCK/ENDBLK.
 *
 * Los casos felices usan el writer real como única fuente del binario válido
 * y exigen nombre, punto base y referencias EXACTOS; los gemelos tristes
 * componen cuerpos hostiles a mano con el mismo `DwgBitEmitter`
 * (previsualizaciones que se salen, truncados, descuadres) y los filtros
 * cruzados exigen que un tipo ajeno sea capacidad ausente, no corrupción.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AC1015_TYPE_BLOCK,
  AC1015_TYPE_BLOCK_CONTROL,
  AC1015_TYPE_BLOCK_HEADER,
  AC1015_TYPE_ENDBLK,
  decodeAc1015BlockBeginBody,
  decodeAc1015BlockControlBody,
  decodeAc1015BlockEndBody,
  decodeAc1015BlockRecordBody,
} from "../../src/objects/table-block.js";
import { decodeAc1015LayerBody } from "../../src/objects/table-layer.js";
import {
  writeAc1015BlockBeginBody,
  writeAc1015BlockControlBody,
  writeAc1015BlockEndBody,
  writeAc1015BlockRecordBody,
} from "../../src/writer/ac1015-block-writer.js";
import { DwgBitEmitter } from "../../src/writer/ac1015-entity-writer.js";
import { assertDwgError } from "../support/assert.js";

const PUERTA = [0x50, 0x55, 0x45, 0x52, 0x54, 0x41] as const; // "PUERTA"

/** Compone un cuerpo de OBJETO a mano: tipo BS + RL (con ajuste) + tail + resto. */
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

/** Un flujo de handles nulo de relleno para los cuerpos hostiles. */
function nullStream(handles: number): DwgBitEmitter {
  const stream = new DwgBitEmitter();
  for (let index = 0; index < handles; index += 1) {
    stream.emitH(0, 0);
  }
  return stream;
}

test("los códigos de tipo BS registrados de la tabla de bloques", () => {
  assert.equal(AC1015_TYPE_BLOCK, 4);
  assert.equal(AC1015_TYPE_ENDBLK, 5);
  assert.equal(AC1015_TYPE_BLOCK_CONTROL, 48);
  assert.equal(AC1015_TYPE_BLOCK_HEADER, 49);
});

test("round-trip del BLOCK_RECORD: nombre, punto base y común exactos", () => {
  const body = writeAc1015BlockRecordBody(
    {
      name: [...PUERTA],
      basePoint: { x: 1.5, y: -2.25, z: 0 },
      ownerControlHandle: 4,
      blockEntityHandle: 6,
      firstEntityHandle: 7,
      lastEntityHandle: 8,
      endblkHandle: 9,
    },
    5,
  );
  const decoded = decodeAc1015BlockRecordBody(body);

  assert.equal(decoded.common.type, AC1015_TYPE_BLOCK_HEADER);
  assert.equal(decoded.common.ownHandle.value, 5);
  assert.equal(decoded.common.reactorCount, 0);
  assert.deepEqual(decoded.record.name, PUERTA);
  assert.deepEqual(decoded.record.basePoint, { x: 1.5, y: -2.25, z: 0 });
  assert.equal(decoded.record.xrefRef, false);
  assert.equal(decoded.record.anonymous, false);
  assert.equal(decoded.record.hasAttributeDefinitions, false);
  assert.equal(decoded.record.isXref, false);
  assert.equal(decoded.record.xrefOverlaid, false);
  assert.deepEqual(decoded.record.xrefPath, []);
  assert.deepEqual(decoded.record.insertCounts, []);
  assert.deepEqual(decoded.record.description, []);
  assert.equal(decoded.record.previewByteLength, 0);

  // Un único resto opaco: el flujo de handles (6 handles: propietario,
  // xdictionary y los cuatro punteros del bloque) que arranca EXACTAMENTE en
  // el bit declarado y muere al final del cuerpo.
  assert.equal(decoded.opaqueSpans.length, 1);
  const stream = decoded.opaqueSpans[0]!;
  assert.equal(stream.kind, "handle-stream");
  assert.equal(stream.startBit, decoded.common.bitSize);
  assert.equal(stream.bitLength, body.length * 8 - decoded.common.bitSize);
});

test("round-trip BLOCK_RECORD mínimo: punto base por defecto y punteros nulos", () => {
  const body = writeAc1015BlockRecordBody({ name: [0x41] }, 2);
  const decoded = decodeAc1015BlockRecordBody(body);
  assert.deepEqual(decoded.record.name, [0x41]);
  assert.deepEqual(decoded.record.basePoint, { x: 0, y: 0, z: 0 });
});

test("round-trip del CONTROL de bloques: recuento y flujo contabilizado", () => {
  const body = writeAc1015BlockControlBody({ entryHandles: [5, 0x22] }, 4);
  const decoded = decodeAc1015BlockControlBody(body);
  assert.equal(decoded.common.type, AC1015_TYPE_BLOCK_CONTROL);
  assert.equal(decoded.common.ownHandle.value, 4);
  assert.equal(decoded.entryCount, 2);
  assert.equal(decoded.opaqueSpans.length, 1);
  assert.equal(decoded.opaqueSpans[0]!.kind, "handle-stream");
});

test("round-trip de BLOCK y ENDBLK: nombre y propietario resueltos", () => {
  const begin = decodeAc1015BlockBeginBody(
    writeAc1015BlockBeginBody({ name: [...PUERTA], ownerBlockHandle: 5 }, 6),
  );
  assert.equal(begin.common.type, AC1015_TYPE_BLOCK);
  assert.equal(begin.common.ownHandle.value, 6);
  assert.equal(begin.common.entityMode, 0);
  assert.deepEqual(begin.name, PUERTA);
  assert.deepEqual({ ...begin.references.owner }, { kind: "absolute", handle: 5 });
  assert.equal(begin.references.layer.kind, "null");

  const end = decodeAc1015BlockEndBody(
    writeAc1015BlockEndBody({ ownerBlockHandle: 5 }, 9),
  );
  assert.equal(end.common.type, AC1015_TYPE_ENDBLK);
  assert.equal(end.common.ownHandle.value, 9);
  assert.deepEqual({ ...end.references.owner }, { kind: "absolute", handle: 5 });
});

test("determinista: mismos specs de bloque, mismos bytes", () => {
  const recordSpec = { name: [...PUERTA], firstEntityHandle: 7 } as const;
  assert.deepEqual(
    writeAc1015BlockRecordBody(recordSpec, 5),
    writeAc1015BlockRecordBody(recordSpec, 5),
  );
  assert.deepEqual(
    writeAc1015BlockControlBody({ entryHandles: [5] }, 4),
    writeAc1015BlockControlBody({ entryHandles: [5] }, 4),
  );
  assert.deepEqual(
    writeAc1015BlockBeginBody({ name: [0x41], ownerBlockHandle: 5 }, 6),
    writeAc1015BlockBeginBody({ name: [0x41], ownerBlockHandle: 5 }, 6),
  );
});

test("filtros cruzados: un tipo ajeno es capacidad ausente, no corrupción", () => {
  const recordBody = writeAc1015BlockRecordBody({ name: [0x41] }, 5);
  const controlBody = writeAc1015BlockControlBody({ entryHandles: [] }, 4);
  const beginBody = writeAc1015BlockBeginBody(
    { name: [0x41], ownerBlockHandle: 5 },
    6,
  );

  for (const [decode, body] of [
    [decodeAc1015BlockRecordBody, controlBody],
    [decodeAc1015BlockControlBody, recordBody],
    [decodeAc1015BlockBeginBody, recordBody],
    [decodeAc1015BlockEndBody, beginBody],
    [decodeAc1015LayerBody, recordBody],
    [decodeAc1015BlockRecordBody, beginBody],
  ] as const) {
    const error = assertDwgError(
      () => decode(body),
      "DWG_VERSION_DECODER_UNSUPPORTED",
    );
    assert.equal(error.detail.category, "unsupported");
  }
});

test("gemelo triste: cuerpos de bloque truncados en varios cortes", () => {
  const recordBody = writeAc1015BlockRecordBody(
    { name: [...PUERTA], basePoint: { x: 4.5, y: 1, z: 0 } },
    5,
  );
  const recordCut =
    Math.floor(decodeAc1015BlockRecordBody(recordBody).common.bitSize / 8) - 1;
  for (const cut of [1, 4, 10, recordCut]) {
    assertDwgError(
      () => decodeAc1015BlockRecordBody(recordBody.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
  const beginBody = writeAc1015BlockBeginBody(
    { name: [...PUERTA], ownerBlockHandle: 5 },
    6,
  );
  const beginCut =
    Math.floor(decodeAc1015BlockBeginBody(beginBody).common.bitSize / 8) - 1;
  for (const cut of [1, 5, beginCut]) {
    assertDwgError(
      () => decodeAc1015BlockBeginBody(beginBody.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("gemelo triste: una previsualización que se sale del cuerpo", () => {
  const tail = new DwgBitEmitter();
  tail.emitH(0, 5);
  tail.emitBS(0); // EED
  tail.emitBL(0); // reactores
  tail.emitTV([0x41]); // nombre
  tail.pushBit(0);
  tail.emitBS(0);
  tail.pushBit(0);
  tail.pushBit(0);
  tail.pushBit(0);
  tail.pushBit(0);
  tail.pushBit(0);
  tail.emitBD(0);
  tail.emitBD(0);
  tail.emitBD(0); // punto base
  tail.emitTV([]); // ruta xref
  tail.emitRC(0); // recuentos de inserción: terminador
  tail.emitTV([]); // descripción
  tail.emitBL(5000); // una previsualización imposible
  assertDwgError(
    () =>
      decodeAc1015BlockRecordBody(
        composeBody(AC1015_TYPE_BLOCK_HEADER, tail, 0, nullStream(6)),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: tamaño en bits del BLOCK_RECORD que no cuadra", () => {
  for (const adjust of [-8, 8]) {
    const tail = new DwgBitEmitter();
    tail.emitH(0, 5);
    tail.emitBS(0);
    tail.emitBL(0);
    tail.emitTV([0x41]);
    tail.pushBit(0);
    tail.emitBS(0);
    tail.pushBit(0);
    tail.pushBit(0);
    tail.pushBit(0);
    tail.pushBit(0);
    tail.pushBit(0);
    tail.emitBD(0);
    tail.emitBD(0);
    tail.emitBD(0);
    tail.emitTV([]);
    tail.emitRC(0);
    tail.emitTV([]);
    tail.emitBL(0);
    assertDwgError(
      () =>
        decodeAc1015BlockRecordBody(
          composeBody(AC1015_TYPE_BLOCK_HEADER, tail, adjust, nullStream(6)),
        ),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("el writer de bloques falla cerrado ante specs imposibles", () => {
  assertDwgError(
    () => writeAc1015BlockRecordBody({ name: [] }, 5),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015BlockRecordBody(
        { name: [0x41], basePoint: { x: Number.NaN, y: 0, z: 0 } },
        5,
      ),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015BlockRecordBody({ name: [0x41], firstEntityHandle: 0 }, 5),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015BlockRecordBody({ name: [0x41] }, 0),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015BlockControlBody({ entryHandles: [0] }, 4),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015BlockBeginBody({ name: [], ownerBlockHandle: 5 }, 6),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015BlockBeginBody({ name: [0x41], ownerBlockHandle: 0 }, 6),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015BlockEndBody({ ownerBlockHandle: -3 }, 9),
    "DWG_INPUT_INVALID",
  );
});

console.log(
  "table-block.spec: fase D4 verde — el BLOCK_RECORD, su control y el par BLOCK/ENDBLK viajan y vuelven exactos; lo hostil cae tipado y lo ajeno cae unsupported.",
);
