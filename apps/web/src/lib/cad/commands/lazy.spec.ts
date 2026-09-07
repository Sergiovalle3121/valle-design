/**
 * `loadCadNlCommands` sobre los módulos reales: confirma que la carga
 * perezosa entrega el merge de `parser` + `executor` y que
 * `cadNlCommandsIfLoaded` sólo deja de ser null después de resolver. La
 * recuperación tras un rechazo (T-72e) está cubierta en
 * `lazy-singleton.spec.ts` sobre el cargador genérico.
 */
import { strict as assert } from "node:assert";
import { cadNlCommandsIfLoaded, loadCadNlCommands } from "./lazy";
import * as parser from "./parser";
import * as executor from "./executor";

async function main() {
  assert.equal(cadNlCommandsIfLoaded(), null, "nada cargado antes del primer load");

  const loaded = await loadCadNlCommands();
  assert.equal(typeof loaded.parseCadCommand, typeof parser.parseCadCommand, "trae el parser real");
  assert.ok(Object.keys(executor).every((key) => key in loaded), "trae todas las claves del executor");

  const second = await loadCadNlCommands();
  assert.equal(loaded, second, "segunda llamada memoizada, misma instancia");
  assert.equal(cadNlCommandsIfLoaded(), loaded, "queda accesible de forma síncrona tras resolver");
}

main().then(() => console.log("lazy: OK"));
