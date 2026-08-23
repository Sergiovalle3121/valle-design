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
assert.equal(
  wrapped,
  21,
  "lo que falta POR ENCIMA de los 56 px que el envoltorio ya reserva",
);
assert.ok(
  wrapped !== null && CONTAINER_BOTTOM - (56 + wrapped) < WRAPPED_BAR.top,
  "la línea termina POR ENCIMA del borde superior de la barra",
);

// Un solo renglón no pide nada: el `bottom-14` de fábrica ya lo cubre, y
// desplazar sin motivo dejaría un hueco muerto sobre la barra.
assert.equal(cadStatusBarClearancePx({ top: 859, height: 29 }, 900), null);

// Tres renglones piden más. Es el caso de la ventana estrecha, que un
// `bottom-24` clavado habría vuelto a romper.
const triple = cadStatusBarClearancePx({ top: 803, height: 85 }, 900);
assert.equal(triple, 49);
assert.ok(triple !== null && wrapped !== null && triple > wrapped);

// Sin barra —modo enfoque— no hay nada de lo que apartarse: `null` significa
// «quita la variable», y la línea vuelve a su sitio de fábrica.
assert.equal(cadStatusBarClearancePx(null, 900), null);
assert.equal(cadStatusBarClearancePx({ top: 900, height: 0 }, 900), null);

/*
 * EL CONTRATO, Y DÓNDE SE APLICA.
 *
 * El desfase es de LA LÍNEA DE COMANDOS, no de su envoltorio. El envoltorio es
 * una columna que la línea comparte con el acompañante de los primeros cinco
 * minutos y con la consola AutoLISP: subirlo sube los tres, y los BOTONES del
 * acompañante —que sí reclaman el ratón— acaban sobre el plano. Medido: subir
 * el envoltorio 21 px puso en rojo el golden 12 (lazo y ventana sobre el
 * lienzo) y dos casos del 39 (arrastre de grip); con el envoltorio quieto y la
 * línea desplazada sola, los catorce casos vuelven a verde.
 */
const editor = readFileSync(
  "src/components/cad/editor/Layout3DEditor.tsx",
  "utf8",
);
assert.ok(
  editor.includes("absolute bottom-14 left-3 z-30"),
  "el envoltorio se queda donde estaba: mover la columna entera cuesta goldens",
);
const line = readFileSync(
  "src/components/cad/command-line/CadCommandLine.tsx",
  "utf8",
);
assert.ok(
  line.includes("bottom: `var(${CAD_COMMAND_LINE_CLEARANCE_VAR}, 0px)`"),
  "y es la LÍNEA la que lee la variable, por su nombre y con respaldo de 0px",
);
assert.equal(
  CAD_COMMAND_LINE_CLEARANCE_VAR,
  "--cad-command-line-clearance-extra",
  "el nombre dice que es un EXTRA sobre el bottom-14, no la holgura entera",
);
assert.ok(
  line.includes("relative"),
  "como desfase relativo: mueve su caja sin mover el hueco de sus hermanas",
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
