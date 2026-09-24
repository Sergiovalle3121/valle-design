import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  rawPropertyLabels,
  essentialPropertyViewViolations,
  legacyPropertyViewViolations,
} from "./essential-properties-gate.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

assert.deepEqual(
  rawPropertyLabels('field("startX", "startX", "0")'),
  ["startX → startX"],
  "una clave interna debe hacer fallar el gate",
);
assert.deepEqual(
  rawPropertyLabels('const fields = [{ key: "name", label: "name", value: "Sala" }]'),
  ["name → name"],
  "también se revisan los campos creados como objetos",
);
assert.deepEqual(
  rawPropertyLabels('const fields = [{ key: "color", label: "Color", value: "Azul" }]'),
  [],
  "Color es la excepción española exacta",
);
assert.deepEqual(
  rawPropertyLabels('const fields = [{ key: "color", label: "color", value: "Azul" }]'),
  ["color → color"],
  "la excepción no autoriza la clave cruda en minúsculas",
);
const fakePanel =
  'if (mode === "pro") return technical; return <CadHumanProperties model={human} />';
assert.ok(
  essentialPropertyViewViolations(
    "const view = <dt>{field.key}</dt>",
    fakePanel,
  ).length > 0,
  "pintar field.key en vez de field.label debe fallar",
);
assert.ok(
  essentialPropertyViewViolations(
    "const view = <><dt>{field.label}</dt><span>{field.key}</span></>",
    read("apps/web/src/components/cad/palettes/CadEntityPropertiesPanel.tsx"),
  ).some((failure) => failure.includes("clave cruda")),
  "la clave cruda también se detecta fuera de <dt>",
);

const humanSource = read("apps/web/src/components/cad/palettes/CadHumanProperties.tsx");
const humanWithRawLabel = humanSource.replace("{field.label}</dt>", "{field.key}</dt>");
assert.notEqual(humanWithRawLabel, humanSource, "se inyecta el error en la ficha real");
assert.ok(essentialPropertyViewViolations(
  humanWithRawLabel,
  read("apps/web/src/components/cad/palettes/CadEntityPropertiesPanel.tsx"),
).length > 0, "el gate rechaza una clave cruda en el componente real");

const legacyPath = "apps/web/src/components/cad/palettes/CadEssentialLegacyProperties.tsx";
const legacySource = read(legacyPath);
const editorSource = read("apps/web/src/components/cad/editor/Layout3DEditor.tsx");
const legacyWithTechnical = legacySource.replace(
  "<CadHumanProperties model={model} />",
  "<CadPropertiesPalette model={model} />",
);
assert.notEqual(legacyWithTechnical, legacySource, "se inyecta la tabla cruda en la ficha legada real");
assert.ok(legacyPropertyViewViolations(legacyWithTechnical, editorSource).length > 0,
  "el gate rechaza la tabla técnica en la selección histórica de Esencial");
const editorWithoutGuard = editorSource.replace(
  ') : uiMode === "esencial" ? (\n                  <CadEssentialLegacyProperties',
  ') : uiMode === "pro" ? (\n                  <CadEssentialLegacyProperties',
);
assert.notEqual(editorWithoutGuard, editorSource, "se invierte el modo real en la prueba");
assert.ok(legacyPropertyViewViolations(legacySource, editorWithoutGuard).length > 0,
  "el gate rechaza una ficha histórica montada en Pro en vez de Esencial");
assert.ok(
  essentialPropertyViewViolations(
    "const view = <dt>{field.label}</dt>",
    "return technical",
  ).length > 0,
  "la tabla cruda fuera de Pro debe fallar",
);
assert.ok(
  essentialPropertyViewViolations(
    "const view = <dt>{field.label}</dt>",
    'if (mode === "pro") return technical; return <details>{technical}</details>',
  ).length > 0,
  "la tabla cruda no debe montarse ni dentro de un pliegue en Esencial",
);

const labels = rawPropertyLabels(
  read("apps/web/src/components/cad/palettes/human-property-model.ts"),
);
labels.push(...rawPropertyLabels(legacySource));
const view = essentialPropertyViewViolations(
  read("apps/web/src/components/cad/palettes/CadHumanProperties.tsx"),
  read("apps/web/src/components/cad/palettes/CadEntityPropertiesPanel.tsx"),
);
view.push(...legacyPropertyViewViolations(legacySource, editorSource));
assert.deepEqual(
  [...labels, ...view],
  [],
  `Propiedades crudas en Esencial: ${[...labels, ...view].join("; ")}`,
);
console.log("Propiedades Esencial: rótulos humanos sin tabla técnica montada");
