/**
 * El gate de specs tiene que fallar un spec COLGADO.
 *
 * `run-specs.mjs` decidía verde/rojo mirando sólo el código de salida. Un spec
 * cuyo trabajo asíncrono de nivel superior nunca resuelve deja el event loop
 * vacío, Node termina con 0 y no imprime nada: se contaba como ✅ sin haber
 * ejecutado sus aserciones. Pasó de verdad al escribir el spec de la cola de
 * checkpoints (PR #24), así que esto no es una hipótesis.
 *
 * Los fixtures viven FUERA de `src/` a propósito: si estuviesen dentro, el
 * glob del runner los recogería en la pasada real y el gate se suspendería a
 * sí mismo.
 */
import { strict as assert } from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";

const webRoot = path.resolve(__dirname, "../..");

void (async () => {
  // Import dinámico: el runner es ESM (.mjs) y este spec se compila a CJS.
  const { runSpecs } = (await import(
    pathToFileURL(path.join(webRoot, "scripts/run-specs.mjs")).href
  )) as typeof import("../../scripts/run-specs.mjs");

  const results = runSpecs({
    root: webRoot,
    pattern: "scripts/__fixtures__/spec-runner/*.spec.ts",
    // Corto a propósito: el fixture que no termina no debe costar dos minutos.
    timeoutMs: 8_000,
  });

  const status = new Map(results.map((result) => [path.basename(result.spec), result]));
  assert.equal(results.length, 4, "los cuatro fixtures se recogen");

  /* ── Un spec sano pasa ─────────────────────────────────────────────────── */
  assert.equal(status.get("passes.spec.ts")?.status, "passed");

  /* ── EL DEFECTO: colgarse en silencio no puede contar como verde ───────── */
  const silent = status.get("hangs-silently.spec.ts");
  assert.equal(
    silent?.status,
    "silent",
    "un spec que sale con 0 sin imprimir nada no puede darse por bueno: es indistinguible de uno colgado",
  );
  assert.match(String(silent?.detail), /console\.log final/);

  /* ── Colgarse manteniendo vivo el loop se atribuye al spec culpable ────── */
  assert.equal(
    status.get("never-ends.spec.ts")?.status,
    "timeout",
    "sin timeout por spec, éste agotaría el job entero sin decir quién fue",
  );

  /* ── Un fallo normal sigue siendo un fallo normal ──────────────────────── */
  const failed = status.get("fails.spec.ts");
  assert.equal(failed?.status, "failed");
  assert.match(
    String(failed?.detail),
    /el fixture falla a propósito/,
    "el mensaje real de la aserción tiene que llegar al informe",
  );

  console.log("spec-runner: un spec colgado, mudo o caducado ya no pasa por verde");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
