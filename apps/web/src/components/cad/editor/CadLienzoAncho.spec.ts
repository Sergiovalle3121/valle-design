/**
 * T6/P13/D12 — Cableado de pliegue por defecto: la paleta arranca abierta y el
 * recorrido guiado arranca PLEGADO y se pinta en el muelle izquierdo. La
 * medición REAL —que la tarjeta no tapa la paleta ni el lienzo y recibe sus
 * propios clics— vive en el golden 67 («con el recorrido abierto») y el 211.
 *
 * Este spec comprueba el COMPORTAMIENTO del plegado: que el registro nace con
 * el estado correcto y que el componente sabe irse al muelle.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EMPTY_CAD_TOUR_RECORD,
  cadGuidedTourReduce,
} from "../../../lib/cad/onboarding/guided-tour";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const palette = readFileSync(path.join(__dirname, "CadToolPalette.tsx"), "utf8");
const dock = readFileSync(
  path.join(__dirname, "..", "onboarding", "CadGuidedTourDock.tsx"),
  "utf8",
);

// 1. La paleta arranca abierta de fábrica (localStorage).
ok(
  palette.includes('localStorage.getItem(STORAGE_KEY) !== "false"'),
  "la paleta arranca abierta (localStorage)",
);
ok(palette.includes("setOpen"), "la paleta tiene un toggle de visibilidad");

// 2. El registro vacío nace PLEGADO: un recién llegado ve una línea con su paso
//    actual, no cinco pasos encima del plano.
assert.equal(EMPTY_CAD_TOUR_RECORD.minimized, true,
  "EMPTY_CAD_TOUR_RECORD nace con minimized: true");

// 3. La preferencia de plegado se preserva: minimizar y restaurar funciona.
let record = { ...EMPTY_CAD_TOUR_RECORD };
record = cadGuidedTourReduce(record, { type: "minimize", minimized: true });
assert.equal(record.minimized, true, "minimizar pone minimized a true");
record = cadGuidedTourReduce(record, { type: "minimize", minimized: false });
assert.equal(record.minimized, false, "restaurar pone minimized a false");

// 4. El componente del recorrido soporta plegado: tiene el dispatch minimize
//    y expone data-collapsed para que los goldens lo midan.
ok(dock.includes('"minimize"'), "el dock puede despachar minimize");
ok(dock.includes("data-collapsed"), "el dock expone data-collapsed");

// 5. Se pinta en el hueco del muelle izquierdo y deja de ser un telón que los
//    clics atraviesan. La prueba de COMPORTAMIENTO del hueco es
//    `onboarding/tour-slot.spec.ts`; aquí sólo que el componente lo usa.
ok(dock.includes("createPortal(card, slot)"), "el recorrido se pinta en el hueco del muelle");
ok(
  !/"[^"\n]*\bpointer-events-none\b[^"\n]*"/.test(dock),
  "ninguna clase del recorrido deja pasar los clics a lo de debajo",
);

console.log(`CadLienzoAncho: ${checks}/${checks} comprobaciones verdes`);
