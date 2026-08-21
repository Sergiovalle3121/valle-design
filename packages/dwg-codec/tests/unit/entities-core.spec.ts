/**
 * Spec de la primera geometría real (fase D2): LINE, POINT, CIRCLE y ARC.
 *
 * La fuente única del binario válido es el writer de entidades: los casos
 * felices emiten cuerpos (o contenedores completos) con el writer real y
 * exigen que el pipeline lector — mapa → envoltura → común → tipo — devuelva
 * la geometría EXACTA, double a double. Los gemelos tristes componen cuerpos
 * HOSTILES a mano con el mismo `DwgBitEmitter` (tipos desconocidos, comunes
 * truncados, banderas imposibles, tamaños en bits que no cuadran) y exigen el
 * error tipado correcto: unsupported para capacidad ausente, corrupt para
 * estructura rota.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DWG_LIMITS } from "../../src/api/limits.js";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import { readAc1015ObjectEnvelope } from "../../src/container/ac1015-object-envelope.js";
import { readAc1015ObjectMap } from "../../src/container/ac1015-object-map.js";
import type {
  DwgArcEntity,
  DwgCircleEntity,
  DwgGeometryEntity,
  DwgLineEntity,
  DwgPointEntity,
} from "../../src/model/entity-geometry.js";
import {
  AC1015_TYPE_ARC,
  AC1015_TYPE_CIRCLE,
  AC1015_TYPE_LINE,
  AC1015_TYPE_POINT,
  decodeAc1015EntityBody,
} from "../../src/objects/entities-core.js";
import {
  writeAc1015Container,
  type Ac1015ObjectSpec,
} from "../../src/writer/ac1015-container-writer.js";
import {
  DwgBitEmitter,
  writeAc1015EntityBody,
} from "../../src/writer/ac1015-entity-writer.js";
import { wrapAc1015ObjectBody } from "../../src/writer/ac1015-object-writer.js";
import { assertDwgError } from "../support/assert.js";

function cursorOf(bytes: Uint8Array): BoundedByteCursor {
  return new BoundedByteCursor(bytes);
}

/** Round-trip de un cuerpo suelto: writer → decodificador, geometría exacta. */
function roundTrip(entity: DwgGeometryEntity, handle = 7): void {
  const body = writeAc1015EntityBody(entity, handle);
  const decoded = decodeAc1015EntityBody(body);
  assert.deepEqual(decoded.entity, entity);
  assert.equal(decoded.common.ownHandle.code, 0);
  assert.equal(decoded.common.ownHandle.value, handle);
}

/**
 * Cabecera común mínima compuesta A MANO para los gemelos tristes, espejo de
 * la que emite el writer real; los parámetros tuercen exactamente lo que cada
 * test quiere torcer.
 */
function handmadeCommonTail(mode = 0b10, reactorCount = 0): DwgBitEmitter {
  const tail = new DwgBitEmitter();
  tail.emitH(0, 1); // handle propio
  tail.emitBS(0); // EED vacío
  tail.pushBit(0); // sin gráfico
  tail.pushBits(mode, 2);
  tail.emitBL(reactorCount);
  tail.pushBit(1); // sin vínculos
  tail.emitBS(256); // color ByLayer
  tail.emitBD(1); // escala de linetype
  tail.pushBits(0, 2); // banderas de linetype
  tail.pushBits(0, 2); // banderas de plotstyle
  tail.emitBS(0); // visible
  tail.emitRC(0x1d); // lineweight
  return tail;
}

/** Datos específicos de un POINT todo ceros: 3BD + BT + BE + BD, 10 bits. */
function zeroPointSpecific(tail: DwgBitEmitter): void {
  tail.emitBD(0);
  tail.emitBD(0);
  tail.emitBD(0);
  tail.pushBit(1); // BT: grosor cero
  tail.pushBit(1); // BE: extrusión canónica
  tail.emitBD(0); // ángulo del eje X
}

/**
 * Compone un cuerpo completo: tipo BS + RL (bits reales de tipo+RL+tail más
 * el ajuste hostil pedido) + tail + flujo de handles fuera del tamaño.
 */
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

test("los códigos de tipo BS registrados de las cuatro entidades", () => {
  assert.equal(AC1015_TYPE_ARC, 17);
  assert.equal(AC1015_TYPE_CIRCLE, 18);
  assert.equal(AC1015_TYPE_LINE, 19);
  assert.equal(AC1015_TYPE_POINT, 27);
});

test("round-trip LINE: Z ceros, Z reales, deltas iguales y −0 exacto", () => {
  // Z ambas cero: viaja por el bit de Z nulas, sin campos Z.
  roundTrip({
    kind: "line",
    start: { x: 1.5, y: -2.25, z: 0 },
    end: { x: -1_000_000.75, y: 0.125, z: 0 },
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  } satisfies DwgLineEntity);

  // Z no nulas, X final igual a la inicial (atajo DD contra defecto),
  // grosor negativo y extrusión NO canónica.
  roundTrip({
    kind: "line",
    start: { x: 0, y: 0, z: -3.5 },
    end: { x: 0, y: 7.25, z: 12.5 },
    thickness: -2.5,
    extrusion: { x: 0.6, y: 0, z: 0.8 },
  } satisfies DwgLineEntity);

  // Un −0.0 no es 0.0: debe volver con su bit de signo intacto.
  const negativeZero = writeAc1015EntityBody(
    {
      kind: "line",
      start: { x: 2, y: 3, z: -0 },
      end: { x: 2, y: 3, z: 4 },
      thickness: 0,
      extrusion: { x: 0, y: 0, z: 1 },
    },
    7,
  );
  const decoded = decodeAc1015EntityBody(negativeZero);
  assert.equal(decoded.entity.kind, "line");
  const line = decoded.entity as DwgLineEntity;
  assert.ok(Object.is(line.start.z, -0));
  assert.equal(line.end.z, 4);
});

test("round-trip POINT: coordenadas variadas y ángulo negativo", () => {
  roundTrip({
    kind: "point",
    position: { x: -12.5, y: 0, z: 99.99 },
    thickness: 1.25,
    extrusion: { x: 0, y: 1, z: 0 },
    xAxisAngle: -2.75,
  } satisfies DwgPointEntity);

  // El punto trivial: todos los atajos de un bit / dos bits a la vez.
  roundTrip({
    kind: "point",
    position: { x: 0, y: 0, z: 0 },
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    xAxisAngle: 0,
  } satisfies DwgPointEntity);
});

test("round-trip CIRCLE: centro negativo, Z no nula, extrusión no canónica", () => {
  roundTrip({
    kind: "circle",
    center: { x: -3.5, y: 4.25, z: -1 },
    radius: 12.75,
    thickness: 0.5,
    extrusion: { x: 0.6, y: 0, z: 0.8 },
  } satisfies DwgCircleEntity);

  roundTrip({
    kind: "circle",
    center: { x: 0, y: 0, z: 0 },
    radius: 1,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  } satisfies DwgCircleEntity);
});

test("round-trip ARC: ángulos en los cuatro cuadrantes y negativos", () => {
  const quadrantAngles = [0.5, 2.0, 3.6, 5.5, -1.2];
  for (const [index, startAngle] of quadrantAngles.entries()) {
    const endAngle = quadrantAngles[(index + 1) % quadrantAngles.length]!;
    roundTrip({
      kind: "arc",
      center: { x: index - 2, y: -index * 0.25, z: index === 3 ? 8.5 : 0 },
      radius: 0.125 + index,
      thickness: index === 2 ? 3.25 : 0,
      extrusion:
        index === 4 ? { x: 0, y: -1, z: 0 } : { x: 0, y: 0, z: 1 },
      startAngle,
      endAngle,
    } satisfies DwgArcEntity);
  }
});

test("el común mínimo coherente vuelve interpretado y lo opaco contabilizado", () => {
  const body = writeAc1015EntityBody(
    {
      kind: "circle",
      center: { x: 1, y: 2, z: 3 },
      radius: 4,
      thickness: 0,
      extrusion: { x: 0, y: 0, z: 1 },
    },
    0x90,
  );
  const { common, opaqueSpans } = decodeAc1015EntityBody(body);

  assert.equal(common.type, AC1015_TYPE_CIRCLE);
  assert.deepEqual(
    { ...common.ownHandle },
    { code: 0, value: 0x90, byteLength: 1 },
  );
  assert.equal(common.entityMode, 2);
  assert.equal(common.reactorCount, 0);
  assert.equal(common.noLinks, true);
  assert.equal(common.color.index, 256);
  assert.equal(common.linetypeScale, 1);
  assert.equal(common.linetypeFlags, 0);
  assert.equal(common.plotstyleFlags, 0);
  assert.equal(common.invisibility, 0);
  assert.equal(common.lineweight, 0x1d);

  // Un único resto opaco: el flujo de handles final, que arranca EXACTAMENTE
  // en el bit declarado y muere en el último bit del cuerpo. Dos handles
  // nulos son 16 bits; el resto es relleno del último byte.
  assert.equal(opaqueSpans.length, 1);
  const stream = opaqueSpans[0]!;
  assert.equal(stream.kind, "handle-stream");
  assert.equal(stream.startBit, common.bitSize);
  assert.equal(stream.bitLength, body.length * 8 - common.bitSize);
  assert.ok(stream.bitLength >= 16 && stream.bitLength < 24);
});

test("EED y gráfico presentes se contabilizan opacos con su posición exacta", () => {
  const tail = new DwgBitEmitter();
  tail.emitH(0, 3);
  const eedStart = tail.bitLength;
  tail.emitBS(5); // un grupo EED de 5 bytes
  tail.emitH(5, 0x123); // handle de la aplicación dueña
  for (let index = 0; index < 5; index += 1) {
    tail.emitRC(0x20 + index);
  }
  tail.emitBS(0); // terminador
  const eedEnd = tail.bitLength;
  tail.pushBit(1); // gráfico presente
  const graphicStart = tail.bitLength;
  tail.emitRL(2);
  tail.emitRC(0xaa);
  tail.emitRC(0xbb);
  const graphicEnd = tail.bitLength;
  tail.pushBits(0b10, 2);
  tail.emitBL(0);
  tail.pushBit(1);
  tail.emitBS(256);
  tail.emitBD(1);
  tail.pushBits(0, 2);
  tail.pushBits(0, 2);
  tail.emitBS(0);
  tail.emitRC(0x1d);
  zeroPointSpecific(tail);
  const body = composeBody(AC1015_TYPE_POINT, tail, 0, nullStream());

  const { common, entity, opaqueSpans } = decodeAc1015EntityBody(body);
  assert.equal(common.ownHandle.value, 3);
  assert.deepEqual(entity, {
    kind: "point",
    position: { x: 0, y: 0, z: 0 },
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    xAxisAngle: 0,
  });

  // El tipo POINT viaja como BS de 10 bits y el RL son 32: los tramos opacos
  // se declaran en bits ABSOLUTOS del cuerpo.
  const base = 10 + 32;
  assert.equal(opaqueSpans.length, 3);
  assert.deepEqual(
    { ...opaqueSpans[0]! },
    {
      kind: "extended-data",
      startBit: base + eedStart,
      bitLength: eedEnd - eedStart,
    },
  );
  assert.deepEqual(
    { ...opaqueSpans[1]! },
    {
      kind: "graphic",
      startBit: base + graphicStart,
      bitLength: graphicEnd - graphicStart,
    },
  );
  assert.equal(opaqueSpans[2]!.kind, "handle-stream");
  assert.equal(opaqueSpans[2]!.startBit, common.bitSize);
});

test("determinista: misma entidad y mismo handle, mismos bytes", () => {
  const arc: DwgArcEntity = {
    kind: "arc",
    center: { x: 1.25, y: -8, z: 0 },
    radius: 3,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    startAngle: 0.25,
    endAngle: 4.5,
  };
  assert.deepEqual(
    writeAc1015EntityBody(arc, 11),
    writeAc1015EntityBody(arc, 11),
  );
  const options = { objects: [{ entity: arc }] };
  assert.deepEqual(writeAc1015Container(options), writeAc1015Container(options));
});

test("pipeline completo: mapa → envoltura → común → tipo, geometría exacta", () => {
  const line: DwgLineEntity = {
    kind: "line",
    start: { x: -5.5, y: 2.25, z: 1.75 },
    end: { x: 10, y: -0.5, z: -9.125 },
    thickness: 0.75,
    extrusion: { x: 0, y: 0, z: 1 },
  };
  const circle: DwgCircleEntity = {
    kind: "circle",
    center: { x: 100.5, y: -200.25, z: 0 },
    radius: 42.125,
    thickness: 0,
    extrusion: { x: 0.6, y: 0, z: 0.8 },
  };
  const file = writeAc1015Container({
    objects: [
      { entity: line },
      { entity: circle, handle: 5 },
      { type: 500, bodyFillLength: 4 }, // un opaco D1 convive con las reales
    ],
  });

  const cursor = cursorOf(file);
  const header = parseAc1015FileHeader(cursor);
  const entries = readAc1015ObjectMap(
    cursor,
    header.records[2]!,
    DEFAULT_DWG_LIMITS,
  );
  assert.deepEqual(
    entries.map((entry) => entry.handle),
    [1, 5, 6],
  );

  const envelopes = entries.map((entry) =>
    readAc1015ObjectEnvelope(cursor, entry.offset, header.records),
  );
  assert.deepEqual(
    envelopes.map((envelope) => envelope.type),
    [AC1015_TYPE_LINE, AC1015_TYPE_CIRCLE, 500],
  );

  const first = decodeAc1015EntityBody(envelopes[0]!.bodyBytes);
  assert.deepEqual(first.entity, line);
  assert.equal(first.common.ownHandle.value, entries[0]!.handle);

  const second = decodeAc1015EntityBody(envelopes[1]!.bodyBytes);
  assert.deepEqual(second.entity, circle);
  assert.equal(second.common.ownHandle.value, entries[1]!.handle);

  // El sintético sigue siendo capacidad ausente, no corrupción.
  const unsupported = assertDwgError(
    () => decodeAc1015EntityBody(envelopes[2]!.bodyBytes),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assert.equal(unsupported.detail.category, "unsupported");
});

test("gemelo triste: un tipo BS desconocido es unsupported, no corrupt", () => {
  const tail = handmadeCommonTail();
  const body = composeBody(0x4a, tail, 0, nullStream());
  const error = assertDwgError(
    () => decodeAc1015EntityBody(body),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assert.equal(error.detail.category, "unsupported");

  // Y un cuerpo que no alcanza ni para su tipo sí es corrupción.
  assertDwgError(
    () => decodeAc1015EntityBody(new Uint8Array(0)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: común truncado en varios puntos", () => {
  const body = writeAc1015EntityBody(
    {
      kind: "line",
      start: { x: 1, y: 2, z: 3 },
      end: { x: 4, y: 5, z: 6 },
      thickness: 0,
      extrusion: { x: 0, y: 0, z: 1 },
    },
    9,
  );
  // Cortado dentro del RL del tamaño, dentro del handle/EED y dentro del
  // común profundo: siempre corrupción tipada, nunca una excepción cruda.
  for (const cut of [1, 3, 8, 12]) {
    assertDwgError(
      () => decodeAc1015EntityBody(body.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("gemelo triste: datos del tipo truncados fallan cerrado", () => {
  // El común completo promete un RD de 8 bytes del centro… y entrega 3.
  const tail = handmadeCommonTail();
  tail.pushBits(0b00, 2); // BD del centro X en forma RD completa
  tail.emitRC(0x11);
  tail.emitRC(0x22);
  tail.emitRC(0x33);
  const body = composeBody(AC1015_TYPE_CIRCLE, tail);
  assertDwgError(() => decodeAc1015EntityBody(body), "DWG_STRUCTURE_CORRUPT");
});

test("gemelo triste: banderas imposibles en el común", () => {
  // Modo de entidad 0b11: no definido por el formato.
  const modeTail = handmadeCommonTail(0b11);
  zeroPointSpecific(modeTail);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(
        composeBody(AC1015_TYPE_POINT, modeTail, 0, nullStream()),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Bandera BL 0b11 en el recuento de reactores: tampoco existe.
  const flagTail = new DwgBitEmitter();
  flagTail.emitH(0, 1);
  flagTail.emitBS(0);
  flagTail.pushBit(0);
  flagTail.pushBits(0b10, 2);
  flagTail.pushBits(0b11, 2); // readBL fallará aquí
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_POINT, flagTail)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Un recuento de reactores que no cabría ni en el flujo de handles.
  const reactorTail = handmadeCommonTail(0b10, 200);
  zeroPointSpecific(reactorTail);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(
        composeBody(AC1015_TYPE_POINT, reactorTail, 0, nullStream()),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: el tamaño en bits que no cuadra falla cerrado", () => {
  // Declara más bits de los que caben en el cuerpo entero.
  const overflowTail = handmadeCommonTail();
  zeroPointSpecific(overflowTail);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(composeBody(AC1015_TYPE_POINT, overflowTail, 64)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Declara 8 bits MENOS de los que el decodificado real consume…
  const shortTail = handmadeCommonTail();
  zeroPointSpecific(shortTail);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(
        composeBody(AC1015_TYPE_POINT, shortTail, -8, nullStream()),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // …y 8 bits MÁS, aun cabiendo en el cuerpo: también descuadre.
  const longTail = handmadeCommonTail();
  zeroPointSpecific(longTail);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(
        composeBody(AC1015_TYPE_POINT, longTail, 8, nullStream()),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: radios negativos y doubles no finitos son corrupción", () => {
  // Radio −5.0 emitido como RD crudo (el emisor de BD válidos no lo haría).
  const radiusTail = handmadeCommonTail();
  radiusTail.emitBD(0);
  radiusTail.emitBD(0);
  radiusTail.emitBD(0);
  radiusTail.pushBits(0b00, 2);
  radiusTail.emitRD(-5);
  radiusTail.pushBit(1);
  radiusTail.pushBit(1);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(
        composeBody(AC1015_TYPE_CIRCLE, radiusTail, 0, nullStream()),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Una coordenada NaN (todo unos) tampoco es geometría.
  const nanTail = handmadeCommonTail();
  nanTail.pushBits(0b00, 2);
  for (let index = 0; index < 8; index += 1) {
    nanTail.emitRC(0xff);
  }
  assertDwgError(
    () => decodeAc1015EntityBody(composeBody(AC1015_TYPE_POINT, nanTail)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("el writer de entidades falla cerrado ante specs imposibles", () => {
  const good: DwgCircleEntity = {
    kind: "circle",
    center: { x: 0, y: 0, z: 0 },
    radius: 1,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  };
  // Geometría no finita, radio negativo, kind ajeno y handles imposibles.
  assertDwgError(
    () =>
      writeAc1015EntityBody(
        { ...good, center: { x: Number.NaN, y: 0, z: 0 } },
        1,
      ),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015EntityBody({ ...good, radius: Number.POSITIVE_INFINITY }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015EntityBody({ ...good, radius: -1 }, 1),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015EntityBody(
        { kind: "banana" } as unknown as DwgGeometryEntity,
        1,
      ),
    "DWG_INPUT_INVALID",
  );
  // Un kind del modelo que el lector decodifica pero el writer aún no emite
  // se rechaza como pendiente DECLARADO, no como input inválido.
  assertDwgError(
    () =>
      writeAc1015EntityBody(
        { kind: "solid" } as unknown as DwgGeometryEntity,
        1,
      ),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assertDwgError(() => writeAc1015EntityBody(good, 0), "DWG_INPUT_INVALID");

  // La envoltura de cuerpos tampoco acepta imposibles.
  assertDwgError(
    () => wrapAc1015ObjectBody(new Uint8Array(0)),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => wrapAc1015ObjectBody(new Uint8Array(0x8001)),
    "DWG_FILE_LIMIT_EXCEEDED",
  );

  // Y un spec de contenedor debe ser entidad O sintético, nunca ambos o nada.
  assertDwgError(
    () =>
      writeAc1015Container({
        objects: [{ entity: good, type: 3 } as unknown as Ac1015ObjectSpec],
      }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015Container({
        objects: [{ handle: 2 } as unknown as Ac1015ObjectSpec],
      }),
    "DWG_INPUT_INVALID",
  );
});

console.log(
  "entities-core.spec: fase D2 verde — LINE, POINT, CIRCLE y ARC hacen round-trip coordenada a coordenada por el pipeline completo; lo opaco queda contabilizado y los cuerpos hostiles caen tipados.",
);
