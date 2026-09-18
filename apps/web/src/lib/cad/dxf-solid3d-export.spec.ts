import assert from "node:assert/strict";
import type { CadDocument, CadEntity } from "./cad-document";
import { cadDocumentNativeDxfPrimitives, cadDocumentDxfExportLosses } from "./dxf-cad-document";
import { exportCadDxf } from "./dxf-export";
import { cadSolid3dToDxfPrimitives, cadRegionToDxfPrimitives } from "./dxf-solid3d-primitives";
import { importDxfPrimitives } from "./dxf-import";

// Fixture: caja 1000×2000×3000 en capa "0".
const boxSolid: CadEntity = {
  id: "s1",
  type: "solid3d",
  layer: "0",
  root: "n",
  nodes: [{ id: "n", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 1000, y: 2000, z: 3000 } }],
  placement: { e: 0, f: 0, a: 1, b: 0, c: 0, d: 1 },
} as unknown as CadEntity;

const document = {
  entities: [boxSolid],
  meta: { unit: "mm" },
  layers: [{ name: "0", color: 7, linetype: "Continuous" }],
  modelSpace: "ms",
  blocks: [],
  imageDefinitions: [],
} as unknown as CadDocument;

// 1. Primitivas directas: la caja tiene 6 caras.
const fromAdapter = cadSolid3dToDxfPrimitives(boxSolid as Extract<CadEntity, { type: "solid3d" }>);
assert.equal(fromAdapter.length, 6, "una caja produce 6 contornos de cara");
for (const p of fromAdapter) {
  assert.equal(p.kind, "polyline");
  assert.equal((p as { closed: boolean }).closed, true);
}

// 2. Primitivas vía el registro canónico (anti-segunda-geometría).
const nativePrims = cadDocumentNativeDxfPrimitives(document);
assert.equal(nativePrims.length, 6, "cadDocumentNativeDxfPrimitives: 6 primitivas");
assert.deepEqual(
  nativePrims.map((p) => (p as { points: unknown[] }).points),
  fromAdapter.map((p) => p.points),
  "los puntos son los del adaptador, no una segunda geometría",
);

// 3. Exportación DXF: entityCount === 6, 6 POLYLINE, 6 SEQEND.
const exported = exportCadDxf({ primitives: nativePrims }, { units: "mm" });
assert.equal(exported.entityCount, 6, "entityCount === 6");
const lines = exported.content.split("\n");
assert.equal(lines.filter((l: string) => l.trim() === "POLYLINE").length, 6, "6 POLYLINE");
assert.equal(lines.filter((l: string) => l.trim() === "SEQEND").length, 6, "6 SEQEND");

// 4. Reimportar: polilíneas cerradas.
const reimported = importDxfPrimitives(exported.content);
const polylines = reimported.primitives.filter((p) => p.kind === "polyline" && (p as { closed?: boolean }).closed);
// Una caja alineada a ejes proyecta 2 caras reales (tapas) y 4 degeneradas
// (laterales, colineales en XY). El reimportador fusiona duplicados: 4 de 3 vértices.
assert.equal(polylines.length, 4, "4 polilíneas cerradas reimportadas (fusión de duplicados)");
for (const p of polylines) assert.equal(p.points.length, 3, "cada una con 3 vértices tras fusión");
// Envolvente: [0,0]–[1000,2000].
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const p of polylines) {
  for (const pt of p.points) {
    minX = Math.min(minX, pt.x!);
    minY = Math.min(minY, pt.y!);
    maxX = Math.max(maxX, pt.x!);
    maxY = Math.max(maxY, pt.y!);
  }
}
assert.equal(minX, 0, "minX");
assert.equal(minY, 0, "minY");
assert.equal(maxX, 1000, "maxX");
assert.equal(maxY, 2000, "maxY");

// 5. Manifiesto de pérdidas: cero entity_dropped, una warning nueva.
const losses = cadDocumentDxfExportLosses(document);
assert.equal(losses.filter((l) => l.code === "dxf_export_entity_dropped").length, 0, "cero entity_dropped");
assert.equal(losses.filter((l) => l.code === "dxf_export_solid3d_as_face_contours").length, 1, "una warning solid3d");

// 6. REGION: placa con un hueco.
const region: CadEntity = {
  id: "r1",
  type: "region",
  layer: "0",
  outer: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 500 },
    { x: 0, y: 500 },
  ],
  inners: [[
    { x: 200, y: 100 },
    { x: 800, y: 100 },
    { x: 800, y: 400 },
    { x: 200, y: 400 },
  ]],
} as unknown as CadEntity;
const regionPrims = cadRegionToDxfPrimitives(region as Extract<CadEntity, { type: "region" }>);
assert.ok(regionPrims.length >= 2, "región: al menos outer + inner");
const regionDoc = {
  entities: [region],
  meta: { unit: "mm" },
  layers: [{ name: "0", color: 7, linetype: "Continuous" }],
  modelSpace: "ms",
  blocks: [],
  imageDefinitions: [],
} as unknown as CadDocument;
const regionLosses = cadDocumentDxfExportLosses(regionDoc);
assert.equal(regionLosses.filter((l) => l.code === "dxf_export_region_as_contours").length, 1, "una warning región");

console.log("dxf-solid3d-export.spec.ts OK");
