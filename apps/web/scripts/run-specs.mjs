#!/usr/bin/env node
/**
 * Runner de los specs script-style del web (node assert / contadores ok()):
 * ejecuta cada src/**\/*.spec.ts con tsx. Eran 47 suites escritas SIN runner
 * (tests muertos que se pudrían en silencio) — este script las convierte en
 * gate de CI. ADR §149.
 *
 * POR QUÉ NO BASTA EL CÓDIGO DE SALIDA. Un spec cuyo trabajo asíncrono de nivel
 * superior nunca resuelve deja el event loop vacío: Node termina con 0, sin
 * imprimir nada, y el runner lo daba por VERDE. No es hipotético — pasó al
 * escribir el spec de la cola de checkpoints, que colgaba en un `await` que
 * nadie iba a resolver y aun así salía ✅ sin haber ejecutado sus aserciones.
 * Un gate que aprueba un test colgado es exactamente el problema que este
 * runner existe para impedir.
 *
 * Dos reglas cierran el hueco, y ninguna intenta juzgar si el spec es CORRECTO:
 *
 *   1. Anunciar el final. Un spec debe imprimir algo en stdout. Es la señal más
 *      barata de "llegué al final del fichero"; los `console.log` finales que ya
 *      tenían 128 de 140 specs eran justo eso, sin que nadie los exigiera.
 *   2. Terminar. Si en vez de vaciar el event loop lo mantiene vivo (un
 *      `setInterval`, un socket abierto), `execFileSync` bloquearía hasta que
 *      caducase el job COMPLETO, sin decir qué spec fue. Un timeout por spec
 *      convierte eso en un fallo con nombre propio.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { globSync } from "glob";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Margen por spec. El más lento del repo baja de 20 s; 120 s es holgado. */
export const SPEC_TIMEOUT_MS = 120_000;

/**
 * Resultado por spec. `status` distingue las tres formas de fallar, porque el
 * mensaje útil es distinto en cada una.
 */
export function runSpecs({
  root = path.resolve(here, ".."),
  pattern = "src/**/*.spec.ts",
  timeoutMs = SPEC_TIMEOUT_MS,
} = {}) {
  const specs = globSync(pattern, { cwd: root }).sort();
  const require = createRequire(import.meta.url);
  const tsxCli = require.resolve("tsx/cli");
  return specs.map((spec) => {
    let stdout = "";
    try {
      stdout = execFileSync(process.execPath, [tsxCli, spec], {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        timeout: timeoutMs,
      });
    } catch (err) {
      const timedOut = err?.code === "ETIMEDOUT" || err?.signal === "SIGTERM";
      return {
        spec,
        status: timedOut ? "timeout" : "failed",
        detail: timedOut
          ? `El spec no terminó en ${timeoutMs} ms. Suele ser un temporizador o un recurso abierto que nadie cierra.`
          : `${err?.message ?? ""}\n${err?.stdout ?? ""}${err?.stderr ?? ""}`,
      };
    }
    if (!stdout.trim()) {
      return {
        spec,
        status: "silent",
        detail:
          "Terminó con éxito pero no imprimió nada. Un spec que se cuelga en una promesa que nunca resuelve sale igual (código 0, sin salida), así que el runner no puede distinguirlos: añade un console.log final que confirme que llegó al final.",
      };
    }
    return { spec, status: "passed", detail: "" };
  });
}

/** Sólo actúa como CLI cuando se ejecuta directamente, no al importarse. */
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const results = runSpecs();
  if (results.length === 0) {
    console.error("No se encontró ningún spec — ¿glob roto?");
    process.exit(1);
  }
  const failures = [];
  for (const result of results) {
    if (result.status === "passed") {
      console.log(`✅ ${result.spec}`);
      continue;
    }
    failures.push(result);
    const label = result.status === "timeout" ? "⏱" : result.status === "silent" ? "🔇" : "❌";
    console.error(`${label} ${result.spec}`);
    console.error(
      result.detail
        .split("\n")
        .slice(-15)
        .map((line) => `   ${line}`)
        .join("\n"),
    );
  }
  console.log(`\n${results.length - failures.length}/${results.length} specs verdes`);
  if (failures.length) {
    console.error(`Fallaron: ${failures.map((result) => result.spec).join(", ")}`);
    process.exit(1);
  }
}
