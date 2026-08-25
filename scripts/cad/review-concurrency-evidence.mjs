#!/usr/bin/env node
/**
 * Generador de `docs/cad/evidence/review-concurrency.json`.
 *
 * POR QUÉ EXISTE. La fila `review.concurrency` de la rúbrica pide «carga
 * concurrente medida y merge semántico con recorrido de todos los roles, con
 * veredicto verde en el artefacto» (jsonValue: verdict/passed === true).
 * Hasta hoy la colaboración de review tenía specs funcionales pero ninguna
 * medición concurrente publicada. Este script la produce contra la
 * aplicación REAL: API NestJS completa por HTTP, PostgreSQL 16 local con las
 * migraciones reales, y los CINCO roles del producto (owner, admin, member,
 * viewer y revisor por enlace) trabajando A LA VEZ sobre el mismo documento,
 * más dos escritores CAS cuyo 409 se resuelve con la fusión semántica REAL
 * del editor (`planCadConflictResolution`, vía tsx). Ver el porqué de cada
 * decisión en `apps/api/src/load-probe/review-concurrency.main.ts`.
 *
 * TRES CORRIDAS, MEDIANA, PROCESOS SEPARADOS. La misma regla que
 * `api-load-tests.mjs`: en un portátil compartido una corrida mide el ruido
 * de los vecinos tanto como el producto. Se publican las tres muestras al
 * lado de cada mediana.
 *
 * EL VEREDICTO ES FUNCIONAL, LAS LATENCIAS SON INFORME. `verdict.passed`
 * exige lo que no depende de la máquina: cero 5xx, todos los roles
 * completaron todas las operaciones, las fronteras de rol negaron lo que
 * debían negar, cada carrera CAS tuvo exactamente un ganador y cada 409 se
 * resolvió con la fusión semántica hasta un 200 con ambos trabajos
 * presentes, y los conteos de comentarios cuadran. Convertir latencias de un
 * portátil con vecinos en umbral produciría un gate que falla por contención
 * y no por una regresión (la lección de api-load-tests).
 *
 * BASE PROPIA Y RECREADA por corrida: `valle_design_review_conc`.
 *
 * Uso:
 *   npm run evidence:review-concurrency
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const API_DIR = path.join(REPO_ROOT, "apps/api");
const OUTPUT = path.join(
  REPO_ROOT,
  "docs/cad/evidence/review-concurrency.json",
);

const RUNS = Number(process.env.REVIEW_CONCURRENCY_RUNS ?? 3);
const DATABASE =
  process.env.REVIEW_CONCURRENCY_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/valle_design_review_conc";

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

function countNeighbourNodeProcesses() {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "tasklist",
        ["/FI", "IMAGENAME eq node.exe", "/FO", "CSV", "/NH"],
        { encoding: "utf8" },
      );
      return out
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith('"node.exe"')).length;
    }
    const out = execFileSync("ps", ["-C", "node", "-o", "pid="], {
      encoding: "utf8",
    });
    return out.split("\n").filter((line) => line.trim()).length;
  } catch {
    return null;
  }
}

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
      "src/load-probe/review-concurrency.main.ts",
    ],
    {
      cwd: API_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: DATABASE,
        REVIEW_PROBE_PORT: String(4340 + index),
      },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 10 * 60_000,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `El probe de concurrencia falló (corrida ${index + 1}):\n${result.stderr || result.stdout}`,
    );
  }
  const marker = "__REVIEW_CONCURRENCY__";
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

const ROLES = ["owner", "admin", "member", "viewer", "link"];
const OPS = ["open", "listComments", "comment", "resolve"];

function buildPerRole(reports) {
  const out = {};
  for (const role of ROLES) {
    out[role] = {};
    for (const op of OPS) {
      const cells = reports.map((report) => report.storm.perRole[role][op]);
      out[role][op] = {
        requestsPerRun: cells.map((cell) => cell.latencyMs.samples),
        statusCountsPerRun: cells.map((cell) => cell.statusCounts),
        latencyMs: {
          p50: aggregate(cells.map((cell) => cell.latencyMs.p50Ms)),
          p95: aggregate(cells.map((cell) => cell.latencyMs.p95Ms)),
          max: aggregate(cells.map((cell) => cell.latencyMs.maxMs)),
        },
        percentileConfidence:
          Math.min(...cells.map((cell) => cell.latencyMs.samples)) >= 100
            ? "Muestra ≥100 por corrida: el p95 es legible."
            : "MUESTRA CORTA (<100 por corrida): lee p95 como «cerca del máximo observado», no como percentil fino.",
      };
    }
  }
  return out;
}

async function main() {
  const startedAt = new Date().toISOString();
  const neighboursBefore = countNeighbourNodeProcesses();
  const reports = [];
  for (let index = 0; index < RUNS; index += 1) {
    await resetDatabase();
    process.stderr.write(
      `[review-concurrency] corrida ${index + 1}/${RUNS}…\n`,
    );
    reports.push(runProbe(index));
  }
  const neighboursAfter = countNeighbourNodeProcesses();

  const allPassed = reports.every((report) => report.passed === true);
  const casRounds = reports.flatMap((report, runIndex) =>
    report.cas.rounds.map((row) => ({ run: runIndex + 1, ...row })),
  );
  const conflictsObserved = casRounds.filter((row) =>
    row.statuses.includes(409),
  ).length;

  const artifact = {
    $schema: "urn:valle-design:schema:cad-review-concurrency:v1",
    schemaVersion: 1,
    evidenceId: "valle-design-review-concurrency-v1",
    startedAt,
    finishedAt: new Date().toISOString(),
    enforcement: "report-only en latencias; el veredicto es funcional",
    enforcementRationale:
      "Las latencias salen de un portátil de desarrollo con otros agentes en paralelo: convertirlas en umbral produciría un gate que falla por contención de máquina. El veredicto exige sólo lo que no depende de la máquina (éxitos, fronteras de rol, un ganador por carrera CAS, fusión aplicada, conteos íntegros).",
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
        "AMD Ryzen 5 5500U with Radeon Graphics, 7,4 GB de RAM, Windows_NT 10.0.26200, portátil de desarrollo. Node v22.18.0. PostgreSQL 16 local en localhost:5432, sin Docker.",
      neighbours: {
        declared: true,
        statement:
          "LA CORRIDA TIENE VECINOS: otros agentes trabajaban en la misma máquina. Las latencias son un suelo observable, no una capacidad.",
        nodeProcessesBefore: neighboursBefore,
        nodeProcessesAfter: neighboursAfter,
      },
      database:
        "valle_design_review_conc recreada ANTES de cada corrida (DROP SCHEMA public CASCADE) y poblada por las migraciones reales.",
    },
    method: {
      runs: RUNS,
      aggregation:
        "mediana de 3 corridas en PROCESOS SEPARADOS; muestras publicadas",
      generator:
        "scripts/cad/review-concurrency-evidence.mjs + apps/api/src/load-probe/review-concurrency.main.ts",
      applicationUnderTest:
        "AppModule COMPLETO sobre HTTP real (misma configuración que main.ts). Sesiones, RBAC por membresía, entitlement design.cad y la superficie de review link se ejecutan en cada petición.",
      identityPath:
        "Los cinco actores nacen por el camino real: registro, verificación, login (argon2id), invitación con rol y aceptación por token. El revisor por enlace canjea el shareToken de la sesión de revisión (X-Review-Token, sin sesión).",
      declaredExceptions: [
        "Los tokens de verificación e invitación se leen de email_outbox: es lo que el proveedor de correo entregaría y un script no tiene buzón (la misma excepción que api-load-tests).",
        "El trial da 3 asientos y el recorrido exige 4 miembros: el probe amplía subscriptions.seats a 4 por SQL haciendo de OPERADOR; en producción ese es el camino del cobro externo asistido (upgrade-intents). Ningún otro estado se inyecta.",
      ],
      semanticMerge:
        "La fusión del 409 NO es una copia: es planCadConflictResolution del editor (apps/web/src/lib/cad/cad-conflict-resolution.ts), invocada vía scripts/cad/review-concurrency-merge.mts con tsx. Los documentos entran por migrateCadDocument y salen por serializeCadDocument, el mismo camino de carga/guardado del editor. Política de colisiones declarada: mine (el perdedor conserva su cambio disputado).",
      everyNumberReadFrom:
        "El reloj del cliente HTTP alrededor de cada petición y el código de estado del servidor. Nada viene de instrumentar el interior de la aplicación.",
    },
    scenario: {
      documentEntities: reports[0].documentEntities,
      roles: ROLES,
      workersPerRole: reports[0].storm.workersPerRole,
      concurrentClients: reports[0].storm.concurrentClients,
      windowMsPerRun: reports.map((report) => report.storm.windowMs),
      operationsPerActorLoop: OPS,
      sameDocument: true,
      sameReviewSession: true,
    },
    concurrentLoad: {
      totalRequestsPerRun: reports.map((report) => report.storm.totalRequests),
      serverErrorsPerRun: reports.map((report) => report.storm.serverErrors),
      unexpectedClientErrorsPerRun: reports.map(
        (report) => report.storm.unexpectedClientErrors,
      ),
      // Veces que link/comment se topó con reviewCommentsPerSession (VD-RL-001)
      // y se reintentó tras retryAfterSeconds en vez de contar como fallo. Cero
      // en las tres corridas sería sospechoso para esta tormenta sintética —
      // demostraría que el techo nunca se ejerció, no que el cliente lo maneja.
      rateLimitRetriesPerRun: reports.map(
        (report) => report.storm.rateLimitRetries ?? 0,
      ),
      perRole: buildPerRole(reports),
    },
    roleBoundaries: {
      description:
        "Comprobado en cada corrida, con el documento y la sesión reales: el viewer (cad:view+cad:review, sin cad:edit) no puede guardar; el enlace de review es de solo lectura impuesta por el backend.",
      perRun: reports.map((report) => report.boundaries),
      allDenied: reports.every(
        (report) =>
          report.boundaries.viewerSaveDenied &&
          report.boundaries.linkSaveDenied,
      ),
    },
    casWriters: {
      description:
        "Dos escritores (owner y member) guardan A LA VEZ contra la misma versión, todas las rondas: exactamente un 200 y un 409 por ronda. El perdedor re-lee, fusiona con la función real del editor y reintenta. Rondas «disjoint»: adiciones distintas, fusión automática, ambas presentes al final. Ronda «collision»: ambos mueven el mismo muro, colisión tipada resuelta con la política declarada.",
      roundsPerRun: RUNS > 0 ? reports[0].cas.rounds.length : 0,
      conflictsObserved,
      rounds: casRounds,
      conflictPutMs: aggregate(
        reports.map((report) =>
          median(report.cas.rounds.map((row) => row.conflictPutMs)),
        ),
      ),
      resolutionMs: aggregate(
        reports.map((report) =>
          median(
            report.cas.rounds
              .map((row) => row.resolutionMs)
              .filter((value) => value !== null),
          ),
        ),
      ),
      resolutionMsNote:
        "Incluye re-lectura del documento, el proceso tsx de la fusión (arranque de Node incluido) y el guardado. El arranque de tsx domina: en el editor la fusión corre en la misma pestaña y no paga ese coste.",
      allClean: reports.every((report) => report.cas.clean),
    },
    integrity: {
      perRun: reports.map((report) => report.integrity),
      anomaliesPerRun: reports.map((report) => report.anomalies),
    },
    verdict: {
      passed: allPassed,
      criteria: [
        "cero 5xx y cero 4xx inesperados en la tormenta concurrente (el único 4xx legítimo es el 409 del CAS)",
        "los cinco roles completaron abrir/listar/comentar/resolver con éxito dentro de la ventana",
        "fronteras de rol: viewer y enlace de review NO pudieron guardar el documento",
        "cada carrera CAS tuvo exactamente un ganador; cada 409 se resolvió con la fusión semántica real hasta un 200 con ambos trabajos presentes (o la política declarada en la colisión)",
        "conteos íntegros tras la tormenta: comentarios creados = listados, resueltos = resoluciones",
      ],
      latencyNote:
        "El veredicto NO juzga latencias; se publican como dato con su dispersión y su contaminación declaradas.",
    },
    scope: {
      notMeasured: [
        "Red real y TLS: clientes y servidor comparten loopback; el trayecto de internet y el handshake no están incluidos.",
        "Merge en el navegador: la fusión corre con tsx en Node; es el mismo código que ejecuta el editor, pero no se midió dentro de una pestaña.",
        "Saturación: 10 clientes en lazo cerrado no buscan la rodilla de la curva ni el máximo de sesiones de revisión simultáneas.",
        "Varias réplicas de la API: un proceso; el CAS en PostgreSQL funcionaría igual con más réplicas, pero aquí no está medido.",
        "Websockets/presencia en vivo: la colaboración medida es la superficie HTTP de review, no un canal de tiempo real (que el producto no ofrece hoy).",
      ],
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const owner95 =
    artifact.concurrentLoad.perRole.owner.open.latencyMs.p95.median;
  const link95 = artifact.concurrentLoad.perRole.link.open.latencyMs.p95.median;
  process.stderr.write(
    `[review-concurrency] escrito ${path.relative(REPO_ROOT, OUTPUT)}\n` +
      `  corridas: ${RUNS} · clientes concurrentes: ${artifact.scenario.concurrentClients} · ` +
      `conflictos CAS observados: ${conflictsObserved}\n` +
      `  p95 abrir (mediana): owner ${owner95} ms · enlace ${link95} ms\n` +
      `  veredicto: ${allPassed ? "VERDE" : "NO SUPERADO"}\n`,
  );
}

main().catch((error) => {
  console.error(`[review-concurrency] FALLO: ${error.message}`);
  process.exit(1);
});
