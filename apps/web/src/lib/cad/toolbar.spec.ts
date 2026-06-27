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
assert.equal(
  findToolbarAction("measure")?.shortcut,
  "M",
  "measure action has shortcut",
);
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
