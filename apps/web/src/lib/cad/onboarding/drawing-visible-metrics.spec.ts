import assert from "node:assert/strict";
import type { CadDocument } from "../cad-document";
import type { CadWallEntity } from "../cad-entities-v6";
import type { CadOpeningEntity } from "../cad-entities-v7";
import { cadDrawingVisibleMetrics } from "./drawing-visible-metrics";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): CadWallEntity => ({
  id, type: "wall", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 },
  thickness: 200, height: 2400, layer: "MUROS",
});
const shell = (): CadWallEntity[] => [
  wall("sur", 0, 0, 4000, 0), wall("este", 4000, 0, 4000, 3000),
  wall("norte", 4000, 3000, 0, 3000), wall("oeste", 0, 3000, 0, 0),
];
const opening = (id: string, kind: "door" | "window", hostId: string): CadOpeningEntity => ({
  id, type: "opening", kind, hostId, position: 1500, width: kind === "door" ? 900 : 1200,
  height: kind === "door" ? 2100 : 1200, sill: kind === "door" ? 0 : 900,
  swing: "left", hinge: "start", layer: "MUROS",
});
const dimension = {
  id: "medida", type: "dimension" as const, a: { x: 0, y: 0 }, b: { x: 4000, y: 0 },
  dimensionKind: "aligned" as const, offset: 350, layer: "COTAS",
};
const doc = (entities: CadDocument["entities"], unit = "mm") => ({
  meta: { version: 1, schema: 7, unit }, entities,
}) as CadDocument;

assert.deepEqual(cadDrawingVisibleMetrics(null), { rooms: [], openings: null, dimensions: [] });
const empty = cadDrawingVisibleMetrics(doc([]));
assert.equal(empty.openings, null, "sin muros no se inventa un conteo de huecos");

const base = cadDrawingVisibleMetrics(doc(shell()));
assert.deepEqual(base.openings, { doors: 0, windows: 0 });
assert.equal(base.rooms[0].axisAreaText, "12.00");

const drawn = cadDrawingVisibleMetrics(doc([
  ...shell(), opening("puerta", "door", "sur"), opening("ventana", "window", "este"),
  opening("huérfana", "door", "inexistente"), dimension,
]));
assert.deepEqual(drawn.openings, { doors: 1, windows: 1 }, "solo se cuentan huecos que caben en un muro real");
assert.equal(drawn.dimensions.length, 1);
assert.equal(drawn.dimensions[0].text, "4.00 m", "la cota usa una longitud legible sin cambiar el dato CAD");
assert.ok(Number.isFinite(drawn.dimensions[0].at.x));

const customized = cadDrawingVisibleMetrics(doc([...shell(), { ...dimension, text: "EJE A" }]));
assert.equal(customized.dimensions.length, 0, "el rótulo del autor no se tapa con uno automático");
const reopened = cadDrawingVisibleMetrics(doc(shell().slice(0, 3)));
assert.equal(reopened.rooms.length, 0, "un cuarto abierto no anuncia metros cuadrados");

console.log("drawing-visible-metrics.spec: conteos válidos, cota legible y rótulos honestos OK");
