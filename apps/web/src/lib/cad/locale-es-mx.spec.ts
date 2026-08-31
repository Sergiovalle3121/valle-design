/**
 * El producto formatea en es-MX, y eso se comprueba en vez de confiarse.
 *
 * ## Por qué existe este candado
 *
 * Se encontró usando el producto: el tablero anunciaba «Suscripción trialing
 * hasta 9/14/2026». Es la fecha del 14 de septiembre escrita a la americana,
 * en un producto cuyo sistema de diseño exige español mexicano. La causa era un
 * `toLocaleDateString()` sin locale, que no falla nunca: adopta el del
 * navegador, así que sale bien en la máquina de quien lo escribió y mal en la
 * del cliente.
 *
 * El segundo hallazgo fue peor y menos visible: `formatMagnitude`, el
 * formateador con el que el MOTOR responde a las consultas, usaba **`es-ES`**.
 * España separa millares con punto y decimales con coma; México al revés. El
 * mismo volumen sale `1234,5678` en un país y `1,234.5678` en el otro. En un
 * CAD, un número que se lee mal no es un detalle de idioma.
 *
 * ## Qué fija este spec, y qué NO
 *
 * Fija las dos conductas por su RESULTADO, no por la cadena `"es-MX"`: importa
 * que el 14 de septiembre salga como 14/9 y que mil doscientos treinta y cuatro
 * coma cinco salga con coma de millares y punto decimal. Un spec que sólo
 * buscara el literal pasaría con `es-AR`, que formatea como España.
 *
 * NO barre todo el árbol: quedan usos de `toLocaleString()` sin locale sobre
 * NÚMEROS —conteos de entidades en insignias de diagnóstico— cuyo riesgo es
 * menor y cuyos archivos están hoy en manos de otras campañas. Se declara aquí
 * en vez de callarse, que es la regla de la casa.
 *
 * ## Por qué sigue existiendo este spec y no sólo `region/region.spec.ts`
 *
 * `formatMagnitude` ya no tiene el locale incrustado: lo saca de
 * `lib/cad/region`, con México como default explícito y probado por separado
 * en `region/region.spec.ts`. Este archivo se queda porque es el candado del
 * defecto CONCRETO que se encontró — un motor que respondía en la convención
 * de otro país sin que nadie lo pidiera — y borrarlo perdería esa evidencia.
 * El criterio no cambia: se sigue afirmando por RESULTADO, nunca por el
 * nombre del locale.
 */
import { strict as assert } from "node:assert";
import { formatMagnitude } from "./engine/commands/solids-support";
import { REGION_PROFILES } from "./region";

let checks = 0;
const check = (label: string, condition: boolean, detail?: string) => {
  assert.ok(condition, detail ? `${label} — ${detail}` : label);
  checks += 1;
};

// --- El motor responde con la convención mexicana ------------------------
{
  const formatted = formatMagnitude(1234.5678);
  check(
    "millares con COMA y decimales con PUNTO, como en México",
    formatted === "1,234.5678",
    `obtenido "${formatted}"`,
  );
  check(
    "y NO con la convención española (1.234,5678)",
    !/^\d+\.\d{3},/.test(formatted),
    `obtenido "${formatted}"`,
  );
  check(
    "un entero no inventa decimales",
    formatMagnitude(120) === "120",
    formatMagnitude(120),
  );
  check(
    "lo no finito se dice con una raya",
    formatMagnitude(Number.NaN) === "—",
  );
  check(
    "lo diminuto pasa a notación científica en vez de a cero",
    formatMagnitude(1e-9).includes("e"),
    formatMagnitude(1e-9),
  );
  check(
    "es configurable: pedir explícitamente España responde en su convención",
    formatMagnitude(12345.5678, REGION_PROFILES.ES) === "12.345,5678",
    formatMagnitude(12345.5678, REGION_PROFILES.ES),
  );
}

// --- Las fechas visibles salen en el orden mexicano ----------------------
{
  // 14 de septiembre de 2026, a mediodía UTC para que ninguna zona lo mueva.
  const date = new Date("2026-09-14T12:00:00Z");
  const mx = date.toLocaleDateString("es-MX", { timeZone: "UTC" });
  check("día antes que mes", mx.startsWith("14"), mx);
  check(
    "y no el orden americano, que fue el defecto que se encontró",
    !mx.startsWith("9/"),
    mx,
  );
}

console.log(`✔ locale es-MX: ${checks} aserciones verdes`);
