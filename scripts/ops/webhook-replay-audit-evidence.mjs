#!/usr/bin/env node
/**
 * Generador de `docs/cad/evidence/webhook-replay-audit.json`.
 *
 * POR QUÉ EXISTE. La fila `events.operational` de la rúbrica pide «evidencia
 * operacional sostenida y replay auditado con receptor externo». Las piezas
 * existen todas —outbox transaccional con leases y cola muerta, receptor de
 * webhooks propio (la API se recibe a sí misma, ADR-0006/ADR-0008) y la
 * herramienta de replay del RUNBOOK— pero ninguna corrida las había juntado
 * con números publicados. Este script ejecuta esa corrida de punta a punta y
 * publica lo que MIDIÓ: entregas verdes, filas muertas por un receptor caído
 * de verdad (conexión rechazada, no un fallo inyectado), el JSON de auditoría
 * del replay ÍNTEGRO, la recuperación posterior y la deduplicación verificada
 * contra el receptor.
 *
 * QUÉ ES REAL AQUÍ. La aplicación COMPLETA sobre HTTP (AppModule, worker de
 * outbox encendido), PostgreSQL 16 local con las migraciones reales, el
 * transporte firmado HMAC y el receptor de este mismo repositorio, y
 * `scripts/ops/outbox-replay.mjs` tal cual lo usaría el operador del RUNBOOK.
 * Los correos y eventos se generan por caminos de producto (registro →
 * verificación; guardado CAD → design.document.saved), no con INSERTs.
 *
 * QUÉ NO ES. Ver `scope.notMeasured` dentro del artefacto: no hay red real ni
 * TLS (receptor en loopback y en el MISMO proceso), no hay proveedor de
 * correo (los correos mueren por diseño y el artefacto lo declara en vez de
 * fingir), la «operación sostenida» es una ventana de minutos, no semanas.
 *
 * BASE PROPIA Y RECREADA. `valle_design_outbox_audit`, esquema recreado antes
 * de la corrida: la evidencia de un replay no puede depender de filas de una
 * corrida anterior.
 *
 * Uso:
 *   npm run evidence:webhook-replay-audit
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../..');
const API_DIR = path.join(REPO_ROOT, 'apps/api');
const OUTPUT = path.join(REPO_ROOT, 'docs/cad/evidence/webhook-replay-audit.json');

const AUDIT_DATABASE =
  process.env.OUTBOX_AUDIT_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/valle_design_outbox_audit';

/** Vecinos en la máquina, contados y DECLARADOS (misma regla que api-load). */
function countNeighbourNodeProcesses() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'tasklist',
        ['/FI', 'IMAGENAME eq node.exe', '/FO', 'CSV', '/NH'],
        { encoding: 'utf8' },
      );
      return out
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('"node.exe"')).length;
    }
    const out = execFileSync('ps', ['-C', 'node', '-o', 'pid='], {
      encoding: 'utf8',
    });
    return out.split('\n').filter((line) => line.trim()).length;
  } catch {
    return null;
  }
}

async function resetDatabase() {
  const { Client } = await import('pg');
  const url = new URL(AUDIT_DATABASE);
  const databaseName = url.pathname.replace(/^\//, '');
  const adminUrl = new URL(AUDIT_DATABASE);
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

  const target = new Client({ connectionString: AUDIT_DATABASE });
  await target.connect();
  await target.query('DROP SCHEMA IF EXISTS public CASCADE');
  await target.query('CREATE SCHEMA public');
  await target.end();
}

function runProbe() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules/ts-node/dist/bin.js'),
      '-r',
      'tsconfig-paths/register',
      'src/load-probe/outbox-audit.main.ts',
    ],
    {
      cwd: API_DIR,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: AUDIT_DATABASE,
      },
      maxBuffer: 64 * 1024 * 1024,
      // La muerte por backoff tarda ~2 min por tanda; presupuesto holgado.
      timeout: 20 * 60_000,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `El probe de auditoría falló:\n${result.stderr || result.stdout}`,
    );
  }
  const marker = '__OUTBOX_AUDIT__';
  const line = result.stdout
    .split('\n')
    .find((candidate) => candidate.startsWith(marker));
  if (!line) {
    throw new Error(
      `El probe no emitió informe:\n${result.stdout.slice(-2000)}`,
    );
  }
  return JSON.parse(line.slice(marker.length));
}

async function main() {
  const startedAt = new Date().toISOString();
  const neighboursBefore = countNeighbourNodeProcesses();
  await resetDatabase();
  process.stderr.write('[webhook-replay-audit] corrida única en marcha…\n');
  const report = runProbe();
  const neighboursAfter = countNeighbourNodeProcesses();

  const artifact = {
    $schema: 'urn:valle-design:schema:webhook-replay-audit:v1',
    schemaVersion: 1,
    evidenceId: 'valle-design-webhook-replay-audit-v1',
    startedAt,
    finishedAt: new Date().toISOString(),
    enforcement: 'report-only',
    enforcementRationale:
      'Las latencias salen de un portátil compartido y no fijan umbral de CI. Lo que SÍ está cerrado por specs es el comportamiento aquí observado: el lease, el backoff, la cola muerta y la deduplicación del receptor se prueban en apps/api (outbox-dispatcher, outbox-receiver.pg.spec, outbox-receiver.circuit.pg.spec) sin depender de esta corrida.',
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model ?? 'desconocido',
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      declaredMachine:
        'AMD Ryzen 5 5500U with Radeon Graphics, 7,4 GB de RAM, Windows_NT 10.0.26200, portátil de desarrollo. Node v22.18.0. PostgreSQL 16 local en localhost:5432, sin Docker.',
      neighbours: {
        declared: true,
        statement:
          'LA CORRIDA TIENE VECINOS: otros agentes de desarrollo trabajaban en la misma máquina. Las latencias son un suelo observable, no una capacidad.',
        nodeProcessesBefore: neighboursBefore,
        nodeProcessesAfter: neighboursAfter,
      },
      database:
        'valle_design_outbox_audit recreada antes de la corrida (DROP SCHEMA public CASCADE) y poblada por las migraciones reales.',
    },
    method: {
      generator:
        'scripts/ops/webhook-replay-audit-evidence.mjs + apps/api/src/load-probe/outbox-audit.main.ts',
      applicationUnderTest:
        'AppModule COMPLETO sobre HTTP real con el worker de outbox encendido (OUTBOX_DISPATCHER_ENABLED=true) y el receptor de webhooks de este mismo repositorio apuntado a sí mismo, firmado HMAC-SHA256.',
      trafficOrigin:
        'Caminos de producto, no INSERTs: registro/verificación de usuarios → email_outbox; guardados del documento CAD → domain_outbox (design.document.saved).',
      failureInjection:
        'Ninguna en la base. El incidente es OUTBOX_DOMAIN_WEBHOOK_URL apuntando a un puerto sin servicio: cada intento es una conexión rechazada real y el backoff exponencial del dispatcher agota los 8 intentos.',
      replayTool:
        'scripts/ops/outbox-replay.mjs, exactamente como lo usaría el operador del RUNBOOK (INC-2); su JSON de auditoría se publica íntegro en replay.toolAuditJson.',
      singleRun:
        'UNA corrida, deliberadamente: esta evidencia demuestra un CIRCUITO (entrega → muerte → replay → recuperación → dedupe), no una distribución de latencias. Las latencias que publica llevan su tamaño de muestra al lado.',
    },
    run: report,
    verdict: {
      passed:
        report.sustained.allDomainDelivered === true &&
        report.incident.allPoisonedWentDead === true &&
        report.replay.allRecovered === true &&
        report.deduplication.verified === true,
      criteria: [
        'todos los eventos de dominio de la fase sostenida entregados al receptor propio',
        'todos los eventos envenenados terminaron dead tras agotar reintentos reales',
        'el replay auditado devolvió las filas dead a pending y TODAS se entregaron',
        'la re-entrega con el mismo idempotency-key respondió duplicate sin recibo nuevo',
      ],
      latencyNote:
        'El veredicto es FUNCIONAL: juzga el circuito, no las latencias. Las latencias se publican como dato con su contaminación declarada.',
    },
    scope: {
      notMeasured: [
        'Red real y TLS: emisor y receptor comparten proceso y loopback; el trayecto de internet y el handshake no están incluidos.',
        'Proveedor de correo: este despliegue no tiene EMAIL_SENDER_* y los correos mueren por diseño (503 del receptor); la evidencia lo declara en run.emailQueue en vez de fingir entregas.',
        'Operación sostenida de semanas: la ventana medida dura minutos. Lo sostenido aquí es el circuito completo bajo un incidente real, no la estadística de un trimestre.',
        'Varios workers compitiendo por el lease: corre UN worker; la exclusión multi-worker está probada por specs PG, no por esta corrida.',
        'Saturación del outbox: decenas de filas, no miles; esta corrida no busca el techo del dispatcher.',
      ],
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  process.stderr.write(
    `[webhook-replay-audit] escrito ${path.relative(REPO_ROOT, OUTPUT)}\n` +
      `  dominio: ${JSON.stringify(artifact.run.final.domainOutbox.byStatus)} · ` +
      `email: ${JSON.stringify(artifact.run.final.emailOutbox.byStatus)} · ` +
      `dedupe verificado: ${artifact.run.deduplication.verified} · ` +
      `veredicto: ${artifact.verdict.passed ? 'VERDE' : 'NO SUPERADO'}\n`,
  );
}

main().catch((error) => {
  console.error(`[webhook-replay-audit] FALLO: ${error.message}`);
  process.exit(1);
});
