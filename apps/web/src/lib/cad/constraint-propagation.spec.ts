/** Propagación de restricciones en la frontera de commit (Ola integridad). */
import assert from "node:assert/strict";
import type { CadDocument } from "./cad-document";
import { propagateCadConstraints } from "./constraint-propagation";

const doc = (overrides: Partial<CadDocument>): CadDocument => ({
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  entities: [],
  history: [],
  modelSpace: { entityIds: [] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
  ...overrides,
});

// Sin restricciones: la ENTRADA se devuelve por referencia, coste O(1).
const empty = doc({
  entities: [
    { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
  ],
  modelSpace: { entityIds: ["a"] },
});
const untouched = propagateCadConstraints(empty, ["a"]);
assert.equal(untouched.document, empty, "sin restricciones devuelve la referencia de entrada");
assert.deepEqual(untouched.movedEntityIds, []);

// Restricciones que no tocan lo mutado: también referencia intacta.
const disjoint = doc({
  entities: [
    { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
    { id: "b", type: "line", start: { x: 0, y: 5, z: 0 }, end: { x: 10, y: 5, z: 0 }, layer: "0" },
    { id: "c", type: "line", start: { x: 0, y: 9, z: 0 }, end: { x: 10, y: 9, z: 0 }, layer: "0" },
  ],
  modelSpace: { entityIds: ["a", "b", "c"] },
  constraints: [
    { id: "k1", kind: "parallel", entityIds: ["a", "b"], enabled: true },
  ],
});
const unrelated = propagateCadConstraints(disjoint, ["c"]);
assert.equal(unrelated.document, disjoint, "restricciones ajenas a lo mutado no disparan el solver");

// Lo mutado participa en una restricción: el solver corre, ancla lo mutado y
// mueve a su pareja; la pareja se reporta en movedEntityIds.
const linked = doc({
  entities: [
    { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
    // El usuario acaba de mover `b`: su inicio ya no coincide con el fin de `a`.
    { id: "b", type: "line", start: { x: 12, y: 2, z: 0 }, end: { x: 20, y: 0, z: 0 }, layer: "0" },
  ],
  modelSpace: { entityIds: ["a", "b"] },
  constraints: [
    { id: "k1", kind: "coincident", entityIds: ["a", "b"], anchors: ["end", "start"], enabled: true },
  ],
});
const propagated = propagateCadConstraints(linked, ["b"]);
assert.notEqual(propagated.document, linked, "el residuo pendiente dispara el solver");
const lineA = propagated.document.entities.find((entity) => entity.id === "a");
const lineB = propagated.document.entities.find((entity) => entity.id === "b");
assert.ok(lineA && lineA.type === "line" && lineB && lineB.type === "line");
if (lineA && lineA.type === "line" && lineB && lineB.type === "line") {
  const dx = lineA.end.x - lineB.start.x;
  const dy = lineA.end.y - lineB.start.y;
  assert.ok(
    Math.hypot(dx, dy) < 1e-6,
    `la coincidencia se restaura (residuo ${Math.hypot(dx, dy)})`,
  );
  // Anclado lo que el usuario movió: `b` conserva su inicio.
  assert.ok(
    Math.hypot(lineB.start.x - 12, lineB.start.y - 2) < 1e-6,
    "lo recién movido queda anclado",
  );
}
assert.ok(
  propagated.movedEntityIds.includes("a"),
  "la pareja movida por el solver se reporta para la sincronización de escena",
);
assert.ok(
  !propagated.movedEntityIds.includes("b"),
  "lo ya tocado por la mutación no se duplica en el reporte",
);

// Restricción deshabilitada: no dispara el solver.
const disabled = doc({
  entities: linked.entities,
  modelSpace: { entityIds: ["a", "b"] },
  constraints: [
    { id: "k1", kind: "coincident", entityIds: ["a", "b"], anchors: ["end", "start"], enabled: false },
  ],
});
assert.equal(propagateCadConstraints(disabled, ["b"]).document, disabled);

console.log("constraint propagation specs passed");
