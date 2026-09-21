import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity, type CadLayerDef } from "./cad-document";
import { executeCadEntityCommandBatch } from "./entity-commands";

const layer = (id: string, name: string): CadLayerDef => ({ id, name, color: "#ffffff", visible: true, locked: false });
const line = (id: string, layerId: string): CadEntity => ({
  id, type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: layerId,
});
const base = migrateCadDocument({
  meta: { version: 1, schema: 4, unit: "mm" },
  layers: [layer("0", "0"), layer("id-src", "Origen"), layer("id-dst", "Destino")],
  entities: [line("modelo", "id-src"), line("destino", "id-dst")],
});
const rich: CadDocument = {
  ...base,
  blocks: [{ id: "bloque", name: "BLOQUE", basePoint: { x: 0, y: 0, z: 0 }, version: 1, entities: [line("interior", "id-src")] }],
  unsupportedEntities: [{ id: "opaco", provider: "fixture", sourceType: "proxy", raw: "preservado", editable: false, layer: "id-src" }],
  paperSpaces: [{
    id: "hoja", name: "Hoja", entityIds: [], page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
    viewports: [{
      id: "vp", paperBounds: { x: 0, y: 0, width: 100, height: 80 }, modelBounds: { x: 0, y: 0, width: 10, height: 8 }, scale: 1, locked: false,
      layerVisibility: { "id-src": false, "id-dst": true },
      layerOverrides: { "id-src": { color: "#ff0000" } },
    }],
  }],
};
const sourceBytes = JSON.stringify(rich);
const deleted = executeCadEntityCommandBatch(rich, [{ type: "layer", op: "delete", name: "origen", reassignTo: " DESTINO " }], "Reasignar capas").document;
assert.equal(deleted.meta.version, rich.meta.version + 1, "una sola transacción y versión");
assert.equal(JSON.stringify(rich), sourceBytes, "no muta el checkpoint original");
assert.equal(deleted.entities.find((entity) => entity.id === "modelo")?.layer, "id-dst");
assert.equal(deleted.blocks[0].entities[0].layer, "id-dst");
assert.equal(deleted.unsupportedEntities[0].layer, "id-dst");
assert.equal(deleted.unsupportedEntities[0].raw, "preservado", "payload opaco intacto");
assert.deepEqual(deleted.paperSpaces[0].viewports?.[0].layerVisibility, { "id-dst": true }, "la preferencia del destino existente prevalece");
assert.deepEqual(deleted.paperSpaces[0].viewports?.[0].layerOverrides, { "id-dst": { color: "#ff0000" } });
assert.ok(!deleted.layers.some((entry) => entry.id === "id-src"));

// Renombrar conserva la identidad; actualizar por nombre heredado tampoco la reemplaza.
const renamed = executeCadEntityCommandBatch(base, [{ type: "layer", op: "upsert", layer: layer("id-src", "Nombre nuevo") }], "Renombrar capa").document;
assert.equal(renamed.layers.length, base.layers.length);
assert.equal(renamed.layers.find((entry) => entry.id === "id-src")?.name, "Nombre nuevo");
assert.equal(renamed.entities.find((entity) => entity.id === "modelo")?.layer, "id-src");
const byName = executeCadEntityCommandBatch(base, [{ type: "layer", op: "upsert", layer: { ...layer("slug-derivado", "ORIGEN"), visible: false } }], "Actualizar capa").document;
assert.equal(byName.layers.find((entry) => entry.name === "ORIGEN")?.id, "id-src");
assert.equal(byName.entities.find((entity) => entity.id === "modelo")?.layer, "id-src");
assert.throws(() => executeCadEntityCommandBatch(base, [{ type: "layer", op: "upsert", layer: layer("id-src", "Destino") }], "Colisión de nombre"), /otra capa/u);
assert.throws(() => executeCadEntityCommandBatch(base, [{ type: "layer", op: "delete", name: "Origen", reassignTo: "origen" }], "Borrado circular"), /distinta/u);
assert.throws(() => executeCadEntityCommandBatch(base, [{ type: "layer", op: "delete", name: "0", reassignTo: "Destino" }], "Borrado de cero"), /no se puede borrar/u);

// Dos borrados en el mismo lote respetan la cadena también fuera de modelo.
const chained = executeCadEntityCommandBatch(rich, [
  { type: "layer", op: "delete", name: "Origen", reassignTo: "Destino" },
  { type: "layer", op: "delete", name: "Destino", reassignTo: "0" },
], "Dos reasignaciones").document;
assert.ok(chained.entities.every((entity) => entity.layer === "0"));
assert.equal(chained.blocks[0].entities[0].layer, "0");
assert.equal(chained.unsupportedEntities[0].layer, "0");
assert.deepEqual(chained.paperSpaces[0].viewports?.[0].layerOverrides, { "0": { color: "#ff0000" } });
assert.equal(chained.meta.version, rich.meta.version + 1);

// La última capa vacía se puede retirar; un uso sólo dentro de bloque/opaco
// sigue siendo un uso. El lote completo, no el checkpoint previo, decide.
const lastLayer: CadDocument = { ...base, layers: [layer("id-src", "Origen")], entities: [], blocks: [], modelSpace: { entityIds: [] } };
const removeLast = { type: "layer", op: "delete", name: "Origen", reassignTo: "Origen" } as const;
assert.equal(executeCadEntityCommandBatch(lastLayer, [removeLast], "Purgar última capa").document.layers.length, 0);
assert.throws(() => executeCadEntityCommandBatch({ ...lastLayer, blocks: rich.blocks }, [removeLast], "Con bloque"), /distinta/u);
assert.throws(() => executeCadEntityCommandBatch({ ...lastLayer, unsupportedEntities: rich.unsupportedEntities }, [removeLast], "Con opaco"), /distinta/u);
const stripped = executeCadEntityCommandBatch({ ...lastLayer, blocks: rich.blocks }, [
  { type: "block", op: "delete", blockId: "bloque" }, removeLast,
], "Desligar último bloque").document;
assert.equal(stripped.layers.length, 0);
assert.equal(stripped.blocks.length, 0);
console.log("entity-command-tables: ID estable al renombrar, reasignación atómica de modelo/bloques/opacos/ventanas, destino existente preservado y borrados inválidos rechazados");
