/**
 * La política de cámara: quién manda el botón izquierdo.
 *
 * Existe porque el cambio que trae PRESSPULL sobre cara es el más fácil de
 * romper sin darse cuenta: si el izquierdo deja de designar, el gesto no
 * existe; si deja de orbitar cuando NO hay comando, se rompe el gesto que la
 * gente ya tiene en los dedos. Las dos direcciones se comprueban.
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { applyCadCameraPolicy } from "./camera-policy";

/**
 * Contador de aserciones EJECUTADAS, no de llamadas escritas.
 *
 * El renglón final decía «14» a mano y llevaba dos comprobaciones de retraso:
 * varias de las de abajo viven dentro de bucles, así que contar apariciones de
 * `assert.` en el archivo da un número que no es el que corre. Un número
 * inventado en una prueba es exactamente la clase de cifra que este repositorio
 * no se permite en ningún otro sitio.
 */
let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const noEq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.notEqual(actual, esperado, mensaje);
  verdes += 1;
};

/** Un doble de OrbitControls con lo justo que la política toca. */
function controlsFalsos() {
  return {
    minPolarAngle: -1,
    maxPolarAngle: -1,
    enableRotate: true,
    mouseButtons: { LEFT: undefined, MIDDLE: undefined, RIGHT: undefined },
    touches: { ONE: undefined, TWO: undefined },
    zoomToCursor: false,
    enableDamping: true,
  } as unknown as Parameters<typeof applyCadCameraPolicy>[0] & {
    mouseButtons: { LEFT: unknown; RIGHT: unknown };
    touches: { ONE: unknown };
    enableRotate: boolean;
    maxPolarAngle: number;
    zoomToCursor: boolean;
    enableDamping: boolean;
  };
}

// --- 1 · en plano, el izquierdo panea y no se orbita ------------------------
{
  const c = controlsFalsos();
  applyCadCameraPolicy(c, "2d");
  eq(c.mouseButtons.LEFT, THREE.MOUSE.PAN, "en plano el izquierdo panea");
  eq(c.enableRotate, false, "y no se orbita un plano");
  ok(c.maxPolarAngle < 0.1, "la cámara queda clavada mirando hacia abajo");
}

// --- 2 · en 3D SIN comando, el izquierdo orbita: el gesto de siempre --------
{
  const c = controlsFalsos();
  applyCadCameraPolicy(c, "3d");
  eq(c.mouseButtons.LEFT, THREE.MOUSE.ROTATE, "sin comando activo, el izquierdo orbita");
  eq(c.enableRotate, true, "y la órbita está viva");
  eq(c.mouseButtons.RIGHT, null, "el derecho queda libre para el menú contextual y para valer por Enter");
  eq(c.touches.ONE, THREE.TOUCH.ROTATE, "y un dedo sigue orbitando");
}

// --- 3 · en 3D CON comando, el izquierdo designa ----------------------------
//
// Es el cambio que hace que el modo 3D deje de ser un visor. Si esta aserción
// se cae, PRESSPULL sobre cara no se puede usar con el ratón por mucho que el
// motor lo acepte.
{
  const c = controlsFalsos();
  applyCadCameraPolicy(c, "3d", true);
  eq(c.mouseButtons.LEFT, null, "con comando activo el izquierdo NO mueve la cámara");
  eq(c.mouseButtons.RIGHT, THREE.MOUSE.ROTATE, "y la órbita se muda al derecho, no se pierde");
  eq(c.enableRotate, true, "orbitar sigue siendo posible");
  noEq(c.touches.ONE, THREE.TOUCH.ROTATE, "y un dedo designa en vez de orbitar");
}

// --- 4 · el modo designación NO se cuela en plano ---------------------------
//
// En 2D el izquierdo ya panea y la designación la resuelve el enrutador sobre
// el plano; robarle el paneo rompería el gesto primario de un CAD de planos.
{
  const c = controlsFalsos();
  applyCadCameraPolicy(c, "2d", true);
  eq(c.mouseButtons.LEFT, THREE.MOUSE.PAN, "en plano el izquierdo sigue paneando aunque haya comando");
}

// --- 5 · la política es idempotente y REVIERTE ------------------------------
//
// Se llama en cada cambio de modo y en cada cambio de comando: aplicarla dos
// veces tiene que dar lo mismo, y volver de «con comando» a «sin comando» tiene
// que devolver la órbita al izquierdo. Sin esto, terminar un PRESSPULL dejaría
// el visor sin forma de girar.
{
  const c = controlsFalsos();
  applyCadCameraPolicy(c, "3d", true);
  applyCadCameraPolicy(c, "3d", true);
  eq(c.mouseButtons.LEFT, null, "aplicarla dos veces no cambia nada");
  applyCadCameraPolicy(c, "3d", false);
  eq(c.mouseButtons.LEFT, THREE.MOUSE.ROTATE, "al terminar el comando, la órbita vuelve al izquierdo");
  eq(c.mouseButtons.RIGHT, null, "y el derecho vuelve a quedar libre");
}


// --- 7 · el botón central ENCUADRA en los dos modos, con y sin comando -------
// De fábrica OrbitControls lo trae en DOLLY (medido con tsx sobre three
// 0.185.1): la rueda hacía zoom dos veces y encuadrar con el central era
// imposible. Es el gesto de AutoCAD.
for (const [mode, picking] of [["2d", false], ["2d", true], ["3d", false], ["3d", true]] as const) {
  const c = controlsFalsos();
  applyCadCameraPolicy(c, mode, picking);
  eq(
    (c.mouseButtons as { MIDDLE?: unknown }).MIDDLE,
    THREE.MOUSE.PAN,
    `el botón central encuadra en ${mode}${picking ? " con comando" : ""}`,
  );
}

// --- 5 · la rueda acerca al CURSOR en los dos modos -------------------------
//
// El defecto de OrbitControls es `false` y toda la aplicación del
// desplazamiento al puntero está condicionada a él: sin esto la rueda acerca
// al centro de la vista, que es la firma táctil de un visor 3D web y no la de
// un CAD. Se comprueba en los dos modos porque la política se aplica en los
// dos y un `if` mal puesto sólo se vería en uno.
for (const modo of ["2d", "3d"] as const) {
  const c = controlsFalsos();
  applyCadCameraPolicy(c, modo);
  eq(c.zoomToCursor, true, `la rueda acerca al cursor en ${modo}`);
  eq(c.enableDamping, false, `y la cámara no planea al soltar en ${modo}`);
}

console.log(`✔ política de cámara: ${verdes} aserciones verdes`);
