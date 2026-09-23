import assert from "node:assert/strict";
import type { CadDocument } from "../cad-document";
import type { CadWallEntity } from "../cad-entities-v6";
import { cadPointInBoundary } from "../hatch-associativity";
import { cadRoomAreaLabels } from "./room-area-labels";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, thickness = 200): CadWallEntity => ({
  id, type: "wall", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 },
  thickness, height: 2400, layer: "MURO",
});
const shell = (width = 4000) => [
  wall("sur", 0, 0, width, 0), wall("este", width, 0, width, 3000),
  wall("norte", width, 3000, 0, 3000), wall("oeste", 0, 3000, 0, 0),
];
const document = (entities: CadDocument["entities"], unit = "mm") => ({
  meta: { version: 1, schema: 7, unit }, entities,
}) as Pick<CadDocument, "meta" | "entities">;

const closed = cadRoomAreaLabels(document(shell()));
assert.equal(closed.length, 1, "cuatro muros cerrados generan un cuarto");
assert.equal(closed[0].name, "Cuarto 1");
assert.equal(closed[0].nameFromDocument, false);
assert.equal(closed[0].axisAreaText, "12.00", "3 × 4 m se leen con dos decimales entre ejes");
assert.equal(closed[0].clearAreaText, "10.64", "el área útil no se confunde con la de ejes");
assert.ok(cadPointInBoundary(closed[0].at, [
  { x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 },
]), "el rótulo cae dentro del cuarto");

assert.deepEqual(cadRoomAreaLabels(document(shell().slice(0, 3))), [], "al abrir el contorno desaparece el área");
assert.equal(cadRoomAreaLabels(document(shell(5000)))[0].axisAreaText, "15.00", "mover el muro actualiza el área");
assert.equal(cadRoomAreaLabels(document(shell().map((part) => ({
  ...part,
  start: { ...part.start, x: part.start.x / 1000, y: part.start.y / 1000 },
  end: { ...part.end, x: part.end.x / 1000, y: part.end.y / 1000 },
  thickness: part.thickness / 1000,
  height: part.height / 1000,
})), "m"))[0].axisAreaText, "12.00", "la unidad del documento cambia sin falsear m²");
assert.deepEqual(cadRoomAreaLabels(document(shell(), "u")), [], "una unidad desconocida no se anuncia falsamente en m²");
assert.deepEqual(cadRoomAreaLabels(document(shell(), "constructor")), [], "tampoco se aceptan claves heredadas del prototipo");

const label = { id: "nombre", type: "text" as const, x: 2000, y: 1500,
  text: "RECÁMARA", height: 250, layer: "TEXTO" };
assert.equal(cadRoomAreaLabels(document([...shell(), label]))[0].name, "RECÁMARA", "el nombre viene del TEXT real");
assert.equal(cadRoomAreaLabels(document([...shell(), label]))[0].nameFromDocument, true);
assert.deepEqual(cadRoomAreaLabels(document([label])), [], "un texto de plantilla sin muros canónicos no inventa un área");

console.log("room-area-labels.spec: cuarto cerrado, apertura, edición, unidades y nombre OK");
