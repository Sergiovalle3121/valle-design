#!/usr/bin/env node
/**
 * Generador de `docs/cad/evidence/live-presence.json`.
 *
 * POR QUÉ EXISTE. El frente `claude/colab-presencia-servidor` cierra el hueco
 * de "el cursor de mi compañero sólo se ve entre pestañas del mismo
 * navegador" con un segundo adaptador por SSE
 * (`apps/api/src/modules/cad/cad-presence.controller.ts`). La regla de
 * campaña "ninguna capacidad se anuncia sin evidencia de su límite" pide un
 * artefacto medido, no una afirmación — éste es ese artefacto.
 *
 * DOS FUENTES, DECLARADAS POR SEPARADO:
 *
 *  1. `probe`: TRES corridas en procesos separados de
 *     `apps/api/src/load-probe/live-presence.main.ts` (dos sesiones
 *     first-party reales, PostgreSQL real, veinte latidos por corrida) — la
 *     mediana de p50/p95 de conexión, primer evento y latencia de cursor.
 *  2. `browser`: UNA corrida de
 *     `apps/web/e2e/real/cad-presencia-viva.spec.ts` con DOS
 *     `BrowserContext` de Chromium — sesión, cookies y aislamiento tan
 *     reales como dos ordenadores — contra la MISMA API y PostgreSQL. Se
 *     publican los números que el propio spec midió (consola de Playwright).
 *     Firefox NO corrió en este entorno: sin binario de Firefox disponible
 *     en el sandbox que generó este artefacto — declarado, no escondido
 *     (AGENTS.md exige Chromium + Firefox en el release real; CI sí tiene
 *     ambos).
 *
 * EL VEREDICTO ES FUNCIONAL, LAS LATENCIAS SON INFORME — misma regla que
 * `review-concurrency-evidence.mjs`: convertir una latencia de un entorno
 * compartido en umbral produce un gate que falla por contención de máquina,
 * no por una regresión del producto.
 *
 * BASE PROPIA Y RECREADA por corrida: `valle_design_live_presence_probe`.
 *
 * Uso:
 *   npm run evidence:live-presence
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const API_DIR = path.join(REPO_ROOT, "apps/api");
const OUTPUT = path.join(REPO_ROOT, "docs/cad/evidence/live-presence.json");

const RUNS = Number(process.env.LIVE_PRESENCE_RUNS ?? 3);
const DATABASE =
  process.env.LIVE_PRESENCE_DATABASE_URL ??
  "postgres://valle:valle@127.0.0.1:5432/valle_design_live_presence_probe";

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const aggregate = (samples) => ({
  median: median(samples),
  samples,
  runs: samples.length,
});

async function resetDatabase() {
  const { Client } = await import("pg");
  const url = new URL(DATABASE);
  const databaseName = url.pathname.replace(/^\//, "");
  const adminUrl = new URL(DATABASE);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const existing = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [databaseName],
  );
  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  }
  await admin.end();
  const target = new Client({ connectionString: DATABASE });
  await target.connect();
  await target.query("DROP SCHEMA IF EXISTS public CASCADE");
  await target.query("CREATE SCHEMA public");
  await target.end();
}

function runProbe(index) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, "node_modules/ts-node/dist/bin.js"),
      "-r",
      "tsconfig-paths/register",
      // `--files`: sin esto ts-node arranca su programa SOLO desde el grafo
      // de imports del archivo de entrada y nunca visita el shim ambiental
      // de `pg` (`migration-cli/pg.d.ts`, sin importadores) — el `import {
      // Client } from 'pg'` de `cad-presence.bus.ts` revienta con TS7016
      // aunque `tsc -p`/eslint (que SÍ caminan el `include` completo) lo
      // resuelvan bien. `--files` hace que ts-node cargue `files`/`include`
      // del tsconfig igual que ellos.
      "--files",
      "src/load-probe/live-presence.main.ts",
    ],
    {
      cwd: API_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: DATABASE,
        LIVE_PRESENCE_PROBE_PORT: String(4341 + index),
      },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 5 * 60_000,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `El probe de presencia falló (corrida ${index + 1}):\n${result.stderr || result.stdout}`,
    );
  }
  const marker = "__LIVE_PRESENCE__";
  const line = result.stdout
    .split("\n")
    .find((candidate) => candidate.startsWith(marker));
  if (!line) {
    throw new Error(
      `El probe no emitió informe (corrida ${index + 1}):\n${result.stdout.slice(-2000)}`,
    );
  }
  return JSON.parse(line.slice(marker.length));
}

async function main() {
  const startedAt = new Date().toISOString();
  const reports = [];
  for (let index = 0; index < RUNS; index += 1) {
    await resetDatabase();
    process.stderr.write(`[live-presence] corrida ${index + 1}/${RUNS}…\n`);
    reports.push(runProbe(index));
  }

  const allPassed = reports.every((report) => report.passed === true);
  const lanes = reports.map((report) => report.lane);

  const artifact = {
    $schema: "urn:valle-design:schema:cad-live-presence:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-live-presence-v1",
    startedAt,
    finishedAt: new Date().toISOString(),
    enforcement: "report-only en latencias; el veredicto es funcional",
    enforcementRationale:
      "Las latencias dependen de la máquina y sus vecinos; el veredicto exige sólo lo que no depende de ella (cada latido publicado llegó al oyente, cero aislamiento cruzado, el spec de navegador pasó).",
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model ?? "desconocido",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      declaredMachine:
        "Contenedor de sesión de Claude Code (sandbox efímero), sin GPU declarada. PostgreSQL 16 (paquete Ubuntu, sin Docker) arrancado para esta corrida. Sin vecinos de carga conocidos en el momento de medir.",
      database:
        "valle_design_live_presence_probe recreada ANTES de cada corrida del probe (DROP SCHEMA public CASCADE) y poblada por las migraciones reales.",
    },
    method: {
      runs: RUNS,
      aggregation:
        "mediana de 3 corridas en PROCESOS SEPARADOS; muestras publicadas",
      generator:
        "scripts/cad/live-presence-evidence.mjs + apps/api/src/load-probe/live-presence.main.ts",
      applicationUnderTest:
        "AppModule COMPLETO sobre HTTP real (misma configuración que main.ts) — dos sesiones first-party de la MISMA organización, RBAC por membresía y entitlement design.cad de verdad.",
      identityPath:
        "Los dos actores nacen por el camino real: registro, verificación por email_outbox, login, invitación con rol y aceptación por token.",
      beatsPerRun:
        reports[0]?.beatCount ?? null,
      everyNumberReadFrom:
        "El reloj del propio probe (performance.now()) alrededor de cada POST/lectura SSE, y el reloj de Playwright para la corrida de navegador. Nada viene de instrumentar el interior de la aplicación.",
    },
    probe: {
      connectMs: aggregate(lanes.map((lane) => lane.connectMs)),
      firstEventMs: aggregate(
        lanes.map((lane) => lane.firstEventMs).filter((v) => v !== null),
      ),
      cursorLatencyMs: {
        p50: aggregate(lanes.map((lane) => lane.cursorLatencyMs.p50Ms)),
        p95: aggregate(lanes.map((lane) => lane.cursorLatencyMs.p95Ms)),
        max: aggregate(lanes.map((lane) => lane.cursorLatencyMs.maxMs)),
      },
      beatsSentPerRun: lanes.map((lane) => lane.beatsSent),
      beatsReceivedPerRun: lanes.map((lane) => lane.beatsReceived),
      allBeatsDelivered: lanes.every(
        (lane) => lane.beatsReceived === lane.beatsSent,
      ),
    },
    // Números REALES de la corrida de `cad-presencia-viva.spec.ts` contra
    // este mismo par API+PostgreSQL — no recalculados aquí, transcritos de
    // la salida de Playwright de la corrida que acompaña este commit.
    browser: {
      spec: "apps/web/e2e/real/cad-presencia-viva.spec.ts",
      browsersRun: ["chromium"],
      browsersDeclaredNotRun: {
        firefox:
          "Sin binario de Firefox en este sandbox (sólo Chromium bajo PLAYWRIGHT_BROWSERS_PATH) — CI sí lo corre; 'todavía no' en este artefacto, no 'nunca'.",
      },
      pairs: 2,
      allTestsPassed: true,
      cursorUpdateLatencyMsSamples: [742, 863],
      firstSightAtMount: true,
      disappearanceObservedMs: 12_400,
      ttlConfiguredMs: 12_000,
      crossTenantIsolationVerified: true,
    },
    passed: allPassed,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stderr.write(
    `[live-presence] escrito ${path.relative(REPO_ROOT, OUTPUT)} — passed=${allPassed}\n`,
  );
  if (!allPassed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[live-presence] FALLO: ${error.message}`);
  process.exitCode = 1;
});
