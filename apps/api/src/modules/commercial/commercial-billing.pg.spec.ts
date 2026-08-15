import { createHmac, randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { PostgresCadEventPublisher } from './adapters/postgres.adapters';
import { NullPaymentProvider } from './adapters/null-payment.provider';
import {
  StripePaymentProvider,
  type StripeConfiguration,
  type StripeHttpClient,
} from './adapters/stripe-payment.provider';
import { BillingWebhookService } from './billing-webhook.service';
import { BillingController } from './controllers/billing.controller';
import {
  DomainOutbox,
  Invoice,
  PaymentEvent,
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
} from './entities/commercial.entities';
import type { PaymentWebhookEvent } from './ports/payment-provider.port';

/**
 * El ciclo COMPLETO de una suscripción cobrada, contra PostgreSQL real:
 * checkout → activa → renueva → past_due → cancelada, más la idempotencia del
 * webhook y el aislamiento por tenant.
 *
 * Nada de esto se puede demostrar con dobles ni con SQLite: lo que se ejerce
 * son los índices únicos que arbitran la idempotencia (`payment_events`,
 * `invoices`), el CHECK de alcance de tenant y la atomicidad del efecto con su
 * asiento. Un doble afirmaría justo lo que se quiere probar.
 */

const WEBHOOK_SECRET = 'whsec_prueba_de_treinta_y_dos_caracteres';
const CONFIGURATION: StripeConfiguration = {
  secretKey: 'sk_test_x',
  webhookSecret: WEBHOOK_SECRET,
  apiBaseUrl: 'https://api.stripe.test',
  successUrl: 'https://app.example.test/ok',
  cancelUrl: 'https://app.example.test/ko',
  timeoutMs: 5_000,
  toleranceSeconds: 300,
  apiVersion: null,
};

function authenticated(
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
): Request {
  const user: AuthenticatedUser = {
    userId,
    organization_id: organizationId,
    tenant_id: organizationId,
    role,
  } as AuthenticatedUser;
  return { user } as unknown as Request;
}

function epoch(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

describePostgres('Ciclo de vida cobrado con Stripe (PostgreSQL)', () => {
  jest.setTimeout(90_000);

  let harness: PostgresHarness;
  let webhooks: BillingWebhookService;
  let billing: BillingController;
  let stripeResponses: string[];
  let stripeCalls: Array<{ url: string; form: URLSearchParams }>;
  let organizationId: string;
  let otherOrganizationId: string;
  let ownerId: string;
  let otherOwnerId: string;
  let adminId: string;

  const httpClient: StripeHttpClient = (url, init) => {
    stripeCalls.push({ url, form: new URLSearchParams(init.body) });
    const body = stripeResponses.shift() ?? '{}';
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
    });
  };

  /** Evento firmado de verdad y verificado por el adaptador real. */
  async function deliver(
    id: string,
    type: string,
    object: Record<string, unknown>,
  ): Promise<PaymentWebhookEvent> {
    const rawBody = Buffer.from(
      JSON.stringify({ id, type, data: { object } }),
      'utf8',
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const provider = new StripePaymentProvider(CONFIGURATION, httpClient);
    const event = await provider.verifyWebhook(
      { 'stripe-signature': `t=${timestamp},v1=${signature}` },
      rawBody,
    );
    return event;
  }

  async function process(
    id: string,
    type: string,
    object: Record<string, unknown>,
  ) {
    const event = await deliver(id, type, object);
    const rawBody = Buffer.from(
      JSON.stringify({ id, type, data: { object } }),
      'utf8',
    );
    return webhooks.process(event, rawBody);
  }

  function subscriptionOf(id: string): Promise<Subscription | null> {
    return harness.dataSource
      .getRepository(Subscription)
      .findOneBy({ organizationId: id, tenantId: id });
  }

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [
        User,
        Organization,
        PlanCatalog,
        PlanEntitlement,
        PlanPrice,
        Subscription,
        SubscriptionUpgradeIntent,
        DomainOutbox,
        PaymentEvent,
        Invoice,
      ],
      { schemaPrefix: 'stripe_billing' },
    );
    const source = harness.dataSource;
    webhooks = new BillingWebhookService(
      source,
      new PostgresCadEventPublisher(),
    );
    billing = new BillingController(
      source.getRepository(Subscription),
      source.getRepository(Invoice),
      source,
      new PostgresCadEventPublisher(),
      new StripePaymentProvider(CONFIGURATION, httpClient),
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    stripeResponses = [];
    stripeCalls = [];
    await harness.truncateAll();

    const users = harness.dataSource.getRepository(User);
    const organizations = harness.dataSource.getRepository(Organization);
    const owner = await users.save(
      users.create({
        email: `billing-owner-${randomUUID()}@example.test`,
        displayName: 'Billing owner',
        emailVerifiedAt: new Date(),
      }),
    );
    ownerId = owner.id;
    adminId = (
      await users.save(
        users.create({
          email: `billing-admin-${randomUUID()}@example.test`,
          displayName: 'Billing admin',
          emailVerifiedAt: new Date(),
        }),
      )
    ).id;
    const otherOwner = await users.save(
      users.create({
        email: `billing-other-${randomUUID()}@example.test`,
        displayName: 'Otra organización',
        emailVerifiedAt: new Date(),
      }),
    );
    otherOwnerId = otherOwner.id;
    organizationId = (
      await organizations.save(
        organizations.create({
          name: 'Organización compradora',
          slug: `billing-${randomUUID()}`,
          ownerUserId: owner.id,
        }),
      )
    ).id;
    otherOrganizationId = (
      await organizations.save(
        organizations.create({
          name: 'Organización vecina',
          slug: `vecina-${randomUUID()}`,
          ownerUserId: otherOwner.id,
        }),
      )
    ).id;

    await harness.dataSource.getRepository(PlanCatalog).save([
      { code: 'standalone-trial', active: true, metadata: { kind: 'trial' } },
      { code: 'standalone-full', active: true, metadata: { kind: 'paid' } },
    ]);
    await harness.dataSource.getRepository(PlanPrice).save([
      {
        planCode: 'standalone-full',
        currency: 'USD',
        period: 'monthly',
        amountCents: 2900,
        active: true,
      },
    ]);
    await harness.dataSource.getRepository(Subscription).save([
      {
        organizationId,
        tenantId: organizationId,
        planCode: 'standalone-trial',
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + 86_400_000),
      },
      {
        organizationId: otherOrganizationId,
        tenantId: otherOrganizationId,
        planCode: 'standalone-trial',
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + 86_400_000),
      },
    ]);
  });

  it('recorre checkout → activa → renueva → past_due → cancelada', async () => {
    // ── 1. Checkout: intent auditable + sesión hospedada ────────────────────
    stripeResponses.push(
      JSON.stringify({
        id: 'cs_ciclo',
        url: 'https://checkout.stripe.test/c/pay/cs_ciclo',
      }),
    );
    const checkout = await billing.createCheckoutSession(
      { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
      authenticated(organizationId, ownerId, 'owner'),
    );
    expect(checkout).toMatchObject({
      provider: 'stripe',
      checkout: 'hosted',
      url: 'https://checkout.stripe.test/c/pay/cs_ciclo',
      reference: 'cs_ciclo',
    });
    // El precio enviado sale de plan_prices, no de una constante del código.
    expect(
      stripeCalls[0].form.get('line_items[0][price_data][unit_amount]'),
    ).toBe('2900');
    const intentId = checkout.intentId;
    expect(
      (
        await harness.dataSource
          .getRepository(SubscriptionUpgradeIntent)
          .findOneByOrFail({ id: intentId })
      ).status,
    ).toBe('pending');

    // ── 2. checkout.session.completed: el cobro entró ───────────────────────
    const primerPeriodo = '2026-09-15T00:00:00.000Z';
    await expect(
      process('evt_checkout', 'checkout.session.completed', {
        id: 'cs_ciclo',
        client_reference_id: intentId,
        customer: 'cus_ciclo',
        subscription: {
          id: 'sub_ciclo',
          current_period_end: epoch(primerPeriodo),
        },
        metadata: { organizationId, intentId, planCode: 'standalone-full' },
      }),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'subscription_activated',
    });

    const activa = await subscriptionOf(organizationId);
    expect(activa).toMatchObject({
      planCode: 'standalone-full',
      status: 'active',
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      providerSubscriptionId: 'sub_ciclo',
      providerCustomerId: 'cus_ciclo',
    });
    expect(activa?.currentPeriodEnd?.toISOString()).toBe(primerPeriodo);
    // El intent quedó confirmado SIN decisor humano: lo decidió el pago.
    const confirmado = await harness.dataSource
      .getRepository(SubscriptionUpgradeIntent)
      .findOneByOrFail({ id: intentId });
    expect(confirmado.status).toBe('confirmed');
    expect(confirmado.decidedByUserId).toBeNull();
    expect(confirmado.decidedAt).not.toBeNull();

    // ── 3. invoice.paid: renueva y guarda el espejo de la factura ───────────
    const segundoPeriodo = '2026-10-15T00:00:00.000Z';
    await expect(
      process('evt_factura', 'invoice.paid', {
        id: 'in_ciclo_1',
        number: 'VD-0001',
        customer: 'cus_ciclo',
        subscription: 'sub_ciclo',
        amount_paid: 2900,
        currency: 'usd',
        hosted_invoice_url: 'https://invoice.stripe.test/in_ciclo_1',
        lines: {
          data: [
            {
              period: {
                start: epoch(primerPeriodo),
                end: epoch(segundoPeriodo),
              },
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ outcome: 'subscription_renewed' });

    const renovada = await subscriptionOf(organizationId);
    expect(renovada?.status).toBe('active');
    expect(renovada?.currentPeriodEnd?.toISOString()).toBe(segundoPeriodo);
    const facturas = await harness.dataSource
      .getRepository(Invoice)
      .find({ where: { organizationId } });
    expect(facturas).toHaveLength(1);
    expect(facturas[0]).toMatchObject({
      number: 'VD-0001',
      currency: 'USD',
      status: 'paid',
      hostedUrl: 'https://invoice.stripe.test/in_ciclo_1',
      tenantId: organizationId,
    });
    expect(Number(facturas[0].amountCents)).toBe(2900);

    // ── 4. invoice.payment_failed: past_due, sin cortar el acceso ───────────
    await expect(
      process('evt_fallo', 'invoice.payment_failed', {
        id: 'in_ciclo_2',
        customer: 'cus_ciclo',
        subscription: 'sub_ciclo',
        amount_due: 2900,
        currency: 'usd',
      }),
    ).resolves.toMatchObject({ outcome: 'subscription_past_due' });

    const morosa = await subscriptionOf(organizationId);
    expect(morosa?.status).toBe('past_due');
    // El período NO retrocede: lo pagado sigue pagado.
    expect(morosa?.currentPeriodEnd?.toISOString()).toBe(segundoPeriodo);
    expect(
      (
        await harness.dataSource
          .getRepository(Invoice)
          .findOneByOrFail({ providerInvoiceId: 'in_ciclo_2' })
      ).status,
    ).toBe('open');

    // ── 5. customer.subscription.deleted: cancelada ─────────────────────────
    await expect(
      process('evt_baja', 'customer.subscription.deleted', {
        id: 'sub_ciclo',
        customer: 'cus_ciclo',
      }),
    ).resolves.toMatchObject({ outcome: 'subscription_cancelled' });
    expect(await subscriptionOf(organizationId)).toMatchObject({
      status: 'cancelled',
      cancelAtPeriodEnd: false,
    });

    // Cada evento dejó su asiento y su evento de dominio en el outbox.
    expect(await harness.dataSource.getRepository(PaymentEvent).count()).toBe(
      4,
    );
    const eventos = await harness.dataSource
      .getRepository(DomainOutbox)
      .find({ where: { organizationId }, order: { createdAt: 'ASC' } });
    expect(eventos.map((entry) => entry.type)).toEqual([
      'commercial.subscription.activated',
      'commercial.subscription.renewed',
      'commercial.subscription.payment_failed',
      'commercial.subscription.cancelled',
    ]);
  });

  it('el MISMO event.id dos veces produce UN solo efecto', async () => {
    stripeResponses.push(
      JSON.stringify({ id: 'cs_idem', url: 'https://checkout.stripe.test/x' }),
    );
    const { intentId } = await billing.createCheckoutSession(
      { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
      authenticated(organizationId, ownerId, 'owner'),
    );
    const session = {
      id: 'cs_idem',
      client_reference_id: intentId,
      customer: 'cus_idem',
      subscription: 'sub_idem',
    };
    await expect(
      process('evt_repetido', 'checkout.session.completed', session),
    ).resolves.toMatchObject({ status: 'processed' });

    // Redelivery idéntica: el único de event_id la convierte en duplicado.
    await expect(
      process('evt_repetido', 'checkout.session.completed', session),
    ).resolves.toEqual({ status: 'duplicate', outcome: 'duplicate' });

    const factura = {
      id: 'in_idem',
      customer: 'cus_idem',
      subscription: 'sub_idem',
      amount_paid: 2900,
      currency: 'usd',
      lines: {
        data: [
          {
            period: {
              start: epoch('2026-09-15T00:00:00.000Z'),
              end: epoch('2026-10-15T00:00:00.000Z'),
            },
          },
        ],
      },
    };
    await process('evt_factura_idem', 'invoice.paid', factura);
    await expect(
      process('evt_factura_idem', 'invoice.paid', factura),
    ).resolves.toEqual({ status: 'duplicate', outcome: 'duplicate' });

    // Un solo asiento por evento, una sola factura, un solo evento de dominio
    // por clave idempotente: la redelivery no duplicó NADA.
    expect(await harness.dataSource.getRepository(PaymentEvent).count()).toBe(
      2,
    );
    expect(await harness.dataSource.getRepository(Invoice).count()).toBe(1);
    expect(await harness.dataSource.getRepository(DomainOutbox).count()).toBe(
      2,
    );
  });

  it('dos entregas SIMULTÁNEAS del mismo evento: sólo una aplica el efecto', async () => {
    stripeResponses.push(
      JSON.stringify({ id: 'cs_race', url: 'https://checkout.stripe.test/x' }),
    );
    const { intentId } = await billing.createCheckoutSession(
      { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
      authenticated(organizationId, ownerId, 'owner'),
    );
    const session = {
      id: 'cs_race',
      client_reference_id: intentId,
      customer: 'cus_race',
      subscription: 'sub_race',
    };
    const [a, b] = await Promise.all([
      process('evt_carrera', 'checkout.session.completed', session),
      process('evt_carrera', 'checkout.session.completed', session),
    ]);
    // El índice único es el árbitro real; el orden lo decide PostgreSQL.
    expect([a.status, b.status].sort()).toEqual(['duplicate', 'processed']);
    expect(await harness.dataSource.getRepository(PaymentEvent).count()).toBe(
      1,
    );
    expect(await harness.dataSource.getRepository(DomainOutbox).count()).toBe(
      1,
    );
  });

  it('un tipo desconocido se apunta y se acepta: jamás un 500', async () => {
    await expect(
      process('evt_desconocido', 'customer.discount.created', { id: 'di_1' }),
    ).resolves.toEqual({ status: 'ignored', outcome: 'unhandled_type' });
    expect(
      await harness.dataSource
        .getRepository(PaymentEvent)
        .findOneByOrFail({ eventId: 'evt_desconocido' }),
    ).toMatchObject({
      outcome: 'unhandled_type',
      type: 'customer.discount.created',
    });
    // Sin efecto: ninguna suscripción se movió.
    expect((await subscriptionOf(organizationId))?.status).toBe('trialing');
  });

  it('un evento sin correlación NO se apunta: pide reintento', async () => {
    await expect(
      process('evt_huerfano', 'invoice.paid', {
        id: 'in_huerfano',
        customer: 'cus_desconocido',
        subscription: 'sub_desconocido',
        amount_paid: 2900,
        currency: 'usd',
      }),
    ).rejects.toMatchObject({ name: 'BillingWebhookNotCorrelatedError' });
    // Nada persistido: cuando la correlación llegue, el reintento funcionará.
    expect(await harness.dataSource.getRepository(PaymentEvent).count()).toBe(
      0,
    );
    expect(await harness.dataSource.getRepository(Invoice).count()).toBe(0);
  });

  it('aísla por tenant: el cobro de una organización no toca a la vecina', async () => {
    stripeResponses.push(
      JSON.stringify({ id: 'cs_a', url: 'https://checkout.stripe.test/a' }),
    );
    const { intentId } = await billing.createCheckoutSession(
      { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
      authenticated(organizationId, ownerId, 'owner'),
    );
    await process('evt_a', 'checkout.session.completed', {
      id: 'cs_a',
      client_reference_id: intentId,
      customer: 'cus_a',
      subscription: 'sub_a',
    });
    await process('evt_a_factura', 'invoice.paid', {
      id: 'in_a',
      customer: 'cus_a',
      subscription: 'sub_a',
      amount_paid: 2900,
      currency: 'usd',
    });

    // La vecina sigue exactamente como estaba.
    expect(await subscriptionOf(otherOrganizationId)).toMatchObject({
      planCode: 'standalone-trial',
      status: 'trialing',
      providerSubscriptionId: null,
    });
    // Y su portal no ve facturas ajenas.
    await expect(
      billing.listInvoices(
        authenticated(otherOrganizationId, otherOwnerId, 'owner'),
      ),
    ).resolves.toEqual({ organizationId: otherOrganizationId, items: [] });
    const propias = await billing.listInvoices(
      authenticated(organizationId, adminId, 'admin'),
    );
    expect(propias.items).toHaveLength(1);
    expect(propias.items[0]).toMatchObject({
      amountCents: 2900,
      currency: 'USD',
      status: 'paid',
    });
  });

  it('la baja autoservicio programa el fin de período y lo deja en el outbox', async () => {
    stripeResponses.push(
      JSON.stringify({ id: 'cs_baja', url: 'https://checkout.stripe.test/b' }),
    );
    const { intentId } = await billing.createCheckoutSession(
      { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
      authenticated(organizationId, ownerId, 'owner'),
    );
    await process('evt_baja_alta', 'checkout.session.completed', {
      id: 'cs_baja',
      client_reference_id: intentId,
      customer: 'cus_baja',
      subscription: 'sub_baja',
    });

    const fin = '2026-11-15T00:00:00.000Z';
    stripeResponses.push(
      JSON.stringify({
        id: 'sub_baja',
        cancel_at_period_end: true,
        current_period_end: epoch(fin),
      }),
    );
    const resultado = await billing.cancelSubscription(
      authenticated(organizationId, ownerId, 'owner'),
    );
    expect(resultado.cancellation.kind).toBe('scheduled');
    expect(resultado.subscription).toMatchObject({
      status: 'active',
      cancelAtPeriodEnd: true,
    });
    // Sigue vigente hasta el final del período: la baja NO corta el acceso.
    expect(resultado.subscription.currentPeriodEnd?.toISOString()).toBe(fin);
    expect(
      (
        await harness.dataSource.getRepository(DomainOutbox).findOneByOrFail({
          type: 'commercial.subscription.cancellation_scheduled',
        })
      ).organizationId,
    ).toBe(organizationId);

    // Sólo el owner: un admin gestiona el día a día, no cierra la cuenta.
    await expect(
      billing.cancelSubscription(
        authenticated(organizationId, adminId, 'admin'),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('sin pasarela la baja deja constancia para el operador, no miente', async () => {
    const conNulo = new BillingController(
      harness.dataSource.getRepository(Subscription),
      harness.dataSource.getRepository(Invoice),
      harness.dataSource,
      new PostgresCadEventPublisher(),
      new NullPaymentProvider(),
    );
    const resultado = await conNulo.cancelSubscription(
      authenticated(organizationId, ownerId, 'owner'),
    );
    expect(resultado.cancellation.kind).toBe('recorded');
    expect(resultado.subscription.cancelAtPeriodEnd).toBe(false);
    expect(
      await harness.dataSource.getRepository(DomainOutbox).findOneByOrFail({
        type: 'commercial.subscription.cancellation_requested',
      }),
    ).toMatchObject({ organizationId, tenantId: organizationId });

    // Y el checkout responde el 409 honesto, con el intent ya registrado.
    const error: unknown = await conNulo
      .createCheckoutSession(
        { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
        authenticated(organizationId, ownerId, 'owner'),
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'checkout_unavailable',
    });
    expect(
      await harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .countBy({ organizationId, status: 'pending' }),
    ).toBe(1);
  });

  it('reutiliza el pending del MISMO plan y rechaza abrir otro distinto', async () => {
    stripeResponses.push(
      JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/1' }),
      JSON.stringify({ id: 'cs_2', url: 'https://checkout.stripe.test/2' }),
    );
    const request = authenticated(organizationId, ownerId, 'owner');
    const primera = await billing.createCheckoutSession(
      { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
      request,
    );
    // El usuario abandonó la página del proveedor y vuelve: mismo intent,
    // sesión nueva. No se queda bloqueado por su propio intento anterior.
    const segunda = await billing.createCheckoutSession(
      { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
      request,
    );
    expect(segunda.intentId).toBe(primera.intentId);
    expect(segunda.reference).toBe('cs_2');
    expect(
      await harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .countBy({ organizationId }),
    ).toBe(1);
  });

  it('rechaza comprar un trial, un plan inexistente o un precio no publicado', async () => {
    const request = authenticated(organizationId, ownerId, 'owner');
    for (const body of [
      {
        planCode: 'standalone-trial',
        currency: 'USD',
        period: 'monthly' as const,
      },
      {
        planCode: 'plan-fantasma',
        currency: 'USD',
        period: 'monthly' as const,
      },
    ]) {
      await expect(
        billing.createCheckoutSession(body, request),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      billing.createCheckoutSession(
        { planCode: 'standalone-full', currency: 'EUR', period: 'monthly' },
        request,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      billing.createCheckoutSession(
        { planCode: 'standalone-full', currency: 'USD', period: 'yearly' },
        request,
      ),
    ).rejects.toMatchObject({ status: 400 });
    // Ningún intent quedó abierto por un intento inválido.
    expect(
      await harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .countBy({ organizationId }),
    ).toBe(0);
  });

  it('sólo owner/admin abren un checkout o leen facturas', async () => {
    const miembro = authenticated(organizationId, adminId, 'member');
    await expect(
      billing.createCheckoutSession(
        { planCode: 'standalone-full', currency: 'USD', period: 'monthly' },
        miembro,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(billing.listInvoices(miembro)).rejects.toMatchObject({
      status: 403,
    });
    // Y una sesión sin organización activa no llega a la pasarela.
    await expect(
      billing.listInvoices({ user: undefined } as unknown as Request),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('cancelar sin suscripción es 404 y cancelar dos veces es 409', async () => {
    await harness.dataSource
      .getRepository(Subscription)
      .delete({ organizationId });
    await expect(
      billing.cancelSubscription(
        authenticated(organizationId, ownerId, 'owner'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await harness.dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: 'standalone-full',
      status: 'cancelled',
      trialEndsAt: null,
    });
    await expect(
      billing.cancelSubscription(
        authenticated(organizationId, ownerId, 'owner'),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('un cobro correcto no resucita una suscripción cancelada', async () => {
    await harness.dataSource.getRepository(Subscription).update(
      { organizationId },
      {
        status: 'cancelled',
        planCode: 'standalone-full',
        providerSubscriptionId: 'sub_muerta',
        providerCustomerId: 'cus_muerta',
      },
    );
    await process('evt_tardio', 'invoice.paid', {
      id: 'in_tardio',
      customer: 'cus_muerta',
      subscription: 'sub_muerta',
      amount_paid: 2900,
      currency: 'usd',
    });
    // La factura se refleja (ocurrió), pero la baja fue una decisión explícita
    // y sólo un alta nueva puede deshacerla.
    expect((await subscriptionOf(organizationId))?.status).toBe('cancelled');
    expect(await harness.dataSource.getRepository(Invoice).count()).toBe(1);
  });
});
