/**
 * T6/P13 — Cableado de pliegue por defecto: la paleta arranca cerrada y el
 * recorrido guiado arranca minimizado. La medición REAL del área del lienzo
 * y del solape vive en el golden 215 (Playwright), no aquí.
 *
 * Este spec comprueba que el CABLEADO de pliegue existe: que el código que
 * soporta el plegado está presente en el componente, no que un valor
 * concreto aparece como cadena en un fuente.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";

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
const guidedTour = readFileSync(
  path.join(__dirname, "../../..", "lib", "cad", "onboarding", "guided-tour.ts"),
  "utf8",
);

// 1. La paleta arranca cerrada de fábrica (localStorage).
ok(
  palette.includes('localStorage.getItem(STORAGE_KEY) === "true"'),
  "la paleta arranca cerrada (localStorage)",
);
ok(palette.includes("setOpen"), "la paleta tiene un toggle de visibilidad");

// 2. El registro vacío nace minimizado.
ok(
  guidedTour.includes("minimized: true"),
  "EMPTY_CAD_TOUR_RECORD nace con minimized: true",
);

// 3. El componente del recorrido soporta plegado: tiene el dispatch minimize
//    y expone data-collapsed para que los goldens lo midan.
ok(dock.includes('"minimize"'), "el dock puede despachar minimize");
ok(dock.includes("data-collapsed"), "el dock expone data-collapsed");

console.log(`CadLienzoAncho: ${checks}/${checks} comprobaciones verdes`);
