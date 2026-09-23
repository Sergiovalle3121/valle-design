/**
 * T3 — Cada sugerencia aparece exactamente una vez en el desplegable.
 *
 * El manifiesto y la paleta pueden producir entradas con el mismo label;
 * `sugerirComandos` deduplica por nombre.
 */
import { strict as assert } from "node:assert";
import { sugerirComandos } from "./command-suggestions";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// Antes esto leía el CÓDIGO FUENTE buscando «vistos.has(c.nombre)», porque la
// función vivía dentro del componente y no se podía llamar. Ahora vive en
// `command-suggestions.ts` y se puede MEDIR: una comprobación que mira lo que
// hace vale más que una que mira cómo está escrito, y no se rompe el día que
// alguien deduplique de otra manera igual de buena.
for (const prefijo of ["L", "C", "A", "M", "D", "RE", "TR", "PL"]) {
  const nombres = sugerirComandos(prefijo).map((s) => s.nombre);
  ok(
    new Set(nombres).size === nombres.length,
    `«${prefijo}» no repite ninguna sugerencia (dio: ${nombres.join(", ")})`,
  );
}

console.log(`CadSugerenciasDuplicadas: ${checks}/${checks} comprobaciones verdes`);
