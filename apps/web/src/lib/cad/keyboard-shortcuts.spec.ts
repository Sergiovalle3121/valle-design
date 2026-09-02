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
  matchCadShortcut({ key: "l", shiftKey: true }),
  undefined,
  "shift-l ya no existe: connector no tenía salida en el intérprete",
);
// La letra suelta es de la línea de comandos: P=PAN, B=BLOCK, G=GROUP,
// V=VIEW, E=ERASE, R/S/X en acad.pgp. El lienzo ya no las roba.
assert.equal(matchCadShortcut({ key: "p" }), undefined, "p es PAN en acad.pgp: el lienzo no la roba");
assert.equal(matchCadShortcut({ key: "b" }), undefined, "b es BLOCK en acad.pgp: el lienzo no la roba");
assert.equal(matchCadShortcut({ key: "m" }), undefined, "m es MOVE en acad.pgp: el lienzo no la roba");
assert.equal(matchCadShortcut({ key: "" }), undefined, "un evento sin tecla no casa con una entrada sin tecla");
assert.equal(matchCadShortcut({ key: "c" })?.id, "circle", "matches circle drafting");
assert.equal(matchCadShortcut({ key: "o", shiftKey: true })?.id, "offset", "matches precise offset");
assert.equal(matchCadShortcut({ key: "g" }), undefined, "g es GROUP en acad.pgp: la grilla es F7");
assert.equal(
  matchCadShortcut({ key: "v", shiftKey: true })?.id,
  "validate_layout",
  "matches validation shortcut without stealing select",
);
assert.equal(matchCadShortcut({ key: "v" }), undefined, "v es VIEW en acad.pgp: seleccionar no tiene letra suelta");
assert.equal(matchCadShortcut({ key: "e" }), undefined, "e es ERASE en acad.pgp: exportar DXF vive en la paleta");
assert.equal(cadShortcutLabel(palette!), "Ctrl+K", "formats shortcut labels");
assert.equal(
  cadShortcutLabel(matchCadShortcut({ key: "v", shiftKey: true })!),
  "Shift+V",
  "formats shifted shortcut labels",
);
console.log("cad keyboard shortcuts specs passed");

// R, S y X no tenían salida en el intérprete (medido: null en las dos fases)
// y en acad.pgp S=STRETCH y X=EXPLODE: se retiraron del registro.
assert.equal(matchCadShortcut({ key: "r" }), undefined, "r no es un atajo del lienzo");
assert.equal(matchCadShortcut({ key: "s" }), undefined, "s es STRETCH en acad.pgp");
assert.equal(matchCadShortcut({ key: "x" }), undefined, "x es EXPLODE en acad.pgp");
assert.equal(
  matchCadShortcut({ key: "s", metaKey: true })?.id,
  "save",
  "matches operating-system save shortcut",
);
assert.equal(matchCadShortcut({ key: "F3" })?.id, "object_snap_toggle", "F3 toggles osnap");
assert.equal(matchCadShortcut({ key: "F8" })?.id, "ortho_toggle", "F8 toggles ortho");
assert.equal(matchCadShortcut({ key: "F10" })?.id, "polar_tracking_toggle", "F10 toggles polar tracking");
assert.equal(matchCadShortcut({ key: "F11" })?.id, "object_tracking_toggle", "F11 toggles object tracking");
// Las tres que faltaban de la fila F, con los ids que el handler del editor
// enruta: F7 comparte id con la G (como F3 con la O), F9 y F12 son propios.
assert.equal(matchCadShortcut({ key: "F7" })?.id, "grid_toggle", "F7 toggles the grid");
assert.equal(matchCadShortcut({ key: "F9" })?.id, "grid_snap_toggle", "F9 toggles grid snap");
assert.equal(matchCadShortcut({ key: "F12" })?.id, "dynamic_input_toggle", "F12 toggles dynamic input");
