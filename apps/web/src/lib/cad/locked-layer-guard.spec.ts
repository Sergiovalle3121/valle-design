/** Guardia de capas bloqueadas para las puertas por documento (Ola integridad). */
import assert from "node:assert/strict";
import type { CadDocument, CadEntity } from "./cad-document";
import { assertCadLockedLayerInvariant } from "./locked-layer-guard";

type CadLine = Extract<CadEntity, { type: "line" }>;

const freeLine: CadLine = { id: "free", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" };
const frozenLine: CadLine = { id: "frozen", type: "line", start: { x: 0, y: 5, z: 0 }, end: { x: 10, y: 5, z: 0 }, layer: "L" };

const base: CadDocument = {
  meta: { version: 1, schema: 3, unit: "mm" },
  layers: [
    { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    { id: "L", name: "Locked", color: "#ff0000", visible: true, locked: true },
  ],
  entities: [freeLine, frozenLine],
  history: [],
  modelSpace: { entityIds: ["free", "frozen"] },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
};

// Sin capas bloqueadas: salida inmediata, cualquier mutación pasa.
const unlockedDoc: CadDocument = {
  ...base,
  layers: base.layers.map((layer) => ({ ...layer, locked: false })),
};
assert.doesNotThrow(() =>
  assertCadLockedLayerInvariant(unlockedDoc, { ...unlockedDoc, entities: [] }),
);

// Identidad por referencia: mutar SOLO lo no bloqueado pasa.
const movedFree: CadDocument = {
  ...base,
  entities: [{ ...freeLine, end: { x: 20, y: 0, z: 0 } }, frozenLine],
};
assert.doesNotThrow(() => assertCadLockedLayerInvariant(base, movedFree));

// Reconstrucción sin cambios (referencia distinta, mismo contenido) pasa:
// las rutinas que clonan el documento entero no deben ser rechazadas.
const rebuilt: CadDocument = {
  ...base,
  entities: base.entities.map((entity) => JSON.parse(JSON.stringify(entity))),
};
assert.doesNotThrow(() => assertCadLockedLayerInvariant(base, rebuilt));

// Editar una entidad de capa bloqueada: rechazo con mensaje accionable.
const editedLocked: CadDocument = {
  ...base,
  entities: [freeLine, { ...frozenLine, end: { x: 99, y: 5, z: 0 } }],
};
assert.throws(
  () => assertCadLockedLayerInvariant(base, editedLocked),
  /Layer L is locked\. Unlock it before editing frozen\./,
);

// Borrar una entidad de capa bloqueada: rechazo.
const deletedLocked: CadDocument = { ...base, entities: [freeLine] };
assert.throws(
  () => assertCadLockedLayerInvariant(base, deletedLocked),
  /Layer L is locked\. Unlock it before deleting frozen\./,
);

// Mover la entidad a OTRA capa también es editarla: rechazo.
const relayered: CadDocument = {
  ...base,
  entities: [freeLine, { ...frozenLine, layer: "0" }],
};
assert.throws(() => assertCadLockedLayerInvariant(base, relayered), /locked/);

// Crear entidades NUEVAS sobre la capa bloqueada se permite (semántica AutoCAD).
const created: CadDocument = {
  ...base,
  entities: [
    ...base.entities,
    { id: "new", type: "line", start: { x: 0, y: 9, z: 0 }, end: { x: 1, y: 9, z: 0 }, layer: "L" },
  ],
};
assert.doesNotThrow(() => assertCadLockedLayerInvariant(base, created));

// Cambiar la DEFINICIÓN de la capa (unlock) sin tocar entidades se permite:
// desbloquear es su propia transacción.
const unlockOnly: CadDocument = {
  ...base,
  layers: base.layers.map((layer) =>
    layer.id === "L" ? { ...layer, locked: false } : layer,
  ),
};
assert.doesNotThrow(() => assertCadLockedLayerInvariant(base, unlockOnly));

console.log("locked layer guard specs passed");
