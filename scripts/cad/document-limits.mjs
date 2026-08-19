#!/usr/bin/env node
/**
 * Presupuesto de documento y de memoria — hasta dónde se sostiene la promesa.
 *
 * ## Por qué existe
 *
 * `apps/web/e2e/real/cad-offline-multitab.spec.ts` demuestra que el trabajo no
 * se pierde cuando se cae la red, cuando el mismo plano está abierto dos veces
 * y cuando la pestaña muere sin avisar. Lo hace con un documento de tres arcos,
 * y eso deja una pregunta abierta que un cliente sí va a hacer: **¿hasta qué
 * tamaño de plano sigue siendo cierto?**
 *
 * La red de seguridad tiene un coste que crece con el dibujo: serializar,
 * comprimir, cifrar el hash, escribir en IndexedDB y volver a leerlo. Si ese
 * coste se dispara, el checkpoint deja de llegar a tiempo y la promesa se
 * rompe justo con los planos que más duele perder. Este script lo mide y lo
 * publica en `docs/cad/evidence/document-limits.json`.
 *
 * ## Por qué arranca un navegador de verdad
 *
 * Porque `CompressionStream` e IndexedDB no existen en Node, y un número de
 * Node sobre ellos sería inventado. La sonda (`document-limits-probe.mts`) se
 * empaqueta con esbuild —importando las funciones REALES del producto, no
 * copias— y se ejecuta dentro de Chromium. Aquí sólo se orquesta, se toma la
 * mediana y se escribe el artefacto.
 *
 * ## Regla de la casa
 *
 * Si se cita un número, se cita la máquina. El artefacto declara CPU, memoria,
 * Node, navegador y el límite de montón que el propio navegador reportó. Y
 * publica **mediana de 3**, no la mejor pasada: en una máquina con carga
 * vecina la mejor pasada es una anécdota.
 *
 * Uso:
 *   node scripts/cad/document-limits.mjs
 *   node scripts/cad/document-limits.mjs --tiers 2000,10000,40000 --repeat 3
 *   node scripts/cad/document-limits.mjs --output docs/cad/evidence/x.json
 *   node scripts/cad/document-limits.mjs --machine "Ryzen 5 5500U, 7,4 GB"
 */
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const WEB_SRC = path.join(REPO_ROOT, "apps/web/src");
const PROBE = path.join(here, "document-limits-probe.mts");
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  "docs/cad/evidence/document-limits.json",
);
const require = createRequire(import.meta.url);

/**
 * Escalones de tamaño.
 *
 * 20.000 es el plano real de despacho que ya sostiene
 * `cad-plan-benchmark-20k.json`; por debajo va el trabajo cotidiano y por
 * encima se busca el punto en que la red de seguridad deja de sostenerse.
 *
 * El último escalón está A PROPÓSITO por encima del techo de entidades que
 * declara el servidor: un presupuesto que sólo enseña escalones que pasan no
 * dice dónde está la pared. Ése la enseña, y con su coste medido al lado.
 */
const DEFAULT_TIERS = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 150_000];
const DEFAULT_REPEAT = 3;

/**
 * Presupuestos que definen «la promesa se sostiene» en un escalón.
 *
 * No son gustos: cada uno sale de un hecho del producto.
 *
 *  · El checkpoint local tiene que caber HOLGADAMENTE dentro del periodo con
 *    que se programa (15 s). Se exige un quinto de ese periodo: si escribir un
 *    checkpoint consume más del 20 % del intervalo, el siguiente empieza tarde
 *    y la ventana de pérdida crece sin que nadie lo vea.
 *  · El archivo comprimido tiene que caber en lo que el servidor acepta
 *    (`CAD_DOCUMENT_MAX_COMPRESSED_BYTES`), o el guardado no existe.
 *  · El montón usado tiene que quedar por debajo de la mitad del límite que el
 *    navegador declara: el editor además renderiza, y un corpus que ya roza el
 *    techo en frío no deja sitio para dibujar.
 */
const CHECKPOINT_INTERVAL_MS = 15_000;
const CHECKPOINT_BUDGET_FRACTION = 0.2;
const HEAP_BUDGET_FRACTION = 0.5;

function parseArgs(argv) {
  const options = {
    tiers: DEFAULT_TIERS,
    repeat: DEFAULT_REPEAT,
    output: DEFAULT_OUTPUT,
    machine: process.env.VALLE_DECLARED_MACHINE ?? null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--tiers") {
      options.tiers = value
        .split(",")
        .map((entry) => Number.parseInt(entry.trim(), 10));
      index += 1;
    } else if (flag === "--repeat") {
      options.repeat = Number.parseInt(value, 10);
      index += 1;
    } else if (flag === "--output") {
      options.output = path.resolve(REPO_ROOT, value);
      index += 1;
    } else if (flag === "--machine") {
      options.machine = value;
      index += 1;
    }
  }
  if (options.tiers.some((entry) => !Number.isFinite(entry) || entry <= 0))
    throw new Error("--tiers pide enteros positivos separados por comas");
  if (!(options.repeat >= 1))
    throw new Error("--repeat pide al menos 1 pasada");
  return options;
}

/**
 * Techos que declara el servidor, LEÍDOS de su fuente.
 *
 * Copiarlos aquí sería garantizar que un día dejan de coincidir y que el
 * artefacto publica un límite que ya no existe. Si el nombre desaparece, esto
 * revienta a propósito: prefiero que falle el script a que mienta el número.
 */
function serverCeilings() {
  const read = (relative, constant) => {
    const source = fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
    const match = new RegExp(
      `${constant}\\s*=\\s*([0-9_]+(?:\\s*\\*\\s*[0-9_]+)*)`,
    ).exec(source);
    if (!match)
      throw new Error(
        `no se encontró ${constant} en ${relative}: el artefacto no puede publicar un techo que no ha leído`,
      );
    return match[1]
      .split("*")
      .map((factor) => Number(factor.replace(/_/gu, "").trim()))
      .reduce((product, factor) => product * factor, 1);
  };
  const validation = "apps/api/src/modules/cad-documents/cad-document-validation.ts";
  return {
    maxEntities: read(validation, "MAX_ENTITIES"),
    maxInlineBytes: read(validation, "CAD_DOCUMENT_MAX_INLINE_BYTES"),
    maxArchiveBytes: read(validation, "CAD_DOCUMENT_MAX_ARCHIVE_BYTES"),
    maxCompressedBytes: read(
      "apps/api/src/modules/cad-documents/cad-document-storage.ts",
      "CAD_DOCUMENT_MAX_COMPRESSED_BYTES",
    ),
    jsonBodyLimit: /JSON_BODY_LIMIT\s*=\s*['"]([^'"]+)['"]/u.exec(
      fs.readFileSync(
        path.join(REPO_ROOT, "apps/api/src/bootstrap/production-hardening.ts"),
        "utf8",
      ),
    )?.[1],
  };
}

/** Empaqueta la sonda con las funciones reales del producto. */
async function buildProbe() {
  const esbuild = require("esbuild");
  const result = await esbuild.build({
    entryPoints: [PROBE],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    // El editor importa por alias; la sonda tiene que resolverlo igual o
    // estaría midiendo otro árbol de módulos.
    alias: { "@": WEB_SRC },
    loader: { ".mts": "ts", ".ts": "ts" },
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

/** Servidor mínimo: IndexedDB y `CompressionStream` exigen un origen real. */
function serveProbe(bundle) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      if (request.url === "/probe.js") {
        response.writeHead(200, { "content-type": "text/javascript" });
        response.end(bundle);
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        '<!doctype html><meta charset="utf-8"><title>document-limits</title><script src="/probe.js"></script>',
      );
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port }),
    );
  });
}

/** Mediana, no media: una pasada mala no puede arrastrar la cifra publicada. */
function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const round = (value, decimals = 3) =>
  value === null || value === undefined
    ? null
    : Number(value.toFixed(decimals));

function summarize(samples) {
  const pick = (key) => samples.map((sample) => sample[key]);
  const maybe = (key) => {
    const values = pick(key).filter((value) => typeof value === "number");
    return values.length === samples.length ? median(values) : null;
  };
  return {
    entities: samples[0].entities,
    repeats: samples.length,
    buildMs: round(median(pick("buildMs"))),
    serializeMs: round(median(pick("serializeMs"))),
    documentBytes: Math.round(median(pick("documentBytes"))),
    gzipMs: round(median(pick("gzipMs"))),
    archiveBytes: Math.round(median(pick("archiveBytes"))),
    checkpoint: {
      encodeMs: round(median(pick("checkpointEncodeMs"))),
      storedBytes: Math.round(median(pick("checkpointBytes"))),
      format: samples[0].checkpointFormat,
      decodeMs: round(median(pick("checkpointDecodeMs"))),
      indexedDbWriteMs: round(median(pick("indexedDbWriteMs"))),
      indexedDbReadMs: round(median(pick("indexedDbReadMs"))),
      // Lo que de verdad decide si la red de seguridad llega a tiempo: todo el
      // camino desde que hay que salvar hasta que la transacción confirma.
      totalMs: round(
        median(
          samples.map(
            (sample) => sample.checkpointEncodeMs + sample.indexedDbWriteMs,
          ),
        ),
      ),
    },
    reopenMs: round(median(pick("reopenMs"))),
    heapUsedBytes: maybe("heapUsedBytes") === null ? null : Math.round(maybe("heapUsedBytes")),
    heapLimitBytes:
      maybe("heapLimitBytes") === null ? null : Math.round(maybe("heapLimitBytes")),
    // La dispersión se publica SIEMPRE, no sólo la mediana. Esta máquina
    // trabaja con vecinos: quien lea el artefacto tiene derecho a saber si la
    // cifra salió de tres pasadas parecidas o de tres pasadas distintas.
    spread: spreadOf(
      samples.map(
        (sample) => sample.checkpointEncodeMs + sample.indexedDbWriteMs,
      ),
    ),
  };
}

/**
 * Dispersión del camino crítico entre pasadas.
 *
 * `relative` es (máximo − mínimo) / mediana. Por encima de 0,5 la cifra
 * publicada es una mediana de tres números que no se parecen, y eso hay que
 * poder verlo sin abrir el script.
 */
function spreadOf(values) {
  const middle = median(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    minMs: round(min),
    maxMs: round(max),
    relative: middle === 0 ? null : round((max - min) / middle),
  };
}

/** ¿Se sostiene la promesa en este escalón? Con la razón, si no. */
function verdictFor(tier, ceilings) {
  const violations = [];
  const checkpointBudgetMs = CHECKPOINT_INTERVAL_MS * CHECKPOINT_BUDGET_FRACTION;
  if (tier.checkpoint.totalMs > checkpointBudgetMs)
    violations.push(
      `el checkpoint local tarda ${tier.checkpoint.totalMs} ms y el presupuesto es ${checkpointBudgetMs} ms (un quinto del periodo de 15 s)`,
    );
  if (tier.archiveBytes > ceilings.maxCompressedBytes)
    violations.push(
      `el archivo comprimido ocupa ${tier.archiveBytes} B y el servidor acepta ${ceilings.maxCompressedBytes} B`,
    );
  if (tier.entities > ceilings.maxEntities)
    violations.push(
      `${tier.entities} entidades superan el techo del servidor (${ceilings.maxEntities})`,
    );
  if (
    tier.heapUsedBytes !== null &&
    tier.heapLimitBytes !== null &&
    tier.heapUsedBytes > tier.heapLimitBytes * HEAP_BUDGET_FRACTION
  )
    violations.push(
      `el montón usado (${tier.heapUsedBytes} B) pasa de la mitad del límite del navegador (${tier.heapLimitBytes} B)`,
    );
  return { sustained: violations.length === 0, violations };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ceilings = serverCeilings();
  const bundle = await buildProbe();
  const { server, port } = await serveProbe(bundle);
  const { chromium } = require("playwright-core");
  const startedAt = new Date().toISOString();
  // `--enable-precise-memory-info` es lo que convierte `performance.memory` en
  // un dato y no en un valor redondeado a 100 KB por privacidad.
  const browser = await chromium.launch({
    args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
  });
  const failures = [];
  const tiers = [];
  let constants = null;
  let browserInfo = null;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => Boolean(window.__valleDocumentLimits));
    constants = await page.evaluate(() =>
      window.__valleDocumentLimits.constants(),
    );
    browserInfo = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: navigator.deviceMemory ?? null,
      jsHeapLimitBytes: performance.memory?.jsHeapSizeLimit ?? null,
    }));

    for (const entities of options.tiers) {
      const samples = [];
      let failure = null;
      for (let pass = 0; pass < options.repeat; pass += 1) {
        try {
          samples.push(
            await page.evaluate(
              ([count, seed]) =>
                window.__valleDocumentLimits.measure(count, seed),
              [entities, 1_000 + pass],
            ),
          );
        } catch (error) {
          // Que un escalón no quepa es UN RESULTADO, no un accidente: es
          // exactamente el límite que este artefacto existe para publicar.
          failure = error instanceof Error ? error.message : String(error);
          break;
        }
      }
      if (failure || samples.length < options.repeat) {
        failures.push({ entities, reason: failure ?? "pasadas incompletas" });
        tiers.push({
          entities,
          repeats: samples.length,
          sustained: false,
          violations: [failure ?? "pasadas incompletas"],
        });
        // Los escalones van de menor a mayor: si éste no cabe, los de arriba
        // tampoco, y seguir intentándolo sólo añade ruido a la corrida.
        break;
      }
      const summary = summarize(samples);
      const verdict = verdictFor(summary, ceilings);
      tiers.push({ ...summary, ...verdict });
    }
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }

  const sustainedTiers = tiers.filter((tier) => tier.sustained);
  const largest = sustainedTiers[sustainedTiers.length - 1] ?? null;
  const evidence = {
    $schema: "urn:valle-design:schema:cad-document-limits-evidence:v1",
    schemaVersion: 1,
    benchmarkId: "valle-design-cad-document-limits-v1",
    startedAt,
    finishedAt: new Date().toISOString(),
    enforcement: "report-only",
    enforcementRationale:
      "Perfil nuevo: la evidencia se publica y no bloquea. Los presupuestos están " +
      "calibrados para la máquina declarada abajo, NO para el runner de CI (2 vCPU), " +
      "donde las mismas cifras no significan lo mismo.",
    scenario: {
      corpus: "plano-real",
      corpusRationale:
        "La mezcla que un despacho mexicano dibuja de verdad —muros por caras, cadenas " +
        "de cotas, hatch de acabados, rótulos y bloques repetidos—, la misma que sostiene " +
        "cad-plan-benchmark-20k.json. Un corpus de arcos sueltos daría cifras mejores y " +
        "no diría nada del plano que se pierde.",
      repeatsPerTier: options.repeat,
      published: "mediana entre pasadas",
      checkpointIntervalMs: CHECKPOINT_INTERVAL_MS,
      checkpointBudgetMs: CHECKPOINT_INTERVAL_MS * CHECKPOINT_BUDGET_FRACTION,
      heapBudgetFraction: HEAP_BUDGET_FRACTION,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model?.trim() ?? null,
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytesAtStart: os.freemem(),
      declaredMachine:
        options.machine ??
        `${os.cpus()[0]?.model?.trim() ?? "CPU desconocida"}, ` +
          `${(os.totalmem() / 1_073_741_824).toFixed(1)} GB de RAM utilizable, ` +
          `${os.type()} ${os.release()}, Node ${process.version}`,
      browser: browserInfo,
    },
    productLimits: { web: constants, api: ceilings },
    verdict: {
      // La cifra que un cliente puede repetir: hasta aquí llega la promesa.
      largestSustainedEntities: largest?.entities ?? null,
      largestSustainedDocumentBytes: largest?.documentBytes ?? null,
      largestSustainedArchiveBytes: largest?.archiveBytes ?? null,
      largestSustainedCheckpointMs: largest?.checkpoint.totalMs ?? null,
      largestSustainedHeapBytes: largest?.heapUsedBytes ?? null,
      /**
       * Cuánto trabajo puede desaparecer en el peor caso de cierre forzado: lo
       * dibujado desde el último checkpoint. No es una estimación, es el
       * periodo con que el editor los programa más lo que cuesta escribir uno.
       */
      worstCaseLossWindowMs:
        CHECKPOINT_INTERVAL_MS + (largest?.checkpoint.totalMs ?? 0),
      failures,
    },
    tiers,
    scope: {
      measured: [
        "serialización del documento canónico (serializeCadDocument)",
        "compresión de la ruta de archivo (gzipCadDocumentJson, CompressionStream real)",
        "codificación y verificación del checkpoint local (encodeCadRecoveryPayload / decodeCadRecoveryPayload)",
        "escritura y lectura del checkpoint en IndexedDB, con la transacción confirmada",
        "reapertura del borrador recuperado (migrateCadDocument)",
        "montón de JavaScript usado y límite declarado por el navegador",
      ],
      notMeasured: [
        "render, GPU y cuadros por segundo: eso es browser-slo-100k.json",
        "red, API y PostgreSQL: eso es apps/web/e2e/real/cad-offline-multitab.spec.ts",
        "la cola y la poda completas del journal (saveCadRecovery), que añaden su propio worker",
        "planos por encima del techo de entidades del servidor: ahí el documento ni se acepta",
      ],
    },
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(
    options.output,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  const sustained = evidence.verdict.largestSustainedEntities;
  console.log(
    `document-limits → ${path.relative(REPO_ROOT, options.output)}\n` +
      `  máximo sostenido: ${sustained ?? "ninguno"} entidades` +
      (largest
        ? ` · ${(largest.documentBytes / 1_000_000).toFixed(2)} MB canónicos` +
          ` · ${(largest.archiveBytes / 1_000_000).toFixed(2)} MB comprimidos` +
          ` · checkpoint ${largest.checkpoint.totalMs} ms`
        : "") +
      `\n  ventana de pérdida en el peor caso: ${evidence.verdict.worstCaseLossWindowMs} ms`,
  );
}

await main();
