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
  RENEWAL_REMINDER_TEMPLATE,
  RenewalReminderService,
} from './renewal-reminder.service';

/**
 * RECORDATORIO DE RENOVACIÓN OXXO/SPEI, contra PostgreSQL real.
 *
 * Lo que se demuestra aquí y no se puede demostrar con dobles:
 *
 * - Que la elegibilidad es la consulta REAL (active + sin identidad en la
 *   pasarela + vencimiento a ≤5 días), no una lista que el test afirma.
 * - Que la idempotencia la arbitra el ÚNICO de `email_outbox.idempotency_key`:
 *   dos pasadas — o dos réplicas — dejan UN correo por (suscripción, período).
 * - Que un período renovado gana su PROPIO aviso: la clave incluye el
 *   vencimiento, así que el siguiente ciclo no queda deduplicado por el
 *   anterior.
 */
describePostgres('Recordatorio de renovación OXXO/SPEI (PostgreSQL)', () => {
  jest.setTimeout(90_000);

  let harness: PostgresHarness;
  let service: RenewalReminderService;
  let organizationId: string;
  let ownerEmail: string;

  function emailRows(): Promise<EmailOutbox[]> {
    return harness.dataSource
      .getRepository(EmailOutbox)
      .findBy({ template: RENEWAL_REMINDER_TEMPLATE });
  }

  async function saveSubscription(
    patch: Partial<Subscription>,
  ): Promise<Subscription> {
    return harness.dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: 'individual',
      status: 'active',
      seats: 1,
      providerSubscriptionId: null,
      providerCustomerId: null,
      ...patch,
    });
  }

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [User, Organization, PlanCatalog, Subscription, EmailOutbox],
      { schemaPrefix: 'renewal_reminder' },
    );
    service = new RenewalReminderService(
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
    ownerEmail = `duena-${randomUUID()}@example.test`;
    const owner = await users.save(
      users.create({
        email: ownerEmail,
        displayName: 'Dueña del despacho',
        emailVerifiedAt: new Date(),
      }),
    );
    organizationId = (
      await harness.dataSource.getRepository(Organization).save({
        name: 'Despacho Efectivo',
        slug: `renewal-${randomUUID()}`,
        ownerUserId: owner.id,
      })
    ).id;
    await harness.dataSource
      .getRepository(PlanCatalog)
      .save({ code: 'individual', active: true, metadata: { kind: 'paid' } });
  });

  it('encola UN aviso a la dueña cuando el pago único vence en ≤5 días', async () => {
    const periodEnd = new Date(Date.now() + 3 * 86_400_000);
    const subscription = await saveSubscription({
      currentPeriodEnd: periodEnd,
    });

    await expect(service.runOnce()).resolves.toBe(1);

    const rows = await emailRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipient: ownerEmail,
      organizationId,
      tenantId: organizationId,
      status: 'pending',
      idempotencyKey: `renewal-reminder:${subscription.id}:${periodEnd.toISOString()}`,
    });
    expect(rows[0].payload).toMatchObject({
      organizationName: 'Despacho Efectivo',
      planCode: 'individual',
      currentPeriodEnd: periodEnd.toISOString(),
    });
  });

  it('la segunda pasada no duplica: la clave es determinista y el único manda', async () => {
    await saveSubscription({
      currentPeriodEnd: new Date(Date.now() + 2 * 86_400_000),
    });
    await service.runOnce();
    // Segunda pasada (otra hora, u otra réplica): mismo período, misma clave.
    await expect(service.runOnce()).resolves.toBe(1);
    expect(await emailRows()).toHaveLength(1);
  });

  it('un período RENOVADO gana su propio aviso: la clave incluye el vencimiento', async () => {
    const subscription = await saveSubscription({
      currentPeriodEnd: new Date(Date.now() + 2 * 86_400_000),
    });
    await service.runOnce();

    // El cliente pagó su ficha: el período avanza un mes y sale de la ventana.
    const renewedEnd = new Date(Date.now() + 32 * 86_400_000);
    await harness.dataSource
      .getRepository(Subscription)
      .update({ id: subscription.id }, { currentPeriodEnd: renewedEnd });
    await expect(service.runOnce()).resolves.toBe(0);
    expect(await emailRows()).toHaveLength(1);

    // Un mes después el nuevo vencimiento entra en ventana: aviso NUEVO.
    const nearAgain = new Date(Date.now() + 4 * 86_400_000);
    await harness.dataSource
      .getRepository(Subscription)
      .update({ id: subscription.id }, { currentPeriodEnd: nearAgain });
    await expect(service.runOnce()).resolves.toBe(1);
    expect(await emailRows()).toHaveLength(2);
  });

  it('no avisa a quien no le toca: tarjeta, lejos de vencer, vencida o inactiva', async () => {
    // Tarjeta: el proveedor renueva solo; avisar sería ruido.
    await saveSubscription({
      currentPeriodEnd: new Date(Date.now() + 2 * 86_400_000),
      providerSubscriptionId: 'sub_tarjeta',
    });
    await expect(service.runOnce()).resolves.toBe(0);

    // Lejos de vencer (10 días): todavía no.
    await harness.dataSource.getRepository(Subscription).update(
      { organizationId },
      {
        providerSubscriptionId: null,
        currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
      },
    );
    await expect(service.runOnce()).resolves.toBe(0);

    // Ya vencida: «te va a vencer» después de vencer sería mentir la urgencia.
    await harness.dataSource
      .getRepository(Subscription)
      .update(
        { organizationId },
        { currentPeriodEnd: new Date(Date.now() - 86_400_000) },
      );
    await expect(service.runOnce()).resolves.toBe(0);

    // past_due: ese estado es del flujo de cobro fallido, no del recordatorio.
    await harness.dataSource.getRepository(Subscription).update(
      { organizationId },
      {
        status: 'past_due',
        currentPeriodEnd: new Date(Date.now() + 2 * 86_400_000),
      },
    );
    await expect(service.runOnce()).resolves.toBe(0);

    expect(await emailRows()).toHaveLength(0);
  });

  it('la compuerta horaria corre a lo sumo una pasada por hora y por proceso', async () => {
    const gated = new RenewalReminderService(
      harness.dataSource,
      new PostgresEmailService(),
    );
    const runOnce = jest.spyOn(gated, 'runOnce').mockResolvedValue(0);
    const t0 = new Date('2026-08-20T10:00:00.000Z');

    await gated.maybeRun(t0);
    await gated.maybeRun(new Date(t0.getTime() + 30 * 60_000));
    await gated.maybeRun(new Date(t0.getTime() + 59 * 60_000));
    expect(runOnce).toHaveBeenCalledTimes(1);

    await gated.maybeRun(new Date(t0.getTime() + 61 * 60_000));
    expect(runOnce).toHaveBeenCalledTimes(2);
  });
});
