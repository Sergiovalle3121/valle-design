#!/usr/bin/env node
/**
 * `check:cad-math` — la matemática al cien, encadenada al gate.
 *
 * Corre las suites de `apps/web/src/lib/cad/verification/` y publica el número
 * que la campaña de lanzamiento prometió: cuántos casos numéricos se
 * verificaron contra un oráculo INDEPENDIENTE y cuántas desviaciones salieron
 * fuera de tolerancia.
 *
 * ─── Por qué un lanzador propio y no `npm test --workspace=web` ────────────
 *
 * Porque el número tiene que poder publicarse. `run-specs.mjs` corre las 420
 * suites del web y dice «420/420 verdes», que es la señal correcta para un
 * gate pero no responde «¿cuántos casos numéricos hay?». Estas seis suites
 * imprimen su recuento y este lanzador lo SUMA, así que el informe de la
 * campaña enlaza a una cifra medida en vez de a una estimación.
 *
 * Las suites siguen corriendo TAMBIÉN en `npm test` — viven bajo `src/**\/*.spec.ts`
 * como todas las demás. Este comando no las sustituye: las destaca.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webRoot = path.join(root, "apps/web");
const verificationDir = path.join(webRoot, "src/lib/cad/verification");

const specs = readdirSync(verificationDir)
  .filter((file) => file.endsWith(".spec.ts"))
  .sort();

if (specs.length === 0) {
  console.error(
    "No hay ni una suite de verificación numérica. Si se borraron, el gate\n" +
      "que las corre no puede seguir en verde: bórralo también o repóntelas.",
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");

let total = 0;
let failed = 0;
const lines = [];

for (const spec of specs) {
  const relative = path.join("src/lib/cad/verification", spec);
  try {
    const stdout = execFileSync(process.execPath, [tsxCli, relative], {
      cwd: webRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    });
    // Cada suite anuncia su recuento con «: N comprobaciones». Si una deja de
    // hacerlo, cuenta como 0 y el total baja — que es la señal correcta: una
    // suite que no dice cuánto verificó no ha verificado nada comprobable.
    const match = stdout.match(/:\s*(\d+)\s+comprobaciones/u);
    const count = match ? Number(match[1]) : 0;
    total += count;
    lines.push(`  ✅ ${spec} — ${count} comprobaciones`);
    for (const extra of stdout.split("\n").filter((line) => line.startsWith("  · ")))
      lines.push(`     ${extra.trim()}`);
  } catch (error) {
    failed += 1;
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    const reason =
      output.match(/AssertionError[^\n]*\n?[^\n]*/u)?.[0] ?? String(error.message).slice(0, 300);
    lines.push(`  ❌ ${spec}\n     ${reason.trim()}`);
  }
}

console.log("Verificación numérica contra oráculo independiente:");
for (const line of lines) console.log(line);

if (failed > 0) {
  console.error(
    `\n${failed} suite(s) de verificación en rojo. Una desviación fuera de tolerancia\n` +
      "no es un umbral que ajustar: es un número que el producto está dando mal.",
  );
  process.exit(1);
}

console.log(
  `\n${total} casos numéricos verificados contra oráculo independiente · 0 desviaciones fuera de tolerancia.`,
);
