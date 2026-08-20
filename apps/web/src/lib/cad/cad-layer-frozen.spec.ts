/**
 * Semántica de la capa CONGELADA (esquema 9): ni se dibuja, ni cuenta.
 *
 * Cuatro afirmaciones, cada una contra el consumidor REAL de la regla y no
 * contra la regla en el vacío:
 *
 *   1. `cad-layer-visibility.ts`: congelada y apagada ocultan, pero sólo la
 *      congelada entra en el conjunto de la selección/enganche.
 *   2. `view/document-extents.ts`: una capa congelada no arrastra la
 *      envolvente — `ZOOM Extensión` encuadra lo que se ve.
 *   3. `paper-space.ts`: la publicación no proyecta la capa congelada, y la
 *      anulación por VENTANA (`layerVisibility`) manda en ambos sentidos:
 *      `false` congela en esa ventana una capa viva (VP freeze) y `true`
 *      descongela en esa ventana una capa congelada del documento.
 *   4. `native-selection-index.ts`: lo congelado no sale de `search` ni de
 *      `hitTest`; lo APAGADO sí sigue saliendo, porque siempre salió y esta
 *      ola no cambia ese contrato.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadLayerDef } from "./cad-document";
import {
  cadFrozenLayerIds,
  cadHiddenLayerIds,
  cadLayerShown,
} from "./cad-layer-visibility";
import { cadDocumentExtents } from "./view/document-extents";
import { buildCadPublishPlan, createCadPaperSpace } from "./paper-space";
import { CadNativeSelectionIndex } from "./native-selection-index";

const layers: CadLayerDef[] = [
  { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
  { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
  { id: "MEP", name: "MEP", color: "#00ff00", visible: true, locked: false, frozen: true },
  { id: "EJES", name: "EJES", color: "#00ffff", visible: false, locked: false },
];

function documento(): CadDocument {
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers,
    entities: [
      { id: "muro", type: "line", layer: "MUROS", start: { x: 0, y: 0, z: 0 }, end: { x: 1_000, y: 0, z: 0 } },
      // La geometría MEP está deliberadamente LEJOS: si la envolvente la
      // contara, el encuadre se iría hasta x=50.000 y se notaría.
      { id: "tubo", type: "line", layer: "MEP", start: { x: 0, y: 0, z: 0 }, end: { x: 50_000, y: 0, z: 0 } },
      { id: "eje", type: "line", layer: "EJES", start: { x: 0, y: 500, z: 0 }, end: { x: 1_000, y: 500, z: 0 } },
    ],
    history: [],
    modelSpace: { entityIds: ["muro", "tubo", "eje"] },
    paperSpaces: [
      createCadPaperSpace({
        id: "lamina",
        name: "Lámina",
        order: 0,
        paper: "A3",
        modelBounds: { x: 0, y: 0, width: 1_000, height: 600 },
        metadata: {
          project: "-", drawingNumber: "-", title: "Lámina", sheetNumber: "1",
          revision: "-", discipline: "General",
        },
      }),
    ],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

// --- 1. la regla: congelada ≠ apagada ----------------------------------------
{
  assert.equal(cadLayerShown(layers[1]), true, "una capa viva se enseña");
  assert.equal(cadLayerShown(layers[2]), false, "la congelada no se enseña");
  assert.equal(cadLayerShown(layers[3]), false, "la apagada tampoco");
  assert.deepEqual([...cadHiddenLayerIds(layers)].sort(), ["EJES", "MEP"], "ocultas = apagadas + congeladas");
  assert.deepEqual([...cadFrozenLayerIds(layers)], ["MEP"], "pero congeladas es el conjunto pequeño");
}

// --- 2. extensión: lo congelado no arrastra el encuadre ----------------------
{
  const bounds = cadDocumentExtents(documento());
  assert.ok(bounds, "hay envolvente");
  assert.equal(bounds!.maxX, 1_000, "el tubo congelado en x=50.000 NO entra en la extensión");
}

// --- 3. publicación: la ventana manda en los dos sentidos --------------------
{
  const base = documento();
  const plan = buildCadPublishPlan(base);
  const ids = plan.sheets[0].viewports[0].commands.map((command) => command.entityId);
  assert.ok(ids.includes("muro"), "la capa viva se proyecta");
  assert.ok(!ids.includes("tubo"), "la capa congelada no se proyecta");
  assert.ok(!ids.includes("eje"), "la apagada tampoco (comportamiento de siempre)");

  // Anulación por ventana: `true` descongela SÓLO en esa ventana…
  const thawed = documento();
  thawed.paperSpaces[0].viewports![0].layerVisibility = { MEP: true };
  const thawedIds = buildCadPublishPlan(thawed).sheets[0].viewports[0].commands.map((c) => c.entityId);
  assert.ok(thawedIds.includes("tubo"), "layerVisibility[MEP]=true la descongela en la ventana");

  // …y `false` es el VP freeze de una capa viva.
  const vpFrozen = documento();
  vpFrozen.paperSpaces[0].viewports![0].layerVisibility = { MUROS: false };
  const vpIds = buildCadPublishPlan(vpFrozen).sheets[0].viewports[0].commands.map((c) => c.entityId);
  assert.ok(!vpIds.includes("muro"), "layerVisibility[MUROS]=false congela sólo esa ventana");
}

// --- 4. selección y enganche: congelada no cuenta, apagada sí ----------------
{
  const doc = documento();
  const index = new CadNativeSelectionIndex();
  index.replace(doc.entities as never, doc);
  const everywhere = { minX: -1, minY: -1_000, maxX: 60_000, maxY: 1_000 };
  const found = index.search(everywhere).map((entity) => entity.id).sort();
  assert.deepEqual(found, ["eje", "muro"], "search salta lo congelado y conserva lo apagado");
  assert.equal(
    index.hitTest({ x: 25_000, y: 0 }, 5).length,
    0,
    "no se puede designar lo que está congelado",
  );
  assert.ok(
    index.hitTest({ x: 500, y: 0 }, 5).some((entity) => entity.id === "muro"),
    "lo vivo se designa igual que siempre",
  );
  // Descongelar por parche recupera la entidad sin reconstruir el índice.
  const thawedDoc = {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === "MEP" ? { ...layer, frozen: false } : layer)),
  } as CadDocument;
  index.applyPatch({ upsert: [], remove: [] }, thawedDoc);
  assert.ok(
    index.search(everywhere).some((entity) => entity.id === "tubo"),
    "descongelar devuelve la capa al índice",
  );
}

console.log(
  "capa congelada (esquema 9): regla única, extensión sin lo congelado, publicación con anulación por ventana " +
    "en ambos sentidos y selección/enganche que salta lo congelado sin tocar el contrato de lo apagado",
);
