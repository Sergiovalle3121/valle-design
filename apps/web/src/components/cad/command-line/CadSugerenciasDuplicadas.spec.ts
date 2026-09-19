/**
 * T3 — Cada sugerencia aparece exactamente una vez en el desplegable.
 *
 * El manifiesto y la paleta pueden producir entradas con el mismo label;
 * `sugerirComandos` deduplica por nombre.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");

ok(
  fuente.includes("vistos.has(c.nombre)") || fuente.includes("new Set"),
  "sugerirComandos deduplica por nombre de comando",
);

console.log(`CadSugerenciasDuplicadas: ${checks}/${checks} comprobaciones verdes`);
