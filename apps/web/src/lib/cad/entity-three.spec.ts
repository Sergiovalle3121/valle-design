import assert from "node:assert/strict";
import {
  buildCadInsertBatchObject,
  buildCadNativeOverviewObject,
  buildCadNativeObject,
  disposeCadNativeObject,
  setCadInsertBatchHiddenLayers,
  setCadNativeOverviewHiddenLayers,
  setCadNativeObjectSelected,
  updateCadNativeOverviewObject,
} from "./entity-three";
import type { BufferAttribute } from "three";
import type { CadNativeEntity } from "./entity-runtime";
import type { CadDocument } from "./cad-document";

const arc: Extract<CadNativeEntity, { type: "arc" }> = {
  id: "arc-render",
  type: "arc",
  center: { x: 500, y: 500, z: 0 },
  radius: 200,
  startAngle: 0,
  endAngle: 180,
  layer: "CURVES",
};
const object = buildCadNativeObject(
  arc,
  { scale: 0.01, width: 1_000, height: 1_000 },
  false,
);
assert.equal(object.userData.nativeEntityId, arc.id);
assert.ok(object.children.some((child) => child.userData.nativePath));
assert.ok(object.children.some((child) => child.userData.nativeGrip));
assert.equal(
  object.children
    .filter((child) => child.userData.nativeGrip)
    .every((child) => !child.visible),
  true,
);
setCadNativeObjectSelected(object, true);
assert.equal(
  object.children
    .filter((child) => child.userData.nativeGrip)
    .every((child) => child.visible),
  true,
);
disposeCadNativeObject(object);

const hatch: Extract<CadNativeEntity, { type: "hatch" }> = {
  id: "hatch-render",
  type: "hatch",
  pattern: "SOLID",
  solid: true,
  boundaries: [
    [
      { x: 100, y: 100, z: 0 },
      { x: 900, y: 100, z: 0 },
      { x: 900, y: 900, z: 0 },
      { x: 100, y: 900, z: 0 },
    ],
  ],
  layer: "AREAS",
};
const hatchObject = buildCadNativeObject(
  hatch,
  { scale: 0.01, width: 1_000, height: 1_000 },
  false,
);
assert.ok(
  hatchObject.children.some((child) => child.userData.nativeFill),
  "solid hatch has a real fill mesh",
);
assert.ok(
  hatchObject.children.some((child) => child.userData.nativePath),
  "solid hatch keeps its editable outline",
);
setCadNativeObjectSelected(hatchObject, true);
const hatchFill = hatchObject.children.find(
  (child) => child.userData.nativeFill,
);
assert.equal(hatchFill?.userData.nativeEntityId, hatch.id);
disposeCadNativeObject(hatchObject);

const overviewArc = { ...arc, id: "arc-overview" };
const overview = buildCadNativeOverviewObject(
  [overviewArc, hatch],
  { scale: 0.01, width: 1_000, height: 1_000 },
  4,
);
assert.equal(overview.userData.nativeOverview, true);
assert.equal(overview.userData.nativeOverviewEntities, 2);
assert.equal(overview.geometry.getAttribute("position").count, 16);
const beforeOverview = [...overview.geometry.getAttribute("position").array];
const movedOverviewArc = {
  ...overviewArc,
  center: { ...overviewArc.center, x: overviewArc.center.x + 50 },
};
assert.equal(
  updateCadNativeOverviewObject(overview, {
    upsert: [movedOverviewArc],
    remove: [],
  }),
  true,
);
const updatedAttribute = overview.geometry.getAttribute(
  "position",
) as BufferAttribute;
assert.equal(updatedAttribute.updateRanges.length, 1);
assert.equal(updatedAttribute.updateRanges[0]?.count, 24);
assert.notDeepEqual(
  [...overview.geometry.getAttribute("position").array],
  beforeOverview,
);
assert.equal(
  updateCadNativeOverviewObject(overview, {
    upsert: [{ ...overviewArc, id: "new-arc" }],
    remove: [],
  }),
  false,
);
assert.equal(
  updateCadNativeOverviewObject(overview, {
    upsert: [],
    remove: [hatch.id],
  }),
  true,
);
assert.equal(
  [...overview.geometry.getAttribute("position").array]
    .slice(24)
    .every((value) => value === 0),
  true,
);
setCadNativeOverviewHiddenLayers(overview, new Set([overviewArc.layer]));
assert.equal(
  [...overview.geometry.getAttribute("position").array]
    .slice(0, 24)
    .every((value) => value === 0),
  true,
);
setCadNativeOverviewHiddenLayers(overview, new Set());
assert.equal(
  [...overview.geometry.getAttribute("position").array]
    .slice(0, 24)
    .some((value) => value !== 0),
  true,
);
disposeCadNativeObject(overview);

const blockDocument: CadDocument = {
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [
    { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
  ],
  entities: Array.from(
    { length: 1_000 },
    (_, index): Extract<CadNativeEntity, { type: "insert" }> => ({
      id: `insert-${index}`,
      type: "insert",
      block: "symbol",
      insertion: { x: index * 20, y: 100, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      layer: "0",
    }),
  ),
  history: [],
  modelSpace: {
    entityIds: Array.from({ length: 1_000 }, (_, index) => `insert-${index}`),
  },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [
    {
      id: "symbol",
      name: "SYMBOL",
      basePoint: { x: 0, y: 0, z: 0 },
      entities: [
        {
          id: "symbol-line",
          type: "line",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 10, y: 0, z: 0 },
          layer: "0",
        },
      ],
    },
  ],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};
const insertBatches = buildCadInsertBatchObject(blockDocument, {
  scale: 0.01,
  width: 20_000,
  height: 1_000,
});
assert.equal(insertBatches.userData.nativeBlockBatchInstances, 1_000);
assert.equal(insertBatches.userData.nativeBlockBatchDrawCalls, 1);
assert.equal(insertBatches.userData.nativeBlockBatchBaseSegments, 1);
assert.equal(
  insertBatches.children.length,
  1,
  "1,000 repeated symbols share one LineSegments draw call",
);
const instancedGeometry = (
  insertBatches.children[0] as import("three").LineSegments
).geometry as import("three").InstancedBufferGeometry;
assert.equal(instancedGeometry.instanceCount, 1_000);
assert.equal(
  instancedGeometry.getAttribute("position").count,
  2,
  "base geometry is uploaded once",
);
setCadInsertBatchHiddenLayers(insertBatches, new Set(["0"]));
assert.equal(insertBatches.children[0].visible, false);
setCadInsertBatchHiddenLayers(insertBatches, new Set());
assert.equal(insertBatches.children[0].visible, true);
disposeCadNativeObject(insertBatches);

// --- origen flotante: el mismo INSERT, con y sin origen, difiere EXACTO ----
// `instanceTranslate` es la traslación ABSOLUTA de cada INSERT — el punto de
// fuga real de las coordenadas grandes (ver `render-origin.ts`). Con origen,
// tiene que valer exactamente `e - origin.x, f - origin.y`; sin origen, el
// comportamiento de siempre. Las dos construcciones comparten `cadCenter`
// (width/2, height/2) sin cambiar: la resta del origen ya redujo el número
// ANTES de llegar al Float32Array, así que el uniforme no tiene por qué saber
// que existe.
const originShift = { x: 3_333, y: -777 };
const insertBatchesShifted = buildCadInsertBatchObject(blockDocument, {
  scale: 0.01,
  width: 20_000,
  height: 1_000,
  origin: originShift,
});
const translatePlain = (
  (insertBatches.children[0] as import("three").LineSegments)
    .geometry as import("three").InstancedBufferGeometry
).getAttribute("instanceTranslate") as BufferAttribute;
const translateShifted = (
  (insertBatchesShifted.children[0] as import("three").LineSegments)
    .geometry as import("three").InstancedBufferGeometry
).getAttribute("instanceTranslate") as BufferAttribute;
for (let index = 0; index < 5; index += 1) {
  assert.ok(
    Math.abs(
      translateShifted.array[index * 2]! -
        (translatePlain.array[index * 2]! - originShift.x),
    ) < 1e-3,
    `instanceTranslate.x del insert ${index}: el origen se resta exacto`,
  );
  assert.ok(
    Math.abs(
      translateShifted.array[index * 2 + 1]! -
        (translatePlain.array[index * 2 + 1]! - originShift.y),
    ) < 1e-3,
    `instanceTranslate.y del insert ${index}: el origen se resta exacto`,
  );
}
disposeCadNativeObject(insertBatchesShifted);

// --- origen flotante: buildCadNativeObject/scenePoint también lo respeta ---
const arcShifted = buildCadNativeObject(
  arc,
  { scale: 0.01, width: 1_000, height: 1_000, origin: { x: 200, y: -100 } },
  false,
);
const arcPlain = buildCadNativeObject(
  arc,
  { scale: 0.01, width: 1_000, height: 1_000 },
  false,
);
const pathPlain = arcPlain.children.find(
  (child) => child.userData.nativePath,
) as import("three").Line;
const pathShifted = arcShifted.children.find(
  (child) => child.userData.nativePath,
) as import("three").Line;
const posPlain = pathPlain.geometry.getAttribute("position") as BufferAttribute;
const posShifted = pathShifted.geometry.getAttribute(
  "position",
) as BufferAttribute;
// (origin.x, origin.y) en unidades de dibujo, ya escaladas — el mismo signo
// que resta `scenePoint`: escena = (mundo − origen − mitad) × escala.
assert.ok(
  Math.abs(posShifted.array[0]! - (posPlain.array[0]! - 200 * 0.01)) < 1e-6,
  "un origen en X desplaza la escena en X, escalado",
);
assert.ok(
  Math.abs(posShifted.array[2]! - (posPlain.array[2]! + 100 * 0.01)) < 1e-6,
  "un origen en Y desplaza la escena en Z (planta), escalado",
);
disposeCadNativeObject(arcPlain);
disposeCadNativeObject(arcShifted);

console.log("cad native Three.js renderer specs passed");
