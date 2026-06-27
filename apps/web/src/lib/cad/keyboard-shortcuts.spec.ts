import { strict as assert } from "node:assert";
import { cadShortcutLabel, matchCadShortcut } from "./keyboard-shortcuts";

const palette = matchCadShortcut({ key: "k", ctrlKey: true });
assert.equal(palette?.id, "palette", "matches ctrl-k palette");
assert.equal(
  matchCadShortcut({ key: "z", ctrlKey: true, shiftKey: true })?.id,
  "redo",
  "matches redo",
);
assert.equal(cadShortcutLabel(palette!), "Ctrl+K", "formats shortcut labels");
console.log("cad keyboard shortcuts specs passed");
