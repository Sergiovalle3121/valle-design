import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  CAD_COMMAND_LINE_CLEARANCE_VAR,
  cadStatusBarClearancePx,
} from "./use-status-bar-clearance";

/*
 * La geometría del defecto, tal y como se midió en el navegador antes de
 * arreglarlo: lienzo de 1440 × 900, la barra de estado envuelta en dos
 * renglones ocupando de 831 a 888 dentro de un contenedor que termina en 900, y
 * el muelle de la línea de comandos clavado a 56 px del fondo, terminando en
 * 844. Trece píxeles de solape.
 */
const CONTAINER_BOTTOM = 900;
const WRAPPED_BAR = { top: 831, height: 57 };

const wrapped = cadStatusBarClearancePx(WRAPPED_BAR, CONTAINER_BOTTOM);
assert.equal(wrapped, 77, "reserva la barra envuelta, su margen y el aire");
assert.ok(
  wrapped !== null && CONTAINER_BOTTOM - wrapped < WRAPPED_BAR.top,
  "el muelle termina POR ENCIMA del borde superior de la barra",
);
assert.ok(
  wrapped !== null && wrapped > 56,
  "y por encima del 3.5rem de fábrica, que era justo el defecto",
);

// Un solo renglón pide menos hueco: si el número fuera fijo, la línea de
// comandos flotaría con un vacío debajo en cuanto la ventana ensanchara.
const single = cadStatusBarClearancePx({ top: 859, height: 29 }, 900);
assert.equal(single, 49);
assert.ok(single !== null && wrapped !== null && single < wrapped);

// Tres renglones piden más. Es el caso de la ventana estrecha, que un
// `bottom-24` clavado habría vuelto a romper.
const triple = cadStatusBarClearancePx({ top: 803, height: 85 }, 900);
assert.equal(triple, 105);
assert.ok(triple !== null && wrapped !== null && triple > wrapped);

// Sin barra —modo enfoque— no hay nada de lo que apartarse: `null` significa
// «quita la variable», y el editor vuelve a su valor de fábrica.
assert.equal(cadStatusBarClearancePx(null, 900), null);
assert.equal(cadStatusBarClearancePx({ top: 900, height: 0 }, 900), null);

/*
 * EL CONTRATO CON EL MONOLITO. La variable sólo sirve si el envoltorio del
 * muelle la lee, y sólo es segura si lleva el valor de fábrica como respaldo:
 * sin este módulo montado —o antes del primer cuadro— la línea de comandos
 * tiene que quedarse exactamente donde estaba.
 */
const editor = readFileSync(
  "src/components/cad/editor/Layout3DEditor.tsx",
  "utf8",
);
assert.ok(
  editor.includes(`bottom-[var(${CAD_COMMAND_LINE_CLEARANCE_VAR},3.5rem)]`),
  "el envoltorio del muelle lee la variable con respaldo de 3.5rem",
);
assert.ok(
  !editor.includes("absolute bottom-14 left-3 z-30"),
  "y ya no lleva el 56 px clavado que pisaba la barra de estado",
);

/*
 * La barra se busca por `.cad-status-bar`, el gancho semántico que la hoja
 * global ya usaba para reformarla en pantalla táctil. Si el monolito dejara de
 * ponerlo —o este módulo se atara a una utilidad de Tailwind en su lugar— el
 * muelle volvería a pisar la barra en silencio, que es exactamente como se
 * escapó la primera vez.
 */
const source = readFileSync(
  "src/components/cad/command-line/use-status-bar-clearance.ts",
  "utf8",
);
assert.ok(source.includes(".cad-shell .cad-status-bar"));
assert.ok(
  editor.includes('className="cad-status-bar '),
  "y el editor sigue marcando la barra con ese gancho",
);
const globals = readFileSync("src/app/globals.css", "utf8");
assert.ok(
  globals.includes(".cad-shell .cad-status-bar"),
  "el gancho ya era un contrato con la hoja global, no un invento de aqui",
);

console.log("use-status-bar-clearance.spec: OK");
