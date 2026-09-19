import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { cadBackgroundDragGesture, cadPointerDownBeforeHit, type CadBackgroundDragInput } from "./background-drag-policy";

let checks = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
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
eq(cadPointerDownBeforeHit({ button: 1, engineActive: false }), { kind: "camera" }, "el botón central encuadra");
eq(cadPointerDownBeforeHit({ button: 0, engineActive: false }), { kind: "continue" }, "sin comando, el izquierdo sigue a los hit-tests");
eq(cadPointerDownBeforeHit({ button: 2, engineActive: false }), { kind: "continue" }, "sin comando, el derecho sigue a los hit-tests (menú contextual)");
// CON UN COMANDO DEL MOTOR ABIERTO EL GESTO ES DEL MOTOR. LINE tecleado (L +
// Intro) deja la herramienta en «select», y el `pointerdown` corría la
// designación entera en paralelo: un clic sobre la etiqueta de una cota la
// BORRABA, igual una nota, designaba entidades y arrancaba un arrastre con la
// órbita apagada que el `pointerup` no cerraba.
eq(cadPointerDownBeforeHit({ button: 0, engineActive: true }), { kind: "engine" }, "con comando abierto el izquierdo es del motor: ni borra, ni designa, ni arrastra");
eq(cadPointerDownBeforeHit({ button: 2, engineActive: true }), { kind: "engine" }, "el derecho también: su menú lo abre el `contextmenu` del motor, y la designación borraba la cota bajo el cursor con él");
eq(cadPointerDownBeforeHit({ button: 1, engineActive: true }), { kind: "camera" }, "el central encuadra también a mitad de un comando, como en AutoCAD");
// Idempotente: misma entrada, misma salida.
eq(cadBackgroundDragGesture(base), cadBackgroundDragGesture({ ...base }), "pura");

// ── Cableado: la tabla sólo vale si el editor la consulta DONDE toca ─────────
// El `pointerdown` vive en el monolito (no se puede montar en Node), así que se
// comprueba su forma: la pregunta al motor va ANTES de todo lo que borra,
// designa o arrastra, y corta. Y el `pointerup` no entrega al motor el clic que
// cierra un arrastre abierto antes del comando: ese lo cierra `if (drag)`.
const monolito = readFileSync(new URL("../editor/Layout3DEditor.tsx", import.meta.url), "utf8");
const tramo = (desde: string, hasta: string): string => {
  const inicio = monolito.indexOf(desde);
  const fin = monolito.indexOf(hasta, inicio + 1);
  assert.ok(inicio >= 0 && fin > inicio, `no encuentro el tramo «${desde}» → «${hasta}» en Layout3DEditor.tsx`);
  return monolito.slice(inicio, fin);
};
const onDown = tramo("const onDown = (e: PointerEvent) => {", "const onMove = (e: PointerEvent) => {");
const pregunta = onDown.search(/cadPointerDownBeforeHit\(\{\s*button: e\.button,\s*engineActive: enginePointerRouter\.active\s*\}\)/);
ok(pregunta >= 0, "el pointerdown le pasa a la tabla si el motor tiene un comando abierto");
const corte = onDown.search(/if \(beforeHit\.kind !== "continue"\) return;/);
ok(corte > pregunta, "y con comando abierto (o botón central) corta ahí, no sigue a los hit-tests");
for (const [marca, efecto] of [
  ["hatchPickModeRef.current", "el punto interior del sombreado heredado"],
  ["selectionGeometryModeRef.current", "la ventana o el lazo explícitos de la paleta"],
  ["dimsGroup.children", "borrar la cota bajo el cursor"],
  ["notesGroup.children", "borrar la nota bajo el cursor"],
  ["applyProfessionalSelection(", "designar"],
  ["drag = {", "arrancar un arrastre"],
] as const) {
  const donde = onDown.indexOf(marca);
  ok(donde > corte, `la guarda del motor va antes de ${efecto} (${marca})`);
}
const onUp = tramo("const onUp = (e: PointerEvent) => {", "const onPointerLeave = () => {");
ok(
  /if \(isClick && !drag && enginePointerRouter\.click\(e\)\)/.test(onUp),
  "el pointerup no da al motor el clic de un arrastre abierto antes del comando: si no, `drag` queda colgado y el objeto sigue al ratón sin botón",
);
const clicDelMotor = onUp.indexOf("enginePointerRouter.click(e)");
const cierreDelArrastre = onUp.indexOf("if (drag) {");
ok(cierreDelArrastre > clicDelMotor, "ese arrastre lo cierra el bloque `if (drag)` de más abajo");

console.log(`background-drag-policy: ${checks} comprobaciones verdes`);
