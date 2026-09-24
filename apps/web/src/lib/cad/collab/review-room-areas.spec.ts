import assert from "node:assert/strict";
import type { CadDocument } from "../cad-document";
import { cadPointInBoundary } from "../hatch-associativity";
import { projectCadPlan } from "./plan-projection";
import { cadReviewRoomAreas } from "./review-room-areas";

function wallRoom(): CadDocument {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({
    id, type: "wall" as const,
    start: { x: start[0], y: start[1], z: 0 },
    end: { x: end[0], y: end[1], z: 0 },
    thickness: 250, height: 2_400, layer: "0",
  });
  const entities: CadDocument["entities"] = [
    wall("sur", [0, 0], [5_000, 0]),
    wall("este", [5_000, 0], [5_000, 4_000]),
    wall("norte", [5_000, 4_000], [0, 4_000]),
    wall("oeste", [0, 4_000], [0, 0]),
    { id: "nombre", type: "text", x: 2_000, y: 1_500, text: "SALA", height: 180, layer: "0" },
    { id: "oculto", type: "mtext", insertion: { x: 2_000, y: 2_000, z: 0 }, text: "99 m²", layer: "OCULTA" },
  ];
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "OCULTA", name: "OCULTA", color: "#ff00ff", visible: false, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  };
}

const document = wallRoom();
const projection = projectCadPlan(document);
const areas = cadReviewRoomAreas(document, projection);
assert.equal(areas.length, 1, "four visible canonical walls enclose one room");
assert.equal(areas[0].axisArea, "20.00 m²", "axis area is calculated from wall geometry");
assert.equal(areas[0].clearArea, "17.81 m²", "clear area accounts for wall thickness");
assert.equal(areas[0].nameFromDocument, true, "the authored name will not be repeated");
assert.ok(cadPointInBoundary(areas[0].at, [
  { x: 0, y: 0 }, { x: 5_000, y: 0 }, { x: 5_000, y: 4_000 }, { x: 0, y: 4_000 },
]), "the area label belongs inside its room");

const annotated = wallRoom();
annotated.entities.push({
  id: "manual-area", type: "mtext", insertion: { x: 2_000, y: 2_000, z: 0 },
  text: "18\\Pm²", height: 160, layer: "0",
});
annotated.modelSpace.entityIds.push("manual-area");
assert.deepEqual(cadReviewRoomAreas(annotated, projectCadPlan(annotated)), [],
  "a visible, authored multiline MTEXT area must not be duplicated by an overlay");

const open = wallRoom();
open.modelSpace.entityIds = open.modelSpace.entityIds.filter((id) => id !== "norte");
assert.deepEqual(cadReviewRoomAreas(open, projectCadPlan(open)), [],
  "an open set of walls is not a room");

const rectangle = wallRoom();
rectangle.entities = [{
  id: "rectangulo", type: "polyline", layer: "0", closed: true,
  vertices: [
    { x: 0, y: 0, z: 0 }, { x: 5_000, y: 0, z: 0 },
    { x: 5_000, y: 4_000, z: 0 }, { x: 0, y: 4_000, z: 0 },
  ],
}];
rectangle.modelSpace.entityIds = ["rectangulo"];
assert.deepEqual(cadReviewRoomAreas(rectangle, projectCadPlan(rectangle)), [],
  "RECTANG is a closed figure, not a canonical wall room");

assert.deepEqual(cadReviewRoomAreas(document, projectCadPlan(document, 2)), [],
  "a truncated guest plan does not claim an area for walls it may not show");

const feet = wallRoom();
feet.meta.unit = "ft";
for (const entity of feet.entities) {
  if (entity.type !== "wall") continue;
  entity.start.x /= 304.8;
  entity.start.y /= 304.8;
  entity.end.x /= 304.8;
  entity.end.y /= 304.8;
  entity.thickness /= 304.8;
  entity.height /= 304.8;
}
const feetAreas = cadReviewRoomAreas(feet, projectCadPlan(feet));
assert.equal(feetAreas[0]?.axisArea, "20.00 m²",
  "a room drawn in feet is converted to m² before review, not labelled ft²");

const unknownUnit = wallRoom();
unknownUnit.meta.unit = "unknown";
assert.deepEqual(cadReviewRoomAreas(unknownUnit, projectCadPlan(unknownUnit)), [],
  "an undeclared measurement system cannot be presented as a room area");

console.log("ok review-room-areas: canonical walls, units, annotations, visibility and missing walls");
