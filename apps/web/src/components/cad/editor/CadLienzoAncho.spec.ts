/**
 * T6/P13 — Cableado de pliegue por defecto: la paleta arranca cerrada y el
 * recorrido guiado arranca desplegado para nuevos usuarios. La medición REAL
 * del área del lienzo y del solape vive en el golden 215 (Playwright), no aquí.
 *
 * Este spec comprueba el COMPORTAMIENTO del plegado: que el registro nace con
 * el estado correcto y que la paleta arranca cerrada.
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

// 1. La paleta arranca cerrada de fábrica (localStorage).
ok(
  palette.includes('localStorage.getItem(STORAGE_KEY) === "true"'),
  "la paleta arranca cerrada (localStorage)",
);
ok(palette.includes("setOpen"), "la paleta tiene un toggle de visibilidad");

// 2. El registro vacío nace desplegado (un recién llegado ve el recorrido).
assert.equal(EMPTY_CAD_TOUR_RECORD.minimized, false,
  "EMPTY_CAD_TOUR_RECORD nace con minimized: false");

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

console.log(`CadLienzoAncho: ${checks}/${checks} comprobaciones verdes`);
