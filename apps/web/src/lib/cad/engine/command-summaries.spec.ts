/**
 * El contrato fail-closed del catálogo de resúmenes, contra el registro REAL.
 *
 * Dos direcciones, ninguna opcional:
 *
 *   1. Todo comando registrado tiene resumen o exclusión explícita. Un comando
 *      nuevo sin su línea en español rompe el CI aquí, con su nombre, antes de
 *      publicarse mudo en la paleta.
 *   2. Todo resumen corresponde a un comando registrado. Un comando que se
 *      retira arrastra su prosa; este catálogo no acumula cadáveres.
 */
import { strict as assert } from "node:assert";
import {
  CAD_COMMAND_SUMMARIES,
  CAD_COMMAND_SUMMARY_EXCLUSIONS,
  cadCommandSummary,
} from "./command-summaries";
import { CAD_COMMAND_REGISTRY_V2 } from "./index";

const names = CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name);
const nameSet = new Set(names);

// --- 1: ningún comando mudo -----------------------------------------------------
const silent = names.filter(
  (name) => !CAD_COMMAND_SUMMARIES[name] && !CAD_COMMAND_SUMMARY_EXCLUSIONS.has(name),
);
assert.deepEqual(
  silent,
  [],
  `comandos registrados sin resumen ni exclusión explícita: ${silent.join(", ")}`,
);

// --- 2: ningún resumen huérfano ---------------------------------------------------
const orphans = Object.keys(CAD_COMMAND_SUMMARIES).filter((name) => !nameSet.has(name));
assert.deepEqual(orphans, [], `resúmenes de comandos que ya no existen: ${orphans.join(", ")}`);

// Y una exclusión de un comando inexistente también es un cadáver.
const ghostExclusions = [...CAD_COMMAND_SUMMARY_EXCLUSIONS].filter((name) => !nameSet.has(name));
assert.deepEqual(ghostExclusions, [], `exclusiones sin comando: ${ghostExclusions.join(", ")}`);

// --- La prosa es UNA línea útil, no un ensayo ni un eco del nombre ----------------
for (const [name, summary] of Object.entries(CAD_COMMAND_SUMMARIES)) {
  assert.ok(summary.trim().length >= 10, `${name}: el resumen es demasiado corto para orientar`);
  assert.ok(summary.length <= 110, `${name}: el resumen no cabe en una línea de paleta (${summary.length})`);
  assert.ok(!summary.includes("\n"), `${name}: el resumen tiene salto de línea`);
}

// --- El acceso es fail-closed ------------------------------------------------------
assert.equal(cadCommandSummary("trim"), CAD_COMMAND_SUMMARIES.TRIM, "insensible a mayúsculas");
assert.throws(
  () => cadCommandSummary("COMANDO_QUE_NO_EXISTE"),
  /no tiene resumen/,
  "pedir el resumen de un comando mudo lanza, no devuelve vacío",
);

console.log(
  `resúmenes de paleta: ${Object.keys(CAD_COMMAND_SUMMARIES).length} para ${names.length} comandos, ` +
    `${CAD_COMMAND_SUMMARY_EXCLUSIONS.size} exclusiones`,
);
