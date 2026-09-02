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
 * clase de entidad fuera de las autorizadas quede en el manifiesto de
 * pérdidas y fuera del archivo, nunca las dos cosas a la vez. Las clases
 * autorizadas pasaron de siete a ocho el 2026-09-01, cuando la ELIPSE dejó de
 * caer al `default` del camino público.
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

// Esta prueba usaba una ELIPSE como ejemplo de «clase no escribible», y desde
// el 2026-09-01 la elipse SÍ se escribe: se habría vuelto un guardián de la
// carencia, afirmando que se pierde algo que ya no se pierde. Se cambia el
// ejemplo por una clase que de verdad sigue sin emitirse —SPLINE—, para que
// la prueba siga vigilando lo que existe para vigilar: que lo no escribible
// consta en el manifiesto Y queda fuera del archivo, nunca las dos cosas.
test("una clase de entidad fuera de las autorizadas queda en el manifiesto y fuera del archivo", () => {
  const document = emptyDocument({
    entities: [
      { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
      {
        id: "e2",
        type: "spline",
        degree: 3,
        closed: false,
        knots: [0, 0, 0, 0, 1, 1, 1, 1],
        controlPoints: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 2, z: 0 },
          { x: 3, y: 2, z: 0 },
          { x: 4, y: 0, z: 0 },
        ],
        layer: "0",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  assert.equal(lossManifest.length, 1);
  assert.equal(lossManifest[0]!.code, "canonical-type-not-writable");
  assert.equal(lossManifest[0]!.sourceType, "spline");
  assert.equal(lossManifest[0]!.entityId, "e2");

  const database = readDwg(bytes);
  assert.equal(database.modelSpaceEntities.length, 1);
  assert.equal(database.modelSpaceEntities[0]!.entity.kind, "line");
});

// ─── ELLIPSE: la octava clase del camino público (2026-09-01) ──────────────
// El writer interno la emitía desde hacía olas; lo que faltaba era el enrutado
// aquí, en el camino PÚBLICO, que la mandaba al `default` y la declaraba «no
// escribible». Esta prueba mide la vuelta completa por el lector público.
test("una ELIPSE va y vuelve exacta por writeCanonicalDwg → readDwg, y declara la extrusión que el canónico no lleva", () => {
  const document = emptyDocument({
    entities: [
      {
        id: "e1",
        type: "ellipse",
        center: { x: 100, y: 50, z: 0 },
        majorAxis: { x: 40, y: 0, z: 0 },
        ratio: 0.5,
        // Un arco RECORTADO, no la vuelta completa: si el enrutado perdiera o
        // confundiera los parámetros, una elipse entera lo disimularía.
        startParameter: 0,
        endParameter: Math.PI / 2,
        layer: "0",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  const database = readDwg(bytes);
  assert.equal(database.modelSpaceEntities.length, 1);
  const written = database.modelSpaceEntities[0]!.entity;
  assert.equal(written.kind, "ellipse");
  if (written.kind !== "ellipse") throw new Error("inalcanzable");
  assert.ok(Math.abs(written.center.x - 100) < 1e-6, "el centro viaja");
  assert.ok(Math.abs(written.center.y - 50) < 1e-6);
  assert.ok(Math.abs(written.majorAxisEndpoint.x - 40) < 1e-6, "el eje mayor viaja");
  assert.ok(Math.abs(written.axisRatio - 0.5) < 1e-6, "la razón de ejes viaja");
  assert.ok(Math.abs(written.startAngle - 0) < 1e-6, "el parámetro inicial viaja");
  assert.ok(
    Math.abs(written.endAngle - Math.PI / 2) < 1e-6,
    "y el final TAMBIÉN: el arco recortado no se convierte en una vuelta entera",
  );

  // La extrusión es el único campo que el DWG pide y el canónico no lleva. Se
  // escribe el plano XY y SE DICE, en vez de callarlo.
  assert.equal(lossManifest.length, 1);
  assert.equal(lossManifest[0]!.code, "ellipse-extrusion-not-carried");
  assert.equal(lossManifest[0]!.entityId, "e1");
  assert.ok(Math.abs(written.extrusion.z - 1) < 1e-6, "y el plano escrito es el XY");
});

// ─── HATCH: la novena clase, y sólo la mitad que se puede escribir ────────
// El cuerpo de un HATCH con patrón lleva, después de los contornos, un bloque
// —ángulo, escala, doble trama y las líneas de definición con sus trazos— que
// el sólido no tiene. El canónico transporta el NOMBRE del patrón, no su
// geometría, así que un sombreado con patrón sólo se podría escribir
// inventándosela. Se escribe el sólido y se declara el otro.
test("un HATCH de relleno SÓLIDO va y vuelve exacto por writeCanonicalDwg → readDwg", () => {
  const document = emptyDocument({
    entities: [
      {
        id: "h1",
        type: "hatch",
        pattern: "SOLID",
        solid: true,
        boundaries: [
          [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
            { x: 10, y: 6, z: 0 },
            { x: 0, y: 6, z: 0 },
          ],
        ],
        layer: "0",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  const database = readDwg(bytes);
  assert.equal(database.modelSpaceEntities.length, 1);
  const written = database.modelSpaceEntities[0]!.entity;
  assert.equal(written.kind, "hatch");
  if (written.kind !== "hatch") throw new Error("inalcanzable");
  assert.equal(written.solidFill, true, "se escribe como relleno sólido");
  assert.equal(written.paths.length, 1, "un contorno, un camino");
  const path = written.paths[0]!;
  assert.equal(path.kind, "polyline");
  if (path.kind !== "polyline") throw new Error("inalcanzable");
  assert.equal(path.vertices.length, 4, "los cuatro vértices viajan");
  assert.equal(path.closed, true, "y el contorno vuelve cerrado");
  assert.ok(Math.abs(path.vertices[2]!.x - 10) < 1e-6, "con sus coordenadas exactas");
  assert.ok(Math.abs(path.vertices[2]!.y - 6) < 1e-6);
  assert.equal(String.fromCharCode(...written.nameBytes), "SOLID");

  // Lo que el canónico no lleva son decisiones de autoría, y se declaran.
  assert.equal(lossManifest.length, 1);
  assert.equal(lossManifest[0]!.code, "hatch-authoring-defaults");
});

test("un HATCH CON PATRÓN no se emite y se declara con su razón", () => {
  const document = emptyDocument({
    entities: [
      { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
      {
        id: "h2",
        type: "hatch",
        pattern: "ANSI31",
        solid: false,
        boundaries: [
          [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
            { x: 4, y: 4, z: 0 },
          ],
        ],
        layer: "0",
      },
    ],
  });

  const { bytes, lossManifest } = writeCanonicalDwg(document);
  const database = readDwg(bytes);
  assert.equal(database.modelSpaceEntities.length, 1, "sólo la línea llega al archivo");
  assert.equal(database.modelSpaceEntities[0]!.entity.kind, "line");
  assert.equal(lossManifest.length, 1);
  assert.equal(lossManifest[0]!.code, "hatch-pattern-not-writable");
  assert.equal(lossManifest[0]!.entityId, "h2");
  assert.ok(
    lossManifest[0]!.detail.includes("ANSI31"),
    "y el manifiesto nombra el patrón concreto que no se supo escribir",
  );
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
