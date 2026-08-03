import assert from "node:assert/strict";
import { importDxfPrimitives } from "./dxf-import";
import { exportCadDxf } from "./dxf-export";
import {
  cadEntityToDxfPrimitive,
  cadDxfPrimitivesToCanonicalEntities,
} from "./dxf-cad-document";
import type { CadEntity } from "./cad-document";

/**
 * Regresión P0 — el `bulge` sobrevive al round-trip DXF.
 *
 * Una polilínea con arcos se exportaba como cuerdas rectas (nunca se emitía
 * el código de grupo 42) y, al importar, el `bulge` de origen se descartaba.
 * La pérdida ocurría en AMBOS sentidos y era SILENCIOSA: el runtime dibujaba
 * los arcos bien, pero pasar por DXF los aplanaba.
 *
 * Interoperar con DXF sin deformar la geometría es el requisito competitivo
 * central, así que queda fijado con una prueba de ida y vuelta completa.
 */

type Polyline = Extract<CadEntity, { type: "polyline" }>;

// Semicírculo (bulge 1) seguido de un tramo recto.
const arcPolyline = {
  id: "pl-bulge",
  type: "polyline",
  vertices: [
    { x: 0, y: 0, z: 0, bulge: 1 },
    { x: 100, y: 0, z: 0 },
    { x: 160, y: 40, z: 0 },
  ],
  closed: false,
  layer: "0",
} as Polyline;

// --- 1. La entidad canónica produce una primitiva DXF con bulge -----------

const primitive = cadEntityToDxfPrimitive(arcPolyline);
assert.ok(primitive, "la polilínea debe mapear a una primitiva DXF");
assert.equal(primitive.kind, "polyline");
assert.equal(
  primitive.points[0].bulge,
  1,
  "el bulge debe conservarse al construir la primitiva DXF",
);
assert.equal(
  primitive.points[1].bulge,
  undefined,
  "un vértice recto no debe adquirir bulge",
);

// --- 2. El DXF exportado emite realmente el código de grupo 42 -------------

const dxf = exportCadDxf({ primitives: [primitive] }, { units: "mm" }).content;
assert.ok(dxf.includes("POLYLINE"), "debe existir una POLYLINE en el DXF");
assert.match(
  dxf,
  /\n\s*42\n\s*1(\.0+)?\s*\n/,
  "el DXF debe llevar el grupo 42 con el bulge; sin él el arco sale recto",
);

// --- 3. Reimportar recupera el arco, no una cuerda -------------------------

const reimported = importDxfPrimitives(dxf);
const reimportedPolyline = reimported.primitives.find(
  (item) => item.kind === "polyline" || item.kind === "rect",
);
assert.ok(reimportedPolyline, "la polilínea debe reimportarse");
assert.equal(
  reimportedPolyline.kind,
  "polyline",
  "una polilínea con arcos no debe degradarse a rect",
);
assert.equal(
  reimportedPolyline.points[0].bulge,
  1,
  "el bulge debe sobrevivir a exportar y volver a importar",
);

// --- 4. Round-trip completo hasta entidades canónicas ---------------------

const restored = cadDxfPrimitivesToCanonicalEntities(
  reimported.primitives,
).find((entity): entity is Polyline => entity.type === "polyline");

assert.ok(restored, "el viaje debe reconstruir una polilínea canónica");
assert.equal(
  restored.vertices[0].bulge,
  1,
  "el arco llega intacto a la entidad canónica",
);
assert.equal(
  restored.vertices.length,
  3,
  "no se pierden ni se duplican vértices en el viaje",
);
assert.equal(
  restored.vertices[1].bulge,
  undefined,
  "los segmentos rectos no deben adquirir un bulge espurio",
);

console.log("dxf-bulge-roundtrip.spec.ts OK");
