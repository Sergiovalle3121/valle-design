import { strict as assert } from "node:assert";
import { cadBackgroundDragGesture, cadPointerDownBeforeHit, type CadBackgroundDragInput } from "./background-drag-policy";

let checks = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const base: CadBackgroundDragInput = {
  pointerType: "mouse",
  button: 0,
  shiftKey: false,
  viewMode: "2d",
  tool: "select",
  engineActive: false,
  selectionOperation: "replace",
  backgroundDrag: "marquee",
};

// El defecto de AutoCAD: arrastrar sobre el fondo designa (medido antes: «0 sel» y paneo).
eq(cadBackgroundDragGesture(base), { kind: "marquee", clearSelection: true }, "2D · select · sin comando · pick · 'marquee' → ventana que reemplaza");
eq(cadBackgroundDragGesture({ ...base, selectionOperation: "add" }), { kind: "marquee", clearSelection: false }, "con operación «añadir» la ventana no limpia");
eq(cadBackgroundDragGesture({ ...base, shiftKey: true }), { kind: "marquee", clearSelection: false }, "Shift+arrastre sigue siendo ventana sin limpiar, como antes");
eq(cadBackgroundDragGesture({ ...base, shiftKey: true, viewMode: "3d" }), { kind: "marquee", clearSelection: false }, "Shift también en 3D");
// Cuándo NO: comando abierto, herramienta de dibujo, 3D, preferencia 'pan', dedo.
eq(cadBackgroundDragGesture({ ...base, engineActive: true }), { kind: "clear" }, "con un comando del motor abierto el izquierdo sigue encuadrando");
eq(cadBackgroundDragGesture({ ...base, tool: "line" }), { kind: "clear" }, "con herramienta de dibujo el izquierdo sigue encuadrando");
eq(cadBackgroundDragGesture({ ...base, viewMode: "3d" }), { kind: "clear" }, "en 3D el izquierdo sigue orbitando");
eq(cadBackgroundDragGesture({ ...base, backgroundDrag: "pan" }), { kind: "clear" }, "con la preferencia 'pan' vuelve el gesto anterior");
eq(cadBackgroundDragGesture({ ...base, pointerType: "touch" }), { kind: "clear" }, "un dedo NUNCA abre ventana: dos dedos son la cámara (golden 56)");
// Botones: sólo el izquierdo abre ventana; el derecho sigue su curso (menú).
eq(cadBackgroundDragGesture({ ...base, button: 2 }), { kind: "continue" }, "el derecho no es un arrastre de fondo");
eq(cadBackgroundDragGesture({ ...base, button: 2, shiftKey: true }), { kind: "continue" }, "ni con Shift");
// El central se corta antes de los hit-tests, en cualquier estado.
eq(cadPointerDownBeforeHit({ button: 1 }), { kind: "camera" }, "el botón central encuadra");
eq(cadPointerDownBeforeHit({ button: 0 }), { kind: "continue" }, "el izquierdo sigue a los hit-tests");
eq(cadPointerDownBeforeHit({ button: 2 }), { kind: "continue" }, "el derecho sigue a los hit-tests (menú contextual)");
// Idempotente: misma entrada, misma salida.
eq(cadBackgroundDragGesture(base), cadBackgroundDragGesture({ ...base }), "pura");

console.log(`background-drag-policy: ${checks} comprobaciones verdes`);
