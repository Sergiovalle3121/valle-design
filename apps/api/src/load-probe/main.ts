/**
 * Probe de límite y carga de la API pública de Valle Design (UNA corrida).
 *
 * POR QUÉ. La rúbrica competitiva exige «pruebas de límite y carga
 * publicadas», y hasta hoy la única respuesta a «¿cuántas peticiones aguanta?»
 * era una opinión. Un despacho que quiere automatizar necesita tres cifras
 * antes de escribir su primera línea de integración: cuántas peticiones por
 * segundo sostiene el endpoint que va a llamar, cuánto tarda el percentil malo
 * (no la media, que esconde justo el caso que le va a doler) y qué pasa cuando
 * se pasa de la raya —si el servidor lo frena con un 429 accionable o si se
 * cae—. Este proceso mide exactamente eso contra la aplicación REAL.
 *
 * QUÉ ES REAL AQUÍ Y QUÉ NO. Real: el servidor HTTP, los guards de sesión y
 * entitlement, la validación global, PostgreSQL, el CAS del documento y el
 * limitador de tasa compartido. No real: la red (cliente y servidor viven en
 * la misma máquina, así que las latencias publicadas EXCLUYEN el trayecto de
 * internet y son un suelo, no una promesa) y el aislamiento de la máquina,
 * que se declara corrida a corrida en el artefacto.
 *
 * UNA CORRIDA, UN PROCESO. El orquestador (`scripts/cad/api-load-tests.mjs`)
 * lanza este proceso tres veces y publica la MEDIANA. Repetir dentro del mismo
 * proceso mediría un montículo ya caliente y un pool ya abierto: la segunda
 * corrida saldría mejor por razones que no tienen que ver con el producto.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { freemem, loadavg } from 'node:os';
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
import {
  closedLoop,
  round,
  serialSequence,
  type PhaseOutcome,
} from './load-driver';
import {
  apiCall,
  createIntegratorSession,
  LoadProbeSetupError,
  type IntegratorSession,
} from './integrator-session';
import { buildLoadDocument } from './load-corpus';

/** Ventana de medición por fase concurrente. */
const WINDOW_MS = Number(process.env.LOAD_PROBE_WINDOW_MS ?? 9_000);
/** Calentamiento descartado antes de cada ventana. */
const WARMUP_MS = Number(process.env.LOAD_PROBE_WARMUP_MS ?? 800);
/** Clientes simultáneos: un despacho integrando no abre cien conexiones. */
const CONCURRENCY = Number(process.env.LOAD_PROBE_CONCURRENCY ?? 8);
/** Guardados medidos en serie (el CAS hace que la concurrencia mida otra cosa). */
const SAVE_ITERATIONS = Number(process.env.LOAD_PROBE_SAVE_ITERATIONS ?? 12);
/** Intentos de login fallido para encontrar el techo del limitador. */
const RATE_LIMIT_ATTEMPTS = Number(process.env.LOAD_PROBE_RATE_ATTEMPTS ?? 14);

/** Tamaños del escalón de documento grande, en número de entidades. */
const DOCUMENT_LADDER = [500, 5_000, 20_000];

interface LargeDocumentMeasurement {
  entities: number;
  serializedBytes: number;
  saveMs: number;
  openMs: number;
  openBytes: number;
  saveStatus: number;
  openStatus: number;
  storedAsBlobPointer: boolean | null;
}

interface RateLimitProbe {
  endpoint: string;
  scope: string;
  attempts: number;
  firstThrottledAttempt: number | null;
  statusSequence: number[];
  retryAfterSeconds: number | null;
  bodyCode: string | null;
  storeBackend: string;
}

interface ProbeReport {
  runStartedAt: string;
  runFinishedAt: string;
  bootMs: number;
  migrationsRan: boolean;
  phases: PhaseOutcome[];
  largeDocuments: LargeDocumentMeasurement[];
  rateLimit: RateLimitProbe;
  freeMemoryBytesAtStart: number;
  freeMemoryBytesAtEnd: number;
  loadAverageAtEnd: number[];
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Lee la respuesta EXIGIENDO éxito.
 *
 * Un fallo de preparación tiene que decir el estado y el cuerpo: la primera
 * versión de este probe se limitaba a decir «no devolvió cadDocumentVersion» y
 * escondía un 400 del validador del documento. Fallo cerrado con el motivo a
 * la vista.
 */
async function readJsonOrFail(
  response: Response,
  what: string,
): Promise<unknown> {
  const text = await response.text();
  if (response.status >= 400) {
    throw new LoadProbeSetupError(
      `${what}: HTTP ${response.status} — ${text.slice(0, 600)}`,
    );
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function stringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === 'string' ? raw : null;
}

function numberField(value: unknown, field: string): number | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === 'number' ? raw : null;
}

function booleanField(value: unknown, field: string): boolean | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === 'boolean' ? raw : null;
}

/**
 * Arranca la aplicación con la MISMA configuración de `main.ts`.
 *
 * Helmet, compresión, la pipe de validación global y el tope del cuerpo JSON
 * no son adorno: cada uno cuesta microsegundos por petición y el integrador
 * los va a pagar. Medir sin ellos publicaría una cifra que nadie observará.
 */
async function bootApplication(port: number): Promise<{
  app: NestExpressApplication;
  bootMs: number;
}> {
  const started = performance.now();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    logger: ['error', 'warn'],
  });
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
  await app.listen(port, '127.0.0.1');
  return { app, bootMs: round(performance.now() - started) };
}

/** Documento y proyecto de trabajo del integrador, ya persistidos. */
async function seedWorkspace(session: IntegratorSession): Promise<{
  projectId: string;
  documentId: string;
  version: number;
}> {
  const project = await readJsonOrFail(
    await apiCall(session, '/v1/cad/projects', {
      method: 'POST',
      body: { name: 'Proyecto de carga', description: 'probe' },
    }),
    'crear proyecto',
  );
  const projectId = stringField(project, 'id');
  if (!projectId) {
    throw new LoadProbeSetupError('No se pudo crear el proyecto de carga.');
  }
  const document = await readJsonOrFail(
    await apiCall(session, '/v1/cad/documents', {
      method: 'POST',
      body: { name: 'Plano de carga', projectId },
    }),
    'crear documento',
  );
  const documentId = stringField(document, 'id');
  if (!documentId) {
    throw new LoadProbeSetupError('No se pudo crear el documento de carga.');
  }
  const saved = await readJsonOrFail(
    await apiCall(session, `/v1/cad/documents/${documentId}/content`, {
      method: 'PUT',
      rawBody: JSON.stringify({
        cadDocument: buildLoadDocument(500),
        expectedCadDocumentVersion: 0,
      }),
    }),
    'guardado inicial',
  );
  const version = numberField(saved, 'cadDocumentVersion');
  if (version === null) {
    throw new LoadProbeSetupError(
      'El guardado inicial no devolvió cadDocumentVersion.',
    );
  }
  return { projectId, documentId, version };
}

/**
 * Escalón de documento grande.
 *
 * Se mide guardar Y volver a abrir porque son costes distintos y el integrador
 * paga los dos: por encima de 1 MB el documento deja de vivir en la fila y
 * pasa a un blob content-addressed, así que la apertura tiene que rehidratarlo.
 * Publicar sólo el guardado escondería justo el camino que se vuelve caro.
 */
async function measureLargeDocuments(
  session: IntegratorSession,
  documentId: string,
  startVersion: number,
): Promise<{ measurements: LargeDocumentMeasurement[]; version: number }> {
  const measurements: LargeDocumentMeasurement[] = [];
  let version = startVersion;
  for (const entities of DOCUMENT_LADDER) {
    const payload = JSON.stringify({
      cadDocument: buildLoadDocument(entities),
      expectedCadDocumentVersion: version,
    });
    const saveStarted = performance.now();
    const saveResponse = await apiCall(
      session,
      `/v1/cad/documents/${documentId}/content`,
      { method: 'PUT', rawBody: payload },
    );
    const saveBody = await readJson(saveResponse);
    const saveMs = round(performance.now() - saveStarted);
    const nextVersion = numberField(saveBody, 'cadDocumentVersion');
    if (nextVersion !== null) version = nextVersion;

    const openStarted = performance.now();
    const openResponse = await apiCall(
      session,
      `/v1/cad/documents/${documentId}`,
    );
    const openText = await openResponse.text();
    const openMs = round(performance.now() - openStarted);

    measurements.push({
      entities,
      serializedBytes: Buffer.byteLength(payload, 'utf8'),
      saveMs,
      openMs,
      openBytes: Buffer.byteLength(openText, 'utf8'),
      saveStatus: saveResponse.status,
      openStatus: openResponse.status,
      storedAsBlobPointer: booleanField(saveBody, 'storedAsBlobPointer'),
    });
  }
  return { measurements, version };
}

/**
 * Techo del limitador de tasa por cuenta.
 *
 * Se ataca `POST /v1/auth/login` con una contraseña incorrecta sobre una
 * cuenta INEXISTENTE a propósito: así la prueba no bloquea la sesión que las
 * demás fases están usando, y el limitador se ejerce igual porque cuenta
 * INTENTOS, no aciertos. Lo que se publica es el número de intento en el que
 * aparece el 429 y si la respuesta dice cuándo reintentar — un 429 sin
 * `retryAfterSeconds` obliga al integrador a adivinar.
 */
async function probeRateLimit(
  baseUrl: string,
  storeBackend: string,
): Promise<RateLimitProbe> {
  const anonymous = { baseUrl, cookieHeader: '', csrfToken: '' };
  const email = `limite-${randomUUID()}@carga.valle.design`;
  const statusSequence: number[] = [];
  let firstThrottledAttempt: number | null = null;
  let retryAfterSeconds: number | null = null;
  let bodyCode: string | null = null;

  for (let attempt = 1; attempt <= RATE_LIMIT_ATTEMPTS; attempt += 1) {
    const response = await apiCall(anonymous, '/v1/auth/login', {
      method: 'POST',
      body: { email, password: 'contrasena-incorrecta-de-carga' },
    });
    const body = await readJson(response);
    statusSequence.push(response.status);
    if (response.status === 429 && firstThrottledAttempt === null) {
      firstThrottledAttempt = attempt;
      retryAfterSeconds = numberField(body, 'retryAfterSeconds');
      bodyCode = stringField(body, 'message');
    }
  }

  return {
    endpoint: 'POST /v1/auth/login',
    scope: 'login.account (clave opaca por cuenta, ventana fija de 60 s)',
    attempts: RATE_LIMIT_ATTEMPTS,
    firstThrottledAttempt,
    statusSequence,
    retryAfterSeconds,
    bodyCode,
    storeBackend,
  };
}

async function main(): Promise<void> {
  const port = Number(process.env.LOAD_PROBE_PORT ?? 4310);
  const baseUrl = `http://127.0.0.1:${port}`;
  const runStartedAt = new Date().toISOString();
  const freeMemoryBytesAtStart = freemem();

  const { app, bootMs } = await bootApplication(port);
  const dataSource = app.get(DataSource);
  // Si el esquema se hubiera creado con `synchronize` en vez de migraciones,
  // la tabla no existe: eso NO es un fallo del probe, pero sí un hecho que el
  // artefacto debe publicar, porque un esquema sincronizado no es el que
  // corre en producción.
  let migrationsRan = false;
  try {
    const migrations: unknown = await dataSource.query(
      'SELECT count(*)::int AS total FROM migrations',
    );
    migrationsRan =
      Array.isArray(migrations) &&
      (numberField(migrations[0], 'total') ?? 0) > 0;
  } catch {
    migrationsRan = false;
  }
  const storeBackend = String(dataSource.options.type);

  try {
    const suffix = randomUUID().slice(0, 8);
    const session = await createIntegratorSession({
      baseUrl,
      dataSource,
      email: `integrador-${suffix}@carga.valle.design`,
      password: 'Carga-Valle-2026-integrador',
      organizationSlug: `despacho-carga-${suffix}`,
    });
    const workspace = await seedWorkspace(session);

    const phases: PhaseOutcome[] = [];

    phases.push(
      await closedLoop({
        phase: 'health',
        concurrency: CONCURRENCY,
        windowMs: WINDOW_MS,
        warmupMs: WARMUP_MS,
        attempt: async () => {
          const response = await fetch(`${baseUrl}/health`);
          await response.text();
          return { status: response.status };
        },
      }),
    );

    phases.push(
      await closedLoop({
        phase: 'public-catalog',
        concurrency: CONCURRENCY,
        windowMs: WINDOW_MS,
        warmupMs: WARMUP_MS,
        attempt: async () => {
          const response = await fetch(`${baseUrl}/v1/commercial/public/plans`);
          await response.text();
          return { status: response.status };
        },
      }),
    );

    phases.push(
      await closedLoop({
        phase: 'cad-projects-list',
        concurrency: CONCURRENCY,
        windowMs: WINDOW_MS,
        warmupMs: WARMUP_MS,
        attempt: async () => {
          const response = await apiCall(session, '/v1/cad/projects?limit=50');
          await response.text();
          return { status: response.status };
        },
      }),
    );

    phases.push(
      await closedLoop({
        phase: 'cad-document-open',
        concurrency: CONCURRENCY,
        windowMs: WINDOW_MS,
        warmupMs: WARMUP_MS,
        attempt: async () => {
          const response = await apiCall(
            session,
            `/v1/cad/documents/${workspace.documentId}`,
          );
          await response.text();
          return { status: response.status };
        },
      }),
    );

    // El CAS obliga a encadenar: cada guardado declara la versión que leyó.
    let version = workspace.version;
    const savePayloads = Array.from({ length: SAVE_ITERATIONS }, () =>
      buildLoadDocument(500),
    );
    let saveIndex = 0;
    phases.push(
      await serialSequence({
        phase: 'cad-document-save',
        iterations: SAVE_ITERATIONS,
        attempt: async () => {
          const response = await apiCall(
            session,
            `/v1/cad/documents/${workspace.documentId}/content`,
            {
              method: 'PUT',
              rawBody: JSON.stringify({
                cadDocument: savePayloads[saveIndex % savePayloads.length],
                expectedCadDocumentVersion: version,
              }),
            },
          );
          saveIndex += 1;
          const body = await readJson(response);
          const next = numberField(body, 'cadDocumentVersion');
          if (next !== null) version = next;
          return { status: response.status };
        },
      }),
    );

    const large = await measureLargeDocuments(
      session,
      workspace.documentId,
      version,
    );

    // El limitador va AL FINAL: consume presupuesto por IP y dejaría a las
    // fases autenticadas peleando con su propio 429.
    const rateLimit = await probeRateLimit(baseUrl, storeBackend);

    const report: ProbeReport = {
      runStartedAt,
      runFinishedAt: new Date().toISOString(),
      bootMs,
      migrationsRan,
      phases,
      largeDocuments: large.measurements,
      rateLimit,
      freeMemoryBytesAtStart,
      freeMemoryBytesAtEnd: freemem(),
      loadAverageAtEnd: loadavg().map(round),
    };
    process.stdout.write(`\n__LOAD_PROBE__${JSON.stringify(report)}\n`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api-load-probe] FALLO: ${message}`);
    process.exit(1);
  });
