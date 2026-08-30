/**
 * Agregador de las specs unitarias POR DIRECTORIO, no por lista manual: una
 * spec nueva corre por el hecho de existir en `tests/unit/`. La lista escrita
 * a mano que hubo aquí era una clase entera de fallo esperando turno — una
 * spec creada y no añadida jamás se ejecutaba, y ningún gate lo detectaba.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const unitDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "unit");
const specs = readdirSync(unitDir)
  .filter((file) => file.endsWith(".spec.ts"))
  .sort();
if (specs.length === 0) {
  throw new Error(`No hay specs en ${unitDir}: el agregador no tiene qué correr.`);
}
for (const file of specs) {
  // `.js` a propósito: la resolución nodenext mapea el especificador a `.ts`.
  await import(`./unit/${file.replace(/\.ts$/u, ".js")}`);
}
