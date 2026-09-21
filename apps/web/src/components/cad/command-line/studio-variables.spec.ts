import assert from "node:assert/strict";
import type { CadDocument } from "@/lib/cad/cad-document";
import { CadSystemVariableStore } from "@/lib/cad/system-variables";
import { createCadStudioVariableAccess } from "./studio-variables";

const document = {
  layers: [
    { id: "0", name: "0" },
    { id: "wall-id", name: "Muros" },
    { id: "opening-id", name: "Vanos" },
  ],
} as CadDocument;
const uiChanges: string[] = [];
const scales: number[] = [];
const port = {
  document: { current: document },
  activeLayer: "wall-id",
  setActiveLayer: (id: string) => {
    uiChanges.push(id);
  },
  linetypeScale: {
    get: () => 2,
    set: (value: number) => {
      scales.push(value);
    },
  },
};
const session = new CadSystemVariableStore();
const documentBefore = JSON.stringify(document);
const variables = createCadStudioVariableAccess(session, port);

assert.equal(
  variables.get("CLAYER"),
  "wall-id",
  "la capa visible gana al valor inicial0 de sesión",
);
assert.equal(variables.set("clayer", "vAnOs").ok, true);
assert.deepEqual(
  uiChanges,
  ["opening-id"],
  "el comando actualiza el panel con ID canónico",
);
assert.equal(session.get("CLAYER"), "opening-id");
assert.equal(
  variables.get("CLAYER"),
  "opening-id",
  "el siguiente comando ve el cambio antes del render de React",
);
variables.publish("CLAYER", "opening-id");
assert.deepEqual(
  uiChanges,
  ["opening-id"],
  "publicar la misma capa no repite el setter ni crea un bucle",
);
port.activeLayer = "opening-id";
variables.syncActiveLayer();
assert.equal(
  variables.get("CLAYER"),
  "opening-id",
  "el render confirma la capa que ordenó el comando",
);
port.activeLayer = "wall-id";
variables.syncActiveLayer();
assert.equal(
  variables.get("CLAYER"),
  "wall-id",
  "una selección posterior en el panel gana a CLAYER anterior",
);
assert.equal(variables.set("CLAYER", "missing").ok, false);
assert.equal(
  variables.get("CLAYER"),
  "wall-id",
  "rechazar una capa inexistente no cambia la capa actual",
);
assert.deepEqual(uiChanges, ["opening-id"]);

variables.publish("CLAYER", "Vanos");
variables.set("CLAYER", "Muros");
assert.equal(
  variables.get("CLAYER"),
  "wall-id",
  "dos cambios encadenados antes del render conservan el último",
);
assert.deepEqual(uiChanges, ["opening-id", "opening-id", "wall-id"]);
assert.equal(
  JSON.stringify(port.document.current),
  documentBefore,
  "la sincronía no escribe geometría ni historial",
);

assert.equal(variables.get("LTSCALE"), 2);
assert.equal(variables.set("LTSCALE", -2).ok, false);
assert.deepEqual(scales, []);
assert.equal(variables.publish("LTSCALE", "5").ok, true);
assert.deepEqual(
  scales,
  [5],
  "LTSCALE aplica sólo el valor validado de la tabla",
);
variables.set("OSMODE", 3);
assert.equal(
  variables.get("OSMODE"),
  3,
  "otras variables conservan su almacén de sesión",
);
const renderPort = { ...port, activeLayer: "wall-id" };
const renderVariables = createCadStudioVariableAccess(
  new CadSystemVariableStore(),
  renderPort,
);
renderVariables.set("CLAYER", "Vanos");
renderPort.activeLayer = "opening-id";
renderVariables.syncActiveLayer();
// No command reads CLAYER between these two renders.
renderPort.activeLayer = "wall-id";
renderVariables.syncActiveLayer();
assert.equal(
  renderVariables.get("CLAYER"),
  "wall-id",
  "volver al panel después de un comando no requiere lecturas intermedias",
);
console.log(
  "studio-variables: sincronía bidireccional, render diferido, rechazo y LTSCALE PASS",
);
