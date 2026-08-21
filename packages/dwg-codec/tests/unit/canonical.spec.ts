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

test("lo no escribible queda declarado como pérdida, jamás emitido a medias", () => {
  const database = readAc1015Database(buildSourceFile());
  const { document } = dwgDatabaseToCanonicalDocument(database);
  const withEllipse = {
    ...document,
    entities: [
      ...document.entities,
      {
        id: "hff",
        type: "ellipse",
        center: { x: 0, y: 0, z: 0 },
        majorAxis: { x: 2, y: 0, z: 0 },
        ratio: 0.5,
        startParameter: 0,
        endParameter: 6.28,
        layer: "0",
      },
    ],
  };
  const projected = canonicalDocumentToDwgEntities(withEllipse);
  assert.equal(projected.entities.length, 3);
  assert.equal(projected.lossManifest.length, 1);
  assert.equal(projected.lossManifest[0]!.code, "canonical-type-not-writable");
  assert.equal(projected.lossManifest[0]!.sourceType, "ellipse");
});

test("el mapeo es determinista documento a documento", () => {
  const database = readAc1015Database(buildSourceFile());
  assert.deepEqual(
    dwgDatabaseToCanonicalDocument(database),
    dwgDatabaseToCanonicalDocument(database),
  );
});
