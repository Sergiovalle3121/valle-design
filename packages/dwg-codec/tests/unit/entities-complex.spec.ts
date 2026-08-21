/**
 * Spec de la campaña de entidades complejas: LEADER, TOLERANCE, MLINE,
 * VIEWPORT (la entidad de paper space) y HATCH.
 *
 * El writer del laboratorio aún no emite estas entidades, así que los casos
 * felices componen los cuerpos A MANO con el emisor first-party — el MISMO
 * `DwgBitEmitter`, `emitAc1015EntityCommonTail` y `composeAc1015ObjectBody`
 * que usa el writer real, cero marcos gemelos — campo a campo en el orden
 * EXACTO que declara el decodificador, y exigen el modelo neutral EXACTO:
 * double a double, −0.0 con su bit de signo incluido. Los gemelos tristes
 * tuercen el mismo emisor (cuerpos truncados, tamaños en bits que no cuadran,
 * doubles no finitos crudos, tipos de segmento fuera del formato, recuentos
 * sobre el tope de laboratorio) y exigen el error tipado correcto: corrupt
 * para estructura rota, unsupported para capacidad ausente.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DwgHatchEntity,
  DwgHatchPath,
  DwgHatchSegment,
  DwgLeaderEntity,
  DwgMlineEntity,
  DwgPoint2,
  DwgPoint3,
  DwgToleranceEntity,
  DwgViewportEntity,
} from "../../src/model/entity-geometry.js";
// El despachador se importa ANTES que sus hermanos hoja: el orden de carga de
// los specs vecinos evita el ciclo TDZ documentado en entities-annotation.
import {
  AC1015_TYPE_HATCH,
  AC1015_TYPE_LEADER,
  AC1015_TYPE_MLINE,
  AC1015_TYPE_TOLERANCE,
  AC1015_TYPE_VIEWPORT,
  decodeAc1015EntityBody,
  type Ac1015DecodedEntity,
} from "../../src/objects/entities-core.js";
import {
  composeAc1015ObjectBody,
  DwgBitEmitter,
  emitAc1015EntityCommonTail,
} from "../../src/writer/ac1015-entity-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Las entidades complejas que esta spec compone y decodifica. */
type ComplexEntity =
  | DwgLeaderEntity
  | DwgToleranceEntity
  | DwgMlineEntity
  | DwgViewportEntity
  | DwgHatchEntity;

/** Los bytes ASCII de una cadena, como el modelo neutral los transporta. */
function bytesOf(value: string): readonly number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

/** Un 3BD del modelo, componente a componente (espejo de readPoint). */
function emit3BD(tail: DwgBitEmitter, point: DwgPoint3): void {
  tail.emitBD(point.x);
  tail.emitBD(point.y);
  tail.emitBD(point.z);
}

/** Dos RD crudos de un punto 2D (espejo de readPoint2RD). */
function emit2RD(tail: DwgBitEmitter, point: DwgPoint2): void {
  tail.emitRD(point.x);
  tail.emitRD(point.y);
}

/** Un 2BD del modelo (espejo de readPoint2BD). */
function emit2BD(tail: DwgBitEmitter, point: DwgPoint2): void {
  tail.emitBD(point.x);
  tail.emitBD(point.y);
}

/** El flujo de handles mínimo del writer real: xdictionary y capa NULOS. */
function emitNullStream(stream: DwgBitEmitter): void {
  stream.emitH(0, 0); // xdictionary nulo
  stream.emitH(0, 0); // capa nula
}

/**
 * Cuerpo HOSTIL con el tamaño en bits torcido a voluntad, espejo del
 * `hostileBody` de las specs vecinas.
 */
function hostileBody(
  type: number,
  tail: DwgBitEmitter,
  bitSizeAdjust = 0,
  withStream = true,
): Uint8Array {
  const head = new DwgBitEmitter();
  head.emitBS(type);
  const bitSize = head.bitLength + 32 + tail.bitLength + bitSizeAdjust;
  const body = new DwgBitEmitter();
  body.pushEmitter(head);
  body.emitRL(bitSize);
  body.pushEmitter(tail);
  if (withStream) {
    emitNullStream(body);
  }
  return body.toBytes();
}

/** LEADER, espejo campo a campo del decodificador (disposición ODS R2000). */
function emitLeader(tail: DwgBitEmitter, entity: DwgLeaderEntity): void {
  tail.pushBit(entity.unnamedBit === 1 ? 1 : 0);
  tail.emitBS(entity.annotationType);
  tail.emitBS(entity.pathType);
  tail.emitBL(entity.points.length);
  for (const point of entity.points) {
    emit3BD(tail, point);
  }
  emit3BD(tail, entity.origin);
  emit3BD(tail, entity.extrusion);
  emit3BD(tail, entity.xDirection);
  emit3BD(tail, entity.blockInsertOffset);
  emit3BD(tail, entity.endpointProjection);
  tail.emitBD(entity.boxHeight);
  tail.emitBD(entity.boxWidth);
  tail.pushBit(entity.hooklineAlongXDirection === 1 ? 1 : 0);
  tail.pushBit(entity.arrowheadOn === 1 ? 1 : 0);
  tail.emitBS(entity.unnamedShort);
  tail.pushBit(entity.unnamedBitA === 1 ? 1 : 0);
  tail.pushBit(entity.unnamedBitB === 1 ? 1 : 0);
}

/** TOLERANCE: inserción, dirección X, extrusión y texto TV. */
function emitTolerance(tail: DwgBitEmitter, entity: DwgToleranceEntity): void {
  emit3BD(tail, entity.insertion);
  emit3BD(tail, entity.xDirection);
  emit3BD(tail, entity.extrusion);
  tail.emitTV(entity.textBytes);
}

/** MLINE: escala, justificación, base, extrusión, banderas y vértices. */
function emitMline(tail: DwgBitEmitter, entity: DwgMlineEntity): void {
  tail.emitBD(entity.scale);
  tail.emitRC(entity.justification);
  emit3BD(tail, entity.basePoint);
  emit3BD(tail, entity.extrusion);
  tail.emitBS(entity.openClosedFlags);
  tail.emitRC(entity.styleLineCount);
  tail.emitBS(entity.vertices.length);
  for (const vertex of entity.vertices) {
    emit3BD(tail, vertex.position);
    emit3BD(tail, vertex.vertexDirection);
    emit3BD(tail, vertex.miterDirection);
    for (const line of vertex.styleLines) {
      tail.emitBS(line.segmentParameters.length);
      for (const parameter of line.segmentParameters) {
        tail.emitBD(parameter);
      }
      tail.emitBS(line.areaFillParameters.length);
      for (const parameter of line.areaFillParameters) {
        tail.emitBD(parameter);
      }
    }
  }
}

/** VIEWPORT: todos los campos R2000 en su orden. */
function emitViewport(tail: DwgBitEmitter, entity: DwgViewportEntity): void {
  emit3BD(tail, entity.center);
  tail.emitBD(entity.width);
  tail.emitBD(entity.height);
  emit3BD(tail, entity.viewTarget);
  emit3BD(tail, entity.viewDirection);
  tail.emitBD(entity.twistAngle);
  tail.emitBD(entity.viewHeight);
  tail.emitBD(entity.lensLength);
  tail.emitBD(entity.frontClip);
  tail.emitBD(entity.backClip);
  tail.emitBD(entity.snapAngle);
  emit2RD(tail, entity.viewCenter);
  emit2RD(tail, entity.snapBase);
  emit2RD(tail, entity.snapSpacing);
  emit2RD(tail, entity.gridSpacing);
  tail.emitBS(entity.circleZoom);
  tail.emitBL(entity.frozenLayerCount);
  tail.emitBL(entity.statusFlags);
  tail.emitTV(entity.styleSheetBytes);
  tail.emitRC(entity.renderMode);
  tail.pushBit(entity.ucsAtOrigin === 1 ? 1 : 0);
  tail.pushBit(entity.ucsPerViewport === 1 ? 1 : 0);
  emit3BD(tail, entity.ucsOrigin);
  emit3BD(tail, entity.ucsXAxis);
  emit3BD(tail, entity.ucsYAxis);
  tail.emitBD(entity.ucsElevation);
  tail.emitBS(entity.ucsOrthoViewType);
}

/** Un segmento de camino de HATCH por su tipo RC. */
function emitHatchSegment(tail: DwgBitEmitter, segment: DwgHatchSegment): void {
  switch (segment.kind) {
    case "line":
      tail.emitRC(1);
      emit2RD(tail, segment.start);
      emit2RD(tail, segment.end);
      return;
    case "arc":
      tail.emitRC(2);
      emit2RD(tail, segment.center);
      tail.emitBD(segment.radius);
      tail.emitBD(segment.startAngle);
      tail.emitBD(segment.endAngle);
      tail.pushBit(segment.counterClockwise ? 1 : 0);
      return;
    case "ellipticArc":
      tail.emitRC(3);
      emit2RD(tail, segment.center);
      emit2RD(tail, segment.majorAxisEndpoint);
      tail.emitBD(segment.axisRatio);
      tail.emitBD(segment.startAngle);
      tail.emitBD(segment.endAngle);
      tail.pushBit(segment.counterClockwise ? 1 : 0);
      return;
    case "spline": {
      tail.emitRC(4);
      tail.emitBL(segment.degree);
      tail.pushBit(segment.rational ? 1 : 0);
      tail.pushBit(segment.periodic ? 1 : 0);
      tail.emitBL(segment.knots.length);
      tail.emitBL(segment.controlPoints.length);
      for (const knot of segment.knots) {
        tail.emitBD(knot);
      }
      for (const [index, point] of segment.controlPoints.entries()) {
        emit2RD(tail, point);
        if (segment.rational) {
          tail.emitBD(segment.weights![index]!);
        }
      }
      return;
    }
  }
}

/** Un camino de HATCH: banderas BL y su forma polilínea o de segmentos. */
function emitHatchPath(tail: DwgBitEmitter, path: DwgHatchPath): void {
  tail.emitBL(path.flags);
  if (path.kind === "polyline") {
    tail.pushBit(path.bulges !== undefined ? 1 : 0);
    tail.pushBit(path.closed ? 1 : 0);
    tail.emitBL(path.vertices.length);
    for (const [index, vertex] of path.vertices.entries()) {
      emit2RD(tail, vertex);
      if (path.bulges !== undefined) {
        tail.emitBD(path.bulges[index]!);
      }
    }
  } else {
    tail.emitBL(path.segments.length);
    for (const segment of path.segments) {
      emitHatchSegment(tail, segment);
    }
  }
  tail.emitBL(path.boundaryObjectCount);
}

/** HATCH entero: elevación, caminos, patrón y puntos semilla, en su orden. */
function emitHatch(tail: DwgBitEmitter, entity: DwgHatchEntity): void {
  tail.emitBD(entity.elevation);
  emit3BD(tail, entity.extrusion);
  tail.emitTV(entity.nameBytes);
  tail.pushBit(entity.solidFill ? 1 : 0);
  tail.pushBit(entity.associative ? 1 : 0);
  tail.emitBL(entity.paths.length);
  for (const path of entity.paths) {
    emitHatchPath(tail, path);
  }
  tail.emitBS(entity.style);
  tail.emitBS(entity.patternType);
  if (!entity.solidFill) {
    tail.emitBD(entity.angle!);
    tail.emitBD(entity.scaleOrSpacing!);
    tail.pushBit(entity.doubleHatch ? 1 : 0);
    tail.emitBS(entity.definitionLines!.length);
    for (const line of entity.definitionLines!) {
      tail.emitBD(line.angle);
      emit2BD(tail, line.basePoint);
      emit2BD(tail, line.offset);
      tail.emitBS(line.dashes.length);
      for (const dash of line.dashes) {
        tail.emitBD(dash);
      }
    }
  }
  if (entity.pixelSize !== undefined) {
    tail.emitBD(entity.pixelSize);
  }
  tail.emitBL(entity.seedPoints.length);
  for (const seed of entity.seedPoints) {
    emit2RD(tail, seed);
  }
}

/** Los datos específicos de cada entidad, espejo exacto del decodificador. */
function emitComplexSpecific(tail: DwgBitEmitter, entity: ComplexEntity): void {
  switch (entity.kind) {
    case "leader":
      emitLeader(tail, entity);
      return;
    case "tolerance":
      emitTolerance(tail, entity);
      return;
    case "mline":
      emitMline(tail, entity);
      return;
    case "viewport":
      emitViewport(tail, entity);
      return;
    case "hatch":
      emitHatch(tail, entity);
      return;
  }
}

/** El código de tipo BS del modelo complejo (hechos registrados). */
function complexTypeOf(entity: ComplexEntity): number {
  switch (entity.kind) {
    case "leader":
      return AC1015_TYPE_LEADER;
    case "tolerance":
      return AC1015_TYPE_TOLERANCE;
    case "mline":
      return AC1015_TYPE_MLINE;
    case "viewport":
      return AC1015_TYPE_VIEWPORT;
    case "hatch":
      return AC1015_TYPE_HATCH;
  }
}

/** Cuerpo VÁLIDO first-party: común mínimo, datos del tipo y flujo nulo. */
function complexBody(entity: ComplexEntity, handle = 7): Uint8Array {
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, handle, false);
  emitComplexSpecific(tail, entity);
  return composeAc1015ObjectBody(complexTypeOf(entity), tail, emitNullStream);
}

/** Compone, decodifica y exige el modelo EXACTO; devuelve el decodificado. */
function roundDecode(entity: ComplexEntity, handle = 7): Ac1015DecodedEntity {
  const decoded = decodeAc1015EntityBody(complexBody(entity, handle));
  assert.deepEqual(decoded.entity, entity);
  assert.equal(decoded.common.type, complexTypeOf(entity));
  assert.equal(decoded.common.ownHandle.value, handle);
  return decoded;
}

/** Un LEADER de referencia con la forma del corpus real (16-leader). */
const LEADER_SAMPLE: DwgLeaderEntity = {
  kind: "leader",
  unnamedBit: 0,
  annotationType: 0,
  pathType: 0,
  points: [
    { x: 10, y: 10, z: -0 },
    { x: 35, y: 30, z: 0 },
    { x: 55, y: 42, z: 0 },
  ],
  origin: { x: 10, y: 10, z: 0 },
  extrusion: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
  blockInsertOffset: { x: 0, y: 0, z: 0 },
  endpointProjection: { x: -2.5, y: 0.75, z: 0 },
  boxHeight: 3.5,
  boxWidth: 39.5,
  hooklineAlongXDirection: 0,
  arrowheadOn: 1,
  unnamedShort: 0,
  unnamedBitA: 0,
  unnamedBitB: 1,
};

/** Una TOLERANCE de referencia (marco de control con texto gdt). */
const TOLERANCE_SAMPLE: DwgToleranceEntity = {
  kind: "tolerance",
  insertion: { x: 20, y: 70, z: -0 },
  xDirection: { x: 1, y: 0, z: 0 },
  extrusion: { x: 0, y: 0, z: 1 },
  textBytes: bytesOf("{\\Fgdt;j}%%v0.05%%vA"),
};

/** Una MLINE de referencia: dos líneas de estilo y dos vértices. */
const MLINE_SAMPLE: DwgMlineEntity = {
  kind: "mline",
  scale: 1.25,
  justification: 1,
  basePoint: { x: 0, y: 30, z: -0 },
  extrusion: { x: 0, y: 0, z: 1 },
  openClosedFlags: 1,
  styleLineCount: 2,
  vertices: [
    {
      position: { x: 0, y: 30, z: 0 },
      vertexDirection: { x: 1, y: 0, z: 0 },
      miterDirection: { x: 0, y: 1, z: 0 },
      styleLines: [
        { segmentParameters: [0.5, -0.25], areaFillParameters: [] },
        { segmentParameters: [-0.5], areaFillParameters: [1.5] },
      ],
    },
    {
      position: { x: 50, y: 30, z: 0 },
      vertexDirection: { x: 0, y: 1, z: 0 },
      miterDirection: { x: -0.7071067811865475, y: 0.7071067811865475, z: 0 },
      styleLines: [
        { segmentParameters: [], areaFillParameters: [] },
        { segmentParameters: [2, 0, -2], areaFillParameters: [] },
      ],
    },
  ],
};

/** Un VIEWPORT de referencia con la forma del corpus real (23-layout). */
const VIEWPORT_SAMPLE: DwgViewportEntity = {
  kind: "viewport",
  center: { x: 148.5, y: 105, z: -0 },
  width: 297,
  height: 210,
  viewTarget: { x: 0, y: 0, z: 0 },
  viewDirection: { x: 0, y: 0, z: 1 },
  twistAngle: -0,
  viewHeight: 210,
  lensLength: 50,
  frontClip: 0,
  backClip: 0,
  snapAngle: 0,
  viewCenter: { x: 148.5, y: 105 },
  snapBase: { x: 0, y: -0 },
  snapSpacing: { x: 10, y: 10 },
  gridSpacing: { x: 10, y: 10 },
  circleZoom: 100,
  frozenLayerCount: 0,
  statusFlags: 0x0002_0000,
  styleSheetBytes: [],
  renderMode: 0,
  ucsAtOrigin: 1,
  ucsPerViewport: 1,
  ucsOrigin: { x: 0, y: 0, z: 0 },
  ucsXAxis: { x: 1, y: 0, z: 0 },
  ucsYAxis: { x: 0, y: 1, z: 0 },
  ucsElevation: 0,
  ucsOrthoViewType: 0,
};

/** Un HATCH sólido con un único camino polilínea, como el del corpus. */
const HATCH_SOLID_SAMPLE: DwgHatchEntity = {
  kind: "hatch",
  elevation: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  nameBytes: bytesOf("SOLID"),
  solidFill: true,
  associative: false,
  paths: [
    {
      kind: "polyline",
      flags: 0x3,
      closed: true,
      vertices: [
        { x: 200, y: 0 },
        { x: 240, y: 0 },
        { x: 240, y: 40 },
        { x: 200, y: 40 },
      ],
      bulges: undefined,
      boundaryObjectCount: 0,
    },
  ],
  style: 0,
  patternType: 1,
  angle: undefined,
  scaleOrSpacing: undefined,
  doubleHatch: undefined,
  definitionLines: undefined,
  pixelSize: undefined,
  seedPoints: [{ x: 220, y: 20 }],
};

/**
 * Un HATCH de patrón que ejercita TODO: camino de segmentos (línea, arco,
 * arco elíptico y spline racional), camino polilínea con bulges, bit de
 * derivado (pixelSize presente), líneas de definición con trazos y semillas.
 */
const HATCH_PATTERN_SAMPLE: DwgHatchEntity = {
  kind: "hatch",
  elevation: -1.5,
  extrusion: { x: 0, y: 0, z: 1 },
  nameBytes: bytesOf("ANSI31"),
  solidFill: false,
  associative: true,
  paths: [
    {
      kind: "segments",
      flags: 0x5, // externo + DERIVADO: pide el pixelSize del final
      segments: [
        { kind: "line", start: { x: 0, y: 0 }, end: { x: 70, y: -0 } },
        {
          kind: "arc",
          center: { x: 70, y: 35 },
          radius: 35,
          startAngle: -1.5707963267948966,
          endAngle: 1.5707963267948966,
          counterClockwise: true,
        },
        {
          kind: "ellipticArc",
          center: { x: 35, y: 70 },
          majorAxisEndpoint: { x: -35, y: 0 },
          axisRatio: 0.5,
          startAngle: 0,
          endAngle: 3.141592653589793,
          counterClockwise: false,
        },
        {
          kind: "spline",
          degree: 2,
          rational: true,
          periodic: false,
          knots: [0, 0, 0, 1, 1, 1],
          controlPoints: [
            { x: 0, y: 35 },
            { x: -0.5, y: 17.5 },
            { x: 0, y: 0 },
          ],
          weights: [1, 0.7071067811865476, 1],
        },
      ],
      boundaryObjectCount: 2,
    },
    {
      kind: "polyline",
      flags: 0x2,
      closed: true,
      vertices: [
        { x: 23, y: 35 },
        { x: 47, y: 35 },
      ],
      bulges: [1, 1],
      boundaryObjectCount: 1,
    },
  ],
  style: 1,
  patternType: 1,
  angle: 0.7853981633974483,
  scaleOrSpacing: 1,
  doubleHatch: false,
  definitionLines: [
    {
      angle: 0.7853981633974483,
      basePoint: { x: 0, y: -0 },
      offset: { x: -0.0883883476483184, y: 0.0883883476483184 },
      dashes: [],
    },
    {
      angle: -0.25,
      basePoint: { x: 1.5, y: 2.5 },
      offset: { x: 0, y: 0.25 },
      dashes: [0.5, -0.25],
    },
  ],
  pixelSize: 0.125,
  seedPoints: [
    { x: 35, y: 10 },
    { x: -0, y: 1 },
  ],
};

test("los códigos de tipo BS registrados de las entidades complejas", () => {
  assert.equal(AC1015_TYPE_VIEWPORT, 0x22);
  assert.equal(AC1015_TYPE_LEADER, 0x2d);
  assert.equal(AC1015_TYPE_TOLERANCE, 0x2e);
  assert.equal(AC1015_TYPE_MLINE, 0x2f);
  assert.equal(AC1015_TYPE_HATCH, 0x4e);
});

test("LEADER: los puntos, el origen y la cola R2000 vuelven EXACTOS", () => {
  const decoded = roundDecode(LEADER_SAMPLE, 0x103);
  const entity = decoded.entity as DwgLeaderEntity;
  // El −0.0 de la Z del primer punto conserva su bit de signo.
  assert.ok(Object.is(entity.points[0]!.z, -0));
  // Los códigos y bits sin semántica viajan tal cual, cola BS+B+B incluida.
  assert.equal(entity.annotationType, 0);
  assert.equal(entity.arrowheadOn, 1);
  assert.equal(entity.unnamedShort, 0);
  assert.equal(entity.unnamedBitB, 1);
  // Un LEADER sin puntos también es un cuerpo válido del formato.
  roundDecode({ ...LEADER_SAMPLE, points: [] }, 0x104);
});

test("TOLERANCE: inserción, dirección X, extrusión y texto por bytes", () => {
  const decoded = roundDecode(TOLERANCE_SAMPLE, 0x106);
  const entity = decoded.entity as DwgToleranceEntity;
  assert.deepEqual(entity.textBytes, bytesOf("{\\Fgdt;j}%%v0.05%%vA"));
  assert.ok(Object.is(entity.insertion.z, -0));
  // Y un texto vacío vuelve vacío, sin inventar contenido.
  roundDecode({ ...TOLERANCE_SAMPLE, textBytes: [] }, 0x107);
});

test("MLINE: vértices con sus direcciones y parámetros por línea de estilo", () => {
  const decoded = roundDecode(MLINE_SAMPLE, 0x108);
  const entity = decoded.entity as DwgMlineEntity;
  // Cada vértice conserva EXACTAMENTE sus listas por línea de estilo.
  assert.equal(entity.vertices.length, 2);
  assert.deepEqual(entity.vertices[0]!.styleLines[0]!.segmentParameters, [
    0.5, -0.25,
  ]);
  assert.deepEqual(entity.vertices[1]!.styleLines[1]!.segmentParameters, [
    2, 0, -2,
  ]);
  // La justificación RC y las banderas BS viajan crudas.
  assert.equal(entity.justification, 1);
  assert.equal(entity.openClosedFlags, 1);
  // Una MLINE sin vértices conserva su recuento de líneas de estilo.
  const empty = roundDecode({ ...MLINE_SAMPLE, vertices: [] }, 0x109);
  assert.equal((empty.entity as DwgMlineEntity).styleLineCount, 2);
});

test("VIEWPORT: los campos R2000 completos vuelven campo a campo", () => {
  const decoded = roundDecode(VIEWPORT_SAMPLE, 0x10a);
  const entity = decoded.entity as DwgViewportEntity;
  assert.equal(entity.width, 297);
  assert.equal(entity.height, 210);
  assert.deepEqual(entity.viewCenter, { x: 148.5, y: 105 });
  // Los crudos sin semántica: zoom BS, banderas BL, modo RC, bits de UCS.
  assert.equal(entity.circleZoom, 100);
  assert.equal(entity.statusFlags, 0x0002_0000);
  assert.equal(entity.ucsAtOrigin, 1);
  // Los −0.0 conservan su bit de signo (giro y base de snap).
  assert.ok(Object.is(entity.twistAngle, -0));
  assert.ok(Object.is(entity.snapBase.y, -0));
});

test("HATCH sólido: sin campos de patrón y con su camino polilínea exacto", () => {
  const decoded = roundDecode(HATCH_SOLID_SAMPLE, 0x101);
  const entity = decoded.entity as DwgHatchEntity;
  assert.equal(entity.solidFill, true);
  // Ausente es `undefined`: nada de patrón viajó y nada se inventa.
  assert.equal(entity.angle, undefined);
  assert.equal(entity.definitionLines, undefined);
  assert.equal(entity.pixelSize, undefined);
  const path = entity.paths[0]!;
  assert.equal(path.kind, "polyline");
  assert.equal((path as { closed: boolean }).closed, true);
});

test("HATCH de patrón: segmentos, bulges, líneas de definición y pixelSize", () => {
  const decoded = roundDecode(HATCH_PATTERN_SAMPLE, 0x102);
  const entity = decoded.entity as DwgHatchEntity;
  // El camino de segmentos conserva sus cuatro tipos en orden.
  const segments = entity.paths[0]! as Extract<
    DwgHatchPath,
    { kind: "segments" }
  >;
  assert.deepEqual(
    segments.segments.map((segment) => segment.kind),
    ["line", "arc", "ellipticArc", "spline"],
  );
  const spline = segments.segments[3]! as Extract<
    DwgHatchSegment,
    { kind: "spline" }
  >;
  assert.equal(spline.rational, true);
  assert.equal(spline.weights!.length, 3);
  // El bit de DERIVADO de un camino pidió el pixelSize del final.
  assert.equal(entity.pixelSize, 0.125);
  // Los bulges del camino polilínea isla vuelven uno a uno.
  const island = entity.paths[1]! as Extract<DwgHatchPath, { kind: "polyline" }>;
  assert.deepEqual(island.bulges, [1, 1]);
  // El −0.0 de una semilla conserva su bit de signo.
  assert.ok(Object.is(entity.seedPoints[1]!.x, -0));
});

test("determinista: decodificar dos veces da estructuras profundas iguales", () => {
  const bodies = [
    complexBody(LEADER_SAMPLE, 3),
    complexBody(MLINE_SAMPLE, 4),
    complexBody(VIEWPORT_SAMPLE, 5),
    complexBody(HATCH_PATTERN_SAMPLE, 6),
  ];
  for (const body of bodies) {
    assert.deepEqual(decodeAc1015EntityBody(body), decodeAc1015EntityBody(body));
  }
});

test("gemelo triste: cuerpos truncados dentro del dato declarado", () => {
  // Un cuerpo VÁLIDO cortado en varios puntos: siempre corrupción tipada.
  for (const entity of [LEADER_SAMPLE, HATCH_PATTERN_SAMPLE]) {
    const valid = complexBody(entity);
    for (const cut of [1, 3, 8, 20, 40]) {
      assertDwgError(
        () => decodeAc1015EntityBody(valid.slice(0, cut)),
        "DWG_STRUCTURE_CORRUPT",
      );
    }
  }
});

test("gemelo triste: el tamaño en bits que no cuadra falla cerrado", () => {
  for (const adjust of [-8, 8]) {
    const tail = new DwgBitEmitter();
    emitAc1015EntityCommonTail(tail, 7, false);
    emitTolerance(tail, TOLERANCE_SAMPLE);
    assertDwgError(
      () =>
        decodeAc1015EntityBody(hostileBody(AC1015_TYPE_TOLERANCE, tail, adjust)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("gemelo triste: un double no finito en un campo BD es corrupción", () => {
  // NaN crudo (todo unos) en la altura de caja del LEADER: se tuerce a mano
  // en forma RD completa porque el emisor de BD válidos no lo escribiría.
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, 7, false);
  tail.pushBit(0);
  tail.emitBS(0);
  tail.emitBS(0);
  tail.emitBL(0);
  for (let index = 0; index < 5; index += 1) {
    emit3BD(tail, { x: 0, y: 0, z: 0 });
  }
  tail.pushBits(0b00, 2); // BD de la altura en forma RD completa…
  for (let index = 0; index < 8; index += 1) {
    tail.emitRC(0xff); // …con los 64 bits a uno: NaN
  }
  assertDwgError(
    () => decodeAc1015EntityBody(hostileBody(AC1015_TYPE_LEADER, tail, 0, false)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un tipo de segmento de HATCH fuera de 1-4 es corrupción", () => {
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, 7, false);
  tail.emitBD(0); // elevación
  emit3BD(tail, { x: 0, y: 0, z: 1 });
  tail.emitTV(bytesOf("ANSI31"));
  tail.pushBit(0); // no sólido
  tail.pushBit(0); // no asociativo
  tail.emitBL(1); // un camino
  tail.emitBL(0); // banderas sin bit de polilínea: siguen segmentos
  tail.emitBL(1); // un segmento…
  tail.emitRC(5); // …de un tipo que el formato no define
  assertDwgError(
    () => decodeAc1015EntityBody(hostileBody(AC1015_TYPE_HATCH, tail, 0, false)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un recuento sobre el tope de laboratorio cae ANTES de reservar", () => {
  // Un HATCH que promete 70 000 caminos: el tope corta antes de iterar.
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, 7, false);
  tail.emitBD(0);
  emit3BD(tail, { x: 0, y: 0, z: 1 });
  tail.emitTV([]);
  tail.pushBit(1); // sólido
  tail.pushBit(0);
  tail.emitBL(70_000);
  assertDwgError(
    () => decodeAc1015EntityBody(hostileBody(AC1015_TYPE_HATCH, tail, 0, false)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Y una MLINE que promete 70 000 vértices… no puede: BS llega a 65 535,
  // justo bajo el tope — se tuerce el recuento de puntos BL de un LEADER.
  const leaderTail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(leaderTail, 7, false);
  leaderTail.pushBit(0);
  leaderTail.emitBS(0);
  leaderTail.emitBS(0);
  leaderTail.emitBL(1_000_000);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(hostileBody(AC1015_TYPE_LEADER, leaderTail, 0, false)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("el flujo de handles queda contabilizado opaco tras el dato exacto", () => {
  const decoded = roundDecode(VIEWPORT_SAMPLE, 0x2b);
  const stream = decoded.opaqueSpans.at(-1)!;
  assert.equal(stream.kind, "handle-stream");
  assert.equal(stream.startBit, decoded.common.bitSize);
  // El común mínimo del emisor first-party vuelve interpretado.
  assert.equal(decoded.common.entityMode, 2);
  assert.equal(decoded.references.owner, undefined);
  assert.deepEqual({ ...decoded.references.layer }, { kind: "null", handle: 0 });
});

console.log(
  "entities-complex.spec: campaña de entidades complejas verde — LEADER, TOLERANCE, MLINE, VIEWPORT y HATCH vuelven campo a campo desde cuerpos first-party; los gemelos tristes caen tipados.",
);
