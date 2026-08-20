import { createHmac, randomUUID } from 'node:crypto';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { PostgresCadEventPublisher } from './adapters/postgres.adapters';
import {
  StripePaymentProvider,
  type StripeConfiguration,
} from './adapters/stripe-payment.provider';
import {
  BillingWebhookNotCorrelatedError,
  BillingWebhookService,
} from './billing-webhook.service';
import {
  DomainOutbox,
  Invoice,
  PaymentEvent,
  PlanCatalog,
  Subscription,
} from './entities/commercial.entities';
import type { PaymentWebhookEvent } from './ports/payment-provider.port';

/**
 * REEMBOLSOS Y DISPUTAS, contra PostgreSQL real.
 *
 * Los dos eventos que el webhook ignoraba y que cuestan dinero real:
 *
 * - `charge.refunded` → la factura espejo pasa a `refunded` (estado propio,
 *   no una vuelta a `open`) y queda el evento de dominio. La suscripción NO
 *   se toca: reembolsar y dar de baja son dos decisiones distintas.
 * - `charge.dispute.created` → la suscripción pasa a `suspended` (fallo
 *   cerrado: un cobro en disputa no puede seguir contando como bueno) y el
 *   humano sigue el RUNBOOK en el dashboard del proveedor.
 *
 * Con dobles no se probaría nada de esto: lo que se ejerce es el único de
 * `payment_events` (idempotencia), el UPDATE del espejo por
 * (provider, provider_invoice_id) y la atomicidad efecto+asiento.
 */

const WEBHOOK_SECRET = 'whsec_prueba_de_treinta_y_dos_caracteres';
const CONFIGURATION: StripeConfiguration = {
  secretKey: 'sk_test_x',
  webhookSecret: WEBHOOK_SECRET,
  apiBaseUrl: 'https://api.stripe.test',
  successUrl: 'https://app.example.test/ok',
  cancelUrl: 'https://app.example.test/ko',
  portalReturnUrl: 'https://app.example.test/portal',
  timeoutMs: 5_000,
  toleranceSeconds: 300,
  apiVersion: null,
};

describePostgres('Reembolsos y disputas (PostgreSQL)', () => {
  jest.setTimeout(90_000);

  let harness: PostgresHarness;
  let webhooks: BillingWebhookService;
  let organizationId: string;

  /** Evento firmado de verdad y verificado por el adaptador real. */
  async function process(
    id: string,
    type: string,
    object: Record<string, unknown>,
  ) {
    const rawBody = Buffer.from(
      JSON.stringify({ id, type, data: { object } }),
      'utf8',
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const event: PaymentWebhookEvent = await new StripePaymentProvider(
      CONFIGURATION,
      () => Promise.reject(new Error('esta suite no llama a la API')),
    ).verifyWebhook(
      { 'stripe-signature': `t=${timestamp},v1=${signature}` },
      rawBody,
    );
    return webhooks.process(event, rawBody);
  }

  function subscription(): Promise<Subscription> {
    return harness.dataSource
      .getRepository(Subscription)
      .findOneByOrFail({ organizationId, tenantId: organizationId });
  }

  /** Deja una factura `paid` espejada, como la dejaría `invoice.paid`. */
  async function mirrorPaidInvoice(providerInvoiceId: string): Promise<void> {
    await process(`evt_paid_${providerInvoiceId}`, 'invoice.paid', {
      id: providerInvoiceId,
      customer: 'cus_refund',
      subscription: 'sub_refund',
      amount_paid: 19_900,
      currency: 'mxn',
    });
    expect(
      await harness.dataSource
        .getRepository(Invoice)
        .findOneByOrFail({ provider: 'stripe', providerInvoiceId }),
    ).toMatchObject({ status: 'paid' });
  }

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [
        User,
        Organization,
        PlanCatalog,
        Subscription,
        DomainOutbox,
        PaymentEvent,
        Invoice,
      ],
      { schemaPrefix: 'refunds_disputes' },
    );
    webhooks = new BillingWebhookService(
      harness.dataSource,
      new PostgresCadEventPublisher(),
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    const users = harness.dataSource.getRepository(User);
    const owner = await users.save(
      users.create({
        email: `refund-owner-${randomUUID()}@example.test`,
        displayName: 'Dueña reembolsada',
        emailVerifiedAt: new Date(),
      }),
    );
    organizationId = (
      await harness.dataSource.getRepository(Organization).save({
        name: 'Despacho reembolsos',
        slug: `refunds-${randomUUID()}`,
        ownerUserId: owner.id,
      })
    ).id;
    await harness.dataSource
      .getRepository(PlanCatalog)
      .save({ code: 'individual', active: true, metadata: { kind: 'paid' } });
    await harness.dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: 'individual',
      status: 'active',
      seats: 1,
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      providerSubscriptionId: 'sub_refund',
      providerCustomerId: 'cus_refund',
    });
  });

  // ── charge.refunded ──────────────────────────────────────────────────────
  it('un reembolso pasa la factura espejo a `refunded` sin tocar el acceso', async () => {
    await mirrorPaidInvoice('in_refund_1');

    await expect(
      process('evt_refund_1', 'charge.refunded', {
        id: 'ch_1',
        customer: 'cus_refund',
        invoice: 'in_refund_1',
        amount: 19_900,
        amount_refunded: 19_900,
        currency: 'mxn',
      }),
    ).resolves.toEqual({ status: 'processed', outcome: 'invoice_refunded' });

    expect(
      await harness.dataSource
        .getRepository(Invoice)
        .findOneByOrFail({ provider: 'stripe', providerInvoiceId: 'in_refund_1' }),
    ).toMatchObject({ status: 'refunded' });
    // El acceso NO cambia: reembolsar y dar de baja son decisiones separadas.
    expect((await subscription()).status).toBe('active');
    // Y queda el evento de dominio, en la MISMA transacción que el efecto.
    expect(
      await harness.dataSource.getRepository(DomainOutbox).findOneByOrFail({
        organizationId,
        type: 'commercial.invoice.refunded',
      }),
    ).toMatchObject({
      status: 'pending',
      idempotencyKey: 'payment-event:evt_refund_1',
    });
  });

  it('un reembolso de cargo SIN factura (pago único) deja rastro igualmente', async () => {
    await expect(
      process('evt_refund_oxxo', 'charge.refunded', {
        id: 'ch_oxxo',
        customer: 'cus_refund',
        // OXXO/SPEI vía checkout: no hay factura del proveedor que espejar.
        amount: 19_900,
        amount_refunded: 19_900,
        currency: 'mxn',
      }),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'refund_without_invoice',
    });
    expect(
      await harness.dataSource
        .getRepository(DomainOutbox)
        .countBy({ organizationId, type: 'commercial.invoice.refunded' }),
    ).toBe(1);
  });

  it('la reentrega de un reembolso es duplicada, nunca un segundo efecto', async () => {
    await mirrorPaidInvoice('in_refund_2');
    const object = {
      id: 'ch_2',
      customer: 'cus_refund',
      invoice: 'in_refund_2',
      amount_refunded: 19_900,
      currency: 'mxn',
    };
    await process('evt_refund_2', 'charge.refunded', object);
    await expect(
      process('evt_refund_2', 'charge.refunded', object),
    ).resolves.toEqual({ status: 'duplicate', outcome: 'duplicate' });
    expect(
      await harness.dataSource
        .getRepository(DomainOutbox)
        .countBy({ organizationId, type: 'commercial.invoice.refunded' }),
    ).toBe(1);
  });

  it('un reembolso de un cliente desconocido pide reintento, no se traga', async () => {
    await expect(
      process('evt_refund_ajeno', 'charge.refunded', {
        id: 'ch_ajeno',
        customer: 'cus_de_otro_sistema',
        amount_refunded: 100,
        currency: 'mxn',
      }),
    ).rejects.toBeInstanceOf(BillingWebhookNotCorrelatedError);
    // Nada quedó apuntado: la reentrega del proveedor volverá a intentarlo.
    expect(
      await harness.dataSource
        .getRepository(PaymentEvent)
        .countBy({ eventId: 'evt_refund_ajeno' }),
    ).toBe(0);
  });

  // ── charge.dispute.created ───────────────────────────────────────────────
  it('una disputa suspende la suscripción y publica el evento', async () => {
    await expect(
      process('evt_disputa_1', 'charge.dispute.created', {
        id: 'dp_1',
        charge: 'ch_1',
        customer: 'cus_refund',
        amount: 19_900,
        currency: 'mxn',
      }),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'subscription_disputed',
    });
    expect((await subscription()).status).toBe('suspended');
    expect(
      await harness.dataSource.getRepository(DomainOutbox).findOneByOrFail({
        organizationId,
        type: 'commercial.subscription.disputed',
      }),
    ).toMatchObject({ idempotencyKey: 'payment-event:evt_disputa_1' });
  });

  it('correlaciona la disputa por el cargo EXPANDIDO cuando falta customer', async () => {
    await expect(
      process('evt_disputa_2', 'charge.dispute.created', {
        id: 'dp_2',
        // Según la versión de la API, `customer` sólo viene dentro del cargo.
        charge: { id: 'ch_1', customer: 'cus_refund' },
        amount: 19_900,
        currency: 'mxn',
      }),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'subscription_disputed',
    });
    expect((await subscription()).status).toBe('suspended');
  });

  it('una disputa sobre una suscripción cancelada no la resucita a suspended', async () => {
    await harness.dataSource
      .getRepository(Subscription)
      .update({ organizationId }, { status: 'cancelled' });
    await expect(
      process('evt_disputa_3', 'charge.dispute.created', {
        id: 'dp_3',
        customer: 'cus_refund',
        amount: 19_900,
        currency: 'mxn',
      }),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'subscription_disputed',
    });
    // Cancelada se queda: no hay acceso que suspender, pero la disputa consta.
    expect((await subscription()).status).toBe('cancelled');
    expect(
      await harness.dataSource
        .getRepository(DomainOutbox)
        .countBy({ organizationId, type: 'commercial.subscription.disputed' }),
    ).toBe(1);
  });

  it('una disputa que no se puede correlacionar pide reintento', async () => {
    await expect(
      process('evt_disputa_sin_cliente', 'charge.dispute.created', {
        id: 'dp_sin_cliente',
        charge: 'ch_opaco',
        amount: 100,
        currency: 'mxn',
      }),
    ).rejects.toBeInstanceOf(BillingWebhookNotCorrelatedError);
    expect(
      await harness.dataSource
        .getRepository(PaymentEvent)
        .countBy({ eventId: 'evt_disputa_sin_cliente' }),
    ).toBe(0);
  });
});
