import assert from "node:assert/strict";
import {
  CAD_ENTITY_REGISTRY,
  CadSceneSynchronizer,
  CadSpatialIndex,
  executeCadEntityCommand,
  type CadNativeEntity,
} from "./entity-runtime";
import { migrateCadDocument, type CadDocument } from "./cad-document";

const arc: Extract<CadNativeEntity, { type: "arc" }> = {
  id: "arc-1",
  type: "arc",
  center: { x: 100, y: 100, z: 0 },
  radius: 50,
  startAngle: 0,
  endAngle: 180,
  layer: "CURVES",
  context: {
    businessLink: { tenantId: "tenant-a", entityType: "asset", entityId: "A-1" },
  },
};
const ellipse: Extract<CadNativeEntity, { type: "ellipse" }> = {
  id: "ellipse-1",
  type: "ellipse",
  center: { x: 300, y: 200, z: 0 },
  majorAxis: { x: 80, y: 0, z: 0 },
  ratio: 0.5,
  startParameter: 0,
  endParameter: 360,
  layer: "CURVES",
};
const spline: Extract<CadNativeEntity, { type: "spline" }> = {
  id: "spline-1",
  type: "spline",
  degree: 2,
  controlPoints: [
    { x: 0, y: 0, z: 0 },
    { x: 50, y: 80, z: 0 },
    { x: 100, y: 0, z: 0 },
  ],
  knots: [0, 0, 0, 1, 1, 1],
  layer: "CURVES",
};
const document: CadDocument = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: "mm" },
  entities: [arc, ellipse, spline],
});

const arcRuntime = CAD_ENTITY_REGISTRY.adapter(arc);
assert.equal(arcRuntime.hitTester.hitTest(arc, { x: 100, y: 150 }, 0.5), true);
assert.equal(arcRuntime.hitTester.hitTest(arc, { x: 100, y: 100 }, 1), false);
assert.deepEqual(
  arcRuntime.bounds.bounds(arc),
  { minX: 50, minY: 100, maxX: 150, maxY: 150 },
);
assert.equal(
  arcRuntime.hitTester.intersectsWindow(
    arc,
    { minX: 40, minY: 90, maxX: 160, maxY: 160 },
    false,
  ),
  true,
);
assert.ok(arcRuntime.snaps.snaps(arc, { x: 200, y: 100 }).some((snap) => snap.kind === "tangent"));
assert.ok(arcRuntime.grips.grips(arc).some((grip) => grip.id === "center"));

const resizedArc = arcRuntime.grips.moveGrip(arc, "quadrant:90", {
  x: 100,
  y: 175,
});
assert.equal(resizedArc.radius, 75);

const changed = executeCadEntityCommand(document, {
  type: "properties",
  entityId: arc.id,
  patch: { radius: 75, startAngle: 15 },
});
const changedArc = changed.document.entities.find((entity) => entity.id === arc.id);
assert.equal(changedArc?.type, "arc");
if (changedArc?.type === "arc") {
  assert.equal(changedArc.radius, 75);
  assert.equal(changedArc.startAngle, 15);
}
assert.equal(changed.document.meta.version, document.meta.version + 1);

const copied = executeCadEntityCommand(changed.document, {
  type: "copy",
  entityId: arc.id,
  newEntityId: "arc-copy",
  offset: { x: 25, y: -10 },
});
const copiedArc = copied.document.entities.find((entity) => entity.id === "arc-copy");
assert.equal(copiedArc?.type, "arc");
if (copiedArc?.type === "arc") {
  assert.deepEqual(copiedArc.center, { x: 125, y: 90, z: 0 });
  assert.deepEqual(copiedArc.context?.businessLink, arc.context?.businessLink);
}

const ellipseRuntime = CAD_ENTITY_REGISTRY.adapter(ellipse);
assert.equal(
  ellipseRuntime.hitTester.hitTest(ellipse, { x: 380, y: 200 }, 0.5),
  true,
);
const ellipseProps = ellipseRuntime.properties.write(ellipse, {
  centerX: 320,
  ratio: 0.25,
});
assert.equal(ellipseProps.center.x, 320);
assert.equal(ellipseProps.ratio, 0.25);

const splineRuntime = CAD_ENTITY_REGISTRY.adapter(spline);
const editedSpline = splineRuntime.grips.moveGrip(spline, "control:1", {
  x: 50,
  y: 120,
});
assert.equal(editedSpline.controlPoints[1].y, 120);
assert.equal(
  splineRuntime.hitTester.hitTest(spline, { x: 50, y: 40 }, 30),
  true,
);

const index = new CadSpatialIndex(100);
index.upsert("arc", arcRuntime.bounds.bounds(arc));
index.upsert("ellipse", ellipseRuntime.bounds.bounds(ellipse));
assert.deepEqual(
  index.search({ minX: 90, minY: 90, maxX: 110, maxY: 160 }),
  ["arc"],
);
assert.equal(index.bounds("ellipse")?.maxX, 380);

type Projection = { id: string; revision: number };
const removed: string[] = [];
const synchronizer = new CadSceneSynchronizer<Projection>();
const sink = {
  create: (entity: CadNativeEntity): Projection => ({ id: entity.id, revision: 1 }),
  update: (entity: CadNativeEntity, projection: Projection): Projection => ({
    id: entity.id,
    revision: projection.revision + 1,
  }),
  remove: (id: string) => {
    removed.push(id);
  },
};
assert.deepEqual(synchronizer.sync(document, sink), {
  created: 3,
  updated: 0,
  removed: 0,
  unchanged: 0,
  total: 3,
});
assert.equal(synchronizer.sync(document, sink).unchanged, 3);
assert.equal(synchronizer.sync(changed.document, sink).updated, 1);
const patchedArc = {
  ...arc,
  radius: 90,
};
assert.deepEqual(
  synchronizer.applyPatch({ upsert: [patchedArc], remove: [] }, sink),
  {
    created: 0,
    updated: 1,
    removed: 0,
    unchanged: 0,
    total: 3,
  },
);
assert.equal(synchronizer.spatialIndex.bounds(arc.id)?.maxX, 190);
const deleted = executeCadEntityCommand(changed.document, {
  type: "delete",
  entityId: spline.id,
});
assert.equal(synchronizer.sync(deleted.document, sink).removed, 1);
assert.deepEqual(removed, ["spline-1"]);

console.log("cad native entity runtime specs passed");
