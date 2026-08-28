import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { PostgresEmailService } from '../commercial/adapters/postgres.adapters';
import { EmailOutbox } from '../commercial/entities/commercial.entities';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../identity/entities/identity.entity';
import { SUPPORT_INCIDENT_TEMPLATE, SupportService } from './support.service';

/**
 * EL BOTÓN «ALGO SALIÓ MAL», CONTRA POSTGRESQL REAL.
 *
 * Lo que se prueba aquí no es que el servicio devuelva algo: es que el reporte
 * QUEDA ESCRITO en el outbox transaccional, con su clave de idempotencia, y que
 * lo que queda escrito respeta el límite de privacidad. Un reporte que se pierde
 * porque el proveedor de correo estaba caído en ese segundo es exactamente el
 * reporte que hacía falta; por eso va por el outbox y no por una llamada
 * directa, y por eso se comprueba contra la base y no contra un doble.
 */
describePostgres('Reportes de soporte — el camino de vuelta', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let service: SupportService;
  const anterior = process.env.SUPPORT_EMAIL;

  beforeAll(async () => {
    // `EmailOutbox` referencia la organización dos veces (dueña e inquilina) y
    // la organización a su dueño, así que el metadato no se construye sin las
    // tres aunque estas filas dejen las dos primeras en nulo a propósito.
    harness = await createPostgresHarness([EmailOutbox, Organization, User], {
      schemaPrefix: 'support_incident',
    });
  });

  afterAll(async () => {
    process.env.SUPPORT_EMAIL = anterior;
    await harness?.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    process.env.SUPPORT_EMAIL = 'soporte@valledesign.test';
    service = new SupportService(
      harness.dataSource,
      new PostgresEmailService(),
    );
  });

  const reporte = (extra: Record<string, unknown> = {}) => ({
    summary: 'Acoté un muro de 4 m y la cota salió midiendo 40.',
    appVersion: '2026.08.27',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    activeCommand: 'DIM',
    documentAuthorized: false,
    ...extra,
  });

  const contexto = {
    reportedBy: 'arquitecta@despacho.test',
    organizationId: null,
  };

  const filas = () =>
    harness.dataSource
      .getRepository(EmailOutbox)
      .find({ order: { id: 'ASC' } });

  it('queda escrito en el outbox, listo para salir', async () => {
    await service.report(reporte(), contexto);

    const [fila] = await filas();
    expect(fila).toBeDefined();
    expect(fila.template).toBe(SUPPORT_INCIDENT_TEMPLATE);
    expect(fila.recipient).toBe('soporte@valledesign.test');
    expect(fila.status).toBe('pending');

    const payload = fila.payload as Record<string, unknown>;
    expect(payload.appVersion).toBe('2026.08.27');
    expect(payload.activeCommand).toBe('DIM');
    expect(payload.reportedBy).toBe('arquitecta@despacho.test');
  });

  it('sin autorización, el plano NO viaja ni siquiera como identificador', async () => {
    await service.report(
      reporte({ documentId: randomUUID(), documentAuthorized: false }),
      contexto,
    );
    const [fila] = await filas();
    const payload = fila.payload as Record<string, unknown>;
    expect(payload.documentId).toBeNull();
    expect(payload.documentAuthorized).toBe(false);
  });

  it('con autorización explícita viaja el identificador, nunca el dibujo', async () => {
    const documentId = randomUUID();
    await service.report(
      reporte({ documentId, documentAuthorized: true }),
      contexto,
    );
    const [fila] = await filas();
    const payload = fila.payload as Record<string, unknown>;
    expect(payload.documentId).toBe(documentId);
    expect(JSON.stringify(payload)).not.toMatch(/"entities"|"modelSpace"/u);
  });

  it('el correo de soporte NO se marca con el inquilino, o quien debe leerlo no lo vería', async () => {
    await service.report(reporte(), {
      reportedBy: 'arquitecta@despacho.test',
      organizationId: randomUUID(),
    });
    const [fila] = await filas();
    expect(fila.organizationId).toBeNull();
    expect(fila.tenantId).toBeNull();
    // La organización sí queda DENTRO del reporte: sirve para reproducirlo.
    expect((fila.payload as Record<string, unknown>).organizationId).toEqual(
      expect.any(String),
    );
  });

  it('un doble clic no manda dos correos', async () => {
    await service.report(reporte(), contexto);
    await service.report(reporte(), contexto);
    expect(await filas()).toHaveLength(1);
  });

  it('pero un problema DISTINTO sí llega', async () => {
    await service.report(reporte(), contexto);
    await service.report(
      reporte({ summary: 'Otra cosa: el PDF sale con el cajetín vacío.' }),
      contexto,
    );
    expect(await filas()).toHaveLength(2);
  });

  it('sin buzón configurado lo DICE, en vez de tragarse el reporte', async () => {
    delete process.env.SUPPORT_EMAIL;
    await expect(service.report(reporte(), contexto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    // Y no queda un correo a medias en la cola.
    expect(await filas()).toHaveLength(0);
  });
});
