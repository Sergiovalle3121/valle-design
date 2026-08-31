/**
 * Spec del round-trip PROPIO de `writeCanonicalDwg` — ADR-0009 §8 (M5).
 *
 * `writeAc1015MinimalFile` documenta que el round-trip contra el lector
 * propio es "la mitad de la evidencia" y que la otra mitad — el lector
 * AJENO — vive en `scripts/dwg/oda-roundtrip.mjs`. Esta spec entrega esa
 * primera mitad para `writeCanonicalDwg`: documento canónico de fixture →
 * `writeCanonicalDwg` → `readDwg` (el lector público, el mismo que usaría
 * cualquier consumidor real), comparando la geometría leída contra la que
 * entró, con la tolerancia 1e-6 que también usa el harness del oráculo. La
 * segunda mitad (ODA File Converter) NO se ejecuta aquí — no está
 * disponible en este entorno; ver `src/api/write.ts` y el caso nuevo de
 * `oda-roundtrip.mjs` para esa evidencia pendiente.
 *
 * Cubre también el límite ASCII declarado de nombres de capa/bloque de esta
 * fase (nunca un `throw`, nunca un nombre transcrito a medias) y que una
 * clase de entidad fuera de las siete autorizadas quede en el manifiesto de
 * pérdidas y fuera del archivo, nunca las dos cosas a la vez.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  readDwg,
  writeCanonicalDwg,
  type CanonicalCadDocumentJson,
  type DwgGeometryEntity,
  type DwgGeometryEntityKind,
} from "../../src/index.js";

const TOLERANCE = 1e-6;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCE;
const near3 = (
  p: { readonly x: number; readonly y: number; readonly z: number },
  q: { readonly x: number; readonly y: number; readonly z: number },
): boolean => near(p.x, q.x) && near(p.y, q.y) && near(p.z, q.z);

function emptyDocument(
  overrides: Partial<CanonicalCadDocumentJson> = {},
): CanonicalCadDocumentJson {
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [],
    entities: [],
    history: [{ version: 1, label: "write-canonical-dwg.spec fixture" }],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    ...overrides,
  };
}

type EntityRecordLike = { readonly entity: DwgGeometryEntity };

/** Exige que `record` exista y que su entidad sea de la clase `kind`. */
function expectEntity<K extends DwgGeometryEntityKind>(
  record: EntityRecordLike | undefined,
  kind: K,
): Extract<DwgGeometryEntity, { kind: K }> {
  assert.ok(record, `falta una entidad "${kind}" en model space`);
  assert.equal(record.entity.kind, kind);
  return record.entity as Extract<DwgGeometryEntity, { kind: K }>;
}

test("las siete clases autorizadas van y vuelven exactas por writeCanonicalDwg → readDwg", () => {
  const document = emptyDocument({
    layers: [
      { id: "0", name: "0", color: "#FFFFFF", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#00FFFF", visible: true, locked: false },
    ],
    blocks: [
      { id: "bPUERTA", name: "PUERTA", basePoint: { x: 0, y: 0, z: 0 }, entities: [] },
    ],
    entities: [
      { id: "e1", type: "line", start: { x: 1, y: 2, z: 0 }, end: { x: 30, y: -4, z: 0 }, layer: "0" },
      { id: "e2", type: "point", position: { x: -6, y: 8, z: 0.5 }, layer: "0" },
      { id: "e3", type: "circle", center: { x: 10, y: 10, z: 0 }, radius: 5.5, layer: "MUROS" },
      {
        id: "e4",
        type: "arc",
        center: { x: -3, y: 8, z: 0 },
        radius: 2.25,
        startAngle: 0.25,
        endAngle: 2.5,
        layer: "0",
      },
      {
        id: "e5",
        type: "polyline",
        vertices: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 5 },
          { x: 0, y: 5 },
        ],
        closed: true,
        layer: "0",
      },
      { id: "e6", type: "text", x: 5, y: 6, text: "VALLE", height: 0.35, layer: "0" },
      {
        id: "e7",
        type: "insert",
        block: "PUERTA",
        insertion: { x: 30, y: 4, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "MUROS",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  // El bloque PUERTA está declarado VACÍO en el fixture (sin entidades que
  // perder), así que estas siete clases ya no dejan NINGUNA pérdida — el
  // contenido de bloque viaja desde el corte 2026-08-31 (ver src/api/write.ts).
  assert.equal(lossManifest.length, 0);

  const database = readDwg(bytes);
  assert.equal(database.layers.length, 2);
  const layerZero = database.layers.find(
    (layer) => String.fromCharCode(...layer.name) === "0",
  );
  const muros = database.layers.find(
    (layer) => String.fromCharCode(...layer.name) === "MUROS",
  );
  assert.ok(layerZero, "la capa 0 debe existir");
  assert.ok(muros, "la capa MUROS debe existir");

  const puerta = database.blocks.find(
    (block) => String.fromCharCode(...block.name) === "PUERTA",
  );
  assert.ok(puerta, "el bloque PUERTA debe existir para que el INSERT resuelva");
  assert.equal(puerta.entities.length, 0, "el bloque PUERTA está declarado vacío en el fixture");

  assert.equal(database.modelSpaceEntities.length, 7);
  const byKind = new Map(
    database.modelSpaceEntities.map((record) => [record.entity.kind, record] as const),
  );

  const lineRecord = byKind.get("line");
  const line = expectEntity(lineRecord, "line");
  assert.ok(near3(line.start, { x: 1, y: 2, z: 0 }));
  assert.ok(near3(line.end, { x: 30, y: -4, z: 0 }));
  assert.equal(lineRecord!.layerHandle, layerZero.handle);

  const point = expectEntity(byKind.get("point"), "point");
  assert.ok(near3(point.position, { x: -6, y: 8, z: 0.5 }));

  const circleRecord = byKind.get("circle");
  const circle = expectEntity(circleRecord, "circle");
  assert.ok(near3(circle.center, { x: 10, y: 10, z: 0 }));
  assert.ok(near(circle.radius, 5.5));
  assert.equal(circleRecord!.layerHandle, muros.handle);

  const arc = expectEntity(byKind.get("arc"), "arc");
  assert.ok(near3(arc.center, { x: -3, y: 8, z: 0 }));
  assert.ok(near(arc.radius, 2.25));
  assert.ok(near(arc.startAngle, 0.25));
  assert.ok(near(arc.endAngle, 2.5));

  const polyline = expectEntity(byKind.get("lwpolyline"), "lwpolyline");
  assert.equal(polyline.closed, true);
  assert.equal(polyline.vertices.length, 4);
  assert.ok(near(polyline.vertices[2]!.x, 8));
  assert.ok(near(polyline.vertices[2]!.y, 5));

  const text = expectEntity(byKind.get("text"), "text");
  assert.ok(near(text.insertion.x, 5));
  assert.ok(near(text.insertion.y, 6));
  assert.ok(near(text.height, 0.35));
  assert.equal(String.fromCharCode(...text.valueBytes), "VALLE");

  const insertRecord = byKind.get("insert");
  const insert = expectEntity(insertRecord, "insert");
  assert.ok(near3(insert.position, { x: 30, y: 4, z: 0 }));
  assert.ok(near3(insert.scale, { x: 1, y: 1, z: 1 }));
  assert.ok(near(insert.rotation, 0));
  assert.equal(String.fromCharCode(...(insertRecord!.insertedBlockName ?? [])), "PUERTA");
  assert.equal(insertRecord!.layerHandle, muros.handle);
});

test("el contenido de un bloque viaja: geometría y capa exactas dentro del BLOCK_RECORD", () => {
  const document = emptyDocument({
    layers: [
      { id: "0", name: "0", color: "#FFFFFF", visible: true, locked: false },
      { id: "BISAGRAS", name: "BISAGRAS", color: "#FF0000", visible: true, locked: false },
    ],
    blocks: [
      {
        id: "bPUERTA",
        name: "PUERTA",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: "bp1",
            type: "line",
            start: { x: 0, y: 0, z: 0 },
            end: { x: 0, y: 2.1, z: 0 },
            layer: "0",
          },
          {
            id: "bp2",
            type: "circle",
            center: { x: 0, y: 1, z: 0 },
            radius: 0.05,
            layer: "BISAGRAS",
          },
        ],
      },
    ],
    entities: [
      {
        id: "e1",
        type: "insert",
        block: "PUERTA",
        insertion: { x: 5, y: 5, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  assert.equal(lossManifest.length, 0);

  const database = readDwg(bytes);
  const bisagras = database.layers.find(
    (layer) => String.fromCharCode(...layer.name) === "BISAGRAS",
  );
  assert.ok(bisagras, "la capa BISAGRAS debe existir: sólo el contenido del bloque la referencia");

  const puerta = database.blocks.find(
    (block) => String.fromCharCode(...block.name) === "PUERTA",
  );
  assert.ok(puerta);
  assert.equal(puerta.entities.length, 2);
  const [lineRecord, circleRecord] = puerta.entities;
  const line = expectEntity(lineRecord, "line");
  assert.ok(near3(line.start, { x: 0, y: 0, z: 0 }));
  assert.ok(near3(line.end, { x: 0, y: 2.1, z: 0 }));
  const circle = expectEntity(circleRecord, "circle");
  assert.ok(near3(circle.center, { x: 0, y: 1, z: 0 }));
  assert.ok(near(circle.radius, 0.05));
  assert.equal(circleRecord!.layerHandle, bisagras.handle);
});

test("un bloque que inserta OTRO bloque declara la pérdida y omite sólo ese INSERT", () => {
  const document = emptyDocument({
    blocks: [
      {
        id: "bMARCO",
        name: "MARCO",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          { id: "bm1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, layer: "0" },
          {
            id: "bm2",
            type: "insert",
            block: "TORNILLO",
            insertion: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            rotation: 0,
            layer: "0",
          },
        ],
      },
    ],
    entities: [
      {
        id: "e1",
        type: "insert",
        block: "MARCO",
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  assert.equal(lossManifest.length, 1);
  assert.equal(lossManifest[0]!.code, "insert-block-nested-insert-not-written");
  assert.equal(lossManifest[0]!.entityId, "bm2");

  const database = readDwg(bytes);
  const marco = database.blocks.find(
    (block) => String.fromCharCode(...block.name) === "MARCO",
  );
  assert.ok(marco);
  // La línea del bloque SÍ viaja; el INSERT anidado se omite, declarado.
  assert.equal(marco.entities.length, 1);
  assert.equal(marco.entities[0]!.entity.kind, "line");
});

test('una capa con nombre no-ASCII cae a la capa "0" con una pérdida declarada, nunca un throw', () => {
  const document = emptyDocument({
    layers: [
      { id: "0", name: "0", color: "#FFFFFF", visible: true, locked: false },
      { id: "MURO-ANO", name: "MURO-AÑO", color: "#FF0000", visible: true, locked: false },
    ],
    entities: [
      { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "MURO-AÑO" },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  const notAscii = lossManifest.filter((loss) => loss.code === "layer-name-not-ascii");
  assert.equal(notAscii.length, 1);
  assert.equal(notAscii[0]!.severity, "warning");
  assert.ok(notAscii[0]!.detail.includes("MURO-AÑO"));

  const database = readDwg(bytes);
  // Ninguna capa "MURO-AÑO", ni ninguna transcripción a medias: sólo la "0".
  assert.equal(database.layers.length, 1);
  assert.equal(String.fromCharCode(...database.layers[0]!.name), "0");
  // La línea se sigue escribiendo — cae a "0", no se omite.
  assert.equal(database.modelSpaceEntities.length, 1);
  assert.equal(database.modelSpaceEntities[0]!.layerHandle, database.layers[0]!.handle);
});

test("un INSERT hacia un bloque con nombre no-ASCII se omite del archivo con una pérdida declarada", () => {
  const document = emptyDocument({
    blocks: [{ id: "b1", name: "PUERTA-AÑO", basePoint: { x: 0, y: 0, z: 0 }, entities: [] }],
    entities: [
      { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
      {
        id: "e2",
        type: "insert",
        block: "PUERTA-AÑO",
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  const dropped = lossManifest.filter((loss) => loss.code === "insert-block-name-not-ascii");
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]!.entityId, "e2");
  assert.equal(dropped[0]!.severity, "warning");

  const database = readDwg(bytes);
  // El INSERT se omite entero: sólo queda la línea, y ningún bloque de
  // usuario apunta a un nombre a medias.
  assert.equal(database.modelSpaceEntities.length, 1);
  assert.equal(database.modelSpaceEntities[0]!.entity.kind, "line");
  const userBlocks = database.blocks.filter(
    (block) => !String.fromCharCode(...block.name).startsWith("*"),
  );
  assert.equal(userBlocks.length, 0);
});

test("una clase de entidad fuera de las siete autorizadas queda en el manifiesto y fuera del archivo", () => {
  const document = emptyDocument({
    entities: [
      { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
      {
        id: "e2",
        type: "ellipse",
        center: { x: 0, y: 0, z: 0 },
        majorAxis: { x: 2, y: 0, z: 0 },
        ratio: 0.5,
        startParameter: 0,
        endParameter: 6.28,
        layer: "0",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  assert.equal(lossManifest.length, 1);
  assert.equal(lossManifest[0]!.code, "canonical-type-not-writable");
  assert.equal(lossManifest[0]!.sourceType, "ellipse");
  assert.equal(lossManifest[0]!.entityId, "e2");

  const database = readDwg(bytes);
  assert.equal(database.modelSpaceEntities.length, 1);
  assert.equal(database.modelSpaceEntities[0]!.entity.kind, "line");
});

test("el mapeo es determinista: mismo documento, mismos bytes y mismo manifiesto", () => {
  const document = emptyDocument({
    entities: [{ id: "e1", type: "circle", center: { x: 1, y: 1, z: 0 }, radius: 3, layer: "0" }],
  });
  const first = writeCanonicalDwg(document);
  const second = writeCanonicalDwg(document);
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(first.lossManifest, second.lossManifest);
});
