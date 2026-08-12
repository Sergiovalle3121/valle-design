/** GC transaccional de restricciones al borrar entidades (Ola integridad). */
import assert from "node:assert/strict";
import type { CadDocument, CadEntity } from "./cad-document";
import { executeCadEntityCommand, executeCadEntityCommandBatch } from "./entity-commands";

type CadLine = Extract<CadEntity, { type: "line" }>;

const lineC: CadLine = { id: "c", type: "line", start: { x: 0, y: 5, z: 0 }, end: { x: 10, y: 5, z: 0 }, layer: "0" };

const base: CadDocument = {
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  entities: [
    { id: "a", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
    { id: "b", type: "line", start: { x: 10, y: 0, z: 0 }, end: { x: 20, y: 0, z: 0 }, layer: "0" },
    lineC,
  ],
  history: [],
  modelSpace: { entityIds: ["a", "b", "c"] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [
    { id: "k-ab", kind: "coincident", entityIds: ["a", "b"], anchors: ["end", "start"], enabled: true },
    { id: "k-c", kind: "horizontal", entityIds: ["c"], enabled: true },
  ],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

// Borrar `a` retira en el MISMO lote la restricción que la referenciaba y
// conserva la ajena.
const deleted = executeCadEntityCommand(base, { type: "delete", entityId: "a" });
assert.ok(!deleted.document.entities.some((entity) => entity.id === "a"));
assert.deepEqual(
  deleted.document.constraints.map((constraint) => constraint.id),
  ["k-c"],
  "la restricción que referenciaba a la entidad borrada se retira en la misma transacción",
);

// En lote: borrar `a` y `b` retira `k-ab` una sola vez y no toca `k-c`.
const batch = executeCadEntityCommandBatch(
  base,
  [
    { type: "delete", entityId: "a" },
    { type: "delete", entityId: "b" },
  ],
  "delete:2",
);
assert.deepEqual(batch.document.constraints.map((constraint) => constraint.id), ["k-c"]);

// Sin borrados, la sección de restricciones queda intacta en contenido: el GC
// sólo filtra cuando el lote borró algo.
const moved = executeCadEntityCommand(base, {
  type: "replace",
  entityId: "c",
  entity: { ...lineC, end: { x: 12, y: 5, z: 0 } },
});
assert.deepEqual(moved.document.constraints, base.constraints);

console.log("entity commands constraint GC specs passed");
