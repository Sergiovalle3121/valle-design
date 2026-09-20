/** Pure CAD toolbar smoke tests. */
import { strict as assert } from "node:assert";
import {
  CAD_TOOLBAR_ACTIONS,
  findToolbarAction,
  toolbarActionsByGroup,
} from "./toolbar";

assert.equal(
  new Set(CAD_TOOLBAR_ACTIONS.map((a) => a.id)).size,
  CAD_TOOLBAR_ACTIONS.length,
  "toolbar action ids are unique",
);

// ola1-paleta (2026-09-19): la paleta se podó a los tres controles de
// navegación de cámara. Los catorce ids que duplicaban una orden de la cinta
// (o vocabulario industrial heredado) siguen siendo `CadToolbarActionId`
// válidos —el registro de comandos no se tocó— pero ya no se declaran como
// acción de paleta. Ese cruce se prueba en `CadToolPalette.spec.ts`; aquí
// sólo queda el smoke test de lo que de verdad sigue en la paleta.
assert.equal(
  CAD_TOOLBAR_ACTIONS.map((a) => a.id).sort().join(","),
  "fit_view,pan,select",
  "la paleta declara exactamente select, pan y fit_view",
);
assert.equal(
  findToolbarAction("pan")?.shortcut,
  "Space",
  "pan action keeps its Space shortcut",
);
assert.equal(
  findToolbarAction("select")?.shortcut,
  undefined,
  "select ya no anuncia atajo",
);
assert.equal(
  toolbarActionsByGroup("navigate").length,
  3,
  "los tres controles restantes son de navegación",
);
assert.equal(
  toolbarActionsByGroup("history").length,
  0,
  "history ya no tiene botón de paleta (Deshacer/Rehacer viven en la cinta)",
);
console.log("cad toolbar specs passed");
