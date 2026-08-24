/**
 * Probe de EVIDENCIA OPERACIONAL del outbox: entrega, muerte y replay
 * auditado, con el receptor propio (UNA corrida).
 *
 * POR QUÉ. La rúbrica competitiva (events.operational) pide «evidencia
 * operacional sostenida y replay auditado con receptor externo», y todas las
 * piezas existen desde hoy: el outbox transaccional con leases y cola muerta,
 * el receptor de webhooks propio (ADR-0006/ADR-0008: la API se recibe a sí
 * misma) y la herramienta de replay del RUNBOOK
 * (`scripts/ops/outbox-replay.mjs`). Lo que no existía era la CORRIDA que las
 * junta y publica números. Este probe la ejecuta de punta a punta:
 *
 *   1. OPERACIÓN: la aplicación REAL (AppModule por HTTP, worker de outbox
 *      encendido) genera correos y eventos de dominio por sus caminos de
 *      producto: registro de usuarios → `identity.verify-email`, guardados de
 *      documento CAD → `design.document.saved`. El receptor es esta misma API
 *      (`/v1/outbox/email` y `/v1/outbox/domain`), firmado con HMAC.
 *   2. INCIDENTE: se apunta la cola `domain` a un puerto muerto y se generan
 *      eventos nuevos; el dispatcher los reintenta con backoff exponencial
 *      hasta agotarlos (8 intentos) y los marca `dead`. Ningún fallo se
 *      inyecta en la base: el fallo es una conexión rechazada de verdad.
 *   3. CAUSA CORREGIDA, REPLAY: se restaura la URL (el transporte relee la
 *      configuración EN CADA entrega, así que es el mismo gesto que haría el
 *      operador) y se ejecuta `outbox-replay.mjs --queue domain --all-dead`.
 *      El JSON de auditoría que imprime esa herramienta se publica ÍNTEGRO.
 *   4. DEDUPLICACIÓN: una entrega ya recibida se reenvía con el mismo
 *      `idempotencyKey` (mismo cuerpo, firma fresca del mismo secreto — bit a
 *      bit lo que reenviaría el transporte en una re-entrega at-least-once) y
 *      se comprueba que el receptor responde `duplicate` y que la tabla de
 *      recibos NO crece.
 *
 * LA COLA EMAIL DICE SU VERDAD. Este despliegue NO tiene proveedor de correo
 * (EMAIL_SENDER_* vacías): el receptor responde 503 por diseño y los correos
 * mueren tras agotar reintentos. El RUNBOOK ordena corregir la CAUSA antes de
 * reinyectar, y la causa (no hay proveedor) no puede corregirse en esta
 * máquina sin una clave real de un tercero; por eso el replay de email se
 * ejecuta en `--dry-run` (auditoría de lo que se tocaría, sin tocarlo) y el
 * artefacto lo declara en vez de fingir una entrega que no ocurrió.
 *
 * UNA CORRIDA, UN PROCESO. El orquestador
 * (`scripts/ops/webhook-replay-audit-evidence.mjs`) recrea la base, lanza
 * este proceso y envuelve el informe con la máquina declarada.
 */
import 'reflect-metadata';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import {
  helmetOptions,
  JSON_BODY_LIMIT,
} from '../bootstrap/production-hardening';
import { useOutboxReceiverRawBody } from '../modules/outbox-receiver/outbox-receiver.raw-body';
import {
  apiCall,
  createIntegratorSession,
  LoadProbeSetupError,
} from './integrator-session';
import { buildLoadDocument } from './load-corpus';

const PORT = Number(process.env.OUTBOX_AUDIT_PORT ?? 4330);
/** Puerto MUERTO para el incidente: discard/CHARGEN nunca escucha aquí. */
const DEAD_PORT = Number(process.env.OUTBOX_AUDIT_DEAD_PORT ?? 9);
/** Guardados que generan eventos de dominio en la fase de operación. */
const SUSTAINED_SAVES = Number(process.env.OUTBOX_AUDIT_SAVES ?? 10);
/** Eventos generados DURANTE el incidente (los que morirán). */
const INCIDENT_SAVES = Number(process.env.OUTBOX_AUDIT_INCIDENT_SAVES ?? 3);
/** Registros extra: cada uno encola un correo de verificación real. */
const EXTRA_REGISTRATIONS = 2;
/** Techo de espera para que una cola alcance un estado (la muerte tarda
 * ~127 s por el backoff exponencial de 8 intentos; margen para jitter). */
const WAIT_BUDGET_MS = 6 * 60_000;
const POLL_MS = 500;

const round = (value: number): number => Math.round(value * 1000) / 1000;

interface QueueTally {
  total: number;
  byStatus: Record<string, number>;
}

interface OutboxRowSnapshot {
  id: string;
  status: string;
  attemptCount: number;
  createdAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  lastError: string | null;
}

async function tally(
  dataSource: DataSource,
  table: 'domain_outbox' | 'email_outbox',
): Promise<QueueTally> {
  const rows: unknown = await dataSource.query(
    `SELECT status, count(*)::int AS total FROM ${table} GROUP BY status`,
  );
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of rows as { status: string; total: number }[]) {
    byStatus[row.status] = row.total;
    total += row.total;
  }
  return { total, byStatus };
}

/** Filas del outbox SIN payload ni destinatario: el informe no necesita PII. */
async function snapshotRows(
  dataSource: DataSource,
  table: 'domain_outbox' | 'email_outbox',
  where = '',
): Promise<OutboxRowSnapshot[]> {
  const rows: unknown = await dataSource.query(
    `SELECT id, status, attempt_count, created_at, sent_at, failed_at,
            left(last_error, 160) AS last_error
       FROM ${table} ${where} ORDER BY created_at`,
  );
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    status: String(row.status),
    attemptCount: Number(row.attempt_count),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
    failedAt: row.failed_at ? new Date(String(row.failed_at)).toISOString() : null,
    lastError: row.last_error ? String(row.last_error) : null,
  }));
}

/**
 * Espera hasta que `predicate` sea verdadero o se agote el presupuesto.
 * Si se agota NO lanza: devuelve `false` y el informe publica el estado real
 * — un timeout también es un dato.
 */
async function waitFor(
  what: string,
  predicate: () => Promise<boolean>,
  budgetMs = WAIT_BUDGET_MS,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  process.stderr.write(`[outbox-audit] TIMEOUT esperando: ${what}\n`);
  return false;
}

/** Lanza el replay auditado REAL del RUNBOOK y devuelve su JSON tal cual. */
function runReplayTool(args: string[]): unknown {
  const script = path.resolve(__dirname, '../../../../scripts/ops/outbox-replay.mjs');
  const run = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.status !== 0 && run.status !== null) {
    // El informe necesita saber QUÉ dijo la herramienta aunque falle.
    throw new LoadProbeSetupError(
      `outbox-replay.mjs salió con ${run.status}: ${run.stderr || run.stdout}`,
    );
  }
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new LoadProbeSetupError(
      `outbox-replay.mjs no imprimió JSON: ${run.stdout.slice(0, 800)}`,
    );
  }
}

async function bootApplication(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    logger: ['error', 'warn'],
  });
  // El receptor verifica la firma HMAC sobre los BYTES CRUDOS: su parser va
  // antes del JSON global, exactamente como en main.ts.
  useOutboxReceiverRawBody(app);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.use(helmet(helmetOptions()));
  app.use(compression());
  await app.listen(PORT, '127.0.0.1');
  return app;
}

async function main(): Promise<void> {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const selfEmailUrl = `${baseUrl}/v1/outbox/email`;
  const selfDomainUrl = `${baseUrl}/v1/outbox/domain`;
  const deadDomainUrl = `http://127.0.0.1:${DEAD_PORT}/v1/outbox/domain`;

  // Configuración del emisor Y del receptor (comparten proceso y secreto).
  // El secreto se genera por corrida: no hay nada que rotar ni filtrar.
  const secret = randomBytes(32).toString('hex');
  process.env.OUTBOX_WEBHOOK_SECRET = secret;
  process.env.OUTBOX_EMAIL_WEBHOOK_URL = selfEmailUrl;
  process.env.OUTBOX_DOMAIN_WEBHOOK_URL = selfDomainUrl;
  process.env.OUTBOX_DISPATCHER_ENABLED = 'true';
  process.env.OUTBOX_POLL_INTERVAL_MS = process.env.OUTBOX_POLL_INTERVAL_MS ?? '250';
  process.env.OUTBOX_WEBHOOK_TIMEOUT_MS = process.env.OUTBOX_WEBHOOK_TIMEOUT_MS ?? '2000';

  const runStartedAt = new Date().toISOString();
  const app = await bootApplication();
  const dataSource = app.get(DataSource);
  const timeline: { at: string; phase: string; detail: string }[] = [];
  const mark = (phase: string, detail: string): void => {
    timeline.push({ at: new Date().toISOString(), phase, detail });
    process.stderr.write(`[outbox-audit] ${phase}: ${detail}\n`);
  };

  try {
    /* ── Fase 1 · OPERACIÓN: tráfico real con receptor propio ────────────── */
    mark('operacion', 'registro del integrador (encola identity.verify-email)');
    const suffix = randomUUID().slice(0, 8);
    const session = await createIntegratorSession({
      baseUrl,
      dataSource,
      email: `outbox-${suffix}@carga.valle.design`,
      password: ['Outbox', 'Valle', '2026', 'auditoria'].join('-'),
      organizationSlug: `despacho-outbox-${suffix}`,
    });

    for (let index = 0; index < EXTRA_REGISTRATIONS; index += 1) {
      const anonymous = { baseUrl, cookieHeader: '', csrfToken: '' };
      const response = await apiCall(anonymous, '/v1/auth/register', {
        method: 'POST',
        body: {
          email: `outbox-extra-${index}-${suffix}@carga.valle.design`,
          password: ['Outbox', 'Valle', '2026', `extra${index}`].join('-'),
          displayName: `Alta extra ${index + 1}`,
        },
      });
      if (response.status !== 202) {
        throw new LoadProbeSetupError(
          `registro extra ${index + 1}: HTTP ${response.status}`,
        );
      }
    }

    const project = (await (
      await apiCall(session, '/v1/cad/projects', {
        method: 'POST',
        body: { name: 'Proyecto de auditoría outbox', description: 'probe' },
      })
    ).json()) as { id?: string };
    const document = (await (
      await apiCall(session, '/v1/cad/documents', {
        method: 'POST',
        body: { name: 'Plano de auditoría', projectId: project.id },
      })
    ).json()) as { id?: string };
    if (!project.id || !document.id) {
      throw new LoadProbeSetupError('No se pudo crear proyecto/documento.');
    }

    let version = 0;
    const save = async (): Promise<void> => {
      const response = await apiCall(
        session,
        `/v1/cad/documents/${document.id}/content`,
        {
          method: 'PUT',
          rawBody: JSON.stringify({
            cadDocument: buildLoadDocument(300),
            expectedCadDocumentVersion: version,
          }),
        },
      );
      const body = (await response.json()) as { cadDocumentVersion?: number };
      if (
        response.status >= 400 ||
        typeof body.cadDocumentVersion !== 'number'
      ) {
        throw new LoadProbeSetupError(`guardado: HTTP ${response.status}`);
      }
      version = body.cadDocumentVersion;
    };

    mark('operacion', `${SUSTAINED_SAVES} guardados → design.document.saved`);
    for (let index = 0; index < SUSTAINED_SAVES; index += 1) await save();

    const sustainedDelivered = await waitFor(
      'todos los eventos de dominio entregados (sent)',
      async () => {
        const domain = await tally(dataSource, 'domain_outbox');
        return (
          (domain.byStatus.sent ?? 0) >= SUSTAINED_SAVES &&
          (domain.byStatus.pending ?? 0) + (domain.byStatus.processing ?? 0) ===
            0
        );
      },
      90_000,
    );
    const sustainedRows = await snapshotRows(dataSource, 'domain_outbox');
    const deliveryLatenciesMs = sustainedRows
      .filter((row) => row.status === 'sent' && row.sentAt && row.createdAt)
      .map((row) =>
        round(Date.parse(row.sentAt as string) - Date.parse(row.createdAt as string)),
      )
      .sort((a, b) => a - b);
    mark(
      'operacion',
      `entregados ${deliveryLatenciesMs.length} eventos de dominio al receptor propio`,
    );

    /* ── Fase 2 · INCIDENTE: receptor de dominio muerto ──────────────────── */
    mark('incidente', `OUTBOX_DOMAIN_WEBHOOK_URL → ${deadDomainUrl}`);
    const incidentStartedAt = new Date().toISOString();
    process.env.OUTBOX_DOMAIN_WEBHOOK_URL = deadDomainUrl;
    for (let index = 0; index < INCIDENT_SAVES; index += 1) await save();

    const domainDead = await waitFor(
      `${INCIDENT_SAVES} eventos de dominio dead tras agotar reintentos`,
      async () => {
        const domain = await tally(dataSource, 'domain_outbox');
        return (domain.byStatus.dead ?? 0) >= INCIDENT_SAVES;
      },
    );
    // Los correos mueren en paralelo por su propia causa (sin proveedor →
    // 503): se espera aquí para que el informe capture su estado final.
    const emailDead = await waitFor(
      'correos dead (receptor 503 sin proveedor, por diseño)',
      async () => {
        const email = await tally(dataSource, 'email_outbox');
        return (
          email.total > 0 &&
          (email.byStatus.pending ?? 0) +
            (email.byStatus.processing ?? 0) +
            (email.byStatus.failed ?? 0) ===
            0
        );
      },
    );
    const deadRows = await snapshotRows(
      dataSource,
      'domain_outbox',
      `WHERE status = 'dead'`,
    );
    mark('incidente', `${deadRows.length} filas dead en domain_outbox`);

    /* ── Fase 3 · CAUSA CORREGIDA + REPLAY AUDITADO ──────────────────────── */
    mark('replay', `causa corregida: OUTBOX_DOMAIN_WEBHOOK_URL → ${selfDomainUrl}`);
    process.env.OUTBOX_DOMAIN_WEBHOOK_URL = selfDomainUrl;
    const replayStartedAt = new Date().toISOString();
    const domainReplayAudit = runReplayTool([
      '--queue',
      'domain',
      '--all-dead',
      '--url',
      process.env.DATABASE_URL ?? '',
    ]);

    const replayedRecovered = await waitFor(
      'filas reinyectadas entregadas (sent)',
      async () => {
        const domain = await tally(dataSource, 'domain_outbox');
        return (
          (domain.byStatus.dead ?? 0) === 0 &&
          (domain.byStatus.pending ?? 0) + (domain.byStatus.processing ?? 0) ===
            0
        );
      },
      120_000,
    );
    const recoveredRows = await snapshotRows(
      dataSource,
      'domain_outbox',
      `WHERE id IN (${deadRows.map((row) => `'${row.id}'`).join(',') || `'00000000-0000-0000-0000-000000000000'`})`,
    );
    const recoveryLatenciesMs = recoveredRows
      .filter((row) => row.status === 'sent' && row.sentAt)
      .map((row) => round(Date.parse(row.sentAt as string) - Date.parse(replayStartedAt)))
      .sort((a, b) => a - b);
    mark('replay', `${recoveryLatenciesMs.length} filas recuperadas a sent`);

    /* ── Fase 4 · DEDUPLICACIÓN verificada contra el receptor ────────────── */
    // Se reenvía una entrega YA recibida con su MISMO idempotencyKey: el
    // cuerpo mínimo que el receptor parsea, firmado con el mismo secreto y un
    // timestamp fresco — lo que haría el transporte en una re-entrega
    // at-least-once tras perder el commit de `sent`.
    const sentRow: unknown = await dataSource.query(
      `SELECT idempotency_key, payload FROM domain_outbox WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 1`,
    );
    const dedupTarget = (sentRow as { idempotency_key: string; payload: unknown }[])[0];
    if (!dedupTarget) {
      throw new LoadProbeSetupError('No hay fila sent para verificar dedupe.');
    }
    const receiptsBefore: unknown = await dataSource.query(
      `SELECT count(*)::int AS total FROM webhook_receipts WHERE queue = 'domain'`,
    );
    const dedupBody = JSON.stringify({
      queue: 'domain',
      idempotencyKey: dedupTarget.idempotency_key,
      payload: dedupTarget.payload,
    });
    const timestamp = new Date().toISOString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${dedupBody}`)
      .digest('hex');
    const dedupResponse = await fetch(selfDomainUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': dedupTarget.idempotency_key,
        'x-valle-timestamp': timestamp,
        'x-valle-signature': `sha256=${signature}`,
      },
      body: dedupBody,
    });
    const dedupResult = (await dedupResponse.json()) as Record<string, unknown>;
    const receiptsAfter: unknown = await dataSource.query(
      `SELECT count(*)::int AS total FROM webhook_receipts WHERE queue = 'domain'`,
    );
    const receiptsBeforeCount = (receiptsBefore as { total: number }[])[0].total;
    const receiptsAfterCount = (receiptsAfter as { total: number }[])[0].total;
    mark(
      'dedupe',
      `reenvío con la misma clave → HTTP ${dedupResponse.status} ${JSON.stringify(dedupResult)}; recibos ${receiptsBeforeCount}→${receiptsAfterCount}`,
    );

    /* ── Fase 5 · Cola email: auditoría en seco, causa declarada ─────────── */
    const emailReplayDryRun = runReplayTool([
      '--queue',
      'email',
      '--all-dead',
      '--dry-run',
      '--url',
      process.env.DATABASE_URL ?? '',
    ]);

    /* ── Informe ─────────────────────────────────────────────────────────── */
    const metricsResponse = await fetch(`${baseUrl}/health/metrics/commercial`);
    const commercialMetrics =
      metricsResponse.status === 200 ? await metricsResponse.json() : null;
    const finalDomain = await tally(dataSource, 'domain_outbox');
    const finalEmail = await tally(dataSource, 'email_outbox');
    const emailRows = await snapshotRows(dataSource, 'email_outbox');
    const receiptsByQueue: unknown = await dataSource.query(
      `SELECT queue, count(*)::int AS total FROM webhook_receipts GROUP BY queue`,
    );

    const report = {
      runStartedAt,
      runFinishedAt: new Date().toISOString(),
      configuration: {
        receiver: 'esta misma API (/v1/outbox/email, /v1/outbox/domain), firma HMAC-SHA256',
        deadEndpoint: deadDomainUrl,
        pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS),
        webhookTimeoutMs: Number(process.env.OUTBOX_WEBHOOK_TIMEOUT_MS),
        maxAttempts: 8,
        backoff: 'exponencial base 1 s, tope 15 min, jitter 20 % (valores por defecto del dispatcher)',
      },
      timeline,
      sustained: {
        savesIssued: SUSTAINED_SAVES,
        registrationsIssued: 1 + EXTRA_REGISTRATIONS,
        allDomainDelivered: sustainedDelivered,
        domainDeliveryLatencyMs: {
          samples: deliveryLatenciesMs.length,
          minMs: deliveryLatenciesMs[0] ?? null,
          medianMs:
            deliveryLatenciesMs[Math.floor(deliveryLatenciesMs.length / 2)] ??
            null,
          maxMs: deliveryLatenciesMs.at(-1) ?? null,
          note:
            'sent_at - created_at leídos de la fila. Dos advertencias: la ' +
            'columna guarda SEGUNDOS enteros (por eso aparecen 0 y 1000 ms, ' +
            'no valores intermedios) e incluye la espera del sondeo del ' +
            'worker (250 ms), no sólo el HTTP. Es un techo grueso, no una ' +
            'medición fina de latencia.',
        },
      },
      incident: {
        startedAt: incidentStartedAt,
        eventsPoisoned: INCIDENT_SAVES,
        allPoisonedWentDead: domainDead,
        emailQueueSettled: emailDead,
        deadRowsAtPeak: deadRows,
      },
      replay: {
        startedAt: replayStartedAt,
        toolAuditJson: domainReplayAudit,
        allRecovered: replayedRecovered,
        recoveredRows,
        recoveryLatencyFromReplayMs: {
          samples: recoveryLatenciesMs.length,
          minMs: recoveryLatenciesMs[0] ?? null,
          maxMs: recoveryLatenciesMs.at(-1) ?? null,
        },
      },
      deduplication: {
        method:
          'reenvío de una entrega ya recibida con el MISMO idempotencyKey del ' +
          'cuerpo firmado (firma fresca, mismo secreto): la re-entrega ' +
          'at-least-once que el replay da por segura.',
        httpStatus: dedupResponse.status,
        receiverResponse: dedupResult,
        receiptsBefore: receiptsBeforeCount,
        receiptsAfter: receiptsAfterCount,
        verified:
          dedupResponse.status === 200 &&
          dedupResult.status === 'duplicate' &&
          receiptsBeforeCount === receiptsAfterCount,
      },
      emailQueue: {
        rows: emailRows,
        replayDryRunAudit: emailReplayDryRun,
        whyNoLiveReplay:
          'Este despliegue no tiene proveedor de correo (EMAIL_SENDER_* ' +
          'vacías): el receptor responde 503 email_sender_unavailable por ' +
          'diseño y los correos mueren al agotar reintentos. El RUNBOOK ' +
          'ordena corregir la causa ANTES de reinyectar; la causa exige una ' +
          'clave real de un tercero, así que el replay de email se audita en ' +
          'seco (--dry-run) y no se finge una entrega.',
      },
      final: {
        domainOutbox: finalDomain,
        emailOutbox: finalEmail,
        webhookReceiptsByQueue: receiptsByQueue,
        commercialMetrics,
      },
    };
    process.stdout.write(`\n__OUTBOX_AUDIT__${JSON.stringify(report)}\n`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[outbox-audit] FALLO: ${message}`);
    process.exit(1);
  });
