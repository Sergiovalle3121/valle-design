import { randomUUID } from 'node:crypto';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../common/testing/postgres-harness';
import { User } from '../modules/identity/entities/identity.entity';
import { Organization } from '../modules/organizations/entities/organization.entity';
import {
  PlanCatalog,
  Subscription,
} from '../modules/commercial/entities/commercial.entities';
import { StripeBilling20260815100000 } from './20260815100000-StripeBilling';

/**
 * Los invariantes de la facturación viven en el ESQUEMA: el único que hace
 * imposible procesar dos veces un evento, el CHECK de alcance de tenant de las
 * facturas y el único parcial que ata una suscripción del proveedor a UNA
 * organización. Se prueban contra PostgreSQL real porque lo que se mide es qué
 * filas ACEPTA y cuáles rechaza, no qué SQL se escribió.
 */
describePostgres('StripeBilling (esquema real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let organizationId: string;
  let otherOrganizationId: string;

  async function run(direction: 'up' | 'down'): Promise<void> {
    const migration = new StripeBilling20260815100000();
    const runner = harness.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${harness.schema}"`);
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  }

  function insertEvent(values: {
    eventId?: string;
    type?: string;
    payloadHash?: string;
    outcome?: string;
  }): Promise<unknown> {
    return harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."payment_events"
         ("provider", "event_id", "type", "payload_hash", "outcome")
       VALUES ('stripe', $1, $2, $3, $4)`,
      [
        values.eventId ?? 'evt_1',
        values.type ?? 'invoice.paid',
        values.payloadHash ?? 'a'.repeat(64),
        values.outcome ?? 'subscription_renewed',
      ],
    );
  }

  function insertInvoice(values: {
    organizationId?: string;
    tenantId?: string;
    providerInvoiceId?: string;
    amountCents?: number;
    currency?: string;
    status?: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    hostedUrl?: string | null;
  }): Promise<unknown> {
    return harness.dataSource.query(
      `INSERT INTO "${harness.schema}"."invoices"
         ("organization_id", "tenant_id", "provider", "provider_invoice_id",
          "amount_cents", "currency", "status", "period_start", "period_end",
          "hosted_url")
       VALUES ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, $9)`,
      [
        values.organizationId ?? organizationId,
        values.tenantId ?? values.organizationId ?? organizationId,
        values.providerInvoiceId ?? 'in_1',
        values.amountCents ?? 2900,
        values.currency ?? 'USD',
        values.status ?? 'paid',
        values.periodStart ?? null,
        values.periodEnd ?? null,
        values.hostedUrl ?? null,
      ],
    );
  }

  beforeAll(async () => {
    // El arnés trae las tablas previas; payment_events, invoices y las columnas
    // nuevas de subscriptions las crea la migración.
    harness = await createPostgresHarness(
      [User, Organization, PlanCatalog, Subscription],
      { schemaPrefix: 'stripe_billing_migration' },
    );
    // El arnés sincroniza la ENTIDAD, que ya declara las columnas de la ola 2
    // (con los nombres de índice que genera TypeORM). Se retiran a mano —
    // soltar las columnas arrastra sus índices — para que sea el `up` de la
    // MIGRACIÓN el que cree lo que estas pruebas miden.
    await harness.dataSource.query(`
      ALTER TABLE "${harness.schema}"."subscriptions"
        DROP COLUMN IF EXISTS "provider_customer_id",
        DROP COLUMN IF EXISTS "provider_subscription_id",
        DROP COLUMN IF EXISTS "cancel_at_period_end",
        DROP COLUMN IF EXISTS "current_period_end"
    `);
    await run('up');
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    await harness.dataSource.query(
      `TRUNCATE "${harness.schema}"."payment_events",
                "${harness.schema}"."invoices" RESTART IDENTITY CASCADE`,
    );
    const users = harness.dataSource.getRepository(User);
    const owner = await users.save(
      users.create({
        email: `mig-${randomUUID()}@example.test`,
        displayName: 'Owner',
        emailVerifiedAt: new Date(),
      }),
    );
    const organizations = harness.dataSource.getRepository(Organization);
    organizationId = (
      await organizations.save(
        organizations.create({
          name: 'Organización',
          slug: `mig-${randomUUID()}`,
          ownerUserId: owner.id,
        }),
      )
    ).id;
    otherOrganizationId = (
      await organizations.save(
        organizations.create({
          name: 'Vecina',
          slug: `mig-otra-${randomUUID()}`,
          ownerUserId: owner.id,
        }),
      )
    ).id;
    await harness.dataSource
      .getRepository(PlanCatalog)
      .save([{ code: 'standalone-full', active: true, metadata: null }]);
  });

  it('payment_events acepta un evento y hace IMPOSIBLE repetir su event_id', async () => {
    await expect(insertEvent({})).resolves.toBeDefined();
    // La barrera de idempotencia del webhook: el segundo intento no entra.
    await expect(insertEvent({ type: 'invoice.paid' })).rejects.toMatchObject({
      code: '23505',
    });
    // Otro evento sí, aunque sea del mismo tipo.
    await expect(insertEvent({ eventId: 'evt_2' })).resolves.toBeDefined();
  });

  it('payment_events exige una huella sha256 bien formada', async () => {
    await expect(
      insertEvent({ payloadHash: 'no-es-un-hash' }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      insertEvent({ payloadHash: 'A'.repeat(64) }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('invoices impone el alcance de tenant de ADR-0005', async () => {
    await expect(insertInvoice({})).resolves.toBeDefined();
    await expect(
      insertInvoice({
        providerInvoiceId: 'in_cruzada',
        tenantId: otherOrganizationId,
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('invoices rechaza importe negativo, moneda no ISO, estado y período inválidos', async () => {
    await expect(insertInvoice({ amountCents: -1 })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(insertInvoice({ currency: 'usd' })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      insertInvoice({ status: 'pagada-quizas' }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      insertInvoice({
        periodStart: '2026-10-15T00:00:00Z',
        periodEnd: '2026-09-15T00:00:00Z',
      }),
    ).rejects.toMatchObject({ code: '23514' });
    // Importe cero es legítimo (una factura de 0 existe).
    await expect(insertInvoice({ amountCents: 0 })).resolves.toBeDefined();
  });

  it('invoices sólo acepta enlaces HTTPS al documento del proveedor', async () => {
    await expect(
      insertInvoice({ hostedUrl: 'http://invoice.stripe.test/in_1' }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      insertInvoice({
        providerInvoiceId: 'in_https',
        hostedUrl: 'https://invoice.stripe.test/in_1',
      }),
    ).resolves.toBeDefined();
  });

  it('una factura del proveedor no se puede duplicar y es hija de su organización', async () => {
    await insertInvoice({});
    await expect(insertInvoice({ amountCents: 9900 })).rejects.toMatchObject({
      code: '23505',
    });
    await expect(
      insertInvoice({
        providerInvoiceId: 'in_huerfana',
        organizationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: '23503' });

    await harness.dataSource.query(
      `DELETE FROM "${harness.schema}"."organizations" WHERE "id" = $1`,
      [organizationId],
    );
    await expect(
      harness.dataSource.query(
        `SELECT count(*)::int AS "total" FROM "${harness.schema}"."invoices"`,
      ),
    ).resolves.toEqual([{ total: 0 }]);
  });

  it('una suscripción del proveedor pertenece a UNA organización', async () => {
    const insertSubscription = (id: string, providerId: string | null) =>
      harness.dataSource.query(
        `INSERT INTO "${harness.schema}"."subscriptions"
           ("organization_id", "tenant_id", "plan_code", "status",
            "provider_subscription_id")
         VALUES ($1, $1, 'standalone-full', 'active', $2)`,
        [id, providerId],
      );
    await expect(
      insertSubscription(organizationId, 'sub_1'),
    ).resolves.toBeDefined();
    await expect(
      insertSubscription(otherOrganizationId, 'sub_1'),
    ).rejects.toMatchObject({ code: '23505' });
    // El índice es PARCIAL: varias organizaciones sin pasarela conviven.
    await expect(
      insertSubscription(otherOrganizationId, null),
    ).resolves.toBeDefined();
    // Y los valores por defecto describen «nadie ha cobrado todavía».
    await expect(
      harness.dataSource.query(
        `SELECT "cancel_at_period_end", "current_period_end", "provider_customer_id"
           FROM "${harness.schema}"."subscriptions" WHERE "organization_id" = $1`,
        [otherOrganizationId],
      ),
    ).resolves.toEqual([
      {
        cancel_at_period_end: false,
        current_period_end: null,
        provider_customer_id: null,
      },
    ]);
  });

  it('el down retira lo de la ola 2 y el up lo repone', async () => {
    await run('down');
    await expect(insertEvent({})).rejects.toMatchObject({ code: '42P01' });
    await expect(insertInvoice({})).rejects.toMatchObject({ code: '42P01' });
    await expect(
      harness.dataSource.query(
        `SELECT "cancel_at_period_end" FROM "${harness.schema}"."subscriptions"`,
      ),
    ).rejects.toMatchObject({ code: '42703' });

    await run('up');
    await expect(insertEvent({})).resolves.toBeDefined();
    await expect(insertInvoice({})).resolves.toBeDefined();
  });
});
