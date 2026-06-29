import { strict as assert } from "node:assert";
import { cadShortcutLabel, matchCadShortcut } from "./keyboard-shortcuts";

const palette = matchCadShortcut({ key: "k", ctrlKey: true });
assert.equal(palette?.id, "palette", "matches ctrl-k palette");
assert.equal(
  matchCadShortcut({ key: "z", ctrlKey: true, shiftKey: true })?.id,
  "redo",
  "matches redo",
);
assert.equal(
  matchCadShortcut({ key: "y", ctrlKey: true })?.id,
  "redo",
  "matches ctrl-y redo",
);
assert.equal(matchCadShortcut({ key: "t" })?.id, "text", "matches text tool");
assert.equal(
  matchCadShortcut({ key: "l" })?.id,
  "connector",
  "matches connector tool",
);
assert.equal(
  matchCadShortcut({ key: "g" })?.id,
  "grid_toggle",
  "matches grid toggle",
);
assert.equal(
  matchCadShortcut({ key: "v", shiftKey: true })?.id,
  "validate_layout",
  "matches validation shortcut without stealing select",
);
assert.equal(
  matchCadShortcut({ key: "v" })?.id,
  "select",
  "plain v remains select",
);
assert.equal(
  matchCadShortcut({ key: "e" })?.id,
  "export_dxf",
  "matches DXF export shortcut",
);
assert.equal(cadShortcutLabel(palette!), "Ctrl+K", "formats shortcut labels");
assert.equal(
  cadShortcutLabel(matchCadShortcut({ key: "v", shiftKey: true })!),
  "Shift+V",
  "formats shifted shortcut labels",
);
console.log("cad keyboard shortcuts specs passed");
