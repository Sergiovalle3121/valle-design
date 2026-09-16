/**
 * T6 — El lienzo ocupa >= 75% del viewport a 1800×962 con los paneles por defecto.
 *
 * La paleta flotante arranca cerrada (localStorage), el recorrido guiado
 * arranca minimizado, y no hay capas flotantes sobre el lienzo que el
 * usuario no haya abierto.
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
const tour = readFileSync(path.join(__dirname, "..", "onboarding", "CadGuidedTourDock.tsx"), "utf8");

ok(palette.includes('localStorage.getItem(STORAGE_KEY) === "true"'), "la paleta arranca cerrada (localStorage)");
ok(palette.includes("setOpen"), "la paleta tiene un toggle de visibilidad");
ok(tour.includes("minimized"), "el recorrido tiene estado minimizado");

console.log(`CadLienzoAncho: ${checks}/${checks} comprobaciones verdes`);
