import { ConflictException } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { hashOpaqueToken } from '../identity/identity-security';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import {
  STRIPE_TEST_CONFIGURATION as CONFIGURATION,
  STRIPE_TEST_WEBHOOK_SECRET as WEBHOOK_SECRET,
  authenticatedCommercialRequest as authenticated,
  memoryRateLimits,
} from '../../common/testing/stripe-billing-fixture';
import { User } from '../identity/entities/identity.entity';
import {
  Invitation,
  Membership,
  Organization,
} from '../organizations/entities/organization.entity';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { OrganizationsController } from '../organizations/organizations.controller';
import { PostgresCadEventPublisher } from './adapters/postgres.adapters';
import {
  StripePaymentProvider,
  type StripeHttpClient,
} from './adapters/stripe-payment.provider';
import { BillingWebhookService } from './billing-webhook.service';
import { BillingController } from './controllers/billing.controller';
import {
  DomainOutbox,
  EmailOutbox,
  Invoice,
  PaymentEvent,
  PlanCatalog,
  PlanPrice,
  Subscription,
  SubscriptionUpgradeIntent,
  TaxProfile,
} from './entities/commercial.entities';
import { SeatEntitlementService } from './seat-entitlement.service';
import type { PaymentWebhookEvent } from './ports/payment-provider.port';

/**
 * T-61 — EL DESPACHO QUE CRECE PUEDE COMPRAR EL CUARTO ASIENTO.
 *
 * `resolveCheckoutSeats` y `SeatEntitlementService` ya existían; lo que
 * faltaba era que `POST /v1/commercial/checkout-sessions` no rechazara con
 * `plan_already_active` a quien ya tiene el plan y sólo quiere MÁS asientos
 * — el arreglo prohibido explícitamente por la ficha era relajar el límite
 * de asientos; el arreglo correcto es venderle el asiento. Este golden
 * recorre exactamente lo que la ficha pide: comprar tres, chocar contra el
 * límite, comprar el cuarto, invitar.
 *
 * Contra PostgreSQL real por la misma razón que el resto de facturación: la
 * idempotencia del webhook y el conteo de asientos bajo la MISMA transacción
 * que inserta la membresía son invariantes que SQLite no puede romper para
 * demostrarlos.
 */
describePostgres(
  'Comprar más asientos de un plan activo (PostgreSQL real)',
  () => {
    jest.setTimeout(90_000);

    let harness: PostgresHarness;
    let webhooks: BillingWebhookService;
    let billing: BillingController;
    let seats: SeatEntitlementService;
    let stripeResponses: string[];
    let stripeCalls: Array<{ url: string; form: URLSearchParams }>;
    let organizationId: string;
    let owner: User;

    const httpClient: StripeHttpClient = (url, init) => {
      stripeCalls.push({ url, form: new URLSearchParams(init.body) });
      const body = stripeResponses.shift() ?? '{}';
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(body),
      });
    };

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
      const provider = new StripePaymentProvider(CONFIGURATION, httpClient);
      const event: PaymentWebhookEvent = await provider.verifyWebhook(
        { 'stripe-signature': `t=${timestamp},v1=${signature}` },
        rawBody,
      );
      return webhooks.process(event, rawBody);
    }

    /** Compra `seatsRequested` asientos del plan Despacho y confirma el pago. */
    async function comprarAsientos(seatsRequested: number, checkoutId: string) {
      stripeResponses.push(
        JSON.stringify({
          id: checkoutId,
          url: `https://checkout.stripe.test/c/pay/${checkoutId}`,
        }),
      );
      const checkout = await billing.createCheckoutSession(
        {
          planCode: 'despacho',
          currency: 'USD',
          period: 'monthly',
          seats: seatsRequested,
        },
        authenticated(organizationId, owner.id, 'owner'),
      );
      await process('evt_' + checkoutId, 'checkout.session.completed', {
        id: checkoutId,
        client_reference_id: checkout.intentId,
        customer: 'cus_despacho',
        subscription: {
          id: 'sub_despacho',
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
        },
        metadata: {
          organizationId,
          intentId: checkout.intentId,
          planCode: 'despacho',
        },
      });
    }

    function organizationsController(authenticatedAs: {
      user: User;
      session: unknown;
    }): OrganizationsController {
      return new OrganizationsController(
        harness.dataSource,
        {
          authenticate: jest.fn().mockResolvedValue(authenticatedAs),
          // `invite()` también necesita estas tres: son PURAS (sin acceso a
          // datos), así que se reutiliza la implementación real en vez de
          // reinventarla — un hash distinto haría que `accept()` nunca
          // encontrara la invitación por su token.
          newToken: () => randomBytes(32).toString('base64url'),
          hashToken: (raw: string) => hashOpaqueToken(raw),
          normalizeEmail: (email: string) => email.trim().toLowerCase(),
        } as never,
        new OrganizationAccessService(
          harness.dataSource.getRepository(Organization),
          harness.dataSource.getRepository(Membership),
        ),
        { trialDays: 7 },
        seats,
        harness.dataSource.getRepository(Organization),
        harness.dataSource.getRepository(Membership),
        harness.dataSource.getRepository(Invitation),
        harness.dataSource.getRepository(User),
        { enqueue: jest.fn() },
      );
    }

    beforeAll(async () => {
      harness = await createPostgresHarness(
        [
          User,
          Organization,
          Membership,
          Invitation,
          PlanCatalog,
          PlanPrice,
          Subscription,
          SubscriptionUpgradeIntent,
          DomainOutbox,
          PaymentEvent,
          Invoice,
          TaxProfile,
          EmailOutbox,
        ],
        { schemaPrefix: 'seat_growth' },
      );
      const source = harness.dataSource;
      seats = new SeatEntitlementService(source);
      webhooks = new BillingWebhookService(
        source,
        new PostgresCadEventPublisher(),
      );
      billing = new BillingController(
        source.getRepository(Subscription),
        source.getRepository(Invoice),
        source.getRepository(TaxProfile),
        source,
        new PostgresCadEventPublisher(),
        new StripePaymentProvider(CONFIGURATION, httpClient),
        memoryRateLimits(),
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
      owner = await users.save(
        users.create({
          email: `seat-owner-${randomUUID()}@example.test`,
          displayName: 'Dueña del despacho',
          emailVerifiedAt: new Date(),
        }),
      );
      organizationId = (
        await harness.dataSource.getRepository(Organization).save(
          harness.dataSource.getRepository(Organization).create({
            name: 'Despacho que crece',
            slug: `crece-${randomUUID()}`,
            ownerUserId: owner.id,
          }),
        )
      ).id;
      await harness.dataSource.getRepository(Membership).save(
        harness.dataSource.getRepository(Membership).create({
          organizationId,
          userId: owner.id,
          role: 'owner',
        }),
      );
      await harness.dataSource.getRepository(PlanCatalog).save([
        { code: 'standalone-trial', active: true, metadata: { kind: 'trial' } },
        {
          code: 'despacho',
          active: true,
          metadata: { kind: 'paid', perSeat: true, seatsMinimum: 3 },
        },
      ]);
      await harness.dataSource.getRepository(PlanPrice).save({
        planCode: 'despacho',
        currency: 'USD',
        period: 'monthly',
        amountCents: 4900,
        active: true,
      });
      await harness.dataSource.getRepository(Subscription).save({
        organizationId,
        tenantId: organizationId,
        planCode: 'standalone-trial',
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + 86_400_000),
      });
      await harness.dataSource.query(
        `INSERT INTO "${harness.schema}"."tax_profiles" ("organization_id", "tenant_id", "rfc", "person_type", "legal_name", "tax_regime_code", "cfdi_use_code", "postal_code")
       VALUES ($1, $1, 'VECJ880326XX4', 'fisica', 'JUAN CARLOS VERA CRUZ', '612', 'G03', '06700')`,
        [organizationId],
      );
    });

    it('compra tres, choca con el límite, compra el cuarto e invita', async () => {
      // ── 1. Compra los tres asientos mínimos del plan Despacho ──────────────
      await comprarAsientos(3, 'cs_tres');
      await expect(
        harness.dataSource
          .getRepository(Subscription)
          .findOneByOrFail({ organizationId, tenantId: organizationId }),
      ).resolves.toMatchObject({
        planCode: 'despacho',
        status: 'active',
        seats: 3,
      });

      // El dueño ocupa un asiento; quedan dos libres.
      await expect(seats.availability(organizationId)).resolves.toMatchObject({
        seats: 3,
        members: 1,
        available: 2,
        denial: null,
      });

      // ── 2. Invita a dos colegas: llena los tres asientos ────────────────────
      const orgOwner = organizationsController({ user: owner, session: {} });
      for (const etiqueta of ['segunda', 'tercera']) {
        await orgOwner.invite(
          organizationId,
          { email: `${etiqueta}-${randomUUID()}@example.test`, role: 'member' },
          { headers: {} } as Request,
        );
      }
      await expect(seats.availability(organizationId)).resolves.toMatchObject({
        seats: 3,
        pendingInvitations: 2,
        available: 0,
        denial: 'seat_limit_reached',
      });

      // ── 3. CHOCA con el límite: la cuarta invitación se rechaza ─────────────
      const bloqueada: unknown = await orgOwner
        .invite(
          organizationId,
          { email: `cuarta-${randomUUID()}@example.test`, role: 'member' },
          { headers: {} } as Request,
        )
        .catch((e: unknown) => e);
      expect(bloqueada).toBeInstanceOf(ConflictException);
      expect((bloqueada as ConflictException).getResponse()).toMatchObject({
        code: 'seat_limit_reached',
      });

      // ── 4. El checkout YA NO responde plan_already_active: vende el cuarto ──
      await comprarAsientos(4, 'cs_cuatro');
      await expect(
        harness.dataSource
          .getRepository(Subscription)
          .findOneByOrFail({ organizationId, tenantId: organizationId }),
      ).resolves.toMatchObject({
        planCode: 'despacho',
        status: 'active',
        seats: 4,
      });

      // ── 5. Con el cuarto asiento pagado, la cuarta invitación entra ────────
      const cuarta = await orgOwner.invite(
        organizationId,
        {
          email: `cuarta-de-verdad-${randomUUID()}@example.test`,
          role: 'member',
        },
        { headers: {} } as Request,
      );
      expect(cuarta.accepted).toBe(true);
      await expect(seats.availability(organizationId)).resolves.toMatchObject({
        seats: 4,
        pendingInvitations: 3,
        available: 0,
        denial: 'seat_limit_reached',
      });
    });

    it('pedir los mismos asientos o menos sigue rechazándose (no relaja el límite)', async () => {
      await comprarAsientos(4, 'cs_base');

      const repetido: unknown = await billing
        .createCheckoutSession(
          {
            planCode: 'despacho',
            currency: 'USD',
            period: 'monthly',
            seats: 4,
          },
          authenticated(organizationId, owner.id, 'owner'),
        )
        .catch((e: unknown) => e);
      expect(repetido).toBeInstanceOf(ConflictException);
      expect((repetido as ConflictException).getResponse()).toMatchObject({
        code: 'plan_already_active',
      });

      // Menos de los que ya tiene (pero por encima del mínimo del plan): sigue
      // siendo la compra redundante que este error existe para evitar — bajar
      // asientos no es un checkout, es un cambio de plan.
      const menos: unknown = await billing
        .createCheckoutSession(
          {
            planCode: 'despacho',
            currency: 'USD',
            period: 'monthly',
            seats: 3,
          },
          authenticated(organizationId, owner.id, 'owner'),
        )
        .catch((e: unknown) => e);
      expect(menos).toBeInstanceOf(ConflictException);
      expect((menos as ConflictException).getResponse()).toMatchObject({
        code: 'plan_already_active',
      });
    });
  },
);
