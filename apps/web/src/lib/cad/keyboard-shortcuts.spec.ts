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
  "line",
  "plain l starts precise line drafting",
);
assert.equal(
  matchCadShortcut({ key: "l", shiftKey: true })?.id,
  "connector",
  "shift-l matches connector tool",
);
assert.equal(
  matchCadShortcut({ key: "p" })?.id,
  "polyline",
  "matches polyline drafting",
);
assert.equal(
  matchCadShortcut({ key: "b" })?.id,
  "rect",
  "matches rectangle drafting",
);
assert.equal(matchCadShortcut({ key: "c" })?.id, "circle", "matches circle drafting");
assert.equal(matchCadShortcut({ key: "o", shiftKey: true })?.id, "offset", "matches precise offset");
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

// Kit diario (AXOS-CAD-XFORM-001): R rota, S escala, X espeja.
assert.equal(matchCadShortcut({ key: "r" })?.id, "rotate", "matches rotate");
assert.equal(matchCadShortcut({ key: "s" })?.id, "scale", "matches scale");
assert.equal(matchCadShortcut({ key: "x" })?.id, "mirror", "matches mirror");
assert.equal(
  matchCadShortcut({ key: "s", metaKey: true })?.id,
  "save",
  "matches operating-system save shortcut",
);
assert.equal(matchCadShortcut({ key: "F3" })?.id, "object_snap_toggle", "F3 toggles osnap");
assert.equal(matchCadShortcut({ key: "F8" })?.id, "ortho_toggle", "F8 toggles ortho");
assert.equal(matchCadShortcut({ key: "F10" })?.id, "polar_tracking_toggle", "F10 toggles polar tracking");
assert.equal(matchCadShortcut({ key: "F11" })?.id, "object_tracking_toggle", "F11 toggles object tracking");
