/**
 * Spec de la fase D3, mitad de entidades: LWPOLYLINE y TEXT.
 *
 * La fuente única del binario válido es el writer de entidades: los casos
 * felices emiten cuerpos (o contenedores completos) con el writer real y
 * exigen que el pipeline lector devuelva el modelo EXACTO, double a double y
 * byte a byte de cadena — presencia y ausencia de cada campo opcional
 * incluidas. Los gemelos tristes componen cuerpos HOSTILES a mano con el
 * mismo `DwgBitEmitter`: banderas no modeladas, recuentos que no cuadran o
 * no caben, anchos negativos, alturas negativas, TV que se sale del cuerpo y
 * truncamientos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DWG_LIMITS } from "../../src/api/limits.js";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import { readAc1015ObjectEnvelope } from "../../src/container/ac1015-object-envelope.js";
import { readAc1015ObjectMap } from "../../src/container/ac1015-object-map.js";
import type {
  DwgGeometryEntity,
  DwgLineEntity,
  DwgLwPolylineEntity,
  DwgPoint2,
  DwgTextEntity,
} from "../../src/model/entity-geometry.js";
import {
  AC1015_TYPE_LINE,
  AC1015_TYPE_LWPOLYLINE,
  AC1015_TYPE_TEXT,
  decodeAc1015EntityBody,
} from "../../src/objects/entities-core.js";
import { writeAc1015Container } from "../../src/writer/ac1015-container-writer.js";
import {
  DwgBitEmitter,
  writeAc1015EntityBody,
} from "../../src/writer/ac1015-entity-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Round-trip de un cuerpo suelto: writer → decodificador, modelo exacto. */
function roundTrip(entity: DwgGeometryEntity, handle = 7): void {
  const body = writeAc1015EntityBody(entity, handle);
  const decoded = decodeAc1015EntityBody(body);
  assert.deepEqual(decoded.entity, entity);
  assert.equal(decoded.common.ownHandle.value, handle);
}

/** Una polilínea plena con todos los campos opcionales ausentes. */
function barePolyline(
  vertices: readonly DwgPoint2[],
  closed = false,
): DwgLwPolylineEntity {
  return {
    kind: "lwpolyline",
    closed,
    vertices,
    bulges: undefined,
    widths: undefined,
    constantWidth: undefined,
    elevation: undefined,
    thickness: undefined,
    extrusion: undefined,
  };
}

/** Un texto con todos los campos opcionales ausentes. */
function bareText(valueBytes: readonly number[], height = 2.5): DwgTextEntity {
  return {
    kind: "text",
    insertion: { x: 0, y: 0 },
    elevation: undefined,
    alignment: undefined,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    obliqueAngle: undefined,
    rotation: undefined,
    height,
    widthFactor: undefined,
    valueBytes,
    generation: undefined,
    horizontalAlignment: undefined,
    verticalAlignment: undefined,
  };
}

/**
 * Cabecera común mínima compuesta A MANO para los gemelos tristes, espejo de
 * la que emite el writer real (mismo patrón que la spec de la fase D2).
 */
function handmadeCommonTail(): DwgBitEmitter {
  const tail = new DwgBitEmitter();
  tail.emitH(0, 1); // handle propio
  tail.emitBS(0); // EED vacío
  tail.pushBit(0); // sin gráfico
  tail.pushBits(0b10, 2); // modo 2
  tail.emitBL(0); // cero reactores
  tail.pushBit(1); // sin vínculos
  tail.emitBS(256); // color ByLayer
  tail.emitBD(1); // escala de linetype
  tail.pushBits(0, 2); // banderas de linetype
  tail.pushBits(0, 2); // banderas de plotstyle
  tail.emitBS(0); // visible
  tail.emitRC(0x1d); // lineweight
  return tail;
}

/** Compone un cuerpo completo: tipo BS + RL (con ajuste hostil) + tail + resto. */
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

/** El flujo de handles mínimo del writer: xdictionary y capa nulos. */
function nullStream(): DwgBitEmitter {
  const stream = new DwgBitEmitter();
  stream.emitH(0, 0);
  stream.emitH(0, 0);
  return stream;
}

test("los códigos de tipo BS registrados de LWPOLYLINE y TEXT", () => {
  assert.equal(AC1015_TYPE_LWPOLYLINE, 77);
  assert.equal(AC1015_TYPE_TEXT, 1);
});

test("round-trip LWPOLYLINE abierta mínima: deltas iguales y distintos", () => {
  // El segundo vértice repite la Y (atajo DD 00) y el tercero repite la X:
  // ambas formas del DD conviven en la misma cadena.
  roundTrip(
    barePolyline([
      { x: 0, y: 0 },
      { x: 10.5, y: 0 },
      { x: 10.5, y: -4.25 },
    ]),
  );
});

test("round-trip LWPOLYLINE cerrada con bulges, anchos y opcionales", () => {
  const polyline: DwgLwPolylineEntity = {
    kind: "lwpolyline",
    closed: true,
    vertices: [
      { x: -3.5, y: 2 },
      { x: 4.75, y: 2 },
      { x: 4.75, y: -6.125 },
      { x: -3.5, y: -6.125 },
    ],
    bulges: [0, -0.5, 1.25, 0.333],
    widths: [
      { start: 0, end: 0.25 },
      { start: 0.25, end: 0.25 },
      { start: 0.75, end: 0 },
      { start: 0, end: 0 },
    ],
    constantWidth: 0.125,
    elevation: -7.5,
    thickness: 1.5,
    extrusion: { x: 0.6, y: 0, z: 0.8 },
  };
  roundTrip(polyline, 0x151);

  // Y con SOLO bulges (sin anchos ni opcionales), abierta.
  roundTrip({
    ...barePolyline([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]),
    bulges: [0.5, 0],
  });
});

test("round-trip LWPOLYLINE con muchos vértices y deltas DD variados", () => {
  const vertices: DwgPoint2[] = [{ x: 0, y: 0 }];
  for (let index = 1; index < 120; index += 1) {
    const previous = vertices[index - 1]!;
    // Cuatro sabores de delta que se turnan: repetir ambos, repetir X,
    // repetir Y y saltar del todo — incluido un −0.0 que NO es 0.0.
    if (index % 4 === 0) {
      vertices.push({ x: previous.x, y: previous.y });
    } else if (index % 4 === 1) {
      vertices.push({ x: previous.x, y: previous.y + index * 0.25 });
    } else if (index % 4 === 2) {
      vertices.push({ x: index === 2 ? -0 : previous.x - index * 3.5, y: previous.y });
    } else {
      vertices.push({ x: index * 1000.125, y: -index * 0.001 });
    }
  }
  const body = writeAc1015EntityBody(barePolyline(vertices, true), 9);
  const decoded = decodeAc1015EntityBody(body);
  assert.equal(decoded.entity.kind, "lwpolyline");
  const polyline = decoded.entity as DwgLwPolylineEntity;
  assert.equal(polyline.vertices.length, 120);
  assert.deepEqual(polyline.vertices, vertices);
  assert.ok(Object.is(polyline.vertices[2]!.x, -0));
});

test("round-trip TEXT con todos los campos presentes", () => {
  const text: DwgTextEntity = {
    kind: "text",
    insertion: { x: 12.5, y: -3.25 },
    elevation: 4.5,
    // La alineación repite la X de la inserción: atajo DD y valor exacto.
    alignment: { x: 12.5, y: 8.75 },
    thickness: -1.25,
    extrusion: { x: 0, y: 0.6, z: 0.8 },
    obliqueAngle: 0.35,
    rotation: -2.1,
    height: 3.5,
    widthFactor: 0.85,
    valueBytes: [0x56, 0x41, 0x4c, 0x4c, 0x45, 0x20, 0xd1, 0xfc, 0xff],
    generation: 4,
    horizontalAlignment: 1,
    verticalAlignment: 3,
  };
  roundTrip(text, 0x2c);
});

test("round-trip TEXT mínimo: banderas de ausencia y cadena vacía", () => {
  roundTrip(bareText([]));
  // Y una cadena de un solo byte alto con rotación 0 presente (0 explícito
  // NO es ausencia: el modelo los distingue).
  roundTrip({ ...bareText([0xff]), rotation: 0 });
});

test("round-trip TEXT con cadena larga que fuerza la forma RS del BS", () => {
  const valueBytes = new Array<number>(300);
  for (let index = 0; index < valueBytes.length; index += 1) {
    valueBytes[index] = index % 256;
  }
  const body = writeAc1015EntityBody(bareText(valueBytes, 0.5), 5);
  const decoded = decodeAc1015EntityBody(body);
  assert.equal(decoded.entity.kind, "text");
  assert.deepEqual((decoded.entity as DwgTextEntity).valueBytes, valueBytes);
});

test("pipeline completo: polilínea, texto y línea por el mapa y la envoltura", () => {
  const polyline = barePolyline(
    [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 9 },
    ],
    true,
  );
  const text = { ...bareText([0x30, 0x41]), rotation: 1.5 };
  const line: DwgLineEntity = {
    kind: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: -2, y: 3, z: 0 },
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  };
  const file = writeAc1015Container({
    objects: [{ entity: polyline }, { entity: text }, { entity: line }],
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
    [AC1015_TYPE_LWPOLYLINE, AC1015_TYPE_TEXT, AC1015_TYPE_LINE],
  );
  assert.deepEqual(decodeAc1015EntityBody(envelopes[0]!.bodyBytes).entity, polyline);
  assert.deepEqual(decodeAc1015EntityBody(envelopes[1]!.bodyBytes).entity, text);
  assert.deepEqual(decodeAc1015EntityBody(envelopes[2]!.bodyBytes).entity, line);

  // El flujo de handles sigue contabilizado: arranca donde el tamaño declara.
  const spans = decodeAc1015EntityBody(envelopes[0]!.bodyBytes).opaqueSpans;
  assert.equal(spans.length, 1);
  assert.equal(spans[0]!.kind, "handle-stream");
});

test("gemelo triste: un bit de bandera no modelado es unsupported, no corrupt", () => {
  // El bit 0x80 (generación de tipo de línea) cambia la disposición de lo
  // que sigue: capacidad ausente declarada, jamás una lectura desplazada.
  const tail = handmadeCommonTail();
  tail.emitBS(0x80);
  const error = assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_LWPOLYLINE, tail)),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assert.equal(error.detail.category, "unsupported");
});

test("gemelo triste: recuentos de polilínea imposibles fallan cerrado", () => {
  // Cero vértices.
  const zeroTail = handmadeCommonTail();
  zeroTail.emitBS(0);
  zeroTail.emitBL(0);
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_LWPOLYLINE, zeroTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Un recuento que no cabe ni con todos los atajos DD del mundo.
  const hugeTail = handmadeCommonTail();
  hugeTail.emitBS(0);
  hugeTail.emitBL(0xffff);
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_LWPOLYLINE, hugeTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Bulges que no cuadran con los vértices (los bytes de vértices SÍ están:
  // debe caer la comprobación de recuentos, no la de presupuesto).
  const bulgeTail = handmadeCommonTail();
  bulgeTail.emitBS(0x10);
  bulgeTail.emitBL(2);
  bulgeTail.emitBL(3);
  bulgeTail.emitRD(0);
  bulgeTail.emitRD(0);
  bulgeTail.pushBits(0b00, 4); // dos deltas DD por defecto
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_LWPOLYLINE, bulgeTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Anchos que no cuadran con los vértices.
  const widthTail = handmadeCommonTail();
  widthTail.emitBS(0x20);
  widthTail.emitBL(1);
  widthTail.emitBL(2);
  widthTail.emitRD(0);
  widthTail.emitRD(0);
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_LWPOLYLINE, widthTail)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: anchos negativos de polilínea son corrupción", () => {
  // Ancho constante negativo.
  const constTail = handmadeCommonTail();
  constTail.emitBS(0x4);
  constTail.pushBits(0b00, 2); // BD en forma RD completa
  constTail.emitRD(-0.5);
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_LWPOLYLINE, constTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Ancho de vértice negativo, tras un vértice válido.
  const widthTail = handmadeCommonTail();
  widthTail.emitBS(0x20);
  widthTail.emitBL(1);
  widthTail.emitBL(1);
  widthTail.emitRD(0);
  widthTail.emitRD(0);
  widthTail.pushBits(0b00, 2);
  widthTail.emitRD(-1);
  widthTail.emitBD(0);
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_LWPOLYLINE, widthTail)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: polilínea truncada y tamaño en bits que no cuadra", () => {
  const body = writeAc1015EntityBody(
    barePolyline(
      [
        { x: 1.5, y: 2.5 },
        { x: -3.25, y: 8 },
      ],
      true,
    ),
    3,
  );
  for (const cut of [1, 4, 9, 15, body.length - 3]) {
    assertDwgError(
      () => decodeAc1015EntityBody(body.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }

  // Un descuadre declarado de ±8 bits, aun con el cuerpo intacto.
  for (const adjust of [-8, 8]) {
    const tail = handmadeCommonTail();
    tail.emitBS(0);
    tail.emitBL(1);
    tail.emitRD(0);
    tail.emitRD(0);
    assertDwgError(
      () =>
        decodeAc1015EntityBody(
          composeBody(AC1015_TYPE_LWPOLYLINE, tail, adjust, nullStream()),
        ),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("gemelo triste: TEXT hostil — TV que se sale, altura negativa, NaN", () => {
  // Una cadena que declara más bytes de los que el cuerpo tiene.
  const tvTail = handmadeCommonTail();
  tvTail.emitRC(0xff); // todo ausente
  tvTail.emitRD(0);
  tvTail.emitRD(0);
  tvTail.pushBit(1); // BE canónica
  tvTail.pushBit(1); // BT cero
  tvTail.emitRD(1); // altura
  tvTail.emitBS(0x4000); // TV: 16384 bytes declarados… y ninguno presente
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_TEXT, tvTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Altura negativa.
  const heightTail = handmadeCommonTail();
  heightTail.emitRC(0xff);
  heightTail.emitRD(0);
  heightTail.emitRD(0);
  heightTail.pushBit(1);
  heightTail.pushBit(1);
  heightTail.emitRD(-2);
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_TEXT, heightTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Una rotación NaN (todo unos) tampoco es geometría.
  const nanTail = handmadeCommonTail();
  nanTail.emitRC(0xf7); // sólo la rotación presente
  nanTail.emitRD(0);
  nanTail.emitRD(0);
  nanTail.pushBit(1);
  nanTail.pushBit(1);
  for (let index = 0; index < 8; index += 1) {
    nanTail.emitRC(0xff);
  }
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_TEXT, nanTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Y un TEXT del writer, truncado en varios cortes DENTRO del dato
  // declarado (cortar el flujo de handles opaco es asunto del CRC de la
  // envoltura, no de esta capa).
  const body = writeAc1015EntityBody(
    { ...bareText([0x41, 0x42, 0x43]), rotation: 1 },
    4,
  );
  const dataCut =
    Math.floor(decodeAc1015EntityBody(body).common.bitSize / 8) - 1;
  for (const cut of [2, 7, 13, dataCut]) {
    assertDwgError(
      () => decodeAc1015EntityBody(body.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("el writer falla cerrado ante polilíneas y textos imposibles", () => {
  const goodPolyline = barePolyline([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  assertDwgError(
    () => writeAc1015EntityBody({ ...goodPolyline, vertices: [] }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015EntityBody({ ...goodPolyline, bulges: [0.5] }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015EntityBody(
        { ...goodPolyline, widths: [{ start: -1, end: 0 }, { start: 0, end: 0 }] },
        1,
      ),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015EntityBody({ ...goodPolyline, constantWidth: -0.5 }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015EntityBody(
        { ...goodPolyline, vertices: [{ x: Number.NaN, y: 0 }] },
        1,
      ),
    "DWG_INPUT_INVALID",
  );

  const goodText = bareText([0x41]);
  assertDwgError(
    () => writeAc1015EntityBody({ ...goodText, height: -1 }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015EntityBody({ ...goodText, valueBytes: [256] }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015EntityBody({ ...goodText, valueBytes: [1.5] }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015EntityBody({ ...goodText, horizontalAlignment: -1 }, 1),
    "DWG_INPUT_INVALID",
  );

  // Una polilínea desmesurada revienta el presupuesto de bits del writer,
  // no la memoria: fallo tipado de recurso.
  const hugeVertices: DwgPoint2[] = [];
  for (let index = 0; index < 3000; index += 1) {
    hugeVertices.push({ x: index * 1.5, y: -index * 2.25 });
  }
  assertDwgError(
    () => writeAc1015EntityBody(barePolyline(hugeVertices), 1),
    "DWG_FILE_LIMIT_EXCEEDED",
  );
});

test("determinista: misma polilínea y mismo texto, mismos bytes", () => {
  const polyline = barePolyline(
    [
      { x: 0.5, y: 0.5 },
      { x: 2.5, y: 0.5 },
    ],
    true,
  );
  assert.deepEqual(
    writeAc1015EntityBody(polyline, 11),
    writeAc1015EntityBody(polyline, 11),
  );
  const text = { ...bareText([0x58]), widthFactor: 1.25 };
  assert.deepEqual(
    writeAc1015EntityBody(text, 12),
    writeAc1015EntityBody(text, 12),
  );
});

console.log(
  "entities-poly.spec: fase D3 verde — LWPOLYLINE y TEXT hacen round-trip exacto con presencia y ausencia de cada opcional; banderas no modeladas caen unsupported y los recuentos mentirosos caen corruptos.",
);
