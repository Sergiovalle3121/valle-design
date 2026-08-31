/**
 * Spec del writer de ARCHIVO COMPLETO de la OLA 3: `writeAc1015MinimalFile`.
 *
 * La meta: el archivo entero — seis registros de directorio, AuxHeader,
 * variables reales, clases, esquema canónico de handles, mapa, ObjFreeSpace,
 * second header y Template — debe abrirse con el lector PROPIO
 * (`readAc1015Database`) y devolver capas, bloques y entidades EXACTAS; las
 * variables de cabecera deben decodificar con `decodeAc1015HeaderVariables`
 * y llevar la HANDSEED del plan. El espejo propio es condición necesaria
 * antes de molestar al oráculo externo (el harness `oda-roundtrip.mjs`); los
 * gemelos tristes exigen fallo cerrado en toda opción imposible.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import { createDwgLimits } from "../../src/api/limits.js";
import { parseAc1015FileHeader } from "../../src/container/ac1015-file-header.js";
import { decodeAc1015HeaderVariables } from "../../src/container/ac1015-header-variables.js";
import {
  AC1015_HEADER_VARIABLES_SENTINELS,
  readAc1015SectionFrame,
} from "../../src/container/ac1015-section-frame.js";
import type {
  DwgArcEntity,
  DwgCircleEntity,
  DwgInsertEntity,
  DwgLineEntity,
  DwgLwPolylineEntity,
  DwgTextEntity,
} from "../../src/model/entity-geometry.js";
import { createInputSnapshot } from "../../src/security/input-snapshot.js";
import { ResourceBudget } from "../../src/security/resource-budget.js";
import { readAc1015Database } from "../../src/reader/ac1015-database-reader.js";
import {
  planAc1015MinimalFile,
  writeAc1015MinimalFile,
} from "../../src/writer/ac1015-minimal-file-writer.js";
import { assertDwgError } from "../support/assert.js";

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

const LINE: DwgLineEntity = {
  kind: "line",
  start: { x: 1.5, y: 2.5, z: 0 },
  end: { x: 40, y: 12.25, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};

const CIRCLE: DwgCircleEntity = {
  kind: "circle",
  center: { x: 10, y: 10, z: 0 },
  radius: 4.5,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};

const ARC: DwgArcEntity = {
  kind: "arc",
  center: { x: -3, y: 7, z: 0 },
  radius: 2.25,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  startAngle: 0.25,
  endAngle: 2.5,
};

const TEXT: DwgTextEntity = {
  kind: "text",
  insertion: { x: 5, y: 6 },
  elevation: undefined,
  alignment: undefined,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  obliqueAngle: undefined,
  rotation: undefined,
  height: 0.35,
  widthFactor: undefined,
  valueBytes: ascii("VALLE"),
  generation: undefined,
  horizontalAlignment: undefined,
  verticalAlignment: undefined,
};

const LWPOLYLINE: DwgLwPolylineEntity = {
  kind: "lwpolyline",
  closed: true,
  vertices: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 5 },
    { x: 0, y: 5 },
  ],
  bulges: undefined,
  widths: undefined,
  constantWidth: undefined,
  elevation: undefined,
  thickness: undefined,
  extrusion: undefined,
};

const INSERT: DwgInsertEntity = {
  kind: "insert",
  position: { x: 30, y: 4, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  attributesFollow: false,
};

test("el archivo vacío abre con el lector propio y lleva el esqueleto canónico", () => {
  const file = writeAc1015MinimalFile();
  const database = readAc1015Database(file);

  assert.equal(database.layers.length, 1);
  assert.deepEqual([...database.layers[0]!.name], [0x30]);
  assert.equal(database.layers[0]!.handle, 0x10);
  assert.equal(database.layers[0]!.colorIndex, 7);

  const blockNames = database.blocks.map((block) => String.fromCharCode(...block.name));
  assert.deepEqual(blockNames.sort(), ["*Model_Space", "*Paper_Space"]);
  assert.equal(database.modelSpaceEntities.length, 0);

  // La fase D5 del lector decodifica el esqueleto entero: nada queda sin
  // enumerar y las tablas de símbolos vuelven con sus entradas canónicas.
  assert.equal(database.unsupported.length, 0);
  const names = (records: readonly { readonly name: readonly number[] }[]) =>
    records.map((record) => String.fromCharCode(...record.name));
  assert.deepEqual(names(database.tables.styles), ["Standard"]);
  assert.deepEqual(names(database.tables.linetypes), ["ByBlock", "ByLayer", "Continuous"]);
  assert.deepEqual(names(database.tables.dimstyles), ["Standard"]);
  assert.deepEqual(names(database.tables.appids), ["ACAD"]);
  assert.deepEqual(names(database.tables.vports), ["*Active"]);
  assert.deepEqual(names(database.tables.mlinestyles), ["Standard"]);
  assert.deepEqual(
    database.classMap.map((record) => String.fromCharCode(...record.dxfClassName)),
    ["ACDBDICTIONARYWDFLT", "ACDBPLACEHOLDER", "LAYOUT"],
  );
  const layoutsDict = database.dictionaries.find((dict) => dict.handle === 0x1a);
  assert.ok(layoutsDict);
  assert.deepEqual(
    layoutsDict.entries.map((entry) => String.fromCharCode(...entry.name)),
    ["Layout1", "Model"],
  );
});

test("el archivo vacío es determinista byte a byte", () => {
  assert.deepEqual(writeAc1015MinimalFile(), writeAc1015MinimalFile());
});

test("la cabecera lleva seis registros y las variables decodifican con la HANDSEED del plan", () => {
  const file = writeAc1015MinimalFile();
  const plan = planAc1015MinimalFile();
  const limits = createDwgLimits();
  const budget = new ResourceBudget(limits);
  const cursor = new BoundedByteCursor(createInputSnapshot(file, limits, budget), budget);
  const header = parseAc1015FileHeader(cursor);
  assert.equal(header.records.length, 6);
  assert.deepEqual(
    [...header.records].map((record) => record.id).sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5],
  );
  const auxRecord = header.records.find((record) => record.id === 5)!;
  assert.equal(auxRecord.start, 0x61);
  assert.equal(auxRecord.size, 123);
  assert.equal(header.previewSeeker, 0xdc);

  const variablesRecord = header.records.find((record) => record.id === 0)!;
  const frame = readAc1015SectionFrame(
    cursor,
    variablesRecord,
    AC1015_HEADER_VARIABLES_SENTINELS,
  );
  const variables = decodeAc1015HeaderVariables(frame.payload);
  assert.equal(variables.handles.handseed.value, plan.handseed);
  assert.equal(variables.handles.clayer.value, 0x10);
  assert.equal(variables.handles.modelSpaceBlockRecord.value, 0x1d);
});

test("el second header y el template cierran el archivo como en el formato", () => {
  const file = writeAc1015MinimalFile();
  // Template: los ÚLTIMOS cuatro bytes, con MEASUREMENT 0 por defecto.
  assert.deepEqual([...file.subarray(file.length - 4)], [0, 0, 0, 0]);
  // El centinela de cierre del second header precede al Template.
  const endSentinel = [0x2b, 0x84, 0xde, 0x31, 0xd7, 0x6c, 0x60, 0x40, 0xac, 0xdb, 0xbf, 0xf6, 0xed, 0xc3, 0x55, 0xfe];
  assert.deepEqual([...file.subarray(file.length - 20, file.length - 4)], endSentinel);
  const metric = writeAc1015MinimalFile({ measurement: 1 });
  assert.deepEqual([...metric.subarray(metric.length - 4)], [0, 0, 1, 0]);
});

test("capa extra y línea: el lector propio recupera geometría y capa exactas", () => {
  const options = {
    layers: [{ name: ascii("MUROS"), colorIndex: 4 }],
    entities: [{ entity: LINE, layerIndex: 1 }],
  } as const;
  const file = writeAc1015MinimalFile(options);
  const plan = planAc1015MinimalFile(options);
  const database = readAc1015Database(file);

  const muros = database.layers.find(
    (layer) => String.fromCharCode(...layer.name) === "MUROS",
  );
  assert.ok(muros);
  assert.equal(muros.colorIndex, 4);
  assert.equal(muros.handle, plan.layerHandles[1]);

  assert.equal(database.modelSpaceEntities.length, 1);
  const record = database.modelSpaceEntities[0]!;
  assert.equal(record.handle, plan.modelEntityHandles[0]);
  assert.equal(record.layerHandle, plan.layerHandles[1]);
  assert.deepEqual(record.entity, LINE);
});

test("figuras, texto, polilínea y un INSERT con bloque: round-trip propio exacto", () => {
  const options = {
    blocks: [{ name: ascii("PUERTA"), entities: [{ entity: LINE }, { entity: CIRCLE }] }],
    entities: [
      { entity: CIRCLE },
      { entity: ARC },
      { entity: TEXT },
      { entity: LWPOLYLINE },
      { entity: INSERT, insertBlockIndex: 0 },
    ],
  } as const;
  const file = writeAc1015MinimalFile(options);
  const plan = planAc1015MinimalFile(options);
  const database = readAc1015Database(file);

  const puerta = database.blocks.find(
    (block) => String.fromCharCode(...block.name) === "PUERTA",
  );
  assert.ok(puerta);
  assert.equal(puerta.handle, plan.blockRecordHandles[0]);
  assert.deepEqual(
    puerta.entities.map((entity) => entity.entity),
    [LINE, CIRCLE],
  );

  assert.equal(database.modelSpaceEntities.length, 5);
  assert.deepEqual(
    database.modelSpaceEntities.map((record) => record.entity),
    [CIRCLE, ARC, TEXT, LWPOLYLINE, INSERT],
  );
  const insert = database.modelSpaceEntities[4]!;
  assert.deepEqual([...(insert.insertedBlockName ?? [])], ascii("PUERTA"));
});

test("contenido de bloque con capa propia y un bloque que inserta OTRO bloque", () => {
  // MARCO inserta PUERTA (una referencia hacia ADELANTE en `blocks`, índice
  // 1): el handle de cada BLOCK_RECORD ya está resuelto por adelantado en
  // `planAc1015MinimalFile`, así que esto no exige reordenar `blocks`.
  const options = {
    layers: [{ name: ascii("MUROS") }],
    blocks: [
      {
        name: ascii("MARCO"),
        entities: [
          { entity: LINE, layerIndex: 1 },
          { entity: INSERT, insertBlockIndex: 1 },
        ],
      },
      { name: ascii("PUERTA"), entities: [{ entity: CIRCLE }] },
    ],
    entities: [{ entity: INSERT, insertBlockIndex: 0 }],
  } as const;
  const file = writeAc1015MinimalFile(options);
  const plan = planAc1015MinimalFile(options);
  const database = readAc1015Database(file);

  const marco = database.blocks.find(
    (block) => String.fromCharCode(...block.name) === "MARCO",
  );
  assert.ok(marco);
  assert.equal(marco.entities.length, 2);
  const lineInBlock = marco.entities[0]!;
  assert.deepEqual(lineInBlock.entity, LINE);
  assert.equal(lineInBlock.layerHandle, plan.layerHandles[1]);

  const nestedInsert = marco.entities[1]!;
  assert.deepEqual(nestedInsert.entity, INSERT);
  assert.deepEqual([...(nestedInsert.insertedBlockName ?? [])], ascii("PUERTA"));

  const puerta = database.blocks.find(
    (block) => String.fromCharCode(...block.name) === "PUERTA",
  );
  assert.ok(puerta);
  assert.deepEqual(
    puerta.entities.map((entity) => entity.entity),
    [CIRCLE],
  );
});

test("opciones imposibles fallan cerradas con el error tipado", () => {
  assertDwgError(
    () => writeAc1015MinimalFile({ layers: [{ name: [] }] }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () => writeAc1015MinimalFile({ entities: [{ entity: INSERT }] }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015MinimalFile({
        entities: [{ entity: LINE, layerIndex: 3 }],
      }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      // Un INSERT dentro de un bloque SÍ se resuelve (ver el test de bloque
      // anidado más abajo), pero sigue exigiendo su propio insertBlockIndex
      // — la misma regla que un INSERT de model space.
      writeAc1015MinimalFile({
        blocks: [{ name: ascii("B"), entities: [{ entity: INSERT }] }],
      }),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      writeAc1015MinimalFile({
        entities: [{ entity: LINE, insertBlockIndex: 0 }],
      }),
    "DWG_INPUT_INVALID",
  );
});
