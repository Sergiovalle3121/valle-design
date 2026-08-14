/**
 * Spec de la fase D3, mitad de tablas: LAYER y su objeto de CONTROL.
 *
 * La meta de la fase: un contenedor del writer lleva la tabla de capas
 * mínima (control + capa "0") junto a entidades reales, y el pipeline lector
 * — mapa → envoltura → común de objeto → campos — recupera el nombre y el
 * color de la capa EXACTOS. Los casos felices usan el writer real como única
 * fuente del binario válido; los gemelos tristes componen cuerpos hostiles a
 * mano con el mismo `DwgBitEmitter` (recuentos que no caben, EED que se
 * sale, tamaños que no cuadran, truncados) y los filtros cruzados exigen que
 * un tipo ajeno sea capacidad ausente, no corrupción.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DWG_LIMITS } from "../../src/api/limits.js";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import { readAc1015ObjectEnvelope } from "../../src/container/ac1015-object-envelope.js";
import { readAc1015ObjectMap } from "../../src/container/ac1015-object-map.js";
import type { DwgCircleEntity } from "../../src/model/entity-geometry.js";
import {
  AC1015_TYPE_CIRCLE,
  decodeAc1015EntityBody,
} from "../../src/objects/entities-core.js";
import {
  AC1015_TYPE_LAYER,
  AC1015_TYPE_LAYER_CONTROL,
  decodeAc1015LayerBody,
  decodeAc1015LayerControlBody,
} from "../../src/objects/table-layer.js";
import {
  writeAc1015Container,
  type Ac1015ObjectSpec,
} from "../../src/writer/ac1015-container-writer.js";
import {
  DwgBitEmitter,
  writeAc1015EntityBody,
} from "../../src/writer/ac1015-entity-writer.js";
import {
  writeAc1015LayerBody,
  writeAc1015LayerControlBody,
} from "../../src/writer/ac1015-table-writer.js";
import { assertDwgError } from "../support/assert.js";

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
function nullStream(handles = 2): DwgBitEmitter {
  const stream = new DwgBitEmitter();
  for (let index = 0; index < handles; index += 1) {
    stream.emitH(0, 0);
  }
  return stream;
}

test("los códigos de tipo BS registrados de la tabla de capas", () => {
  assert.equal(AC1015_TYPE_LAYER_CONTROL, 50);
  assert.equal(AC1015_TYPE_LAYER, 51);
});

test("round-trip del LAYER \"0\": nombre, color y común de objeto exactos", () => {
  const body = writeAc1015LayerBody({ name: [0x30] }, 2);
  const decoded = decodeAc1015LayerBody(body);

  assert.equal(decoded.common.type, AC1015_TYPE_LAYER);
  assert.deepEqual(
    { ...decoded.common.ownHandle },
    { code: 0, value: 2, byteLength: 1 },
  );
  assert.equal(decoded.common.reactorCount, 0);
  assert.deepEqual(decoded.layer.name, [0x30]);
  assert.equal(decoded.layer.color.index, 7);
  assert.equal(decoded.layer.stateFlags, 0);
  assert.equal(decoded.layer.xrefRef, false);
  assert.equal(decoded.layer.xrefIndexPlusOne, 0);
  assert.equal(decoded.layer.xrefDependent, false);

  // Un único resto opaco: el flujo de handles (5 nulos = 40 bits) que
  // arranca EXACTAMENTE en el bit declarado y muere al final del cuerpo.
  assert.equal(decoded.opaqueSpans.length, 1);
  const stream = decoded.opaqueSpans[0]!;
  assert.equal(stream.kind, "handle-stream");
  assert.equal(stream.startBit, decoded.common.bitSize);
  assert.equal(stream.bitLength, body.length * 8 - decoded.common.bitSize);
  assert.ok(stream.bitLength >= 40 && stream.bitLength < 48);
});

test("round-trip LAYER con nombres, colores y banderas variados", () => {
  // Un nombre largo con bytes altos (la página de códigos es de capa
  // superior: bytes idénticos, ni más ni menos), color con atajo 256 y un
  // BS de estado crudo arbitrario.
  const name: number[] = [];
  for (let index = 0; index < 40; index += 1) {
    name.push(0x80 + ((index * 7) % 0x7f));
  }
  for (const [colorIndex, stateFlags] of [
    [256, 0x2a5],
    [0, 1],
    [255, 0],
  ] as const) {
    const body = writeAc1015LayerBody({ name, colorIndex, stateFlags }, 0x1f0);
    const decoded = decodeAc1015LayerBody(body);
    assert.deepEqual(decoded.layer.name, name);
    assert.equal(decoded.layer.color.index, colorIndex);
    assert.equal(decoded.layer.stateFlags, stateFlags);
    assert.equal(decoded.common.ownHandle.value, 0x1f0);
  }
});

test("round-trip del CONTROL: recuento de entradas y flujo contabilizado", () => {
  const body = writeAc1015LayerControlBody(
    { entryHandles: [2, 9, 0x1234] },
    1,
  );
  const decoded = decodeAc1015LayerControlBody(body);
  assert.equal(decoded.common.type, AC1015_TYPE_LAYER_CONTROL);
  assert.equal(decoded.common.ownHandle.value, 1);
  assert.equal(decoded.entryCount, 3);
  assert.equal(decoded.opaqueSpans.length, 1);
  assert.equal(decoded.opaqueSpans[0]!.kind, "handle-stream");
  assert.equal(decoded.opaqueSpans[0]!.startBit, decoded.common.bitSize);
});

test("determinista: misma capa y mismo control, mismos bytes", () => {
  const layerSpec = { name: [0x41, 0x2d, 0x31], colorIndex: 4 } as const;
  assert.deepEqual(
    writeAc1015LayerBody(layerSpec, 6),
    writeAc1015LayerBody(layerSpec, 6),
  );
  const controlSpec = { entryHandles: [6] } as const;
  assert.deepEqual(
    writeAc1015LayerControlBody(controlSpec, 5),
    writeAc1015LayerControlBody(controlSpec, 5),
  );
});

test("meta D3: un contenedor con control + capa \"0\" + entidades reales", () => {
  const circle: DwgCircleEntity = {
    kind: "circle",
    center: { x: 20.5, y: -7.25, z: 0 },
    radius: 3.125,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  };
  const file = writeAc1015Container({
    objects: [
      { layerControl: { entryHandles: [2] }, handle: 1 },
      { layer: { name: [0x30], colorIndex: 7 }, handle: 2 },
      { entity: circle, handle: 3 },
    ],
  });

  const cursor = new BoundedByteCursor(file);
  const header = parseAc1015FileHeader(cursor);
  const entries = readAc1015ObjectMap(cursor, header.records[2]!, DEFAULT_DWG_LIMITS);
  assert.deepEqual(
    entries.map((entry) => entry.handle),
    [1, 2, 3],
  );
  const envelopes = entries.map((entry) =>
    readAc1015ObjectEnvelope(cursor, entry.offset, header.records),
  );
  assert.deepEqual(
    envelopes.map((envelope) => envelope.type),
    [AC1015_TYPE_LAYER_CONTROL, AC1015_TYPE_LAYER, AC1015_TYPE_CIRCLE],
  );

  const control = decodeAc1015LayerControlBody(envelopes[0]!.bodyBytes);
  assert.equal(control.entryCount, 1);
  assert.equal(control.common.ownHandle.value, 1);

  const layer = decodeAc1015LayerBody(envelopes[1]!.bodyBytes);
  assert.deepEqual(layer.layer.name, [0x30]);
  assert.equal(layer.layer.color.index, 7);
  assert.equal(layer.common.ownHandle.value, 2);

  const entity = decodeAc1015EntityBody(envelopes[2]!.bodyBytes);
  assert.deepEqual(entity.entity, circle);
});

test("filtros cruzados: un tipo ajeno es capacidad ausente, no corrupción", () => {
  const layerBody = writeAc1015LayerBody({ name: [0x30] }, 2);
  const controlBody = writeAc1015LayerControlBody({ entryHandles: [] }, 1);
  const circleBody = writeAc1015EntityBody(
    {
      kind: "circle",
      center: { x: 0, y: 0, z: 0 },
      radius: 1,
      thickness: 0,
      extrusion: { x: 0, y: 0, z: 1 },
    },
    3,
  );

  for (const [decode, body] of [
    [decodeAc1015LayerBody, controlBody],
    [decodeAc1015LayerBody, circleBody],
    [decodeAc1015LayerControlBody, layerBody],
    [decodeAc1015LayerControlBody, circleBody],
    [decodeAc1015EntityBody, layerBody],
  ] as const) {
    const error = assertDwgError(
      () => decode(body),
      "DWG_VERSION_DECODER_UNSUPPORTED",
    );
    assert.equal(error.detail.category, "unsupported");
  }

  // Un cuerpo que no alcanza ni para su tipo sí es corrupción.
  assertDwgError(
    () => decodeAc1015LayerBody(new Uint8Array(0)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: capa y control truncados en varios cortes", () => {
  // Los cortes viven DENTRO del dato declarado: cortar el flujo de handles
  // opaco es asunto del CRC de la envoltura, no de esta capa.
  const layerBody = writeAc1015LayerBody({ name: [0x43, 0x41, 0x50, 0x41] }, 4);
  const layerCut =
    Math.floor(decodeAc1015LayerBody(layerBody).common.bitSize / 8) - 1;
  for (const cut of [1, 3, 8, 12, layerCut]) {
    assertDwgError(
      () => decodeAc1015LayerBody(layerBody.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
  const controlBody = writeAc1015LayerControlBody({ entryHandles: [2, 3] }, 1);
  const controlCut =
    Math.floor(
      decodeAc1015LayerControlBody(controlBody).common.bitSize / 8,
    ) - 1;
  for (const cut of [1, 4, 9, controlCut]) {
    assertDwgError(
      () => decodeAc1015LayerControlBody(controlBody.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("gemelo triste: recuentos que no caben en el flujo de handles", () => {
  // 200 reactores declarados con un flujo de dos handles nulos.
  const reactorTail = new DwgBitEmitter();
  reactorTail.emitH(0, 1);
  reactorTail.emitBS(0); // EED vacío
  reactorTail.emitBL(200);
  assertDwgError(
    () =>
      decodeAc1015LayerBody(
        composeBody(AC1015_TYPE_LAYER, reactorTail, 0, nullStream()),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // 500 entradas declaradas en un control cuyo flujo no da ni para 10.
  const entryTail = new DwgBitEmitter();
  entryTail.emitH(0, 1);
  entryTail.emitBS(0);
  entryTail.emitBL(0); // reactores
  entryTail.emitBL(500); // entradas imposibles
  assertDwgError(
    () =>
      decodeAc1015LayerControlBody(
        composeBody(AC1015_TYPE_LAYER_CONTROL, entryTail, 0, nullStream()),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: EED que se sale y tamaño en bits que no cuadra", () => {
  // Un grupo EED de 30 bytes… en un cuerpo que no los tiene.
  const eedTail = new DwgBitEmitter();
  eedTail.emitH(0, 1);
  eedTail.emitBS(30);
  eedTail.emitH(5, 0x11);
  eedTail.emitRC(0xaa);
  eedTail.emitRC(0xbb);
  assertDwgError(
    () => decodeAc1015LayerBody(composeBody(AC1015_TYPE_LAYER, eedTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Una capa completa y válida… con el tamaño declarado corrido ±8 bits.
  for (const adjust of [-8, 8]) {
    const tail = new DwgBitEmitter();
    tail.emitH(0, 2);
    tail.emitBS(0); // EED
    tail.emitBL(0); // reactores
    tail.emitTV([0x30]); // nombre "0"
    tail.pushBit(0);
    tail.emitBS(0);
    tail.pushBit(0);
    tail.emitBS(0); // estado
    tail.emitBS(7); // color
    assertDwgError(
      () =>
        decodeAc1015LayerBody(
          composeBody(AC1015_TYPE_LAYER, tail, adjust, nullStream(5)),
        ),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("el writer de tablas falla cerrado ante specs imposibles", () => {
  assertDwgError(() => writeAc1015LayerBody({ name: [] }, 1), "DWG_INPUT_INVALID");
  assertDwgError(
    () => writeAc1015LayerBody({ name: new Array<number>(300).fill(0x41) }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015LayerBody({ name: [0x30, 256] }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015LayerBody({ name: [0x30], colorIndex: 0x1_0000 }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015LayerBody({ name: [0x30], stateFlags: -1 }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(() => writeAc1015LayerBody({ name: [0x30] }, 0), "DWG_INPUT_INVALID");

  assertDwgError(
    () => writeAc1015LayerControlBody({ entryHandles: [0] }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015LayerControlBody(
        { entryHandles: "2" as unknown as number[] },
        1,
      ),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015LayerControlBody(
        { entryHandles: new Array<number>(4097).fill(0).map((_, i) => i + 1) },
        1,
      ),
    "DWG_FILE_LIMIT_EXCEEDED",
  );

  // Y un spec de contenedor debe declarar UNA sola naturaleza.
  assertDwgError(
    () =>
      writeAc1015Container({
        objects: [
          {
            layer: { name: [0x30] },
            layerControl: { entryHandles: [] },
          } as unknown as Ac1015ObjectSpec,
        ],
      }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015Container({
        objects: [
          {
            entity: {
              kind: "circle",
              center: { x: 0, y: 0, z: 0 },
              radius: 1,
              thickness: 0,
              extrusion: { x: 0, y: 0, z: 1 },
            },
            layer: { name: [0x30] },
          } as unknown as Ac1015ObjectSpec,
        ],
      }),
    "DWG_INPUT_INVALID",
  );
});

console.log(
  "table-layer.spec: fase D3 verde — la tabla de capas mínima viaja por el contenedor junto a las entidades y vuelve con nombre y color exactos; los cuerpos hostiles caen tipados y los tipos ajenos caen unsupported.",
);
