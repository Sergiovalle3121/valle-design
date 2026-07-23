/** Capas / LAYER (AXOS-CAD-DEPTH-B4). */
import { strict as assert } from "node:assert";
import {
  BY_LAYER,
  DEFAULT_LAYER_NAME,
  deleteLayer,
  effectiveColor,
  effectiveLinetype,
  effectiveLineweight,
  ensureLayer,
  filterVisibleEntities,
  isValidLayerName,
  layerEditable,
  layerVisible,
  makeLayer,
  makeLayerTable,
  setLayerState,
  visibleLayerNames,
} from "./layer";

// --- valores por defecto ---------------------------------------------------
const base = makeLayer("Muros");
assert.equal(base.color, 7, "color por defecto 7");
assert.equal(base.linetype, "CONTINUOUS", "tipo de línea por defecto");
assert.equal(base.lineweight, -1, "grosor por defecto -1");
assert.ok(base.on && !base.frozen && !base.locked, "encendida, no congelada, no bloqueada");
const custom = makeLayer("Ejes", { color: 1, linetype: "CENTER", locked: true });
assert.ok(custom.color === 1 && custom.linetype === "CENTER" && custom.locked, "overrides aplicados");

// --- visibilidad y edición -------------------------------------------------
assert.ok(layerVisible(base), "capa normal visible");
assert.ok(!layerVisible(makeLayer("x", { frozen: true })), "congelada no visible");
assert.ok(!layerVisible(makeLayer("x", { on: false })), "apagada no visible");
assert.ok(layerEditable(base), "capa normal editable");
assert.ok(!layerEditable(makeLayer("x", { locked: true })), "bloqueada no editable");
assert.ok(!layerEditable(makeLayer("x", { frozen: true })), "congelada no editable");

// --- herencia ByLayer ------------------------------------------------------
const layer = makeLayer("Cotas", { color: 5, linetype: "DASHED", lineweight: 0.25 });
assert.equal(effectiveColor(BY_LAYER, layer), 5, "color ByLayer toma el de la capa");
assert.equal(effectiveColor(3, layer), 3, "color explícito se respeta");
assert.equal(effectiveLinetype(BY_LAYER, layer), "DASHED", "tipo de línea ByLayer");
assert.equal(effectiveLinetype("HIDDEN", layer), "HIDDEN", "tipo de línea explícito");
assert.equal(effectiveLineweight(BY_LAYER, layer), 0.25, "grosor ByLayer");
assert.equal(effectiveLineweight(0.5, layer), 0.5, "grosor explícito");

// --- nombres válidos -------------------------------------------------------
assert.ok(isValidLayerName("Muros"), "nombre normal válido");
assert.ok(!isValidLayerName(""), "vacío inválido");
assert.ok(!isValidLayerName(" x"), "con espacios al borde inválido");
assert.ok(!isValidLayerName("a<b"), "carácter prohibido inválido");

// --- tabla de capas --------------------------------------------------------
let table = makeLayerTable([makeLayer("Muros")]);
assert.ok(table[DEFAULT_LAYER_NAME], "la tabla siempre tiene la capa 0");
assert.ok(table.Muros, "incluye las capas dadas");
table = ensureLayer(table, "Mobiliario", { color: 2 });
assert.equal(table.Mobiliario.color, 2, "ensureLayer crea con overrides");
const same = ensureLayer(table, "Mobiliario");
assert.equal(same.Mobiliario.color, 2, "ensureLayer es idempotente");

table = setLayerState(table, "Muros", { frozen: true });
assert.ok(table.Muros.frozen, "setLayerState congela");
assert.deepEqual(setLayerState(table, "Fantasma", { on: false }).Fantasma, undefined, "capa inexistente sin cambios");

// --- borrado ---------------------------------------------------------------
assert.ok(deleteLayer(table, DEFAULT_LAYER_NAME)[DEFAULT_LAYER_NAME], "no se puede borrar la capa 0");
const afterDelete = deleteLayer(table, "Mobiliario");
assert.ok(!afterDelete.Mobiliario, "borra una capa normal");

// --- visibles y filtrado ---------------------------------------------------
const t2 = makeLayerTable([
  makeLayer("A"),
  makeLayer("B", { on: false }),
  makeLayer("C", { frozen: true }),
]);
const visibles = visibleLayerNames(t2);
assert.ok(visibles.includes("A") && visibles.includes("0"), "A y 0 visibles");
assert.ok(!visibles.includes("B") && !visibles.includes("C"), "B (apagada) y C (congelada) no");
const ents = [
  { layer: "A", id: 1 },
  { layer: "B", id: 2 },
  { layer: "C", id: 3 },
  { layer: "Desconocida", id: 4 },
];
const kept = filterVisibleEntities(ents, t2);
assert.deepEqual(kept.map((e) => e.id).sort(), [1, 4], "quedan A y la de capa desconocida");

console.log("cad layer specs passed");
