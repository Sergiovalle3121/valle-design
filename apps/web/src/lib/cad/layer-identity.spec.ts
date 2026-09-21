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

const lisp = new CadDocumentLispHost(renamed.document);
lisp.variables().set("CLAYER", "PLACA MECANICA");
assert.equal(lisp.activeLayer(), "persistida", "LISP también resuelve nombres sin escribir referencias inexistentes");
for (const result of [drawn, renamed]) {
  const ids = new Set(result.document.layers.map((layer) => layer.id));
  assert.ok(result.document.entities.every((entity) => ids.has(entity.layer)), "cada entidad referencia una capa existente");
}
console.log("layer-identity: nombre/ID desambiguados, renombrado estable y CLAYER de LISP canónico");
