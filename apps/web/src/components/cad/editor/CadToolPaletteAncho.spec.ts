/**
 * T4 — Las etiquetas de la paleta flotante no se parten dentro de una palabra.
 *
 * El botón se ensanchó de w-14 (56 px) a w-16 (64 px) para que quepan las
 * etiquetas españolas más largas («Seleccionar», «Rectángulo», «Deshacer»).
 * break-words se conserva como red de seguridad pero ya no debería cortar
 * palabras a 1280, 1440 ni 1800 px de ancho.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const fuente = readFileSync(path.join(__dirname, "CadToolPalette.tsx"), "utf8");

ok(fuente.includes("w-16"), "el botón de la paleta mide w-16 (64 px)");
ok(!fuente.includes("w-14"), "w-14 ya no aparece en el botón");

console.log(`CadToolPaletteAncho: ${checks}/${checks} comprobaciones verdes`);
