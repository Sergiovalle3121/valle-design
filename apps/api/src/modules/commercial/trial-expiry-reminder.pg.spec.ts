import { randomUUID } from 'node:crypto';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { PostgresEmailService } from './adapters/postgres.adapters';
import {
  EmailOutbox,
  PlanCatalog,
  Subscription,
} from './entities/commercial.entities';
import {
  TRIAL_EXPIRY_REMINDER_TEMPLATE,
  TrialExpiryReminderService,
  milestoneFor,
} from './trial-expiry-reminder.service';

/**
 * AVISO DE FIN DE PRUEBA, contra PostgreSQL real.
 *
 * La campaña de lanzamiento sale con tres meses gratis. Noventa días son
 * tiempo de sobra para olvidarse de que la prueba existe, así que el aviso NO
 * es un detalle de cortesía: es lo que separa «me avisaron y decidí» de «un
 * día dejó de funcionar».
 *
 * Lo que sólo se puede demostrar contra el motor real:
 *
 * - Que los DOS hitos (7 y 1 días) son correos independientes, cada uno con su
 *   clave, y que ninguno deduplica al otro.
 * - Que el único de `email_outbox.idempotency_key` impide el segundo correo
 *   del mismo hito aunque la pasada se repita.
 * - Que la elegibilidad es la consulta real sobre `status='trialing'` y
 *   `trial_ends_at`, con `timestamptz` de verdad.
 */
describePostgres('Aviso de fin de prueba (PostgreSQL)', () => {
  jest.setTimeout(90_000);

  let harness: PostgresHarness;
  let service: TrialExpiryReminderService;
  let organizationId: string;
  let ownerEmail: string;

  const days = (n: number) => new Date(Date.now() + n * 86_400_000);

  function emailRows(): Promise<EmailOutbox[]> {
    return harness.dataSource
      .getRepository(EmailOutbox)
      .findBy({ template: TRIAL_EXPIRY_REMINDER_TEMPLATE });
  }

  async function startTrial(trialEndsAt: Date | null): Promise<Subscription> {
    return harness.dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: 'standalone-trial',
      status: 'trialing',
      seats: 1,
      trialEndsAt,
      currentPeriodEnd: null,
      providerSubscriptionId: null,
      providerCustomerId: null,
    });
  }

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [User, Organization, PlanCatalog, Subscription, EmailOutbox],
      { schemaPrefix: 'trial_expiry_reminder' },
    );
    service = new TrialExpiryReminderService(
      harness.dataSource,
      new PostgresEmailService(),
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    const users = harness.dataSource.getRepository(User);
    ownerEmail = `fundadora-${randomUUID()}@example.test`;
    const owner = await users.save(
      users.create({
        email: ownerEmail,
        displayName: 'Arquitecta fundadora',
        emailVerifiedAt: new Date(),
      }),
    );
    organizationId = (
      await harness.dataSource.getRepository(Organization).save({
        name: 'Taller de arquitectura',
        slug: `trial-${randomUUID()}`,
        ownerUserId: owner.id,
      })
    ).id;
    await harness.dataSource.getRepository(PlanCatalog).save({
      code: 'standalone-trial',
      active: true,
      metadata: { kind: 'trial' },
    });
  });

  /* ── La aritmética de los hitos, sin base de datos de por medio ─────────── */

  it('el hito se elige por días COMPLETOS y sólo en 7 y 1', () => {
    const now = new Date('2026-08-27T12:00:00.000Z');
    const at = (n: number) => new Date(now.getTime() + n * 86_400_000);
    expect(milestoneFor(at(7), now)).toBe(7);
    expect(milestoneFor(at(1), now)).toBe(1);
    // 6.3 días redondean a 7: el aviso que toca es el de la semana.
    expect(milestoneFor(at(6.3), now)).toBe(7);
    // A media semana no se manda nada: un correo diario es acoso, no cuidado.
    for (const d of [5, 4, 3, 2]) expect(milestoneFor(at(d), now)).toBeNull();
    expect(milestoneFor(at(30), now)).toBeNull();
    // Ya vencida: este servicio calla. Lo que pasó lo dice la pantalla de
    // solo-lectura, que no miente la urgencia.
    expect(milestoneFor(at(-1), now)).toBeNull();
    expect(milestoneFor(now, now)).toBeNull();
  });

  /* ── Los dos correos, contra el motor ───────────────────────────────────── */

  it('a 7 días encola UN aviso a la dueña, y dice que no perderá sus planos', async () => {
    const endsAt = days(7);
    const trial = await startTrial(endsAt);

    await expect(service.runOnce()).resolves.toBe(1);

    const rows = await emailRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipient: ownerEmail,
      organizationId,
      tenantId: organizationId,
      status: 'pending',
      idempotencyKey: `trial-expiry:${trial.id}:${endsAt.toISOString()}:7`,
    });
    expect(rows[0].payload).toMatchObject({
      organizationName: 'Taller de arquitectura',
      daysLeft: 7,
      trialEndsAt: endsAt.toISOString(),
      // LA PROMESA: el aviso no amenaza con perder el trabajo, porque no se
      // pierde. Ver la regla de oro en `entitlement-read-only.pg.spec.ts`.
      readOnlyAfterExpiry: true,
    });
  });

  it('la segunda pasada del mismo hito NO duplica el correo', async () => {
    await startTrial(days(7));
    await expect(service.runOnce()).resolves.toBe(1);
    // Otra hora, u otra réplica del worker: la pasada vuelve a ver la prueba
    // en su hito (por eso devuelve 1 otra vez), pero el ÚNICO de
    // `email_outbox.idempotency_key` es quien impide el segundo correo. La
    // idempotencia la arbitra el esquema, no el servicio — que es justamente
    // lo que hace que sobreviva a N réplicas y a un reinicio.
    await expect(service.runOnce()).resolves.toBe(1);
    expect(await emailRows()).toHaveLength(1);
  });

  it('el aviso de 1 día es OTRO correo: los dos hitos conviven', async () => {
    const trial = await startTrial(days(7));
    await service.runOnce();

    // Pasan seis días. Se mueve la fecha de fin en vez del reloj para no
    // depender del tiempo real de la suite.
    const endsAt = days(1);
    await harness.dataSource
      .getRepository(Subscription)
      .update({ id: trial.id }, { trialEndsAt: endsAt });

    await expect(service.runOnce()).resolves.toBe(1);
    const rows = await emailRows();
    expect(rows).toHaveLength(2);
    expect(
      rows.map((row) => (row.payload as { daysLeft: number }).daysLeft).sort(),
    ).toEqual([1, 7]);
  });

  it('a 30 días de una prueba de tres meses no se molesta a nadie', async () => {
    await startTrial(days(30));
    await expect(service.runOnce()).resolves.toBe(0);
    expect(await emailRows()).toHaveLength(0);
  });

  it('una prueba YA vencida no recibe «termina pronto»', async () => {
    await startTrial(days(-2));
    await expect(service.runOnce()).resolves.toBe(0);
    expect(await emailRows()).toHaveLength(0);
  });

  it('una suscripción de pago no entra por esta puerta', async () => {
    await harness.dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: 'standalone-trial',
      status: 'active',
      seats: 1,
      trialEndsAt: days(1),
      currentPeriodEnd: days(30),
    });
    await expect(service.runOnce()).resolves.toBe(0);
  });

  it('sin fecha de fin registrada no hay aviso que mandar', async () => {
    await startTrial(null);
    await expect(service.runOnce()).resolves.toBe(0);
  });

  it('la compuerta horaria evita el martilleo, y no pierde el primer aviso', async () => {
    await startTrial(days(7));
    const now = new Date();
    await service.maybeRun(now);
    expect(await emailRows()).toHaveLength(1);
    // Un minuto después el tick vuelve a pasar: la compuerta lo corta.
    await service.maybeRun(new Date(now.getTime() + 60_000));
    expect(await emailRows()).toHaveLength(1);
  });
});
