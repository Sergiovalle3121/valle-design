/**
 * Spec de la campaña de anotación: MTEXT, ATTRIB/ATTDEF, SEQEND y la familia
 * DIMENSION completa (siete variantes).
 *
 * El writer del laboratorio aún no emite estas entidades, así que los casos
 * felices componen los cuerpos A MANO con el emisor first-party — el MISMO
 * `DwgBitEmitter`, `emitAc1015EntityCommonTail` y `composeAc1015ObjectBody`
 * que usa el writer real, cero marcos gemelos — campo a campo en el orden
 * EXACTO que declara el decodificador, y exigen el modelo neutral EXACTO:
 * double a double, −0.0 con su bit de signo incluido. Los gemelos tristes
 * tuercen el mismo emisor (TV mentirosos, tamaños en bits que no cuadran,
 * doubles no finitos crudos, tipos no cubiertos) y exigen el error tipado
 * correcto: corrupt para estructura rota, unsupported para capacidad ausente.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DwgAttdefEntity,
  DwgAttribEntity,
  DwgDimensionEntity,
  DwgDimensionKind,
  DwgMTextEntity,
  DwgPoint2,
  DwgPoint3,
  DwgSeqendEntity,
  DwgTextFields,
} from "../../src/model/entity-geometry.js";
// El despachador se importa ANTES que su hermano de anotación: los dos
// módulos se importan mutuamente y cargar primero `entities-annotation.js`
// evalúa `entities-core.js` con las constantes de anotación aún sin
// inicializar (TDZ). El orden de carga de los specs vecinos ya lo respeta.
import {
  AC1015_TYPE_ATTDEF,
  AC1015_TYPE_ATTRIB,
  AC1015_TYPE_DIM_ALIGNED,
  AC1015_TYPE_DIM_ANGULAR_2LN,
  AC1015_TYPE_DIM_ANGULAR_3PT,
  AC1015_TYPE_DIM_DIAMETER,
  AC1015_TYPE_DIM_LINEAR,
  AC1015_TYPE_DIM_ORDINATE,
  AC1015_TYPE_DIM_RADIUS,
  AC1015_TYPE_MTEXT,
  AC1015_TYPE_SEQEND,
  decodeAc1015EntityBody,
  type Ac1015DecodedEntity,
} from "../../src/objects/entities-core.js";
import { dimensionKindOfType } from "../../src/objects/entities-annotation.js";
import {
  composeAc1015ObjectBody,
  DwgBitEmitter,
  emitAc1015EntityCommonTail,
} from "../../src/writer/ac1015-entity-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Las entidades de anotación que esta spec compone y decodifica. */
type AnnotationEntity =
  | DwgMTextEntity
  | DwgAttribEntity
  | DwgAttdefEntity
  | DwgSeqendEntity
  | DwgDimensionEntity;

/** El código de tipo BS de cada variante de cota (hechos registrados). */
const DIMENSION_TYPE_BY_KIND: Readonly<Record<DwgDimensionKind, number>> =
  Object.freeze({
    ordinate: AC1015_TYPE_DIM_ORDINATE,
    linear: AC1015_TYPE_DIM_LINEAR,
    aligned: AC1015_TYPE_DIM_ALIGNED,
    angular3pt: AC1015_TYPE_DIM_ANGULAR_3PT,
    angular2ln: AC1015_TYPE_DIM_ANGULAR_2LN,
    radius: AC1015_TYPE_DIM_RADIUS,
    diameter: AC1015_TYPE_DIM_DIAMETER,
  });

/** Los bytes ASCII de una cadena, como el modelo neutral los transporta. */
function bytesOf(value: string): readonly number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

/** Un 3BD del modelo, componente a componente (espejo de read3BDPoint). */
function emit3BD(tail: DwgBitEmitter, point: DwgPoint3): void {
  tail.emitBD(point.x);
  tail.emitBD(point.y);
  tail.emitBD(point.z);
}

/** Dos RD crudos de un punto 2D (espejo de read2RDPoint). */
function emit2RD(tail: DwgBitEmitter, point: DwgPoint2): void {
  tail.emitRD(point.x);
  tail.emitRD(point.y);
}

/** El flujo de handles mínimo del writer real: xdictionary y capa NULOS. */
function emitNullStream(stream: DwgBitEmitter): void {
  stream.emitH(0, 0); // xdictionary nulo
  stream.emitH(0, 0); // capa nula
}

/**
 * Cuerpo HOSTIL con el tamaño en bits torcido a voluntad, espejo del
 * `composeBody` de las specs vecinas: tipo BS + RL (bits reales más el ajuste
 * pedido) + tail y, si se pide, el flujo nulo de handles.
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

/**
 * Los campos compartidos de TEXT, con el RC de banderas DERIVADO de la
 * presencia (un bit a 1 declara el campo AUSENTE) — espejo campo a campo de
 * `decodeTextFields`, incluida la alineación como 2DD contra la inserción.
 */
function emitTextFields(tail: DwgBitEmitter, fields: DwgTextFields): void {
  let dataFlags = 0;
  if (fields.elevation === undefined) dataFlags |= 0x01;
  if (fields.alignment === undefined) dataFlags |= 0x02;
  if (fields.obliqueAngle === undefined) dataFlags |= 0x04;
  if (fields.rotation === undefined) dataFlags |= 0x08;
  if (fields.widthFactor === undefined) dataFlags |= 0x10;
  if (fields.generation === undefined) dataFlags |= 0x20;
  if (fields.horizontalAlignment === undefined) dataFlags |= 0x40;
  if (fields.verticalAlignment === undefined) dataFlags |= 0x80;
  tail.emitRC(dataFlags);

  if (fields.elevation !== undefined) tail.emitRD(fields.elevation);
  tail.emitRD(fields.insertion.x);
  tail.emitRD(fields.insertion.y);
  if (fields.alignment !== undefined) {
    tail.emitDD(fields.alignment.x, fields.insertion.x);
    tail.emitDD(fields.alignment.y, fields.insertion.y);
  }
  tail.emitBE(fields.extrusion);
  tail.emitBT(fields.thickness);
  if (fields.obliqueAngle !== undefined) tail.emitRD(fields.obliqueAngle);
  if (fields.rotation !== undefined) tail.emitRD(fields.rotation);
  tail.emitRD(fields.height);
  if (fields.widthFactor !== undefined) tail.emitRD(fields.widthFactor);
  tail.emitTV(fields.valueBytes);
  if (fields.generation !== undefined) tail.emitBS(fields.generation);
  if (fields.horizontalAlignment !== undefined) {
    tail.emitBS(fields.horizontalAlignment);
  }
  if (fields.verticalAlignment !== undefined) {
    tail.emitBS(fields.verticalAlignment);
  }
}

/** Los datos específicos de cada anotación, espejo exacto del decodificador. */
function emitAnnotationSpecific(
  tail: DwgBitEmitter,
  entity: AnnotationEntity,
): void {
  switch (entity.kind) {
    case "mtext": {
      emit3BD(tail, entity.insertion);
      emit3BD(tail, entity.extrusion);
      emit3BD(tail, entity.xAxisDirection);
      tail.emitBD(entity.rectWidth);
      tail.emitBD(entity.height);
      tail.emitBS(entity.attachment);
      tail.emitBS(entity.drawingDirection);
      tail.emitBD(entity.extentsHeight);
      tail.emitBD(entity.extentsWidth);
      tail.emitTV(entity.valueBytes);
      tail.emitBS(entity.lineSpacingStyle);
      tail.emitBD(entity.lineSpacingFactor);
      tail.pushBit(entity.trailingBit === 1 ? 1 : 0);
      return;
    }
    case "attrib":
    case "attdef": {
      emitTextFields(tail, entity);
      tail.emitTV(entity.tagBytes);
      tail.emitBS(entity.fieldLength);
      tail.emitRC(entity.attributeFlags);
      if (entity.kind === "attdef") tail.emitTV(entity.promptBytes);
      return;
    }
    case "seqend":
      return; // sin campos propios (hecho registrado)
    case "dimension": {
      emitDimension(tail, entity);
      return;
    }
  }
}

/** La cota entera: datos comunes más la cola de su variante, en su orden. */
function emitDimension(tail: DwgBitEmitter, entity: DwgDimensionEntity): void {
  emit3BD(tail, entity.extrusion);
  emit2RD(tail, entity.textMidpoint);
  tail.emitBD(entity.elevation);
  tail.emitRC(entity.flags);
  tail.emitTV(entity.userTextBytes);
  tail.emitBD(entity.textRotation);
  tail.emitBD(entity.horizontalDirection);
  emit3BD(tail, entity.insertScale);
  tail.emitBD(entity.insertRotation);
  tail.emitBS(entity.attachment);
  tail.emitBS(entity.lineSpacingStyle);
  tail.emitBD(entity.lineSpacingFactor);
  tail.emitBD(entity.actualMeasurement);
  emit2RD(tail, entity.clonePoint);
  switch (entity.dimensionKind) {
    case "ordinate":
      emit3BD(tail, entity.definitionPoint);
      emit3BD(tail, entity.point13!);
      emit3BD(tail, entity.point14!);
      tail.emitRC(entity.ordinateFlags!);
      return;
    case "linear":
      emit3BD(tail, entity.point13!);
      emit3BD(tail, entity.point14!);
      emit3BD(tail, entity.definitionPoint);
      tail.emitBD(entity.extensionLineRotation!);
      tail.emitBD(entity.dimensionRotation!);
      return;
    case "aligned":
      emit3BD(tail, entity.point13!);
      emit3BD(tail, entity.point14!);
      emit3BD(tail, entity.definitionPoint);
      tail.emitBD(entity.extensionLineRotation!);
      return;
    case "angular3pt":
      emit3BD(tail, entity.definitionPoint);
      emit3BD(tail, entity.point13!);
      emit3BD(tail, entity.point14!);
      emit3BD(tail, entity.point15!);
      return;
    case "angular2ln":
      emit2RD(tail, entity.point16!);
      emit3BD(tail, entity.point13!);
      emit3BD(tail, entity.point14!);
      emit3BD(tail, entity.point15!);
      emit3BD(tail, entity.definitionPoint);
      return;
    case "radius":
      emit3BD(tail, entity.definitionPoint);
      emit3BD(tail, entity.point15!);
      tail.emitBD(entity.leaderLength!);
      return;
    case "diameter":
      emit3BD(tail, entity.point15!);
      emit3BD(tail, entity.definitionPoint);
      tail.emitBD(entity.leaderLength!);
      return;
  }
}

/** El código de tipo BS del modelo de anotación (hechos registrados). */
function annotationTypeOf(entity: AnnotationEntity): number {
  switch (entity.kind) {
    case "mtext":
      return AC1015_TYPE_MTEXT;
    case "attrib":
      return AC1015_TYPE_ATTRIB;
    case "attdef":
      return AC1015_TYPE_ATTDEF;
    case "seqend":
      return AC1015_TYPE_SEQEND;
    case "dimension":
      return DIMENSION_TYPE_BY_KIND[entity.dimensionKind];
  }
}

/**
 * Cuerpo VÁLIDO first-party de una anotación: el común mínimo coherente del
 * writer real, los datos del tipo emitidos a mano y la composición y el flujo
 * nulo de la casa — la única fuente del binario feliz de esta spec.
 */
function annotationBody(entity: AnnotationEntity, handle = 7): Uint8Array {
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, handle, false);
  emitAnnotationSpecific(tail, entity);
  return composeAc1015ObjectBody(annotationTypeOf(entity), tail, emitNullStream);
}

/** Compone, decodifica y exige el modelo EXACTO; devuelve el decodificado. */
function roundDecode(entity: AnnotationEntity, handle = 7): Ac1015DecodedEntity {
  const decoded = decodeAc1015EntityBody(annotationBody(entity, handle));
  assert.deepEqual(decoded.entity, entity);
  assert.equal(decoded.common.type, annotationTypeOf(entity));
  assert.equal(decoded.common.ownHandle.value, handle);
  return decoded;
}

/** Campos de TEXT con TODOS los opcionales presentes (banderas a cero). */
const FULL_TEXT_FIELDS: DwgTextFields = {
  insertion: { x: -12.5, y: 3.25 },
  elevation: -0.75,
  // La Y de la alineación coincide con la inserción: viaja por el atajo DD.
  alignment: { x: 4.5, y: 3.25 },
  thickness: 2.25,
  extrusion: { x: 0.6, y: 0, z: 0.8 },
  obliqueAngle: -0.35,
  rotation: 1.25,
  height: 3.5,
  widthFactor: 0.85,
  valueBytes: bytesOf("VALLE-A1"),
  generation: 4,
  horizontalAlignment: 1,
  verticalAlignment: 3,
};

/** Campos de TEXT con TODOS los opcionales ausentes (banderas 0xFF). */
const BARE_TEXT_FIELDS: DwgTextFields = {
  insertion: { x: 0.25, y: -0 },
  elevation: undefined,
  alignment: undefined,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  obliqueAngle: undefined,
  rotation: undefined,
  height: 1.25,
  widthFactor: undefined,
  valueBytes: [],
  generation: undefined,
  horizontalAlignment: undefined,
  verticalAlignment: undefined,
};

/** Un MTEXT de referencia sin ningún campo trivial. */
const MTEXT_SAMPLE: DwgMTextEntity = {
  kind: "mtext",
  insertion: { x: -100.25, y: 50.5, z: -0 },
  extrusion: { x: 0, y: -1, z: 0 },
  xAxisDirection: { x: 0.8, y: -0.6, z: 0 },
  rectWidth: 250.5,
  height: 12.75,
  attachment: 5,
  drawingDirection: 1,
  extentsHeight: 38.25,
  extentsWidth: 245.125,
  valueBytes: bytesOf("{\\fArial;VALLE anotacion}"),
  lineSpacingStyle: 2,
  lineSpacingFactor: 1.5,
  trailingBit: 1,
};

/** La cola de una variante de cota; lo no listado queda `undefined`. */
type DimensionTail = Pick<DwgDimensionEntity, "definitionPoint"> &
  Partial<
    Pick<
      DwgDimensionEntity,
      | "point13"
      | "point14"
      | "point15"
      | "point16"
      | "extensionLineRotation"
      | "dimensionRotation"
      | "leaderLength"
      | "ordinateFlags"
    >
  >;

/**
 * Una cota completa: los datos comunes de referencia (con −0.0 en la rotación
 * del texto y en la X del punto de clonado, a propósito) más la cola de la
 * variante; todas las claves quedan asignadas, como exige el modelo.
 */
function dimensionOf(
  dimensionKind: DwgDimensionKind,
  tail: DimensionTail,
): DwgDimensionEntity {
  return {
    kind: "dimension",
    dimensionKind,
    extrusion: { x: 0, y: 0, z: 1 },
    textMidpoint: { x: -40.5, y: 12.25 },
    elevation: -2.5,
    flags: 0x0a,
    userTextBytes: bytesOf("<> mm"),
    textRotation: -0,
    horizontalDirection: 0.5,
    insertScale: { x: 1, y: 1, z: 1 },
    insertRotation: -1.25,
    attachment: 1,
    lineSpacingStyle: 2,
    lineSpacingFactor: 1,
    actualMeasurement: 118.5,
    clonePoint: { x: -0, y: -7.75 },
    point13: undefined,
    point14: undefined,
    point15: undefined,
    point16: undefined,
    extensionLineRotation: undefined,
    dimensionRotation: undefined,
    leaderLength: undefined,
    ordinateFlags: undefined,
    ...tail,
  };
}

test("los códigos de tipo BS registrados de las entidades de anotación", () => {
  assert.equal(AC1015_TYPE_ATTRIB, 2);
  assert.equal(AC1015_TYPE_ATTDEF, 3);
  assert.equal(AC1015_TYPE_SEQEND, 6);
  assert.equal(AC1015_TYPE_MTEXT, 44);
  assert.equal(AC1015_TYPE_DIM_ORDINATE, 20);
  assert.equal(AC1015_TYPE_DIM_LINEAR, 21);
  assert.equal(AC1015_TYPE_DIM_ALIGNED, 22);
  assert.equal(AC1015_TYPE_DIM_ANGULAR_3PT, 23);
  assert.equal(AC1015_TYPE_DIM_ANGULAR_2LN, 24);
  assert.equal(AC1015_TYPE_DIM_RADIUS, 25);
  assert.equal(AC1015_TYPE_DIM_DIAMETER, 26);
  // La variante por tipo cubre las siete cotas y nada más.
  for (const [kind, type] of Object.entries(DIMENSION_TYPE_BY_KIND)) {
    assert.equal(dimensionKindOfType(type), kind);
  }
  assert.equal(dimensionKindOfType(AC1015_TYPE_MTEXT), null);
  assert.equal(dimensionKindOfType(0x22), null);
});

test("MTEXT completo: cada campo vuelve EXACTO, con −0.0 y extrusión no canónica", () => {
  const decoded = roundDecode(MTEXT_SAMPLE, 0x2a);
  const entity = decoded.entity as DwgMTextEntity;
  // El −0.0 de la Z de inserción conserva su bit de signo (BD en forma RD).
  assert.ok(Object.is(entity.insertion.z, -0));
  // Los códigos BS crudos y el bit final sin semántica viajan tal cual.
  assert.equal(entity.attachment, 5);
  assert.equal(entity.drawingDirection, 1);
  assert.equal(entity.lineSpacingStyle, 2);
  assert.equal(entity.trailingBit, 1);
});

test("ATTRIB y ATTDEF con todos los campos de TEXT presentes", () => {
  const attrib: DwgAttribEntity = {
    kind: "attrib",
    ...FULL_TEXT_FIELDS,
    tagBytes: bytesOf("PARTNO"),
    fieldLength: 12,
    attributeFlags: 0x07,
  };
  roundDecode(attrib, 0x21);

  // El ATTDEF es el MISMO cuerpo más el prompt TV al final.
  const attdef: DwgAttdefEntity = {
    ...attrib,
    kind: "attdef",
    promptBytes: bytesOf("Enter part number"),
  };
  const decoded = roundDecode(attdef, 0x22);
  const entity = decoded.entity as DwgAttdefEntity;
  assert.deepEqual(entity.promptBytes, bytesOf("Enter part number"));
  assert.deepEqual(entity.alignment, { x: 4.5, y: 3.25 });
});

test("ATTRIB y ATTDEF con todos los opcionales ausentes viajan como undefined", () => {
  const attrib: DwgAttribEntity = {
    kind: "attrib",
    ...BARE_TEXT_FIELDS,
    tagBytes: bytesOf("TAG"),
    fieldLength: 0,
    attributeFlags: 0,
  };
  const decodedAttrib = roundDecode(attrib, 0x31);
  const bare = decodedAttrib.entity as DwgAttribEntity;
  // Ausente es `undefined`, no un defecto inventado; el TV vacío vuelve vacío
  // y el −0.0 de la inserción conserva su bit de signo.
  assert.equal(bare.elevation, undefined);
  assert.equal(bare.generation, undefined);
  assert.deepEqual(bare.valueBytes, []);
  assert.ok(Object.is(bare.insertion.y, -0));

  const attdef: DwgAttdefEntity = {
    ...attrib,
    kind: "attdef",
    promptBytes: [],
  };
  roundDecode(attdef, 0x32);
});

test("SEQEND: sin campos propios tras el común", () => {
  const decoded = roundDecode({ kind: "seqend" } satisfies DwgSeqendEntity, 0x51);
  // Todo lo que sigue al común es el flujo de handles, contabilizado opaco:
  // dos handles nulos son 16 bits más el relleno del último byte.
  assert.equal(decoded.opaqueSpans.length, 1);
  const stream = decoded.opaqueSpans[0]!;
  assert.equal(stream.kind, "handle-stream");
  assert.equal(stream.startBit, decoded.common.bitSize);
  assert.ok(stream.bitLength >= 16 && stream.bitLength < 24);
});

test("la familia DIMENSION: las siete variantes decodifican su cola exacta", () => {
  const variants: readonly DwgDimensionEntity[] = [
    dimensionOf("ordinate", {
      definitionPoint: { x: -25.5, y: 40.25, z: 0 },
      point13: { x: -10.5, y: -0, z: 3.25 },
      point14: { x: 0.125, y: -64, z: 0 },
      ordinateFlags: 0x02, // el RC final propio de la ordinate
    }),
    dimensionOf("linear", {
      point13: { x: -30, y: -0.5, z: 0 },
      point14: { x: 12.25, y: -0.5, z: 0 },
      definitionPoint: { x: -8.875, y: 6.5, z: -1.5 },
      extensionLineRotation: -0, // −0.0 bit a bit por la forma RD del BD
      dimensionRotation: 1.5707963267948966,
    }),
    dimensionOf("aligned", {
      point13: { x: -1.5, y: 2.5, z: 0 },
      point14: { x: 3.75, y: -4.25, z: 0 },
      definitionPoint: { x: 1.125, y: -0.625, z: 0 },
      extensionLineRotation: -0.75,
    }),
    dimensionOf("angular3pt", {
      definitionPoint: { x: 0, y: -0, z: 0 },
      point13: { x: -5, y: 0, z: 0 },
      point14: { x: 5, y: 0, z: 0 },
      point15: { x: 0, y: 7.5, z: -2.25 },
    }),
    dimensionOf("angular2ln", {
      point16: { x: -3.5, y: -0 }, // el 2RD que sólo lleva esta variante
      point13: { x: -6.25, y: 1, z: 0 },
      point14: { x: -2, y: 8.5, z: 0 },
      point15: { x: 4.75, y: -9.125, z: 0 },
      definitionPoint: { x: 10.5, y: 11.25, z: -0.5 },
    }),
    dimensionOf("radius", {
      definitionPoint: { x: -14.5, y: 3.25, z: 0 },
      point15: { x: -20.25, y: 9.75, z: 0 },
      leaderLength: 5.5,
    }),
    dimensionOf("diameter", {
      point15: { x: 33.25, y: -16.5, z: 2 },
      definitionPoint: { x: -33.25, y: 16.5, z: -2 },
      leaderLength: 7.125,
    }),
  ];

  for (const [index, expected] of variants.entries()) {
    const decoded = roundDecode(expected, 0x60 + index);
    const entity = decoded.entity as DwgDimensionEntity;
    // El tipo BS y la variante están atados por el mismo mapa registrado.
    assert.equal(dimensionKindOfType(decoded.common.type), expected.dimensionKind);
    // Los −0.0 de los datos comunes conservan su bit de signo en TODAS.
    assert.ok(Object.is(entity.textRotation, -0));
    assert.ok(Object.is(entity.clonePoint.x, -0));
  }
});

test("el flujo de handles: xdictionary y capa nulos decodifican coherentes", () => {
  const decoded = roundDecode(MTEXT_SAMPLE, 0x2b);
  // El común mínimo del emisor first-party vuelve interpretado…
  assert.equal(decoded.common.entityMode, 2);
  assert.equal(decoded.common.reactorCount, 0);
  assert.equal(decoded.common.noLinks, true);
  assert.equal(decoded.common.color.index, 256);
  // …y la cabeza del flujo resuelve EXACTAMENTE lo que viajó: dos nulos y
  // nada más — ni propietario (modo 2), ni vínculos, ni ltype/plotstyle, ni
  // el hard pointer de bloque que sólo un INSERT lleva.
  assert.deepEqual(
    { ...decoded.references.xdictionary },
    { kind: "null", handle: 0 },
  );
  assert.deepEqual({ ...decoded.references.layer }, { kind: "null", handle: 0 });
  assert.equal(decoded.references.owner, undefined);
  assert.equal(decoded.references.previousEntity, undefined);
  assert.equal(decoded.references.nextEntity, undefined);
  assert.equal(decoded.references.linetype, undefined);
  assert.equal(decoded.references.plotstyle, undefined);
  assert.equal(decoded.references.blockRecord, undefined);
  // El flujo sigue contabilizado opaco desde el bit declarado.
  const stream = decoded.opaqueSpans.at(-1)!;
  assert.equal(stream.kind, "handle-stream");
  assert.equal(stream.startBit, decoded.common.bitSize);
});

test("determinista: decodificar dos veces da estructuras profundas iguales", () => {
  const bodies = [
    annotationBody(MTEXT_SAMPLE, 3),
    annotationBody(
      {
        kind: "attdef",
        ...FULL_TEXT_FIELDS,
        tagBytes: bytesOf("PARTNO"),
        fieldLength: 12,
        attributeFlags: 0x07,
        promptBytes: bytesOf("Enter part number"),
      },
      4,
    ),
    annotationBody(
      dimensionOf("angular2ln", {
        point16: { x: -3.5, y: -0 },
        point13: { x: -6.25, y: 1, z: 0 },
        point14: { x: -2, y: 8.5, z: 0 },
        point15: { x: 4.75, y: -9.125, z: 0 },
        definitionPoint: { x: 10.5, y: 11.25, z: -0.5 },
      }),
      5,
    ),
  ];
  for (const body of bodies) {
    // La estructura ENTERA: común, geometría, tramos opacos y referencias.
    assert.deepEqual(decodeAc1015EntityBody(body), decodeAc1015EntityBody(body));
  }
});

test("gemelo triste: cuerpo truncado dentro del dato declarado", () => {
  // Un TV de cota que promete 5 bytes… y el cuerpo se acaba tras entregar 2.
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, 7, false);
  emit3BD(tail, { x: 0, y: 0, z: 1 });
  emit2RD(tail, { x: 1, y: 2 });
  tail.emitBD(0); // elevación
  tail.emitRC(0); // banderas
  tail.emitBS(5); // el texto de usuario declara 5 bytes
  tail.emitRC(0x41);
  tail.emitRC(0x42); // …y sólo entrega estos dos
  assertDwgError(
    () =>
      decodeAc1015EntityBody(hostileBody(AC1015_TYPE_DIM_LINEAR, tail, 0, false)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Y un cuerpo VÁLIDO cortado en varios puntos: siempre corrupción tipada.
  const valid = annotationBody(MTEXT_SAMPLE);
  for (const cut of [1, 3, 8, 20]) {
    assertDwgError(
      () => decodeAc1015EntityBody(valid.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("gemelo triste: el tamaño en bits que no cuadra falla cerrado", () => {
  // Un SEQEND no consume nada tras el común: el descuadre sólo puede venir
  // del tamaño declarado, 8 bits de menos o de más.
  for (const adjust of [-8, 8]) {
    const tail = new DwgBitEmitter();
    emitAc1015EntityCommonTail(tail, 7, false);
    assertDwgError(
      () => decodeAc1015EntityBody(hostileBody(AC1015_TYPE_SEQEND, tail, adjust)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }

  // Y un tamaño que ni siquiera cabe en el cuerpo entero.
  const overflow = new DwgBitEmitter();
  emitAc1015EntityCommonTail(overflow, 7, false);
  assertDwgError(
    () =>
      decodeAc1015EntityBody(hostileBody(AC1015_TYPE_SEQEND, overflow, 64, false)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un double no finito en un campo BD es corrupción", () => {
  // NaN crudo (todo unos) en el ancho de rectángulo del MTEXT: el emisor de
  // BD válidos no lo escribiría, así que se tuerce en forma RD a mano.
  const nanTail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(nanTail, 7, false);
  emit3BD(nanTail, { x: 1, y: 2, z: 0 });
  emit3BD(nanTail, { x: 0, y: 0, z: 1 });
  emit3BD(nanTail, { x: 1, y: 0, z: 0 });
  nanTail.pushBits(0b00, 2); // BD del ancho en forma RD completa…
  for (let index = 0; index < 8; index += 1) {
    nanTail.emitRC(0xff); // …con los 64 bits a uno: NaN
  }
  assertDwgError(
    () => decodeAc1015EntityBody(hostileBody(AC1015_TYPE_MTEXT, nanTail, 0, false)),
    "DWG_STRUCTURE_CORRUPT",
  );

  // +Infinity crudo (exponente lleno, mantisa cero) en la elevación de una cota.
  const infTail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(infTail, 7, false);
  emit3BD(infTail, { x: 0, y: 0, z: 1 });
  emit2RD(infTail, { x: 1, y: 2 });
  infTail.pushBits(0b00, 2);
  for (const byte of [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x7f]) {
    infTail.emitRC(byte); // IEEE-754 little-endian de +Infinity
  }
  assertDwgError(
    () =>
      decodeAc1015EntityBody(hostileBody(AC1015_TYPE_DIM_RADIUS, infTail, 0, false)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("gemelo triste: un tipo no cubierto (0x22 VIEWPORT) es capacidad ausente", () => {
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, 7, false);
  const error = assertDwgError(
    () => decodeAc1015EntityBody(hostileBody(0x22, tail)),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assert.equal(error.detail.category, "unsupported");
});

console.log(
  "entities-annotation.spec: campaña de anotación verde — MTEXT, ATTRIB/ATTDEF, SEQEND y las siete cotas vuelven campo a campo desde cuerpos first-party; los gemelos tristes caen tipados.",
);
