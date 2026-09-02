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
// La barra no anuncia lo que el registro no tiene: M, P y B son alias de
// acad.pgp (MOVE, PAN, BLOCK) y la letra suelta es de la línea de comandos.
assert.equal(findToolbarAction("measure")?.shortcut, undefined, "measure ya no anuncia M");
assert.equal(
  findToolbarAction("text")?.shortcut,
  "T",
  "text action has shortcut",
);
assert.equal(
  findToolbarAction("line")?.shortcut,
  "L",
  "line action owns the plain drafting shortcut",
);
assert.equal(findToolbarAction("polyline")?.shortcut, undefined, "polyline ya no anuncia P");
assert.equal(findToolbarAction("rect")?.shortcut, undefined, "rect ya no anuncia B");
assert.equal(
  toolbarActionsByGroup("history").length,
  2,
  "history group exposes undo/redo",
);
assert.equal(
  toolbarActionsByGroup("insert").some((a) => a.id === "zone"),
  true,
  "insert group exposes zone",
);
console.log("cad toolbar specs passed");
