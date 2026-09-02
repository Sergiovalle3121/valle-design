import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDocumentToDwgEntities,
  dwgDatabaseToCanonicalDocument,
} from "../../src/api/canonical.js";
import { readAc1015Database } from "../../src/reader/ac1015-database-reader.js";
import { writeAc1015Container } from "../../src/writer/ac1015-container-writer.js";
import type { DwgGeometryEntity } from "../../src/model/entity-geometry.js";

/**
 * Round-trip canónico — OLA 4.1: DWG → base neutral → documento canónico →
 * modelo escribible → DWG → base neutral, con diferencias SOLO dentro de las
 * pérdidas declaradas. El corpus de la spec es hermético: lo produce el
 * writer del propio laboratorio.
 */

const LINE: DwgGeometryEntity = Object.freeze({
  kind: "line",
  start: { x: 1, y: 2, z: 0 },
  end: { x: 30, y: -4, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
});
const CIRCLE: DwgGeometryEntity = Object.freeze({
  kind: "circle",
  center: { x: 10, y: 10, z: 0 },
  radius: 5.5,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
});
const ARC: DwgGeometryEntity = Object.freeze({
  kind: "arc",
  center: { x: -3, y: 8, z: 0 },
  radius: 2.25,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  startAngle: 0.25,
  endAngle: 2.5,
});

function buildSourceFile(): Uint8Array {
  return writeAc1015Container({
    objects: [
      { layerControl: { entryHandles: [2, 3] }, handle: 1 },
      { layer: { name: [0x30] }, handle: 2 },
      { layer: { name: [0x4d, 0x55, 0x52, 0x4f, 0x53], colorIndex: 4 }, handle: 3 },
      { entity: LINE, handle: 4 },
      { entity: CIRCLE, handle: 5 },
      { entity: ARC, handle: 6 },
    ],
  });
}

test("la base neutral se proyecta al documento canónico con ids y capas", () => {
  const database = readAc1015Database(buildSourceFile());
  const { document, lossManifest } = dwgDatabaseToCanonicalDocument(database);

  assert.equal(document.meta.schema, 9);
  assert.deepEqual(
    document.layers.map((layer) => [layer.name, layer.color]),
    [
      ["0", "#FFFFFF"],
      ["MUROS", "#00FFFF"],
    ],
  );
  assert.equal(document.entities.length, 3);
  assert.deepEqual(
    document.entities.map((e) => e["type"]),
    ["line", "circle", "arc"],
  );
  assert.deepEqual(document.modelSpace.entityIds, ["h4", "h5", "h6"]);
  // El writer de laboratorio deja las capas de entidad nulas: la proyección
  // usa la capa por defecto y no inventa pertenencias.
  assert.equal(document.entities[0]!["layer"], "0");
  assert.equal(document.unsupportedEntities.length, 0);
  assert.ok(Array.isArray(lossManifest));
});

test("canónico → modelo escribible → DWG → base neutral conserva la geometría", () => {
  const database = readAc1015Database(buildSourceFile());
  const { document } = dwgDatabaseToCanonicalDocument(database);
  const projected = canonicalDocumentToDwgEntities(document);

  assert.equal(projected.entities.length, 3);
  assert.deepEqual(projected.lossManifest, []);
  assert.deepEqual(projected.layerNames, ["0", "MUROS"]);

  const rewritten = writeAc1015Container({
    objects: [
      { layerControl: { entryHandles: [2] }, handle: 1 },
      { layer: { name: [0x30] }, handle: 2 },
      ...projected.entities.map((item, index) => ({
        entity: item.entity,
        handle: 4 + index,
      })),
    ],
  });
  const reread = readAc1015Database(rewritten);
  assert.deepEqual(
    reread.modelSpaceEntities.map((r) => r.entity),
    [LINE, CIRCLE, ARC],
  );
});

// El ejemplo de «no escribible» era una ELIPSE, y desde el 2026-09-01 la
// elipse SÍ se enruta: mantenerla aquí convertiría esta prueba en guardiana de
// una carencia que ya no existe. Se cambia por SPLINE, que sigue sin emitirse
// de verdad, y se añade abajo la mitad nueva: que la elipse pasa.
test("lo no escribible queda declarado como pérdida, jamás emitido a medias", () => {
  const database = readAc1015Database(buildSourceFile());
  const { document } = dwgDatabaseToCanonicalDocument(database);
  const withSpline = {
    ...document,
    entities: [
      ...document.entities,
      {
        id: "hff",
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
  };
  const projected = canonicalDocumentToDwgEntities(withSpline);
  assert.equal(projected.entities.length, 3);
  assert.equal(projected.lossManifest.length, 1);
  assert.equal(projected.lossManifest[0]!.code, "canonical-type-not-writable");
  assert.equal(projected.lossManifest[0]!.sourceType, "spline");
});

test("la ELIPSE sí se enruta al writer, con sus cinco campos y la extrusión declarada", () => {
  const database = readAc1015Database(buildSourceFile());
  const { document } = dwgDatabaseToCanonicalDocument(database);
  const withEllipse = {
    ...document,
    entities: [
      ...document.entities,
      {
        id: "hff",
        type: "ellipse",
        center: { x: 7, y: 3, z: 0 },
        majorAxis: { x: 2, y: 0, z: 0 },
        ratio: 0.5,
        startParameter: 0,
        endParameter: 1.25,
        layer: "0",
      },
    ],
  };
  const projected = canonicalDocumentToDwgEntities(withEllipse);
  assert.equal(projected.entities.length, 4, "la elipse SE PROYECTA, no se descarta");
  const ellipse = projected.entities.find((e) => e.entity.kind === "ellipse");
  assert.ok(ellipse, "y llega como elipse, no degradada a otra cosa");
  if (ellipse?.entity.kind !== "ellipse") throw new Error("inalcanzable");
  assert.equal(ellipse.entity.center.x, 7);
  assert.equal(ellipse.entity.center.y, 3);
  assert.equal(ellipse.entity.majorAxisEndpoint.x, 2);
  assert.equal(ellipse.entity.axisRatio, 0.5);
  assert.equal(ellipse.entity.startAngle, 0);
  assert.equal(ellipse.entity.endAngle, 1.25, "el parámetro final no se redondea ni se completa");
  // Lo único que se pierde es la extrusión, y consta.
  assert.equal(projected.lossManifest.length, 1);
  assert.equal(projected.lossManifest[0]!.code, "ellipse-extrusion-not-carried");
  assert.equal(projected.lossManifest[0]!.entityId, "hff");
});

test("el mapeo es determinista documento a documento", () => {
  const database = readAc1015Database(buildSourceFile());
  assert.deepEqual(
    dwgDatabaseToCanonicalDocument(database),
    dwgDatabaseToCanonicalDocument(database),
  );
});

// ─── ACIS (3DSOLID/REGION/BODY): preservación opaca — sesión DWG-B (3D) ────
// El writer del laboratorio no emite estos tres tipos (son de CLASE, sin
// código BS fijo — ver `objects/entities-acis.ts`), así que este mapeo se
// prueba con una base neutral hecha a mano, mismo patrón que ya usa
// `dwg-native-reader.spec.ts` del producto para ELLIPSE/SPLINE antes de que
// el writer los soportara.
test("un objeto ACIS se proyecta opaco, con su nombre de clase real como sourceType", () => {
  const acis: DwgGeometryEntity = Object.freeze({
    kind: "acisOpaque",
    classNameBytes: Object.freeze([..."3DSOLID"].map((c) => c.charCodeAt(0))),
    dataBitLength: 24,
    leadingBitOffset: 4,
    rawBytes: Object.freeze([0xde, 0xad, 0xbe, 0xef]),
  });
  const database = {
    layers: [],
    blocks: [],
    modelSpaceEntities: [
      {
        handle: 0x50,
        entity: acis,
        layerHandle: undefined,
        insertedBlockName: undefined,
        attributes: undefined,
        vertices: undefined,
        sequenceEndHandle: undefined,
      },
    ],
    paperSpaceEntities: [],
    insunits: 4,
    tables: {
      styles: [],
      linetypes: [],
      dimstyles: [],
      appids: [],
      vports: [],
      views: [],
      ucss: [],
      mlinestyles: [],
    },
    dictionaries: [],
    classMap: [],
    unsupported: [],
    diagnostics: [],
  };
  const { document, lossManifest } = dwgDatabaseToCanonicalDocument(database);

  assert.equal(document.entities.length, 0, "no se proyecta como entidad canónica dibujable");
  assert.equal(document.unsupportedEntities.length, 1);
  const opaque = document.unsupportedEntities[0]!;
  assert.equal(opaque.sourceType, "3DSOLID", "el nombre de clase real, no un genérico 'dwg-acisOpaque'");
  assert.equal(opaque.editable, false);
  const payload = JSON.parse(opaque.raw) as {
    dataBitLength: number;
    leadingBitOffset: number;
    rawBytes: number[];
  };
  assert.equal(payload.dataBitLength, 24);
  assert.equal(payload.leadingBitOffset, 4);
  assert.deepEqual(payload.rawBytes, [0xde, 0xad, 0xbe, 0xef]);
  assert.ok(
    lossManifest.some((entry) => entry.code === "acis-preserved-opaque" && entry.sourceType === "3DSOLID"),
    "el objeto conservado se declara en el manifiesto, nunca en silencio",
  );
});
