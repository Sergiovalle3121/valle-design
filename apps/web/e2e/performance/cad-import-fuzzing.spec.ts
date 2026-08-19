/**
 * Corpus hostil y fuzzing de la importación de JSON canónico, ejecutados EN EL
 * NAVEGADOR.
 *
 * ## Qué pregunta contesta este archivo que Node no podía contestar
 *
 * El importador ya tenía corpus hostil en Node. El problema es que las tres
 * puertas que protegen esta ruta NO son del producto, son del intérprete:
 *
 * 1. **`__proto__`**. La guarda de claves inseguras recorre el árbol con
 *    `Object.entries` y salta si encuentra `__proto__`, `prototype` o
 *    `constructor`. Que `JSON.parse` materialice `__proto__` como propiedad
 *    PROPIA Y ENUMERABLE —y no como el prototipo del objeto, donde
 *    `Object.entries` no la vería— es comportamiento del motor. Node responde
 *    por V8; no responde por SpiderMonkey.
 * 2. **La profundidad**. Nuestro recorrido es iterativo y corta a 128 niveles,
 *    pero `JSON.parse` es recursivo DENTRO del motor: un documento bastante
 *    anidado revienta la pila del intérprete antes de llegar a nuestra guarda.
 *    Dónde está ese punto, y si el fallo sale como excepción capturable o como
 *    pestaña muerta, lo decide el motor.
 * 3. **Los bytes**. El límite de 20 MB se mide con `TextEncoder`, y ante media
 *    pareja subrogada la cuenta de bytes deja de seguir a la de caracteres.
 *
 * ## Cómo se ejecuta el código del producto dentro de la página
 *
 * Con el mismo patrón que `cad-render-browser.spec.ts`: esbuild empaqueta el
 * arnés en un IIFE, Playwright lo inyecta con `addScriptTag` sobre una página
 * en blanco y el fuzzer corre dentro. No hay servidor Next, no hay backend, no
 * hay red: lo único que se está midiendo es el importador real frente al motor
 * real. El corpus es EL MISMO módulo que ejecuta el spec de Node
 * (`src/lib/cad/document-import-fuzz.ts`), y ésa es la razón de que viva en
 * `src/` y no aquí: dos listas distintas no se pueden comparar.
 *
 * ## Qué bloquea
 *
 * Invariantes, nunca tiempos. Que el fuzzer sea determinista entre sus dos
 * pasadas; que ningún caso escape por el error genérico; que nadie lance algo
 * que no sea `Error`; que el corpus declarado caiga donde dice; y que todo lo
 * que el importador ACEPTA sobreviva a su propia serialización. Los tiempos se
 * publican y no fijan presupuesto: esta máquina tiene vecinos.
 *
 * ## La comparación entre motores
 *
 * Playwright corre este archivo una vez por proyecto. Cada corrida escribe su
 * artefacto con nombre estable y LEE los de los demás motores: si Chromium y
 * Firefox clasifican el mismo caso en clases distintas, eso sale publicado como
 * hallazgo. Es literalmente la pregunta de la fila de la rúbrica.
 *
 * Ejecución:
 *   CAD_PERF_E2E=1 npx playwright test e2e/performance/cad-import-fuzzing.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Mutaciones por pasada. Dos pasadas por corrida, dos corridas por motor. */
const MUTATIONS = 2_000;

let bundle = "";
const consoleErrors: string[] = [];

/**
 * Empaqueta el arnés. Va por `stdin` y no por un fichero de entrada porque el
 * punto de entrada es una línea, y crear un archivo sólo para eso metería en
 * `src/` un módulo que nada del producto importa.
 */
async function buildFuzzBundle(): Promise<string> {
  const resolveDir = path.resolve(__dirname, "../../src/lib/cad");
  const result = await build({
    stdin: {
      contents:
        "import { installCadImportFuzz } from './document-import-fuzz';\ninstallCadImportFuzz();\n",
      resolveDir,
      loader: "ts",
      sourcefile: "cad-import-fuzz-harness.ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    loader: { ".json": "json" },
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

async function preparePage(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.setContent(
    '<!doctype html><html><head><meta charset="utf-8"><title>cad-import-fuzz</title></head><body></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => typeof window.__cadImportFuzz !== "undefined");
  return errors;
}

const artifactDir = path.resolve(__dirname, "../.artifacts/cad-import-fuzzing");

/** Artefactos de otros motores ya escritos en esta invocación de Playwright. */
function siblingArtifacts(current: string): { project: string; data: Record<string, unknown> }[] {
  if (!fs.existsSync(artifactDir)) return [];
  return fs
    .readdirSync(artifactDir)
    .filter((file) => file.endsWith(".json") && file !== `${current}.json`)
    .map((file) => ({
      project: file.replace(/\.json$/, ""),
      data: JSON.parse(fs.readFileSync(path.join(artifactDir, file), "utf8")),
    }));
}

test.describe("CAD import · corpus hostil y fuzzing en navegador", () => {
  test.skip(process.env.CAD_PERF_E2E !== "1", "Run explicitly with CAD_PERF_E2E=1.");
  // Diez minutos de techo para el proceso: el corpus incluye un caso de 20 MB
  // REALES y un motor sin JIT calentado lo paga caro. No es un presupuesto.
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    bundle = await buildFuzzBundle();
    expect(bundle.length, "el arnés no se empaquetó").toBeGreaterThan(10_000);
  });

  test("runs the hostile corpus and the deterministic fuzzer inside the engine", async ({
    page,
  }, testInfo) => {
    consoleErrors.push(...(await preparePage(page)));

    const run = await page.evaluate(
      async ([mutations]) =>
        window.__cadImportFuzz!.run({ mutations: mutations as number, includeHuge: true }),
      [MUTATIONS] as const,
    );

    // -----------------------------------------------------------------------
    // Invariantes. Ninguno depende de la velocidad de la máquina.
    // -----------------------------------------------------------------------
    expect(
      run.deterministic,
      `el fuzzer no es determinista en este motor: ${run.divergence}`,
    ).toBe(true);

    for (const [index, pass] of run.passes.entries()) {
      expect(pass.cases, `la pasada ${index + 1} no ejercitó el corpus`).toBeGreaterThan(MUTATIONS);
      expect(
        pass.unknownOutcomes.map((entry) => `${entry.id} → «${entry.message}»`),
        "ningún caso puede escapar por el error genérico: un mensaje que nadie ha previsto es una " +
          "puerta que nadie ha revisado",
      ).toEqual([]);
      expect(
        pass.nonErrorThrows,
        "todo fallo del importador tiene que ser un Error; una cadena lanzada a pelo rompe la " +
          "promesa de error tipado aunque el texto suene razonable",
      ).toEqual([]);
      expect(
        pass.unexpected.map(
          (entry) => `${entry.id}: esperaba ${entry.expected}, dio ${entry.got} («${entry.message}»)`,
        ),
        "el corpus hostil declarado tiene que caer donde dice que va a caer",
      ).toEqual([]);
      expect(
        Object.keys(pass.histogram).length,
        "un histograma con pocas clases significa que el corpus ataca una sola puerta",
      ).toBeGreaterThanOrEqual(5);
    }

    // Lo que el importador ACEPTA tiene que poder guardarse. Aceptar una entrada
    // que después no se puede serializar es peor que rechazarla.
    const detailed = await page.evaluate(
      async ([mutations]) =>
        window.__cadImportFuzz!.run({
          mutations: mutations as number,
          includeHuge: false,
          keepResults: true,
        }),
      [400] as const,
    );
    const accepted = detailed.passes[0].results.filter((result) => result.outcome === "ok");
    expect(accepted.length, "ninguna entrada se aceptó: no se está midiendo el camino feliz").toBeGreaterThan(0);
    expect(
      accepted.filter((result) => result.roundTripStable !== true).map((result) => result.id),
      "todo documento aceptado debe sobrevivir a su propia serialización",
    ).toEqual([]);

    // -----------------------------------------------------------------------
    // Comparación entre motores
    // -----------------------------------------------------------------------
    const project = testInfo.project.name;
    const findings: string[] = [];
    for (const sibling of siblingArtifacts(project)) {
      const other = sibling.data as {
        histogram?: Record<string, number>;
        digest?: string;
        engine?: string;
      };
      if (!other.histogram) continue;
      if (other.digest === run.passes[0].digest) {
        findings.push(
          `${project} y ${sibling.project} clasifican los ${run.passes[0].cases} casos EXACTAMENTE ` +
            `igual (digest ${run.passes[0].digest}): en este corpus, el motor no cambia la respuesta ` +
            "del importador.",
        );
        continue;
      }
      const classes = new Set([
        ...Object.keys(run.passes[0].histogram),
        ...Object.keys(other.histogram),
      ]);
      const differences = [...classes]
        .filter((key) => (run.passes[0].histogram[key] ?? 0) !== (other.histogram![key] ?? 0))
        .map(
          (key) =>
            `${key}: ${project}=${run.passes[0].histogram[key] ?? 0} vs ${sibling.project}=${other.histogram![key] ?? 0}`,
        );
      findings.push(
        `El MOTOR cambia la clasificación: ${project} y ${sibling.project} difieren en ` +
          `${differences.length} clase(s) — ${differences.join(" · ")}. Ésta es exactamente la ` +
          "razón por la que este corpus no podía quedarse en Node.",
      );
    }

    // -----------------------------------------------------------------------
    // Artefacto
    // -----------------------------------------------------------------------
    const cpus = os.cpus();
    const artifact = {
      $schema: "urn:valle-design:schema:cad-import-fuzzing-run:v1",
      schemaVersion: 1,
      project,
      recordedAt: new Date().toISOString(),
      seed: run.seed,
      engine: run.environment.engine,
      userAgent: run.environment.userAgent,
      cases: run.passes[0].cases,
      mutations: MUTATIONS,
      passes: run.passes.length,
      deterministic: run.deterministic,
      digest: run.passes[0].digest,
      histogram: run.passes[0].histogram,
      slowestCase: run.passes[0].slowestCase,
      passDurationsMs: run.passes.map((pass) => pass.totalMs),
      roundTrip: {
        acceptedCases: accepted.length,
        unstable: accepted.filter((result) => result.roundTripStable !== true).length,
        criterion:
          "serializar el documento importado, volver a importarlo y volver a serializarlo tiene que " +
          "dar el MISMO texto.",
      },
      crossEngineFindings: findings,
      consoleErrors,
      environment: {
        node: process.version,
        osType: os.type(),
        osRelease: os.release(),
        cpuModel: cpus[0]?.model ?? "desconocido",
        logicalCpuCount: cpus.length,
        totalMemoryBytes: os.totalmem(),
        declaredMachine:
          `${cpus[0]?.model?.trim() ?? "CPU desconocida"} (${cpus.length} hilos lógicos), ` +
          `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}, ` +
          "portátil de desarrollo CON CARGA VECINA: otros agentes trabajando en el mismo equipo. " +
          "Los tiempos de este artefacto son informativos y NO fijan presupuesto.",
      },
      scope: {
        measured: [
          "el corpus hostil declarado y las mutaciones deterministas, ejecutados por el motor real",
          "clasificación de CADA caso en una clase de fallo conocida, con su histograma",
          "determinismo del fuzzer: dos pasadas de la misma semilla comparadas por digest",
          "estabilidad de round-trip de todo documento aceptado",
          "comparación de la clasificación entre motores, cuando hay más de un proyecto",
        ],
        notMeasured: [
          "el camino del worker (document-import.worker.ts) y su plazo de 45 s: `new Worker(new URL(…, " +
            "import.meta.url))` no sobrevive a un empaquetado IIFE inyectado en una página en blanco. " +
            "Ese camino tiene su propia fila en la rúbrica y sus propios specs; aquí se declara fuera.",
          "la interfaz de importación del panel: este spec ataca la lógica de validación, no el " +
            "recorrido de la persona.",
          "tiempos como presupuesto: se publican y no bloquean.",
          "compatibilidad DWG",
        ],
      },
    };

    const body = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    await testInfo.attach("cad-import-fuzzing.json", { body, contentType: "application/json" });
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, `${project}.json`), body);
    console.log(JSON.stringify(artifact));
    for (const finding of findings) console.log(`HALLAZGO · ${finding}`);

    expect(consoleErrors, "el motor no debe registrar errores durante el fuzzing").toEqual([]);
  });
});
