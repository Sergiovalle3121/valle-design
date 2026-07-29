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

const mtext: Extract<CadNativeEntity, { type: "mtext" }> = {
  id: "mtext-1",
  type: "mtext",
  insertion: { x: 200, y: 300, z: 0 },
  text: "Nota de proceso\nSegunda lÃ­nea",
  width: 500,
  height: 50,
  rotation: 0,
  alignment: "top-left",
  paragraphAlignment: "left",
  lineSpacing: 1.2,
  layer: "TEXT",
};
const mtextRuntime = CAD_ENTITY_REGISTRY.adapter(mtext);
assert.equal(mtextRuntime.hitTester.hitTest(mtext, { x: 220, y: 280 }, 1), true);
assert.equal(mtextRuntime.grips.grips(mtext).length, 4);
const editedMtext = mtextRuntime.properties.write(mtext, {
  text: "Texto editado",
  width: 650,
  paragraphAlignment: "center",
  bold: true,
  columns: 2,
});
assert.equal(editedMtext.text, "Texto editado");
assert.equal(editedMtext.width, 650);
assert.equal(editedMtext.paragraphAlignment, "center");
assert.equal(editedMtext.bold, true);
assert.equal(editedMtext.columns, 2);
const movedMtext = mtextRuntime.grips.moveGrip(mtext, "insertion", { x: 250, y: 350 });
assert.deepEqual(movedMtext.insertion, { x: 250, y: 350, z: 0 });

const nativeLine: Extract<CadNativeEntity, { type: "line" }> = {
  id: "line-source",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 200, y: 0, z: 0 },
  layer: "GEOMETRY",
};
const nativeCircle: Extract<CadNativeEntity, { type: "circle" }> = {
  id: "circle-source",
  type: "circle",
  center: { x: 300, y: 300, z: 0 },
  radius: 75,
  layer: "GEOMETRY",
};
assert.equal(CAD_ENTITY_REGISTRY.adapter(nativeLine).hitTester.hitTest(nativeLine, { x: 100, y: 1 }, 2), true);
assert.equal(CAD_ENTITY_REGISTRY.adapter(nativeCircle).hitTester.hitTest(nativeCircle, { x: 375, y: 300 }, 0.1), true);
const associatedDimension: Extract<CadNativeEntity, { type: "dimension" }> = {
  id: "dimension-associated",
  type: "dimension",
  dimensionKind: "aligned",
  a: { x: 0, y: 0 },
  b: { x: 200, y: 0 },
  offset: 40,
  associative: true,
  references: [
    { entityId: nativeLine.id, anchor: "start" },
    { entityId: nativeLine.id, anchor: "end" },
  ],
  associationStatus: "associated",
  layer: "DIMENSIONS",
};
const dimensionDocument = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: "mm" },
  entities: [nativeLine, nativeCircle, associatedDimension],
});
const movedLineDocument = executeCadEntityCommand(dimensionDocument, {
  type: "transform",
  entityId: nativeLine.id,
  transform: { translation: { x: 25, y: 10 } },
});
const regeneratedDimension = movedLineDocument.document.entities.find((entity) => entity.id === associatedDimension.id);
assert.equal(regeneratedDimension?.type, "dimension");
if (regeneratedDimension?.type === "dimension") {
  assert.deepEqual(regeneratedDimension.a, { x: 25, y: 10, z: 0 });
  assert.deepEqual(regeneratedDimension.b, { x: 225, y: 10, z: 0 });
  assert.equal(regeneratedDimension.associationStatus, "associated");
}
const deletedLineDocument = executeCadEntityCommand(movedLineDocument.document, { type: "delete", entityId: nativeLine.id });
const brokenDimension = deletedLineDocument.document.entities.find((entity) => entity.id === associatedDimension.id);
assert.equal(brokenDimension?.type === "dimension" ? brokenDimension.associationStatus : null, "broken");

const associatedMleader: Extract<CadNativeEntity, { type: "mleader" }> = {
  id: "mleader-associated", type: "mleader", layer: "NOTES", text: "Inspect connection",
  vertices: [{ x: 100, y: 0, z: 0 }, { x: 260, y: 100, z: 0 }],
  leaderLines: [[{ x: 100, y: 0, z: 0 }, { x: 260, y: 100, z: 0 }]],
  textPosition: { x: 500, y: 100, z: 0 }, landing: true, arrowSize: 20,
  associative: true, references: [{ entityId: nativeLine.id, anchor: "center" }], associationStatus: "associated",
};
const mleaderRuntime = CAD_ENTITY_REGISTRY.adapter(associatedMleader);
assert.ok(mleaderRuntime.renderer.paths(associatedMleader).length >= 3);
assert.equal(mleaderRuntime.properties.read(associatedMleader).leaderLineCount, 1);
const mleaderDocument = migrateCadDocument({ meta: { version: 1, schema: 3, unit: "mm" }, entities: [nativeLine, associatedMleader] });
const stretchedLine = executeCadEntityCommand(mleaderDocument, { type: "properties", entityId: nativeLine.id, patch: { endX: 300 } });
const regeneratedMleader = stretchedLine.document.entities.find((entity) => entity.id === associatedMleader.id);
assert.equal(regeneratedMleader?.type, "mleader");
if (regeneratedMleader?.type === "mleader") {
  assert.deepEqual(regeneratedMleader.vertices[0], { x: 150, y: 0, z: 0 });
  assert.equal(regeneratedMleader.associationStatus, "associated");
}
const brokenMleaderDocument = executeCadEntityCommand(stretchedLine.document, { type: "delete", entityId: nativeLine.id });
assert.equal(brokenMleaderDocument.document.entities.find((entity) => entity.id === associatedMleader.id)?.type === "mleader"
  ? (brokenMleaderDocument.document.entities.find((entity) => entity.id === associatedMleader.id) as typeof associatedMleader).associationStatus
  : null, "broken");

const hatch: Extract<CadNativeEntity, { type: "hatch" }> = {
  id: "hatch-1",
  type: "hatch",
  pattern: "ANSI31",
  solid: false,
  boundaries: [
    [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 100, z: 0 },
      { x: 0, y: 100, z: 0 },
    ],
    [
      { x: 40, y: 40, z: 0 },
      { x: 60, y: 40, z: 0 },
      { x: 60, y: 60, z: 0 },
      { x: 40, y: 60, z: 0 },
    ],
  ],
  scale: 10,
  angle: 45,
  layer: "AREAS",
};
const hatchRuntime = CAD_ENTITY_REGISTRY.adapter(hatch);
assert.ok(hatchRuntime.renderer.paths(hatch).length > 2, "pattern renderer emits clipped strokes");
assert.equal(hatchRuntime.hitTester.hitTest(hatch, { x: 10, y: 10 }, 0.1), true);
assert.equal(hatchRuntime.hitTester.hitTest(hatch, { x: 50, y: 50 }, 0.1), false, "hole remains selectable as empty space");
assert.deepEqual(hatchRuntime.bounds.bounds(hatch), { minX: 0, minY: 0, maxX: 100, maxY: 100 });
assert.equal(hatchRuntime.snaps.snaps(hatch).length, 9);
const editedHatch = hatchRuntime.properties.write(hatch, { solid: true, angle: 30, scale: 20 });
assert.equal(editedHatch.solid, true);
assert.equal(editedHatch.pattern, "SOLID");
assert.equal(editedHatch.angle, 30);
assert.equal(editedHatch.scale, 20);
const movedHatch = hatchRuntime.grips.moveGrip(hatch, "boundary:0:vertex:0", { x: -10, y: -5 });
assert.deepEqual(movedHatch.boundaries[0][0], { x: -10, y: -5, z: 0 });
const hatchDocument = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: "mm" },
  entities: [hatch],
});
const rotatedHatch = executeCadEntityCommand(hatchDocument, {
  type: "transform",
  entityId: hatch.id,
  transform: { rotationDeg: 15, origin: { x: 50, y: 50 } },
});
const rotatedHatchEntity = rotatedHatch.document.entities[0];
assert.equal(rotatedHatchEntity.type, "hatch");
if (rotatedHatchEntity.type === "hatch") assert.equal(rotatedHatchEntity.angle, 60);

const associativeHatch: typeof hatch = {
  ...hatch,
  id: "hatch-associated",
  associative: true,
  boundaryRefs: [ellipse.id],
  associationStatus: "associated",
};
const associativeDocument = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: "mm" },
  entities: [ellipse, associativeHatch],
});
const movedBoundary = executeCadEntityCommand(associativeDocument, {
  type: "transform",
  entityId: ellipse.id,
  transform: { translation: { x: 50, y: 25 } },
});
const regeneratedHatch = movedBoundary.document.entities.find((entity) => entity.id === associativeHatch.id);
assert.ok(regeneratedHatch?.type === "hatch");
assert.equal(regeneratedHatch.associationStatus, "associated");
assert.ok(regeneratedHatch.boundaries[0].every((point) => point.x >= 170));
assert.ok(movedBoundary.affectedEntityIds.includes(associativeHatch.id));
const brokenBoundary = executeCadEntityCommand(movedBoundary.document, {
  type: "delete",
  entityId: ellipse.id,
});
const brokenHatch = brokenBoundary.document.entities.find((entity) => entity.id === associativeHatch.id);
assert.ok(brokenHatch?.type === "hatch" && brokenHatch.associationStatus === "broken");
const detachedHatchResult = executeCadEntityCommand(movedBoundary.document, {
  type: "hatch-association",
  entityId: associativeHatch.id,
  associative: false,
});
const detachedHatch = detachedHatchResult.document.entities.find((entity) => entity.id === associativeHatch.id);
assert.ok(detachedHatch?.type === "hatch" && detachedHatch.associationStatus === "detached" && detachedHatch.associative === false);

const index = new CadSpatialIndex(100);
index.upsert("arc", arcRuntime.bounds.bounds(arc));
index.upsert("ellipse", ellipseRuntime.bounds.bounds(ellipse));
assert.deepEqual(
  index.search({ minX: 90, minY: 90, maxX: 110, maxY: 160 }),
  ["arc"],
);
assert.deepEqual(
  index.search({ minX: -100_000, minY: -100_000, maxX: 100_000, maxY: 100_000 }),
  ["arc", "ellipse"],
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
