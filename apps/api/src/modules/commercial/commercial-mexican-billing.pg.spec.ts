import { createHmac, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Request } from 'express';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';
import { User } from '../identity/entities/identity.entity';
import {
  Invitation,
  Membership,
  Organization,
} from '../organizations/entities/organization.entity';
import { PostgresCadEventPublisher } from './adapters/postgres.adapters';
import { NullCfdiProvider } from './adapters/null-cfdi.provider';
import {
  StripePaymentProvider,
  type StripeConfiguration,
  type StripeHttpClient,
} from './adapters/stripe-payment.provider';
import { BillingWebhookService } from './billing-webhook.service';
import { BillingController } from './controllers/billing.controller';
import { TaxProfileController } from './controllers/tax-profile.controller';
import { SeatEntitlementService } from './seat-entitlement.service';
import {
  DomainOutbox,
  Invoice,
  PaymentEvent,
  PlanCatalog,
  PlanEntitlement,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
  TaxProfile,
} from './entities/commercial.entities';
import type { PaymentWebhookEvent } from './ports/payment-provider.port';

/**
 * LA OLA MEXICANA, contra PostgreSQL real y de punta a punta.
 *
 * Tres cosas que sólo se pueden demostrar aquí, con base de verdad:
 *
 * 1. Que los datos fiscales se exigen ANTES del cobro, y que la validación es
 *    la del SAT (catálogos cerrados, coherencia RFC ↔ régimen ↔ uso).
 * 2. Que un pago de OXXO transita PENDIENTE → ACTIVO por webhook. Es la
 *    definición de terminado de E3, y con dobles no probaría nada: lo que se
 *    ejerce es que la sesión completada SIN dinero no activa nada y que el
 *    evento asíncrono posterior sí.
 * 3. Que el límite de asientos vive en la API. Un doble afirmaría justo lo que
 *    se quiere probar.
 */

const WEBHOOK_SECRET = 'whsec_prueba_de_treinta_y_dos_caracteres';
const CONFIGURATION: StripeConfiguration = {
  secretKey: 'sk_test_mx',
  webhookSecret: WEBHOOK_SECRET,
  apiBaseUrl: 'https://api.stripe.test',
  successUrl: 'https://app.example.test/retorno',
  cancelUrl: 'https://app.example.test/precios',
  portalReturnUrl: 'https://app.example.test/facturacion',
  timeoutMs: 5_000,
  toleranceSeconds: 300,
  apiVersion: null,
};

const FISCAL_VALIDO = {
  rfc: 'VECJ880326XX4',
  legalName: 'Arquitectos del Valle S.A. de C.V.',
  taxRegimeCode: '612',
  cfdiUseCode: 'G03',
  postalCode: '06700',
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

describePostgres('Facturación mexicana: CFDI, OXXO y asientos', () => {
  jest.setTimeout(90_000);

  let harness: PostgresHarness;
  let billing: BillingController;
  let taxes: TaxProfileController;
  let webhooks: BillingWebhookService;
  let seats: SeatEntitlementService;
  let stripeResponses: string[];
  let organizationId: string;
  let ownerId: string;

  const httpClient: StripeHttpClient = () => {
    const body = stripeResponses.shift() ?? '{}';
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
    });
  };

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
      httpClient,
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

  async function captureTaxProfile(): Promise<void> {
    await taxes.saveTaxProfile(
      FISCAL_VALIDO,
      authenticated(organizationId, ownerId, 'owner'),
    );
  }

  /** Abre una compra de OXXO y devuelve el intent que la respalda. */
  async function openOxxoCheckout(): Promise<string> {
    stripeResponses.push(
      JSON.stringify({
        id: 'cs_oxxo',
        url: 'https://checkout.stripe.test/c/pay/cs_oxxo',
      }),
    );
    const checkout = await billing.createCheckoutSession(
      {
        planCode: 'individual',
        currency: 'MXN',
        period: 'monthly',
        paymentMethod: 'oxxo',
      },
      authenticated(organizationId, ownerId, 'owner'),
    );
    expect(checkout.asynchronous).toBe(true);
    expect(checkout.paymentMethod).toBe('oxxo');
    return checkout.intentId;
  }

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [
        User,
        Organization,
        Membership,
        Invitation,
        PlanCatalog,
        PlanEntitlement,
        PlanPrice,
        Subscription,
        SubscriptionUpgradeIntent,
        DomainOutbox,
        PaymentEvent,
        Invoice,
        TaxProfile,
      ],
      { schemaPrefix: 'mexican_billing' },
    );
    const source = harness.dataSource;
    webhooks = new BillingWebhookService(
      source,
      new PostgresCadEventPublisher(),
    );
    seats = new SeatEntitlementService(source);
    billing = new BillingController(
      source.getRepository(Subscription),
      source.getRepository(Invoice),
      source.getRepository(TaxProfile),
      source,
      new PostgresCadEventPublisher(),
      new StripePaymentProvider(CONFIGURATION, httpClient),
    );
    taxes = new TaxProfileController(
      source.getRepository(TaxProfile),
      source,
      new NullCfdiProvider(),
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    stripeResponses = [];
    await harness.truncateAll();

    const users = harness.dataSource.getRepository(User);
    const owner = await users.save(
      users.create({
        email: `mx-owner-${randomUUID()}@example.test`,
        displayName: 'Dueña del despacho',
        emailVerifiedAt: new Date(),
      }),
    );
    ownerId = owner.id;
    organizationId = (
      await harness.dataSource.getRepository(Organization).save({
        name: 'Despacho del Valle',
        slug: `mx-${randomUUID()}`,
        ownerUserId: owner.id,
      })
    ).id;
    await harness.dataSource
      .getRepository(Membership)
      .save({ organizationId, userId: owner.id, role: 'owner' });

    await harness.dataSource.getRepository(PlanCatalog).save([
      {
        code: 'individual',
        active: true,
        metadata: { kind: 'paid', perSeat: false, seatsMinimum: 1 },
      },
      {
        code: 'despacho',
        active: true,
        metadata: { kind: 'paid', perSeat: true, seatsMinimum: 3 },
      },
    ]);
    await harness.dataSource.getRepository(PlanPrice).save([
      {
        planCode: 'individual',
        currency: 'MXN',
        period: 'monthly',
        amountCents: 19_900,
        active: true,
      },
      {
        planCode: 'despacho',
        currency: 'MXN',
        period: 'monthly',
        amountCents: 16_900,
        active: true,
      },
    ]);
    await harness.dataSource.getRepository(Subscription).save({
      organizationId,
      tenantId: organizationId,
      planCode: 'individual',
      status: 'trialing',
      trialEndsAt: new Date(Date.now() + 86_400_000),
      seats: 1,
    });
  });

  // ── E2. CFDI 4.0 ────────────────────────────────────────────────────────
  it('exige datos fiscales ANTES de abrir el cobro, y no deja intent detrás', async () => {
    // Pedirlos DESPUÉS del cobro es la pesadilla operativa que esta ola evita:
    // el mes se cierra, la factura no sale y el cliente no deduce.
    await expect(
      billing.createCheckoutSession(
        { planCode: 'individual', currency: 'MXN', period: 'monthly' },
        authenticated(organizationId, ownerId, 'owner'),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'tax_profile_required' },
    });
    // Ni un intent abierto: el rechazo ocurre antes de tocar nada.
    expect(
      await harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .countBy({ organizationId }),
    ).toBe(0);
  });

  it('guarda el perfil normalizado y dice que la emisión es MANUAL', async () => {
    const saved = await taxes.saveTaxProfile(
      FISCAL_VALIDO,
      authenticated(organizationId, ownerId, 'owner'),
    );
    // El régimen de capital se retira porque el SAT no lo compara, y el RFC
    // sube a mayúsculas: es lo que después tiene que coincidir con la
    // Constancia de Situación Fiscal.
    expect(saved.profile).toMatchObject({
      rfc: 'VECJ880326XX4',
      personType: 'fisica',
      legalName: 'ARQUITECTOS DEL VALLE',
      taxRegimeCode: '612',
      cfdiUseCode: 'G03',
      postalCode: '06700',
    });
    // SIN PAC no se promete timbrar. El adaptador nulo lo dice y el contrato
    // lo publica; la web repite exactamente esto.
    expect(saved.issuance).toEqual({
      provider: 'null',
      mode: 'manual',
      available: false,
    });
  });

  it('rechaza un perfil que el SAT no aceptaría y no persiste nada', async () => {
    await expect(
      taxes.saveTaxProfile(
        { ...FISCAL_VALIDO, taxRegimeCode: '605', cfdiUseCode: 'G03' },
        authenticated(organizationId, ownerId, 'owner'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await harness.dataSource.getRepository(TaxProfile).countBy({
        organizationId,
      }),
    ).toBe(0);
  });

  it('sustituye el perfil anterior en vez de duplicarlo', async () => {
    await captureTaxProfile();
    await taxes.saveTaxProfile(
      { ...FISCAL_VALIDO, cfdiUseCode: 'I04' },
      authenticated(organizationId, ownerId, 'owner'),
    );
    const rows = await harness.dataSource
      .getRepository(TaxProfile)
      .findBy({ organizationId });
    expect(rows).toHaveLength(1);
    expect(rows[0].cfdiUseCode).toBe('I04');
  });

  // ── E3. OXXO: pendiente → activo por webhook (DoD de la ola) ────────────
  it('un pago OXXO transita PENDIENTE → ACTIVO cuando llega el webhook', async () => {
    await captureTaxProfile();
    const intentId = await openOxxoCheckout();

    // ── 1. La sesión se completa SIN dinero: el cliente tiene su ficha ────
    await expect(
      process('evt_oxxo_pendiente', 'checkout.session.completed', {
        id: 'cs_oxxo',
        client_reference_id: intentId,
        payment_status: 'unpaid',
        hosted_voucher_url: 'https://payments.stripe.test/oxxo/voucher/abc',
      }),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'checkout_awaiting_payment',
    });
    // NADA se activó: activar aquí regalaría el producto a quien no pague.
    expect(await subscription()).toMatchObject({
      status: 'trialing',
      planCode: 'individual',
    });
    const esperando = await harness.dataSource
      .getRepository(SubscriptionUpgradeIntent)
      .findOneByOrFail({ id: intentId });
    expect(esperando.status).toBe('pending');
    expect(esperando.awaitingPaymentAt).not.toBeNull();
    // La ficha se guarda para que la interfaz pueda decir QUÉ se está
    // esperando en vez de dejar la pantalla en blanco durante dos días.
    expect(esperando.voucherUrl).toBe(
      'https://payments.stripe.test/oxxo/voucher/abc',
    );

    // ── 2. Días después entra el dinero del mostrador ─────────────────────
    await expect(
      process('evt_oxxo_pagado', 'checkout.session.async_payment_succeeded', {
        id: 'cs_oxxo',
        client_reference_id: intentId,
        payment_status: 'paid',
        customer: 'cus_oxxo',
        // Stripe devuelve la sesión ENTERA, con la metadata que el adaptador
        // puso al crearla. `period` es la única fuente del fin de período en
        // un pago único: no hay suscripción del proveedor que consultar.
        metadata: { period: 'monthly', paymentMethod: 'oxxo' },
      }),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'subscription_activated',
    });

    const activa = await subscription();
    expect(activa.status).toBe('active');
    expect(activa.planCode).toBe('individual');
    // Un pago único NO deja `current_period_end` en el proveedor: se deriva
    // del período comprado, que viajó en la metadata de la sesión.
    expect(activa.currentPeriodEnd).not.toBeNull();
    const decidido = await harness.dataSource
      .getRepository(SubscriptionUpgradeIntent)
      .findOneByOrFail({ id: intentId });
    expect(decidido.status).toBe('confirmed');
    // La espera se cierra y la ficha se olvida: enseñarla después de pagar
    // invita a pagar dos veces.
    expect(decidido.awaitingPaymentAt).toBeNull();
    expect(decidido.voucherUrl).toBeNull();
  });

  it('una ficha caducada deja el intent reutilizable, no lo cancela', async () => {
    await captureTaxProfile();
    const intentId = await openOxxoCheckout();
    await process('evt_oxxo_p2', 'checkout.session.completed', {
      id: 'cs_oxxo',
      client_reference_id: intentId,
      payment_status: 'unpaid',
    });

    await expect(
      process('evt_oxxo_caduca', 'checkout.session.async_payment_failed', {
        id: 'cs_oxxo',
        client_reference_id: intentId,
      }),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'checkout_payment_expired',
    });
    const intent = await harness.dataSource
      .getRepository(SubscriptionUpgradeIntent)
      .findOneByOrFail({ id: intentId });
    // Sigue `pending`: quien no llegó a la tienda en tres días no debería
    // tener que repetir el embudo entero.
    expect(intent.status).toBe('pending');
    expect(intent.awaitingPaymentAt).toBeNull();
  });

  it('rechaza OXXO por encima del tope de una ficha con un motivo accionable', async () => {
    await captureTaxProfile();
    await expect(
      billing.createCheckoutSession(
        {
          planCode: 'despacho',
          currency: 'MXN',
          period: 'monthly',
          seats: 700,
          paymentMethod: 'oxxo',
        },
        authenticated(organizationId, ownerId, 'owner'),
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'payment_method_amount_limit' },
    });
  });

  // ── E4. Portal del proveedor ────────────────────────────────────────────
  it('sin cliente en la pasarela dice por qué, en vez de abrir una página vacía', async () => {
    await expect(
      billing.createBillingPortalSession(
        authenticated(organizationId, ownerId, 'owner'),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'billing_portal_unavailable' },
    });
  });

  it('con cliente en la pasarela devuelve la URL del portal del proveedor', async () => {
    await harness.dataSource
      .getRepository(Subscription)
      .update({ organizationId }, { providerCustomerId: 'cus_portal' });
    stripeResponses.push(
      JSON.stringify({ url: 'https://billing.stripe.test/p/session/xyz' }),
    );
    await expect(
      billing.createBillingPortalSession(
        authenticated(organizationId, ownerId, 'owner'),
      ),
    ).resolves.toEqual({
      organizationId,
      url: 'https://billing.stripe.test/p/session/xyz',
    });
  });

  // ── E5. Límite de asientos ──────────────────────────────────────────────
  it('los asientos pagados llegan a la suscripción desde el intent', async () => {
    await captureTaxProfile();
    stripeResponses.push(
      JSON.stringify({
        id: 'cs_despacho',
        url: 'https://checkout.stripe.test/c/pay/cs_despacho',
      }),
    );
    const checkout = await billing.createCheckoutSession(
      {
        planCode: 'despacho',
        currency: 'MXN',
        period: 'monthly',
        seats: 5,
      },
      authenticated(organizationId, ownerId, 'owner'),
    );
    await process('evt_despacho', 'checkout.session.completed', {
      id: 'cs_despacho',
      client_reference_id: checkout.intentId,
      customer: 'cus_despacho',
      subscription: 'sub_despacho',
    });

    // Cinco asientos cobrados, cinco asientos disponibles. Antes de esta ola
    // el checkout cobraba cinco y la API no impedía meter cincuenta.
    expect((await subscription()).seats).toBe(5);
    expect(await seats.availability(organizationId)).toMatchObject({
      seats: 5,
      members: 1,
      available: 4,
      denial: null,
    });
  });

  it('las invitaciones vivas OCUPAN asiento y agotan el plan', async () => {
    await harness.dataSource
      .getRepository(Subscription)
      .update({ organizationId }, { seats: 3 });
    const invitations = harness.dataSource.getRepository(Invitation);
    for (let index = 0; index < 2; index += 1) {
      await invitations.save({
        organizationId,
        email: `invitado-${index}@example.test`,
        role: 'member',
        tokenHash: randomUUID().replace(/-/g, ''),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByUserId: ownerId,
      });
    }
    // 1 miembro + 2 invitaciones = 3 de 3. Si las invitaciones no contaran, un
    // despacho de tres podría mandar veinte y quedarse con veinte miembros.
    expect(await seats.availability(organizationId)).toMatchObject({
      seats: 3,
      members: 1,
      pendingInvitations: 2,
      available: 0,
      denial: 'seat_limit_reached',
    });

    // Una invitación CADUCADA deja de ocupar: su asiento vuelve al plan.
    await invitations.update(
      { email: 'invitado-0@example.test' },
      { expiresAt: new Date(Date.now() - 1_000) },
    );
    expect(await seats.availability(organizationId)).toMatchObject({
      available: 1,
      denial: null,
    });
  });

  it('sin suscripción no hay asientos que repartir (fallo cerrado)', async () => {
    await harness.dataSource
      .getRepository(Subscription)
      .delete({ organizationId });
    expect(await seats.availability(organizationId)).toMatchObject({
      denial: 'subscription_missing',
      available: 0,
    });
  });

  it('el momento de ACEPTAR ignora la invitación que se está consumiendo', async () => {
    await harness.dataSource
      .getRepository(Subscription)
      .update({ organizationId }, { seats: 2 });
    await harness.dataSource.getRepository(Invitation).save({
      organizationId,
      email: 'ultimo@example.test',
      role: 'member',
      tokenHash: randomUUID().replace(/-/g, ''),
      expiresAt: new Date(Date.now() + 86_400_000),
      invitedByUserId: ownerId,
    });
    // Contando la pendiente no queda sitio…
    expect(await seats.availability(organizationId)).toMatchObject({
      available: 0,
    });
    // …pero al aceptar sí, porque esa pendiente es justo la que se consume.
    // Restarla dos veces dejaría fuera al último invitado de un plan lleno.
    expect(await seats.availabilityForAcceptance(organizationId)).toMatchObject(
      { available: 1, denial: null },
    );
  });

  it('el checkout con datos fiscales capturados sí abre la compra', async () => {
    await captureTaxProfile();
    stripeResponses.push(
      JSON.stringify({
        id: 'cs_tarjeta',
        url: 'https://checkout.stripe.test/c/pay/cs_tarjeta',
      }),
    );
    const checkout = await billing.createCheckoutSession(
      { planCode: 'individual', currency: 'MXN', period: 'monthly' },
      authenticated(organizationId, ownerId, 'owner'),
    );
    expect(checkout).toMatchObject({
      provider: 'stripe',
      checkout: 'hosted',
      paymentMethod: 'card',
      asynchronous: false,
      seats: 1,
    });
    expect(
      await harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .findOneByOrFail({ id: checkout.intentId }),
    ).toMatchObject({ paymentMethod: 'card', requestedSeats: 1 });
  });

  it('reabrir la compra con otro medio ACTUALIZA el intent, no lo duplica', async () => {
    await captureTaxProfile();
    const intentId = await openOxxoCheckout();
    stripeResponses.push(
      JSON.stringify({
        id: 'cs_tarjeta',
        url: 'https://checkout.stripe.test/c/pay/cs_tarjeta',
      }),
    );
    const segunda = await billing.createCheckoutSession(
      {
        planCode: 'individual',
        currency: 'MXN',
        period: 'monthly',
        paymentMethod: 'card',
      },
      authenticated(organizationId, ownerId, 'owner'),
    );
    // El mismo intent: dos compras abiertas a la vez es lo que el índice único
    // parcial prohíbe. Pero refleja el medio que se va a pagar de verdad.
    expect(segunda.intentId).toBe(intentId);
    expect(
      await harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .findOneByOrFail({ id: intentId }),
    ).toMatchObject({ paymentMethod: 'card', awaitingPaymentAt: null });
    await expect(
      harness.dataSource
        .getRepository(SubscriptionUpgradeIntent)
        .countBy({ organizationId }),
    ).resolves.toBe(1);
  });

  it('un plan que no cobra por usuario sigue sin admitir varios asientos', async () => {
    await captureTaxProfile();
    await expect(
      billing.createCheckoutSession(
        {
          planCode: 'individual',
          currency: 'MXN',
          period: 'monthly',
          seats: 3,
        },
        authenticated(organizationId, ownerId, 'owner'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el conflicto de asientos es un error tipado, nunca un 500', async () => {
    await harness.dataSource
      .getRepository(Subscription)
      .update({ organizationId }, { seats: 1 });
    const snapshot = await seats.availability(organizationId);
    expect(snapshot.denial).toBe('seat_limit_reached');
    expect(() =>
      new ConflictException({
        code: snapshot.denial,
        seats: snapshot.seats,
      }).getStatus(),
    ).not.toThrow();
  });
});
