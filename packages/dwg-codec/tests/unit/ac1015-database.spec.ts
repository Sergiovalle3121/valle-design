/**
 * Spec del ensamblado de la fase D4: `readAc1015Database`.
 *
 * La meta de la fase: un contenedor del writer con capas, un bloque CON
 * contenido y un model space con INSERT vuelve como base de datos neutral con
 * la estructura EXACTA — nombres, pertenencias, geometría y la referencia del
 * INSERT resuelta al bloque correcto por nombre. Los gemelos tristes exigen
 * que nada falle en silencio: INSERT a bloque inexistente, propietarios
 * desconocidos y tipos no soportados producen diagnósticos o enumeración, y
 * los límites bajos caen con el error tipado de recursos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DwgArcEntity,
  DwgCircleEntity,
  DwgInsertEntity,
  DwgLineEntity,
  DwgPointEntity,
} from "../../src/model/entity-geometry.js";
import { readAc1015Database } from "../../src/reader/ac1015-database-reader.js";
import { writeAc1015Container } from "../../src/writer/ac1015-container-writer.js";
import { ascii, assertDwgError } from "../support/assert.js";

const PUERTA = [0x50, 0x55, 0x45, 0x52, 0x54, 0x41] as const; // "PUERTA"
const MUROS = [0x4d, 0x55, 0x52, 0x4f, 0x53] as const; // "MUROS"

const LINE: DwgLineEntity = {
  kind: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 0.9, y: 0, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};

const CIRCLE: DwgCircleEntity = {
  kind: "circle",
  center: { x: 0.45, y: 0.45, z: 0 },
  radius: 0.05,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};

const POINT: DwgPointEntity = {
  kind: "point",
  position: { x: -3, y: 8.5, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  xAxisAngle: 0,
};

const ARC: DwgArcEntity = {
  kind: "arc",
  center: { x: 10, y: -2, z: 0 },
  radius: 4.25,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  startAngle: 0.5,
  endAngle: 2.5,
};

const INSERT: DwgInsertEntity = {
  kind: "insert",
  position: { x: 20.5, y: 7.75, z: 0 },
  scale: { x: 2, y: 2, z: 1 },
  rotation: 1.25,
  extrusion: { x: 0, y: 0, z: 1 },
  attributesFollow: false,
};

/** El contenedor de la meta D4: capas + bloque con contenido + model space. */
function buildPhaseGoalFile(): Uint8Array {
  return writeAc1015Container({
    objects: [
      { layerControl: { entryHandles: [2, 3] }, handle: 1 },
      { layer: { name: [0x30], colorIndex: 7 }, handle: 2 },
      { layer: { name: [...MUROS], colorIndex: 4 }, handle: 3 },
      { blockControl: { entryHandles: [5] }, handle: 4 },
      {
        blockRecord: {
          name: [...PUERTA],
          basePoint: { x: 0.45, y: 0, z: 0 },
          ownerControlHandle: 4,
          blockEntityHandle: 6,
          firstEntityHandle: 7,
          lastEntityHandle: 8,
          endblkHandle: 9,
        },
        handle: 5,
      },
      { blockBegin: { name: [...PUERTA], ownerBlockHandle: 5 }, handle: 6 },
      { entity: LINE, handle: 7, ownerBlockHandle: 5 },
      { entity: CIRCLE, handle: 8, ownerBlockHandle: 5 },
      { blockEnd: { ownerBlockHandle: 5 }, handle: 9 },
      { entity: POINT, handle: 10 },
      { entity: ARC, handle: 11 },
      { entity: INSERT, handle: 12, insertBlockHandle: 5 },
    ],
  });
}

test("meta D4: la base neutral recupera la estructura EXACTA del contenedor", () => {
  const database = readAc1015Database(buildPhaseGoalFile());

  assert.deepEqual(database.layers, [
    { handle: 2, name: [0x30], colorIndex: 7, stateFlags: 0 },
    { handle: 3, name: MUROS, colorIndex: 4, stateFlags: 0 },
  ]);

  assert.deepEqual(database.blocks, [
    {
      handle: 5,
      name: PUERTA,
      blockBeginHandle: 6,
      blockEndHandle: 9,
      entities: [
        {
          handle: 7,
          entity: LINE,
          layerHandle: undefined,
          insertedBlockName: undefined,
          attributes: undefined,
          vertices: undefined,
          sequenceEndHandle: undefined,
        },
        {
          handle: 8,
          entity: CIRCLE,
          layerHandle: undefined,
          insertedBlockName: undefined,
          attributes: undefined,
          vertices: undefined,
          sequenceEndHandle: undefined,
        },
      ],
    },
  ]);

  assert.deepEqual(database.modelSpaceEntities, [
    {
      handle: 10,
      entity: POINT,
      layerHandle: undefined,
      insertedBlockName: undefined,
      attributes: undefined,
      vertices: undefined,
      sequenceEndHandle: undefined,
    },
    {
      handle: 11,
      entity: ARC,
      layerHandle: undefined,
      insertedBlockName: undefined,
      attributes: undefined,
      vertices: undefined,
      sequenceEndHandle: undefined,
    },
    {
      handle: 12,
      entity: INSERT,
      layerHandle: undefined,
      insertedBlockName: PUERTA,
      attributes: undefined,
      vertices: undefined,
      sequenceEndHandle: undefined,
    },
  ]);

  // La referencia que da sentido al INSERT, resuelta al bloque por NOMBRE.
  assert.deepEqual(database.modelSpaceEntities[2]!.insertedBlockName, PUERTA);
  assert.deepEqual(database.unsupported, []);
  assert.deepEqual(database.diagnostics, []);
});

test("determinista: mismo contenedor, misma base — bytes y estructura", () => {
  const first = buildPhaseGoalFile();
  const second = buildPhaseGoalFile();
  assert.deepEqual(first, second);
  assert.deepEqual(readAc1015Database(first), readAc1015Database(second));
});

test("el contenedor vacío de la fase C vuelve como base vacía", () => {
  const database = readAc1015Database(writeAc1015Container());
  assert.deepEqual(database.layers, []);
  assert.deepEqual(database.blocks, []);
  assert.deepEqual(database.modelSpaceEntities, []);
  assert.deepEqual(database.unsupported, []);
  assert.deepEqual(database.diagnostics, []);
});

test("gemelo triste: un INSERT a bloque inexistente no cae en silencio", () => {
  const file = writeAc1015Container({
    objects: [
      { blockRecord: { name: [...PUERTA] }, handle: 5 },
      // El writer emite la referencia que se le pide; el 99 no existe.
      { entity: INSERT, handle: 12, insertBlockHandle: 99 },
    ],
  });
  const database = readAc1015Database(file);

  assert.equal(database.modelSpaceEntities.length, 1);
  assert.equal(database.modelSpaceEntities[0]!.insertedBlockName, undefined);
  assert.equal(database.diagnostics.length, 1);
  const diagnostic = database.diagnostics[0]!;
  assert.equal(diagnostic.code, "database-insert-block-unresolved");
  assert.equal(diagnostic.severity, "error");
  assert.ok(diagnostic.offset > 0);
});

test("gemelo triste: propietario desconocido → model space con diagnóstico", () => {
  const file = writeAc1015Container({
    objects: [
      { blockRecord: { name: [...PUERTA] }, handle: 5 },
      // El 77 no resuelve a ningún BLOCK_RECORD del mapa.
      { entity: LINE, handle: 7, ownerBlockHandle: 77 },
    ],
  });
  const database = readAc1015Database(file);

  assert.equal(database.blocks[0]!.entities.length, 0);
  assert.deepEqual(database.modelSpaceEntities[0]!.entity, LINE);
  assert.equal(database.diagnostics.length, 1);
  assert.equal(
    database.diagnostics[0]!.code,
    "database-entity-owner-unresolved",
  );
});

test("gemelo triste: BLOCK con propietario ajeno y nombre que no coincide", () => {
  const VENTANA = [0x56, 0x45, 0x4e, 0x54, 0x41, 0x4e, 0x41];
  const file = writeAc1015Container({
    objects: [
      { layer: { name: [0x30] }, handle: 2 },
      { blockRecord: { name: [...VENTANA] }, handle: 5 },
      // Propietario que existe pero NO es un BLOCK_RECORD (la capa 2).
      { blockBegin: { name: [...PUERTA], ownerBlockHandle: 2 }, handle: 6 },
      // Propietario correcto pero nombre distinto del registro.
      { blockBegin: { name: [...PUERTA], ownerBlockHandle: 5 }, handle: 7 },
    ],
  });
  const database = readAc1015Database(file);

  const codes = database.diagnostics.map((entry) => entry.code);
  assert.deepEqual(codes, [
    "database-block-marker-unresolved",
    "database-block-name-mismatch",
  ]);
  // El marcador con nombre torcido sí queda atado; el ajeno no.
  assert.equal(database.blocks[0]!.blockBeginHandle, 7);
});

test("los tipos no decodificados se ENUMERAN con su handle y tipo", () => {
  const file = writeAc1015Container({
    objects: [
      { layer: { name: [0x30] }, handle: 2 },
      { type: 0x1c, handle: 3 }, // sintético D1: tipo que no decodificamos
      { entity: POINT, handle: 4 },
      { type: 0x64, handle: 5 },
    ],
  });
  const database = readAc1015Database(file);

  assert.deepEqual(database.unsupported, [
    { handle: 3, type: 0x1c },
    { handle: 5, type: 0x64 },
  ]);
  // Lo soportado alrededor sigue decodificado: nada se pierde por vecindad.
  assert.equal(database.layers.length, 1);
  assert.deepEqual(database.modelSpaceEntities[0]!.entity, POINT);
  assert.deepEqual(database.diagnostics, []);
});

test("gemelo triste: límites bajos caen con el error tipado de recursos", () => {
  const file = buildPhaseGoalFile();
  // Doce objetos contra un tope de dos: el mapa falla cerrado y tipado.
  assertDwgError(
    () => readAc1015Database(file, { maxObjects: 2 }),
    "DWG_FILE_LIMIT_EXCEEDED",
  );
  // Un presupuesto de trabajo ridículo ni siquiera termina el snapshot.
  assertDwgError(
    () => readAc1015Database(file, { maxWorkUnits: 64 }),
    "DWG_WORK_LIMIT_EXCEEDED",
  );
  // Y un tope de archivo menor que el archivo: rechazo antes de tocar bytes.
  assertDwgError(
    () => readAc1015Database(file, { maxFileBytes: 16 }),
    "DWG_FILE_LIMIT_EXCEEDED",
  );
});

test("las puertas de versión: otra firma reconocida es capacidad ausente", () => {
  const other = new Uint8Array(64);
  other.set(ascii("AC1018"), 0);
  const unsupported = assertDwgError(
    () => readAc1015Database(other),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  assert.equal(unsupported.detail.category, "unsupported");

  assertDwgError(
    () => readAc1015Database(ascii("XXXXXX")),
    "DWG_SIGNATURE_INVALID",
  );
});

test("gemelo triste: un contenedor con bytes torcidos aborta tipado", () => {
  const file = buildPhaseGoalFile();
  // Torcer un byte dentro de la región de objetos rompe un CRC de envoltura
  // o un cuerpo: el ensamblado debe abortar con error tipado, nunca devolver
  // una base "probablemente buena".
  const twisted = file.slice();
  const objectRegion = Math.floor(file.length / 2);
  twisted[objectRegion] = twisted[objectRegion]! ^ 0xff;
  let caught: unknown;
  try {
    readAc1015Database(twisted);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error && caught.name === "DwgParseError");
});

console.log(
  "ac1015-database.spec: fase D4 verde — el laboratorio lee una BASE de dibujo completa: capas, un bloque con contenido y un model space cuyo INSERT resuelve su bloque por nombre; lo no soportado se enumera y los límites caen tipados.",
);
