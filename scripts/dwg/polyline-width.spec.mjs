#!/usr/bin/env node
/**
 * Comprueba la anchura de POLYLINE 2D contra un DWG admitido y su DXF oráculo.
 * El consumidor verifica commit, manifiesto, permisos y SHA antes de leerlos.
 * Si no hay acceso al corpus, declara que la prueba externa no corrió; la
 * prueba unitaria hermética del mapeo sigue ejecutándose en todos los entornos.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseOracleDxf } from "./dxf-oracle.mjs";
import {
  REPO_ROOT,
  fetchAdmittedCorpus,
  loadCorpusPin,
  resolveCorpusSource,
} from "./corpus-consumer.mjs";

const pin = loadCorpusPin();
const { transport } = resolveCorpusSource({ pin });
if (transport === null) {
  process.stdout.write("POLYLINE 2D: sin corpus admitido accesible; verificación externa NO CORRIDA.\n");
  process.exit(0);
}

const report = fetchAdmittedCorpus({ pin, transport });
assert.equal(report.status, "verified");
const bundle = report.bundles.find((item) => item.id === "foundational-entities-ac1015");
assert.ok(bundle, "el bundle AC1015 debe estar admitido en el commit fijado");
const artifact = (suffix) => {
  const item = bundle.artifacts.find((entry) => entry.path.endsWith(suffix));
  assert.ok(item, `falta el artefacto admitido ${suffix}`);
  const bytes = transport.readFile(pin.commit, item.path);
  assert.ok(bytes, `no se puede leer ${item.path} del commit fijado`);
  return bytes;
};
const dwg = artifact("/fixtures/13-polyline2d.dwg");
const dxf = artifact("/oracles/dxf/13-polyline2d.dxf");
const oracle = parseOracleDxf(dxf.toString("utf8"));
const expected = oracle.topEntities.find((entity) =>
  entity.type === "POLYLINE" && entity.r40 === 2 && entity.r41 === 2);
assert.ok(expected, "el DXF oráculo declara ancho inicial y final 2");
assert.equal(expected.vertices[1]?.bulge, 0.5);

const codecPath = path.join(REPO_ROOT, "packages", "dwg-codec", "dist", "index.js");
const { readDwg, dwgDatabaseToCanonicalDocument, writeCanonicalDwg } =
  await import(pathToFileURL(codecPath).href);
const database = readDwg(dwg);
const source = database.modelSpaceEntities.find((record) =>
  record.entity.kind === "polyline2d" && record.entity.startWidth === 2);
assert.ok(source, "el lector abre la POLYLINE 2D del DWG admitido");
assert.deepEqual(source.vertices.map((record) => [
  record.entity.startWidth, record.entity.endWidth,
]), [[2, 2], [2, 2], [2, 2], [2, 2]]);
assert.equal(source.vertices[1].entity.bulge, 0.5);

const { document } = dwgDatabaseToCanonicalDocument(database);
const mapped = document.entities.find((entity) => entity.id === `h${source.handle.toString(16)}`);
assert.ok(mapped);
assert.equal(mapped.type, "polyline");
assert.deepEqual(mapped.vertices.map((vertex) => [
  vertex.startWidth, vertex.endWidth,
]), [[2, 2], [2, 2], [2, 2], [2, 2]]);
assert.equal(mapped.vertices[1].bulge, 0.5);

const withWidths = writeCanonicalDwg(document);
assert.ok(!withWidths.lossManifest.some((loss) =>
  loss.code === "polyline-width-not-emitted" && loss.entityId === mapped.id));
const withoutWidths = writeCanonicalDwg({
  ...document,
  entities: document.entities.map((entity) =>
    entity.id !== mapped.id ? entity : {
      ...entity,
      vertices: entity.vertices.map(({ startWidth, endWidth, ...rest }) => rest),
    }),
});
assert.notDeepEqual(withWidths.bytes, withoutWidths.bytes,
  "el writer debe codificar los anchos y cambiar los bytes del DWG emitido");
const emitted = readDwg(withWidths.bytes).modelSpaceEntities.find((record) =>
  record.entity.kind === "lwpolyline" && record.entity.widths?.length === 4);
assert.ok(emitted, "el DWG emitido debe tener una LWPOLYLINE con anchos");
assert.deepEqual(emitted.entity.widths.map((width) => [width.start, width.end]),
  [[2, 2], [2, 2], [2, 2], [2, 2]]);
assert.equal(emitted.entity.bulges[1], 0.5);
process.stdout.write("POLYLINE 2D: DWG/DXF admitidos verificados; cuatro anchos y bulge reescritos; bytes DWG cambian.\n");
