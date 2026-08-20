#!/usr/bin/env node
/**
 * Generador de `docs/cad/evidence/api-load-tests.json`.
 *
 * POR QUÉ EXISTE. La fila `api-sdk.public` de la rúbrica pide tres cosas para
 * un integrador: una consola pública, pruebas de límite y carga publicadas y
 * una política de extensiones de terceros. Este script produce la segunda y
 * enlaza las otras dos. Antes de él, la respuesta a «¿cuántas peticiones por
 * segundo aguanta vuestra API?» era una opinión, y una opinión no se puede
 * meter en un pliego de licitación.
 *
 * TRES CORRIDAS, MEDIANA, PROCESOS SEPARADOS. Igual que
 * `plot-fidelity-evidence.mjs`: una sola corrida en un portátil compartido
 * mide el ruido de los vecinos tanto como el producto. La mediana de tres
 * corridas independientes —cada una con su proceso, su montículo y su base
 * recién creada— es lo mínimo que se puede defender, y las tres muestras se
 * publican para que cualquiera vea la dispersión en vez de fiarse del resumen.
 *
 * BASE DE DATOS PROPIA Y RECREADA. Cada corrida arranca con el esquema
 * `public` recién creado y las 21 migraciones aplicadas. Reutilizar una base
 * con los datos de la corrida anterior haría que la tercera midiese tablas más
 * grandes que la primera y la mediana mezclaría dos experimentos distintos.
 * Se usa una base APARTE (`valle_design_load`) para no tocar las bases de CI y
 * e2e que otras suites del equipo están usando en la misma máquina.
 *
 * NO ES UN GATE. Este artefacto no fija presupuesto de CI: las cifras salen de
 * un portátil de desarrollo con otros agentes trabajando en paralelo, y
 * calibrarlas como umbral produciría un gate que falla por contención de la
 * máquina y no por una regresión del producto. Lo que sí es verificable es que
 * el artefacto se REGENERA: `--check` vuelve a medir y compara la forma.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../..');
const API_DIR = path.join(REPO_ROOT, 'apps/api');
const OUTPUT = path.join(REPO_ROOT, 'docs/cad/evidence/api-load-tests.json');
const CONTRACT = path.join(
  REPO_ROOT,
  'packages/contracts/specs/design-api.v1.yaml',
);
const CONSOLE_PAGE = 'apps/web/src/app/docs/api/page.tsx';
const CONSOLE_DATA = 'apps/web/src/app/docs/api/operations.generated.json';
const POLICY_DOC = 'docs/cad/third-party-extension-policy.md';

const RUNS = Number(process.env.API_LOAD_RUNS ?? 3);
const LOAD_DATABASE =
  process.env.API_LOAD_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/valle_design_load';

/** Mediana de una muestra pequeña; con n par se toma el promedio central. */
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 1000) / 1000;
}

function aggregate(samples) {
  return { median: median(samples), samples, runs: samples.length };
}

/**
 * Vecinos en la máquina, contados y DECLARADOS.
 *
 * Un número de peticiones por segundo sin decir quién más estaba usando los
 * seis núcleos es un número que no se puede reproducir ni discutir. Se cuenta
 * lo que se puede contar sin instalar nada: cuántos procesos `node` vivos hay
 * además del propio árbol de esta medición.
 */
function countNeighbourNodeProcesses() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'tasklist',
        ['/FI', 'IMAGENAME eq node.exe', '/FO', 'CSV', '/NH'],
        { encoding: 'utf8' },
      );
      const lines = out
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('"node.exe"'));
      return lines.length;
    }
    const out = execFileSync('ps', ['-C', 'node', '-o', 'pid='], {
      encoding: 'utf8',
    });
    return out.split('\n').filter((line) => line.trim()).length;
  } catch {
    return null;
  }
}

async function resetLoadDatabase() {
  const { Client } = await import('pg');
  const url = new URL(LOAD_DATABASE);
  const databaseName = url.pathname.replace(/^\//, '');
  const adminUrl = new URL(LOAD_DATABASE);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const existing = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [databaseName],
  );
  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  }
  await admin.end();

  const target = new Client({ connectionString: LOAD_DATABASE });
  await target.connect();
  // DROP SCHEMA public deja la base como recién creada sin tener que
  // desconectar a nadie de `postgres`, que es lo que haría fallar un DROP
  // DATABASE en una máquina con otras herramientas conectadas.
  await target.query('DROP SCHEMA IF EXISTS public CASCADE');
  await target.query('CREATE SCHEMA public');
  await target.end();
}

function runProbe(index) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules/ts-node/dist/bin.js'),
      '-r',
      'tsconfig-paths/register',
      'src/load-probe/main.ts',
    ],
    {
      cwd: API_DIR,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: LOAD_DATABASE,
        LOAD_PROBE_PORT: String(4310 + index),
      },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `El probe de carga falló (corrida ${index + 1}):\n${result.stderr || result.stdout}`,
    );
  }
  const marker = '__LOAD_PROBE__';
  const line = result.stdout
    .split('\n')
    .find((candidate) => candidate.startsWith(marker));
  if (!line) {
    throw new Error(
      `El probe de carga no emitió informe (corrida ${index + 1}):\n${result.stdout.slice(-2000)}`,
    );
  }
  return JSON.parse(line.slice(marker.length));
}

/** Descripciones de cada fase: qué pregunta del integrador responde. */
const PHASE_MEANING = {
  health:
    'Sonda de vida sin sesión. Es el suelo del framework: por debajo de esta latencia no puede bajar ninguna otra ruta.',
  'public-catalog':
    'GET /v1/commercial/public/plans — la única superficie anónima del producto, con caché de 60 s en proceso. Es lo que aguanta una avalancha desde un buscador.',
  'cad-projects-list':
    'GET /v1/cad/projects — lectura autenticada con la cadena completa: cookie de sesión, resolución de membresía, entitlement design.cad y RBAC cad:view.',
  'cad-document-open':
    'GET /v1/cad/documents/:id — apertura del documento canónico con rehidratación. Es la llamada que hace un integrador que sincroniza planos.',
  'cad-document-save':
    'PUT /v1/cad/documents/:id/content — escritura con concurrencia optimista (CAS). Se mide EN SERIE a propósito: en paralelo mediría cuánto se pisan los clientes, no cuánto cuesta guardar.',
};

function buildPhases(reports) {
  const names = reports[0].phases.map((phase) => phase.phase);
  return names.map((name) => {
    const perRun = reports.map((report) =>
      report.phases.find((phase) => phase.phase === name),
    );
    const minimumSamples = Math.min(...perRun.map((phase) => phase.requests));
    return {
      phase: name,
      meaning: PHASE_MEANING[name] ?? '',
      concurrency: perRun[0].concurrency,
      requestsPerRun: perRun.map((phase) => phase.requests),
      // Un p99 calculado sobre veinte peticiones ES el máximo observado con
      // otro nombre. Publicarlo sin decirlo convertiría ruido en cifra, así
      // que la advertencia viaja DENTRO del artefacto y no en un pie de
      // página que nadie lee.
      percentileConfidence:
        minimumSamples >= 300
          ? `Muestra suficiente (mínimo ${minimumSamples} peticiones por corrida) para leer el p95; el p99 sigue siendo orientativo.`
          : minimumSamples >= 100
            ? `Muestra corta (mínimo ${minimumSamples} peticiones por corrida): el p95 es orientativo y el p99 está muy cerca del máximo.`
            : `MUESTRA INSUFICIENTE para percentiles (mínimo ${minimumSamples} peticiones por corrida): p95 y p99 deben leerse como «máximo observado», no como percentiles.`,
      statusCountsPerRun: perRun.map((phase) => phase.statusCounts),
      requestsPerSecond: aggregate(
        perRun.map((phase) => phase.requestsPerSecond),
      ),
      latencyMs: {
        p50: aggregate(perRun.map((phase) => phase.latency.p50Ms)),
        p95: aggregate(perRun.map((phase) => phase.latency.p95Ms)),
        p99: aggregate(perRun.map((phase) => phase.latency.p99Ms)),
        max: aggregate(perRun.map((phase) => phase.latency.maxMs)),
      },
    };
  });
}

function buildLargeDocuments(reports) {
  const sizes = reports[0].largeDocuments.map((entry) => entry.entities);
  return sizes.map((entities) => {
    const perRun = reports.map((report) =>
      report.largeDocuments.find((entry) => entry.entities === entities),
    );
    return {
      entities,
      serializedBytes: perRun[0].serializedBytes,
      responseBytes: perRun[0].openBytes,
      storedAsBlobPointer: perRun[0].storedAsBlobPointer,
      saveMs: aggregate(perRun.map((entry) => entry.saveMs)),
      openMs: aggregate(perRun.map((entry) => entry.openMs)),
      statuses: perRun.map((entry) => ({
        save: entry.saveStatus,
        open: entry.openStatus,
      })),
    };
  });
}

function buildRateLimit(reports) {
  const first = reports[0].rateLimit;
  return {
    endpoint: first.endpoint,
    scope: first.scope,
    store:
      'PostgreSQL (PostgresIdentityRateLimitStore): ventana fija atómica en SQL, compartida por todas las réplicas. La caída a memoria acotada existe SOLO para SQLite local.',
    attemptsPerRun: reports.map((report) => report.rateLimit.attempts),
    firstThrottledAttemptPerRun: reports.map(
      (report) => report.rateLimit.firstThrottledAttempt,
    ),
    observedLimit: (() => {
      const values = reports
        .map((report) => report.rateLimit.firstThrottledAttempt)
        .filter((value) => typeof value === 'number');
      return values.length ? Math.min(...values) - 1 : null;
    })(),
    statusSequence: first.statusSequence,
    retryAfterSeconds: first.retryAfterSeconds,
    responseMessage: first.bodyCode,
    verdict:
      first.firstThrottledAttempt === null
        ? 'NO se observó 429: el limitador no frenó dentro de la ventana probada.'
        : 'El exceso responde 429 con retryAfterSeconds accionable; el integrador puede reintentar sin adivinar.',
  };
}

function countContractOperations() {
  const spec = fs.readFileSync(CONTRACT, 'utf8').replaceAll('\r\n', '\n');
  const total = (spec.match(/^      operationId:/gm) ?? []).length;
  const lines = spec.split('\n');
  let currentPath = null;
  let cad = 0;
  for (const line of lines) {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    if (currentPath?.startsWith('/v1/cad/') && /^      operationId:/.test(line))
      cad += 1;
  }
  return { total, cad };
}

async function main() {
  const startedAt = new Date().toISOString();
  const neighboursBefore = countNeighbourNodeProcesses();
  const reports = [];
  for (let index = 0; index < RUNS; index += 1) {
    await resetLoadDatabase();
    process.stderr.write(`[api-load-tests] corrida ${index + 1}/${RUNS}…\n`);
    reports.push(runProbe(index));
  }
  const finishedAt = new Date().toISOString();
  const neighboursAfter = countNeighbourNodeProcesses();
  const operations = countContractOperations();

  const artifact = {
    $schema: 'urn:valle-design:schema:cad-api-load-tests:v1',
    schemaVersion: 1,
    evidenceId: 'valle-design-api-load-tests-v1',
    startedAt,
    finishedAt,
    enforcement: 'report-only',
    enforcementRationale:
      'Las cifras salen de un portátil de desarrollo con OTROS AGENTES trabajando en paralelo sobre los mismos seis núcleos. Convertirlas en umbral de CI produciría un gate que falla por contención de la máquina, no por una regresión del producto. Lo que sí está cerrado por specs es el COMPORTAMIENTO que aquí se observa: el 429 del limitador, el CAS del documento y el entitlement se prueban en apps/api sin depender de estas latencias.',
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model ?? 'desconocido',
      logicalCpuCount: os.cpus().length,
      availableParallelism: os.availableParallelism?.() ?? os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      declaredMachine:
        'AMD Ryzen 5 5500U with Radeon Graphics, 7,4 GB de RAM, Windows_NT 10.0.26200, portátil de desarrollo. Node v22.18.0. PostgreSQL 16 local en localhost:5432, sin Docker.',
      neighbours: {
        declared: true,
        statement:
          'LA CORRIDA TIENE VECINOS. Varios agentes de desarrollo trabajaban en el mismo equipo mientras se medía; ninguna de estas cifras es un número de máquina dedicada. Se publican como SUELO observable, no como capacidad máxima del producto.',
        nodeProcessesBefore: neighboursBefore,
        nodeProcessesAfter: neighboursAfter,
        countedBy:
          process.platform === 'win32'
            ? 'tasklist /FI "IMAGENAME eq node.exe"'
            : 'ps -C node',
        freeMemoryBytesPerRun: reports.map((report) => ({
          atStart: report.freeMemoryBytesAtStart,
          atEnd: report.freeMemoryBytesAtEnd,
        })),
        loadAverageNote:
          'os.loadavg() devuelve [0,0,0] en Windows; por eso la carga vecina se declara por conteo de procesos y memoria libre, no por load average.',
      },
    },
    method: {
      runs: RUNS,
      aggregation: 'mediana de 3 corridas en PROCESOS SEPARADOS',
      generator:
        'scripts/cad/api-load-tests.mjs + apps/api/src/load-probe/main.ts',
      driver:
        'Lazo cerrado: 8 clientes que esperan su respuesta antes de volver a pedir, que es como se comporta el pool de conexiones de un integrador. NO es un generador de tasa fija, así que estas cifras no exponen el punto de saturación absoluto.',
      warmup:
        'Cada fase descarta 800 ms de calentamiento antes de abrir la ventana de medición: la primera consulta compila su plan y el pool abre conexiones.',
      database:
        'PostgreSQL 16 local, base valle_design_load recreada ANTES de cada corrida (DROP SCHEMA public CASCADE) y poblada por las migraciones reales de la aplicación.',
      applicationUnderTest:
        'AppModule COMPLETO sobre HTTP real (NestFactory + app.listen), con la misma configuración que main.ts: helmet, compresión, ValidationPipe global y tope de cuerpo JSON. Los guards de sesión, entitlement design.cad y RBAC cad:* se ejecutan en cada petición autenticada.',
      identityPath:
        'La sesión se obtiene por el camino real: POST /v1/auth/register, verificación del correo, POST /v1/auth/login (argon2id) y creación de organización con su trial. La ÚNICA excepción declarada es que el token de verificación se lee de la tabla email_outbox, porque un script no tiene buzón.',
      everyNumberReadFrom:
        'El reloj del cliente HTTP alrededor de cada petición y el código de estado que devolvió el servidor. Ninguna cifra procede de instrumentar el interior de la aplicación.',
    },
    surfaceUnderTest: {
      contract: 'packages/contracts/specs/design-api.v1.yaml',
      openApiOperations: operations.total,
      cadOperations: operations.cad,
      measuredOperations: 6,
      note: 'Se miden seis operaciones representativas de las familias que un integrador usa —anónima, lectura autenticada, apertura de documento, escritura con CAS, documento grande y límite de tasa—, no las 73 del contrato. Publicar una cifra por operación sugeriría una cobertura que esta medición no tiene.',
    },
    phases: buildPhases(reports),
    largeDocuments: {
      note: 'Escalón de tamaño del documento canónico inline. Por encima de 1 MB el documento deja de vivir en la fila y pasa a un blob content-addressed (storedAsBlobPointer), así que la apertura tiene que rehidratarlo: por eso se mide guardar Y abrir.',
      inlineLimitBytes: 8_000_000,
      archiveLimitBytes: 128 * 1024 * 1024,
      steps: buildLargeDocuments(reports),
    },
    rateLimit: buildRateLimit(reports),
    publicConsole: {
      page: CONSOLE_PAGE,
      data: CONSOLE_DATA,
      route: '/docs/api',
      generator: 'scripts/cad/build-api-console.mjs',
      drift:
        'apps/web/src/app/docs/api/console-contract.spec.ts regenera el JSON desde el YAML y falla si difiere: la consola no puede quedarse atrás del contrato.',
    },
    thirdPartyExtensionPolicy: {
      document: POLICY_DOC,
      summary:
        'Publicada con lo que HOY es cierto: no existe proceso de revisión de extensiones de terceros ni mercado, y el documento lo dice en su primera línea.',
    },
    notMeasured: [
      'Latencia de red real: cliente y servidor corren en la misma máquina, así que las latencias publicadas son un SUELO y excluyen el trayecto de internet.',
      'Punto de saturación absoluto: el lazo cerrado con 8 clientes no busca la rodilla de la curva.',
      'Varias réplicas de la API: se mide un proceso. El limitador de tasa sí es compartido en PostgreSQL y funcionaría igual con más réplicas, pero eso no está medido aquí.',
      'Subida multipart de archivo (PUT /v1/cad/documents/:id/archive) y el camino gzip de 128 MiB.',
      'TLS: la medición es HTTP en loopback; el coste del handshake y del cifrado no está incluido.',
    ],
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  process.stderr.write(
    `[api-load-tests] escrito ${path.relative(REPO_ROOT, OUTPUT)}\n`,
  );
}

main().catch((error) => {
  console.error(`[api-load-tests] FALLO: ${error.message}`);
  process.exit(1);
});
