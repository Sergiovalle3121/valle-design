/**
 * Probe de CONCURRENCIA DE REVIEW (UNA corrida): todos los roles a la vez
 * sobre el MISMO documento, más dos escritores CAS con fusión semántica real.
 *
 * POR QUÉ. La fila `review.concurrency` de la rúbrica pide «carga concurrente
 * medida y merge semántico con recorrido de todos los roles, con veredicto
 * verde en el artefacto». Este probe la mide contra la aplicación COMPLETA
 * (AppModule por HTTP, PostgreSQL con las migraciones reales):
 *
 *  · CINCO actores concurrentes sobre el mismo documento y la misma sesión de
 *    revisión: owner, admin, member y viewer (memberships reales, invitación
 *    aceptada por su token) más un revisor por ENLACE (X-Review-Token, sin
 *    sesión). Cada actor abre, lista, comenta y resuelve en bucle dentro de
 *    la misma ventana; las latencias se publican por rol y operación.
 *  · FRONTERAS de rol comprobadas en la misma corrida: el viewer no puede
 *    guardar el documento (403) y el enlace de review tampoco (superficie de
 *    solo lectura impuesta por el backend).
 *  · DOS ESCRITORES CAS: owner y member guardan A LA VEZ contra la misma
 *    versión. Uno gana, el otro recibe 409 y lo resuelve con la fusión
 *    SEMÁNTICA REAL del editor (`planCadConflictResolution`, invocada vía
 *    `scripts/cad/review-concurrency-merge.mts` con tsx) y reintenta. Se
 *    ejercen los dos caminos: adiciones disjuntas (fusión automática) y una
 *    colisión tipada sobre la misma entidad (política declarada).
 *
 * EXCEPCIONES DECLARADAS (las mismas clases que el probe de carga):
 *  · Los tokens de verificación e invitación se leen de `email_outbox` — es
 *    lo que el proveedor de correo entregaría; no hay buzón en un script.
 *  · El trial da 3 asientos y el recorrido exige 4 miembros: el probe amplía
 *    `subscriptions.seats` a 4 por SQL, haciendo de OPERADOR (en producción
 *    ese es el camino del cobro externo asistido). Ningún otro estado se
 *    inyecta a mano.
 *
 * El orquestador (`scripts/cad/review-concurrency-evidence.mjs`) lanza tres
 * corridas en procesos separados y publica la mediana con las muestras.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
} from '../modules/identity/identity-security';
import { round, summarize, type LatencyStats } from './load-driver';
import {
  apiCall,
  createIntegratorSession,
  LoadProbeSetupError,
  type IntegratorSession,
} from './integrator-session';
import { buildLoadDocument } from './load-corpus';

const PORT = Number(process.env.REVIEW_PROBE_PORT ?? 4340);
/** Ventana de la fase concurrente de lectura/comentario, por corrida. */
const WINDOW_MS = Number(process.env.REVIEW_PROBE_WINDOW_MS ?? 8_000);
/** Clientes por rol: 5 roles × 2 = 10 clientes sobre el mismo documento. */
const WORKERS_PER_ROLE = Number(process.env.REVIEW_PROBE_WORKERS ?? 2);
/** Rondas CAS de adiciones disjuntas (fusión automática). */
const CAS_DISJOINT_ROUNDS = Number(process.env.REVIEW_PROBE_CAS_ROUNDS ?? 4);
/** Entidades del documento bajo revisión. */
const DOCUMENT_ENTITIES = 400;

const REPO_ROOT = path.resolve(__dirname, '../../../..');

type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
type Role = OrgRole | 'link';

interface Actor {
  role: Role;
  session: IntegratorSession | null;
  /** Sólo para el revisor por enlace. */
  reviewToken?: string;
}

interface OpSample {
  role: Role;
  op: string;
  ms: number;
  status: number;
}

interface WireDocument {
  meta: Record<string, unknown>;
  entities: Record<string, unknown>[];
  modelSpace: { entityIds: string[] };
  [key: string]: unknown;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Tope defensivo por si `retryAfterSeconds` llegara con un valor patológico. */
const RATE_LIMIT_MAX_WAIT_MS = 65_000;
/** Techo de reintentos: es un probe de fondo, no una interfaz interactiva, pero un bucle real no debe colgarse para siempre. */
const RATE_LIMIT_MAX_RETRIES = 5;

async function expectStatus(
  response: Response,
  expected: readonly number[],
  what: string,
): Promise<unknown> {
  const text = await response.text();
  if (!expected.includes(response.status)) {
    throw new LoadProbeSetupError(
      `${what}: HTTP ${response.status} — ${text.slice(0, 400)}`,
    );
  }
  return text ? (JSON.parse(text) as unknown) : null;
}

/** Token más reciente de una plantilla del outbox para un destinatario. */
async function readOutboxToken(
  dataSource: DataSource,
  recipient: string,
  template: string,
): Promise<string> {
  const rows: unknown = await dataSource.query(
    `SELECT payload FROM email_outbox
      WHERE recipient = $1 AND template = $2
      ORDER BY created_at DESC LIMIT 1`,
    [recipient, template],
  );
  const first = Array.isArray(rows) ? (rows[0] as unknown) : null;
  const payload =
    first && typeof first === 'object'
      ? (first as { payload?: unknown }).payload
      : null;
  const parsed =
    typeof payload === 'string' ? (JSON.parse(payload) as unknown) : payload;
  const token =
    parsed && typeof parsed === 'object'
      ? (parsed as { token?: unknown }).token
      : null;
  if (typeof token !== 'string' || token.length < 32) {
    throw new LoadProbeSetupError(
      `No se encontró token ${template} para ${recipient} en email_outbox.`,
    );
  }
  return token;
}

function readCookies(response: Response): Map<string, string> {
  const jar = new Map<string, string>();
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return jar;
}

/** Alta y sesión SIN organización propia: el camino del INVITADO. */
async function createVerifiedSession(options: {
  baseUrl: string;
  dataSource: DataSource;
  email: string;
  password: string;
  displayName: string;
}): Promise<IntegratorSession> {
  const { baseUrl, dataSource, email, password, displayName } = options;
  const anonymous = { baseUrl, cookieHeader: '', csrfToken: '' };
  await expectStatus(
    await apiCall(anonymous, '/v1/auth/register', {
      method: 'POST',
      body: { email, password, displayName },
    }),
    [202],
    `register ${email}`,
  );
  const token = await readOutboxToken(
    dataSource,
    email,
    'identity.verify-email',
  );
  await expectStatus(
    await apiCall(anonymous, '/v1/auth/verify-email', {
      method: 'POST',
      body: { token },
    }),
    [200, 201, 204],
    `verify ${email}`,
  );
  const login = await apiCall(anonymous, '/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  await expectStatus(login.clone(), [200], `login ${email}`);
  const jar = readCookies(login);
  const sessionCookie = jar.get(SESSION_COOKIE);
  const csrfCookie = jar.get(CSRF_COOKIE);
  if (!sessionCookie || !csrfCookie) {
    throw new LoadProbeSetupError(`login ${email} sin cookies de sesión.`);
  }
  return {
    baseUrl,
    email,
    cookieHeader: `${SESSION_COOKIE}=${sessionCookie}; ${CSRF_COOKIE}=${csrfCookie}`,
    csrfToken: csrfCookie,
    organizationId: '',
  };
}

interface SemanticMergeOutcome {
  mergeReady: boolean;
  autoMerged: number;
  collisions: string[];
  sectionCollisions: string[];
  resolutionsApplied?: { policy: string; entityKeys: string[] };
  document?: WireDocument;
  saveAgainstVersion?: number;
  reason?: string;
}

/** Invoca la fusión semántica REAL del editor (tsx + apps/web). */
function runSemanticMerge(inputs: {
  base: unknown;
  mine: unknown;
  theirs: unknown;
  theirsVersion: number;
}): SemanticMergeOutcome {
  const run = spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'),
      path.join(REPO_ROOT, 'scripts/cad/review-concurrency-merge.mts'),
    ],
    {
      cwd: REPO_ROOT,
      input: JSON.stringify(inputs),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (run.status !== 0) {
    throw new LoadProbeSetupError(
      `merge semántico falló: ${run.stderr?.slice(0, 800) ?? 'sin stderr'}`,
    );
  }
  return JSON.parse(run.stdout) as SemanticMergeOutcome;
}

async function bootApplication(): Promise<NestExpressApplication> {
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
  await app.listen(PORT, '127.0.0.1');
  return app;
}

/** Entidad-muro disjunta para los escritores CAS. */
function casEntity(id: string, y: number): Record<string, unknown> {
  return {
    id,
    type: 'line',
    start: { x: 0, y, z: 0 },
    end: { x: 1_400, y, z: 0 },
    layer: 'A-MURO',
  };
}

function withEntity(
  document: WireDocument,
  entity: Record<string, unknown>,
): WireDocument {
  const copy = JSON.parse(JSON.stringify(document)) as WireDocument;
  copy.entities.push(entity);
  copy.modelSpace.entityIds.push(String(entity.id));
  return copy;
}

async function main(): Promise<void> {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const runStartedAt = new Date().toISOString();
  const app = await bootApplication();
  const dataSource = app.get(DataSource);
  const suffix = randomUUID().slice(0, 8);
  const anomalies: string[] = [];

  try {
    /* ── Actores: owner con organización; admin/member/viewer invitados ──── */
    const owner = await createIntegratorSession({
      baseUrl,
      dataSource,
      email: `owner-${suffix}@revision.valle.design`,
      password: ['Review', 'Valle', '2026', 'owner'].join('-'),
      organizationSlug: `despacho-review-${suffix}`,
    });

    // EXCEPCIÓN DECLARADA: el trial da 3 asientos y el recorrido de roles
    // exige 4 miembros. El probe hace de operador y amplía los asientos por
    // SQL — el camino de producción es el cobro externo asistido.
    await dataSource.query(
      `UPDATE subscriptions SET seats = 4 WHERE organization_id = $1`,
      [owner.organizationId],
    );

    const invitees: {
      role: Exclude<OrgRole, 'owner'>;
      session: IntegratorSession;
    }[] = [];
    for (const role of ['admin', 'member', 'viewer'] as const) {
      const email = `${role}-${suffix}@revision.valle.design`;
      await expectStatus(
        await apiCall(
          owner,
          `/v1/organizations/${owner.organizationId}/invitations`,
          {
            method: 'POST',
            body: { email, role },
          },
        ),
        [200, 201],
        `invitar ${role}`,
      );
      const session = await createVerifiedSession({
        baseUrl,
        dataSource,
        email,
        password: ['Review', 'Valle', '2026', role].join('-'),
        displayName: `Actor ${role}`,
      });
      const invitationToken = await readOutboxToken(
        dataSource,
        email,
        'organization.invitation',
      );
      await expectStatus(
        await apiCall(session, '/v1/organizations/invitations/accept', {
          method: 'POST',
          body: { token: invitationToken },
        }),
        [200, 201],
        `aceptar invitación ${role}`,
      );
      await expectStatus(
        await apiCall(session, '/v1/organizations/active', {
          method: 'POST',
          body: { organizationId: owner.organizationId },
        }),
        [200, 201],
        `activar organización ${role}`,
      );
      session.organizationId = owner.organizationId;
      invitees.push({ role, session });
    }

    /* ── Documento bajo revisión y sesión con enlace ─────────────────────── */
    const project = (await expectStatus(
      await apiCall(owner, '/v1/cad/projects', {
        method: 'POST',
        body: {
          name: 'Proyecto de revisión concurrente',
          description: 'probe',
        },
      }),
      [200, 201],
      'crear proyecto',
    )) as { id: string };
    const documentRow = (await expectStatus(
      await apiCall(owner, '/v1/cad/documents', {
        method: 'POST',
        body: { name: 'Plano en revisión', projectId: project.id },
      }),
      [200, 201],
      'crear documento',
    )) as { id: string };
    const documentId = documentRow.id;
    const saved = (await expectStatus(
      await apiCall(owner, `/v1/cad/documents/${documentId}/content`, {
        method: 'PUT',
        rawBody: JSON.stringify({
          cadDocument: buildLoadDocument(DOCUMENT_ENTITIES),
          expectedCadDocumentVersion: 0,
        }),
      }),
      [200, 201],
      'guardado inicial',
    )) as { cadDocumentVersion: number };

    const reviewCreated = (await expectStatus(
      await apiCall(owner, `/v1/cad/documents/${documentId}/review-sessions`, {
        method: 'POST',
        body: { shareLink: true, allowComments: true },
      }),
      [200, 201],
      'crear sesión de revisión',
    )) as { session: { id: string }; shareToken?: string };
    const reviewSessionId = reviewCreated.session.id;
    const shareToken = reviewCreated.shareToken;
    if (!shareToken) {
      throw new LoadProbeSetupError('La sesión no devolvió shareToken.');
    }

    const actors: Actor[] = [
      { role: 'owner', session: owner },
      ...invitees.map(({ role, session }) => ({ role: role, session })),
      { role: 'link', session: null, reviewToken: shareToken },
    ];

    /* ── Fase A · carga concurrente: 5 roles × N clientes, mismo documento ─ */
    const samples: OpSample[] = [];
    let rateLimitRetries = 0;
    const record = (
      role: Role,
      op: string,
      ms: number,
      status: number,
    ): void => {
      samples.push({ role, op, ms: round(ms), status });
    };

    const linkCall = async (
      pathName: string,
      init: { method?: string; body?: unknown } = {},
    ): Promise<Response> => {
      const headers: Record<string, string> = {
        'x-review-token': shareToken,
      };
      let body: string | undefined;
      if (init.body !== undefined) {
        body = JSON.stringify(init.body);
        headers['content-type'] = 'application/json';
      }
      return fetch(`${baseUrl}${pathName}`, {
        method: init.method ?? 'GET',
        headers,
        body,
      });
    };

    const timed = async (
      role: Role,
      op: string,
      call: () => Promise<Response>,
    ): Promise<unknown> => {
      const began = performance.now();
      const response = await call();
      const body = await readJson(response);
      record(role, op, performance.now() - began, response.status);
      return body;
    };

    /**
     * Como `timed`, pero para la ÚNICA superficie con techo por minuto que
     * este probe ejerce (`reviewCommentsPerSession`, VD-RL-001): un 429 aquí
     * es el techo funcionando, no un fallo. Reintenta pasado
     * `retryAfterSeconds` y sólo registra el desenlace FINAL — a la
     * integridad de la corrida le importa si el comentario se creó, no
     * cuántas peticiones HTTP hicieron falta.
     */
    const timedWithRateLimitRetry = async (
      role: Role,
      op: string,
      call: () => Promise<Response>,
    ): Promise<unknown> => {
      const began = performance.now();
      for (let attempt = 0; ; attempt += 1) {
        const response = await call();
        if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
          rateLimitRetries += 1;
          const body = (await readJson(response)) as
            | { retryAfterSeconds?: number }
            | null;
          const waitMs = Math.min(
            Math.max(1, Number(body?.retryAfterSeconds) || 1) * 1000,
            RATE_LIMIT_MAX_WAIT_MS,
          );
          await sleep(waitMs);
          continue;
        }
        const body = await readJson(response);
        record(role, op, performance.now() - began, response.status);
        return body;
      }
    };

    const anchor = { entityId: 'muro-0', point: { x: 120, y: 80 } };
    const deadline = performance.now() + WINDOW_MS;

    const orgWorker = async (actor: Actor): Promise<void> => {
      const session = actor.session as IntegratorSession;
      while (performance.now() < deadline) {
        await timed(actor.role, 'open', () =>
          apiCall(session, `/v1/cad/documents/${documentId}`),
        );
        await timed(actor.role, 'listComments', () =>
          apiCall(
            session,
            `/v1/cad/documents/${documentId}/comments?reviewSessionId=${reviewSessionId}`,
          ),
        );
        const comment = (await timed(actor.role, 'comment', () =>
          apiCall(session, `/v1/cad/documents/${documentId}/comments`, {
            method: 'POST',
            body: {
              body: `Observación de ${actor.role} ${randomUUID().slice(0, 6)}`,
              anchor,
              reviewSessionId,
            },
          }),
        )) as { id?: string } | null;
        if (comment?.id) {
          await timed(actor.role, 'resolve', () =>
            apiCall(session, `/v1/cad/comments/${comment.id}/resolve`, {
              method: 'POST',
            }),
          );
        }
      }
    };

    const linkWorker = async (actor: Actor): Promise<void> => {
      while (performance.now() < deadline) {
        await timed(actor.role, 'open', () =>
          linkCall('/v1/cad/review/context'),
        );
        await timed(actor.role, 'listComments', () =>
          linkCall('/v1/cad/review/comments'),
        );
        const comment = (await timedWithRateLimitRetry(actor.role, 'comment', () =>
          linkCall('/v1/cad/review/comments', {
            method: 'POST',
            body: {
              body: `Observación del enlace ${randomUUID().slice(0, 6)}`,
              anchor,
            },
          }),
        )) as { id?: string } | null;
        if (comment?.id) {
          await timed(actor.role, 'resolve', () =>
            linkCall(`/v1/cad/review/comments/${comment.id}/resolve`, {
              method: 'POST',
            }),
          );
        }
      }
    };

    const stormStartedAt = new Date().toISOString();
    await Promise.all(
      actors.flatMap((actor) =>
        Array.from({ length: WORKERS_PER_ROLE }, () =>
          actor.role === 'link' ? linkWorker(actor) : orgWorker(actor),
        ),
      ),
    );
    const stormFinishedAt = new Date().toISOString();

    /* ── Fronteras de rol: lo que NO deben poder hacer ───────────────────── */
    const viewerSession = invitees.find(
      (entry) => entry.role === 'viewer',
    )!.session;
    const currentVersionResponse = (await readJson(
      await apiCall(owner, `/v1/cad/documents/${documentId}`),
    )) as { cadDocumentVersion: number; cadDocument: WireDocument };
    const viewerWrite = await apiCall(
      viewerSession,
      `/v1/cad/documents/${documentId}/content`,
      {
        method: 'PUT',
        rawBody: JSON.stringify({
          cadDocument: currentVersionResponse.cadDocument,
          expectedCadDocumentVersion: currentVersionResponse.cadDocumentVersion,
        }),
      },
    );
    await viewerWrite.text();
    const linkWrite = await linkCall(
      `/v1/cad/documents/${documentId}/content`,
      {
        method: 'PUT',
        body: {
          cadDocument: currentVersionResponse.cadDocument,
          expectedCadDocumentVersion: currentVersionResponse.cadDocumentVersion,
        },
      },
    );
    await linkWrite.text();
    const boundaries = {
      viewerSaveStatus: viewerWrite.status,
      viewerSaveDenied: viewerWrite.status === 403,
      linkSaveStatus: linkWrite.status,
      linkSaveDenied: linkWrite.status === 401 || linkWrite.status === 403,
    };

    /* ── Fase B · dos escritores CAS + fusión semántica real ─────────────── */
    const memberSession = invitees.find(
      (entry) => entry.role === 'member',
    )!.session;
    interface CasRound {
      round: number;
      kind: 'disjoint' | 'collision';
      winner: Role | null;
      loser: Role | null;
      statuses: [number, number];
      conflictPutMs: number;
      resolutionMs: number | null;
      autoMerged: number | null;
      collisions: string[];
      bothChangesPresent: boolean | null;
      resolvedSaveStatus: number | null;
    }
    const casRounds: CasRound[] = [];
    const expectedEntityIds: string[] = [];

    const openDocument = async (): Promise<{
      version: number;
      document: WireDocument;
    }> => {
      const body = (await readJson(
        await apiCall(owner, `/v1/cad/documents/${documentId}`),
      )) as { cadDocumentVersion: number; cadDocument: WireDocument };
      return { version: body.cadDocumentVersion, document: body.cadDocument };
    };

    const putContent = async (
      session: IntegratorSession,
      document: WireDocument,
      expectedVersion: number,
    ): Promise<{ status: number; version: number | null; ms: number }> => {
      const began = performance.now();
      const response = await apiCall(
        session,
        `/v1/cad/documents/${documentId}/content`,
        {
          method: 'PUT',
          rawBody: JSON.stringify({
            cadDocument: document,
            expectedCadDocumentVersion: expectedVersion,
          }),
        },
      );
      const body = (await readJson(response)) as {
        cadDocumentVersion?: number;
      } | null;
      return {
        status: response.status,
        version:
          typeof body?.cadDocumentVersion === 'number'
            ? body.cadDocumentVersion
            : null,
        ms: round(performance.now() - began),
      };
    };

    const totalRounds = CAS_DISJOINT_ROUNDS + 1;
    for (let index = 0; index < totalRounds; index += 1) {
      const kind = index < CAS_DISJOINT_ROUNDS ? 'disjoint' : 'collision';
      const base = await openDocument();
      let ownerDoc: WireDocument;
      let memberDoc: WireDocument;
      const ownerId = `cas-owner-${index}`;
      const memberId = `cas-member-${index}`;
      if (kind === 'disjoint') {
        ownerDoc = withEntity(
          base.document,
          casEntity(ownerId, 90_000 + index * 200),
        );
        memberDoc = withEntity(
          base.document,
          casEntity(memberId, 95_000 + index * 200),
        );
        expectedEntityIds.push(ownerId, memberId);
      } else {
        // Colisión tipada: ambos mueven el MISMO muro a sitios distintos.
        ownerDoc = JSON.parse(JSON.stringify(base.document)) as WireDocument;
        memberDoc = JSON.parse(JSON.stringify(base.document)) as WireDocument;
        const target = (doc: WireDocument) =>
          doc.entities.find((entity) => entity.id === 'muro-0') as
            { end?: { x?: number } } | undefined;
        const ownerTarget = target(ownerDoc);
        const memberTarget = target(memberDoc);
        if (ownerTarget?.end) ownerTarget.end.x = 111;
        if (memberTarget?.end) memberTarget.end.x = 222;
      }

      const [ownerPut, memberPut] = await Promise.all([
        putContent(owner, ownerDoc, base.version),
        putContent(memberSession, memberDoc, base.version),
      ]);
      const statuses: [number, number] = [ownerPut.status, memberPut.status];
      const okCount = statuses.filter((status) => status === 200).length;
      const conflictCount = statuses.filter((status) => status === 409).length;
      if (okCount !== 1 || conflictCount !== 1) {
        anomalies.push(
          `ronda CAS ${index}: se esperaba exactamente un 200 y un 409, hubo ${JSON.stringify(statuses)}`,
        );
        casRounds.push({
          round: index,
          kind,
          winner: null,
          loser: null,
          statuses,
          conflictPutMs: round(Math.max(ownerPut.ms, memberPut.ms)),
          resolutionMs: null,
          autoMerged: null,
          collisions: [],
          bothChangesPresent: null,
          resolvedSaveStatus: null,
        });
        continue;
      }
      const ownerWon = ownerPut.status === 200;
      const loserSession = ownerWon ? memberSession : owner;
      const loserDoc = ownerWon ? memberDoc : ownerDoc;
      const loserRole: Role = ownerWon ? 'member' : 'owner';

      // El perdedor re-lee, fusiona con la función REAL del editor y guarda.
      const resolutionStarted = performance.now();
      const fresh = await openDocument();
      const merge = runSemanticMerge({
        base: base.document,
        mine: loserDoc,
        theirs: fresh.document,
        theirsVersion: fresh.version,
      });
      let resolvedSaveStatus: number | null = null;
      let bothChangesPresent: boolean | null = null;
      if (merge.mergeReady && merge.document) {
        const retried = await putContent(
          loserSession,
          merge.document,
          merge.saveAgainstVersion ?? fresh.version,
        );
        resolvedSaveStatus = retried.status;
        const final = await openDocument();
        if (kind === 'disjoint') {
          const ids = new Set(
            final.document.entities.map((entity) => String(entity.id)),
          );
          bothChangesPresent = ids.has(ownerId) && ids.has(memberId);
        } else {
          const wall = final.document.entities.find(
            (entity) => entity.id === 'muro-0',
          ) as { end?: { x?: number } } | undefined;
          // Política declarada `mine`: el PERDEDOR conserva su valor.
          const loserX = ownerWon ? 222 : 111;
          bothChangesPresent = wall?.end?.x === loserX;
        }
      } else {
        anomalies.push(
          `ronda CAS ${index}: la fusión no quedó aplicable (${merge.reason ?? 'sin motivo'})`,
        );
      }
      casRounds.push({
        round: index,
        kind,
        winner: ownerWon ? 'owner' : 'member',
        loser: loserRole,
        statuses,
        conflictPutMs: round(ownerWon ? memberPut.ms : ownerPut.ms),
        resolutionMs: round(performance.now() - resolutionStarted),
        autoMerged: merge.autoMerged,
        collisions: merge.collisions,
        bothChangesPresent,
        resolvedSaveStatus,
      });
    }

    /* ── Integridad tras la tormenta ─────────────────────────────────────── */
    const commentPostsOk = samples.filter(
      (sample) => sample.op === 'comment' && sample.status === 201,
    ).length;
    const resolvesOk = samples.filter(
      (sample) => sample.op === 'resolve' && sample.status === 201,
    ).length;
    const listed = (await readJson(
      await apiCall(
        owner,
        `/v1/cad/documents/${documentId}/comments?reviewSessionId=${reviewSessionId}`,
      ),
    )) as { items: { resolved: boolean }[] };
    const commentsListed = listed.items.length;
    const commentsResolved = listed.items.filter(
      (item) => item.resolved,
    ).length;

    const finalDocument = await openDocument();
    const finalIds = new Set(
      finalDocument.document.entities.map((entity) => String(entity.id)),
    );
    const missingCasIds = expectedEntityIds.filter((id) => !finalIds.has(id));

    /* ── Resumen por rol y operación ─────────────────────────────────────── */
    const roles: Role[] = ['owner', 'admin', 'member', 'viewer', 'link'];
    const ops = ['open', 'listComments', 'comment', 'resolve'];
    const perRole: Record<
      string,
      Record<
        string,
        { statusCounts: Record<string, number>; latencyMs: LatencyStats }
      >
    > = {};
    for (const role of roles) {
      perRole[role] = {};
      for (const op of ops) {
        const subset = samples.filter(
          (sample) => sample.role === role && sample.op === op,
        );
        const statusCounts: Record<string, number> = {};
        for (const sample of subset) {
          statusCounts[String(sample.status)] =
            (statusCounts[String(sample.status)] ?? 0) + 1;
        }
        perRole[role][op] = {
          statusCounts,
          latencyMs: summarize(subset.map((sample) => sample.ms)),
        };
      }
    }
    const serverErrors = samples.filter(
      (sample) => sample.status >= 500,
    ).length;
    const unexpectedClientErrors = samples.filter(
      (sample) => sample.status >= 400 && sample.status !== 409,
    ).length;
    const everyRoleEveryOp = roles.every((role) =>
      ops.every((op) => {
        const cell = perRole[role][op];
        const successes =
          (cell.statusCounts['200'] ?? 0) + (cell.statusCounts['201'] ?? 0);
        return (
          cell.latencyMs.samples > 0 && successes === cell.latencyMs.samples
        );
      }),
    );
    const casClean = casRounds.every(
      (roundResult) =>
        roundResult.winner !== null &&
        roundResult.resolvedSaveStatus === 200 &&
        roundResult.bothChangesPresent === true,
    );

    const report = {
      runStartedAt,
      runFinishedAt: new Date().toISOString(),
      documentEntities: DOCUMENT_ENTITIES,
      storm: {
        startedAt: stormStartedAt,
        finishedAt: stormFinishedAt,
        windowMs: WINDOW_MS,
        workersPerRole: WORKERS_PER_ROLE,
        concurrentClients: roles.length * WORKERS_PER_ROLE,
        totalRequests: samples.length,
        serverErrors,
        unexpectedClientErrors,
        // Veces que un POST de comentario del enlace se topó con el techo
        // por sesión y se reintentó (VD-RL-001). Cero aquí NO sería raro
        // fuera de una tormenta sintética; que no sea 0 en esta corrida
        // demuestra que el techo se ejerció de verdad, no que se esquivó.
        rateLimitRetries,
        perRole,
      },
      boundaries,
      cas: {
        rounds: casRounds,
        clean: casClean,
      },
      integrity: {
        commentPostsOk,
        commentsListed,
        commentsMatch: commentPostsOk === commentsListed,
        resolvesOk,
        commentsResolved,
        resolvesMatch: resolvesOk === commentsResolved,
        missingCasIds,
        finalVersion: finalDocument.version,
        initialVersion: saved.cadDocumentVersion,
      },
      anomalies,
      passed:
        serverErrors === 0 &&
        unexpectedClientErrors === 0 &&
        everyRoleEveryOp &&
        boundaries.viewerSaveDenied &&
        boundaries.linkSaveDenied &&
        casClean &&
        commentPostsOk === commentsListed &&
        resolvesOk === commentsResolved &&
        missingCasIds.length === 0 &&
        anomalies.length === 0,
    };
    process.stdout.write(`\n__REVIEW_CONCURRENCY__${JSON.stringify(report)}\n`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[review-concurrency] FALLO: ${message}`);
    process.exit(1);
  });
