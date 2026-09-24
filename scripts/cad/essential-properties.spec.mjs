import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  rawPropertyLabels,
  essentialPropertyViewViolations,
} from "./essential-properties-gate.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

assert.deepEqual(
  rawPropertyLabels('field("startX", "startX", "0")'),
  ["startX → startX"],
  "una clave interna debe hacer fallar el gate",
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
const view = essentialPropertyViewViolations(
  read("apps/web/src/components/cad/palettes/CadHumanProperties.tsx"),
  read("apps/web/src/components/cad/palettes/CadEntityPropertiesPanel.tsx"),
);
assert.deepEqual(
  [...labels, ...view],
  [],
  `Propiedades crudas en Esencial: ${[...labels, ...view].join("; ")}`,
);
console.log("Propiedades Esencial: rótulos humanos sin tabla técnica montada");
