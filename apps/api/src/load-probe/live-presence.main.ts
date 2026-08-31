/**
 * Probe de PRESENCIA EN VIVO (UNA corrida): dos actores first-party de la
 * MISMA organización, un documento, y el carril de presencia real que
 * `review-concurrency.main.ts` también ejercita (ver `runLivePresenceLane`
 * ahí — este archivo lo reutiliza en vez de duplicarlo).
 *
 * POR QUÉ UN ARNÉS APARTE Y NO SÓLO EL CARRIL DENTRO DEL OTRO PROBE. El
 * probe de revisión paga el coste de CINCO roles, un documento de 400
 * entidades y dos escritores CAS con fusión semántica — minutos por corrida.
 * `docs/cad/evidence/live-presence.json` sólo necesita la aritmética de
 * presencia (conexión, primer evento, latencia de cursor) con muestras
 * suficientes para un p50/p95 real; pagar el resto del probe de revisión por
 * cada corrida habría hecho la evidencia cara de regenerar sin medir nada
 * adicional.
 *
 * MISMA aplicación real, MISMAS excepciones declaradas que el resto de
 * probes: el token de verificación se lee de `email_outbox` (lo que el
 * proveedor de correo entregaría; no hay buzón en un script).
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { JSON_BODY_LIMIT } from '../bootstrap/production-hardening';
import { apiCall } from './integrator-session';
import {
  createVerifiedSession,
  expectStatus,
  readOutboxToken,
} from './review-concurrency.main';
import { runLivePresenceLane } from './live-presence-lane';

const PORT = Number(process.env.LIVE_PRESENCE_PROBE_PORT ?? 4341);
const BEAT_COUNT = Number(process.env.LIVE_PRESENCE_BEAT_COUNT ?? 20);
const INTERVAL_MS = Number(process.env.LIVE_PRESENCE_INTERVAL_MS ?? 200);

/**
 * Arranque MÍNIMO propio en vez de reutilizar el `bootApplication` de
 * `review-concurrency.main.ts`: ese archivo está en su techo de líneas
 * (`scripts/cad/monolith-budget.json`, sólo-encoger) y parametrizar su
 * puerto para compartirlo aquí lo habría pasado. Duplicar quince líneas de
 * arranque es más barato que tocar un archivo que no puede crecer.
 */
async function bootApplication(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    logger: ['error', 'warn'],
  });
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(PORT, '127.0.0.1');
  return app;
}

async function main(): Promise<void> {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const runStartedAt = new Date().toISOString();
  const app = await bootApplication();
  const dataSource = app.get(DataSource);
  const suffix = randomUUID().slice(0, 8);

  try {
    const owner = await createVerifiedSession({
      baseUrl,
      dataSource,
      email: `presence-owner-${suffix}@presencia.valle.design`,
      password: ['Presence', 'Valle', '2026', 'owner'].join('-'),
      displayName: 'Actor presencia (owner)',
    });
    const orgCreated = (await expectStatus(
      await apiCall(owner, '/v1/organizations', {
        method: 'POST',
        body: { name: `Presencia ${suffix}`, slug: `presencia-${suffix}` },
      }),
      [200, 201],
      'crear organización',
    )) as { id: string };
    owner.organizationId = orgCreated.id;
    await expectStatus(
      await apiCall(owner, '/v1/organizations/active', {
        method: 'POST',
        body: { organizationId: owner.organizationId },
      }),
      [200, 201],
      'activar organización (owner)',
    );

    const listenerEmail = `presence-listener-${suffix}@presencia.valle.design`;
    await expectStatus(
      await apiCall(
        owner,
        `/v1/organizations/${owner.organizationId}/invitations`,
        {
          method: 'POST',
          body: { email: listenerEmail, role: 'member' },
        },
      ),
      [200, 201],
      'invitar oyente',
    );
    const listener = await createVerifiedSession({
      baseUrl,
      dataSource,
      email: listenerEmail,
      password: ['Presence', 'Valle', '2026', 'listener'].join('-'),
      displayName: 'Actor presencia (oyente)',
    });
    const invitationToken = await readOutboxToken(
      dataSource,
      listenerEmail,
      'organization.invitation',
    );
    await expectStatus(
      await apiCall(listener, '/v1/organizations/invitations/accept', {
        method: 'POST',
        body: { token: invitationToken },
      }),
      [200, 201],
      'aceptar invitación',
    );
    listener.organizationId = owner.organizationId;
    await expectStatus(
      await apiCall(listener, '/v1/organizations/active', {
        method: 'POST',
        body: { organizationId: owner.organizationId },
      }),
      [200, 201],
      'activar organización (oyente)',
    );

    const document = (await expectStatus(
      await apiCall(owner, '/v1/cad/documents', {
        method: 'POST',
        body: { name: `Plano de presencia ${suffix}` },
      }),
      [200, 201],
      'crear documento',
    )) as { id: string };

    const lane = await runLivePresenceLane({
      documentId: document.id,
      publisher: owner,
      listener,
      beatCount: BEAT_COUNT,
      intervalMs: INTERVAL_MS,
    });

    const report = {
      runStartedAt,
      runFinishedAt: new Date().toISOString(),
      beatCount: BEAT_COUNT,
      intervalMs: INTERVAL_MS,
      lane,
      passed: lane.beatsReceived === lane.beatsSent,
    };
    process.stdout.write(`\n__LIVE_PRESENCE__${JSON.stringify(report)}\n`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[live-presence] FALLO: ${message}`);
    process.exit(1);
  });
