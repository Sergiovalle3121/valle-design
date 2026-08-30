/**
 * Agregador de las specs adversariales POR DIRECTORIO — misma regla que
 * `unit.spec.ts`: una spec corre por existir, no por estar en una lista.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adversarialDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "adversarial",
);
const specs = readdirSync(adversarialDir)
  .filter((file) => file.endsWith(".spec.ts"))
  .sort();
if (specs.length === 0) {
  throw new Error(
    `No hay specs en ${adversarialDir}: el agregador no tiene qué correr.`,
  );
}
for (const file of specs) {
  // `.js` a propósito: la resolución nodenext mapea el especificador a `.ts`.
  await import(`./adversarial/${file.replace(/\.ts$/u, ".js")}`);
}
