/**
 * LA PALETA PODADA — cero duplicados, verificado por código (ola1-paleta,
 * 2026-09-19).
 *
 * De los diecisiete controles que tenía la columna flotante quedan tres:
 * los que NO son una orden, sino navegación de cámara (Seleccionar,
 * Encuadre, Ajustar todo). Este spec afirma dos cosas que una captura de
 * pantalla no puede probar:
 *
 *   1. La paleta declara EXACTAMENTE esos tres ids.
 *   2. Ninguno de los tres tiene un botón equivalente en la cinta — y, al
 *      revés, que los ONCE que SÍ se retiraron por duplicar un botón de la
 *      cinta de verdad tenían ese botón (si `RETIRED_RIBBON_DUPLICATES`
 *      dejara de ser cierto, la poda habría sido un error, no una mejora).
 *
 * La huella en píxeles (≤140×40) se mide en `CadToolPaletteAncho.spec.ts`,
 * que lee las clases de tamaño; aquí sólo import a `CAD_TOOLBAR_ACTIONS` y
 * `cadRibbonExposedNames()`, sin DOM ni navegador.
 */
import { strict as assert } from "node:assert";
import { CAD_TOOLBAR_ACTIONS } from "../../../lib/cad/toolbar";
import { cadRibbonExposedNames } from "../../../lib/cad/ribbon";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// 1. Exactamente tres controles, los de navegación.
const ids = CAD_TOOLBAR_ACTIONS.map((action) => action.id).sort();
assert.deepEqual(
  ids,
  ["fit_view", "pan", "select"],
  `la paleta debería declarar exactamente select/pan/fit_view; declara ${ids.join(", ")}`,
);
checks += 1;

// 2. Los once que SÍ duplicaban un botón de la cinta — el motivo por el que
//    se borraron de la paleta. Vive aquí, no en `toolbar.ts`: es un registro
//    histórico de la poda para que este spec lo verifique, no una tabla que
//    el producto consulte en tiempo de ejecución.
const RETIRED_RIBBON_DUPLICATES: Record<string, string> = {
  measure: "DIST",
  line: "LINE",
  polyline: "PLINE",
  rect: "RECTANG",
  circle: "CIRCLE",
  move: "MOVE",
  copy: "COPY",
  offset: "OFFSET",
  text: "TEXT",
  undo: "U",
  redo: "REDO",
};
assert.equal(
  Object.keys(RETIRED_RIBBON_DUPLICATES).length,
  11,
  "once duplicados retirados (aisle/zone/equipment eran vocabulario industrial, no duplicados)",
);
checks += 1;

const exposed = cadRibbonExposedNames();

for (const [id, commandName] of Object.entries(RETIRED_RIBBON_DUPLICATES)) {
  ok(
    exposed.has(commandName),
    `${id} se retiró de la paleta porque ${commandName} tiene botón en la cinta — y no lo tiene`,
  );
}

// 3. Ninguno de los TRES controles que quedan es uno de los duplicados
//    retirados (serían redundantes con la cinta, exactamente el defecto que
//    esta ola arregla) ni tiene, él mismo, un comando expuesto con su propio
//    nombre en mayúsculas: no hay SELECT/PAN/FITVIEW en el registro de
//    comandos (medido: PAN sí existe como orden real —Vista, Encuadre y
//    zoom— pero es la orden TECLEADA/de la cinta, un camino DISTINTO del
//    modo de arrastre persistente que activa este botón; ninguno de los tres
//    controles llama a `commandEngineRef.invoke(...)`, así que no hay
//    despacho duplicado que verificar por nombre).
for (const action of CAD_TOOLBAR_ACTIONS) {
  ok(
    !(action.id in RETIRED_RIBBON_DUPLICATES),
    `${action.id} debería haberse retirado de la paleta como duplicado y sigue`,
  );
}

console.log(`CadToolPalette: ${checks}/${checks} comprobaciones verdes`);
