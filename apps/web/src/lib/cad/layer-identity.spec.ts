import { strict as assert } from "node:assert";
import { migrateCadDocument } from "./cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import "./engine/all-commands";
import { executeCadScript } from "./engine/script-runner";
import { CadDocumentLispHost } from "../lisp/document-host";

const document = migrateCadDocument({
  meta: { schema: 4, version: 1, unit: "mm" }, entities: [],
  layers: [
    { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    { id: "A", name: "Otra", color: "#ffffff", visible: true, locked: false },
    { id: "persistida", name: "A", color: "#ffffff", visible: true, locked: false },
  ],
});
const script = (text: string) => executeCadScript(text, { registry: CAD_COMMAND_REGISTRY_V2, document });
const drawn = script("-LAYER\nD\nA\nLINE\n0,0\n120,80\n\n");
assert.equal(drawn.document.entities.length, 1);
assert.equal(drawn.document.entities[0].layer, "persistida", "-LAYER define por nombre y persiste su ID aunque otro ID coincida con ese nombre");
assert.equal(drawn.variables.get("CLAYER"), "persistida");

const renamed = script("-RENAME\nCA\nA\nPlaca mecanica\n-LAYER\nD\nPlaca mecanica\nLINE\n0,0\n120,80\n\n");
assert.equal(renamed.document.layers.length, document.layers.length, "renombrar no duplica la capa");
assert.equal(renamed.document.layers.find((layer) => layer.name === "Placa mecanica")?.id, "persistida", "el nombre nuevo conserva identidad");
assert.equal(renamed.document.entities[0].layer, "persistida");

// Un nombre liberado por RENAME se puede crear de nuevo sin absorber la capa
// renombrada ni cambiar las entidades o propiedades que ya pertenecían a ella.
const oldWall = executeCadScript(
  "-LAYER\nN\nMuros\n-LAYER\nD\nMuros\nLINE\n0,0\n120,80\n\n-LAYER\nD\n0\n-LAYER\nC\n1\nMuros\n-RENAME\nCA\nMuros\nExistentes\n",
  { registry: CAD_COMMAND_REGISTRY_V2, document },
);
const oldDefinition = oldWall.document.layers.find((layer) => layer.name === "Existentes")!;
const recreated = executeCadScript("-LAYER\nN\nMuros\n-LAYER\nD\nMuros\nLINE\n0,0\n10,0\n\n", {
  registry: CAD_COMMAND_REGISTRY_V2, document: oldWall.document, newEntityId: () => "new-wall",
});
assert.equal(recreated.document.layers.length, oldWall.document.layers.length + 1, "crear el nombre antiguo añade una capa");
assert.deepEqual(recreated.document.layers.find((layer) => layer.name === "Existentes"), oldDefinition, "la capa anterior conserva nombre, ID y propiedades");
assert.deepEqual(recreated.document.entities[0], oldWall.document.entities[0], "la entidad anterior no cambia de capa ni geometría");
const recreatedLayer = recreated.document.layers.find((layer) => layer.name === "Muros")!;
assert.notEqual(recreatedLayer.id, oldDefinition.id, "la nueva capa recibe una identidad distinta");
assert.equal(recreated.document.entities[1].layer, recreatedLayer.id, "el dibujo siguiente pertenece sólo a la nueva capa");

const lisp = new CadDocumentLispHost(renamed.document);
lisp.variables().set("CLAYER", "PLACA MECANICA");
assert.equal(lisp.activeLayer(), "persistida", "LISP también resuelve nombres sin escribir referencias inexistentes");
for (const result of [drawn, renamed]) {
  const ids = new Set(result.document.layers.map((layer) => layer.id));
  assert.ok(result.document.entities.every((entity) => ids.has(entity.layer)), "cada entidad referencia una capa existente");
}
console.log("layer-identity: nombre/ID desambiguados, renombrado estable y CLAYER de LISP canónico");
