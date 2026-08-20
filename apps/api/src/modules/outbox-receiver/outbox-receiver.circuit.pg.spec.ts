import { randomUUID } from 'node:crypto';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import {
  DomainOutbox,
  EmailOutbox,
  PlanCatalog,
  PlanEntitlement,
  Subscription,
  UsageLedger,
} from '../commercial/entities/commercial.entities';
import { CommercialOutboxDispatcher } from '../commercial/outbox-dispatcher.service';
import { WebhookCommercialOutboxTransport } from '../commercial/webhook-outbox.transport';
import { WebhookReceipt } from './entities/webhook-receipt.entity';
import {
  parseDomainOutboxDelivery,
  parseEmailOutboxDelivery,
} from './outbox-delivery';
import { OutboxReceiverService } from './outbox-receiver.service';
import { verifyOutboxSignature } from './outbox-signature';
import type { EmailSender, EmailSendRequest } from './ports/email-sender.port';

const PAYLOAD_HASH = 'a'.repeat(64);
const SECRET = 's'.repeat(48);

/**
 * Circuito COMPLETO del correo, emisor contra receptor: una fila en
 * email_outbox → dispatchOnce() con el transporte REAL (el que firma) → el
 * receptor REAL (el que verifica, parsea y deduplica) → un sender falso que
 * registra los envíos. Sólo se sustituye la red (`fetch`) y el proveedor de
 * correo; la firma, el parseo y el recibo durable son el código de
 * producción. Si emisor y receptor divergen en un byte del contrato, esta
 * suite no compila una excusa: falla.
 */
describePostgres('Receptor de outbox: circuito completo', () => {
  jest.setTimeout(60_000);

  const originalEnvironment = { ...process.env };
  const originalFetch = globalThis.fetch;

  let harness: PostgresHarness;
  let receiver: OutboxReceiverService;
  let sends: EmailSendRequest[];
  let organization: Organization;

  const fakeSender: EmailSender = {
    descriptor: () => ({ name: 'falso', available: true }),
    send: async (request) => {
      sends.push(request);
    },
  };

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [
        User,
        Organization,
        PlanCatalog,
        PlanEntitlement,
        Subscription,
        UsageLedger,
        DomainOutbox,
        EmailOutbox,
        WebhookReceipt,
      ],
      { schemaPrefix: 'outbox_circuit' },
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    sends = [];
    process.env.OUTBOX_EMAIL_WEBHOOK_URL =
      'https://api.example.test/v1/outbox/email';
    process.env.OUTBOX_DOMAIN_WEBHOOK_URL =
      'https://api.example.test/v1/outbox/domain';
    process.env.OUTBOX_WEBHOOK_SECRET = SECRET;
    receiver = new OutboxReceiverService(
      harness.dataSource,
      fakeSender,
      'https://design.example.test',
    );
    // La «red»: entrega los bytes y cabeceras firmados al receptor real, tal
    // y como haría el HTTP del propio despliegue (ADR-0008: la API se llama a
    // sí misma).
    const receive = async (
      url: URL | RequestInfo,
      init?: RequestInit,
    ): Promise<Response> => {
      const body = init?.body;
      const rawBody = Buffer.from(typeof body === 'string' ? body : '', 'utf8');
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      try {
        verifyOutboxSignature({ headers, rawBody, secret: SECRET });
      } catch {
        return new Response(null, { status: 400 });
      }
      const isEmail = String(url).endsWith('/email');
      const result = isEmail
        ? await receiver.processEmail(
            parseEmailOutboxDelivery(rawBody),
            rawBody,
          )
        : await receiver.processDomain(
            parseDomainOutboxDelivery(rawBody),
            rawBody,
          );
      return new Response(JSON.stringify({ received: true, ...result }), {
        status: 200,
      });
    };
    globalThis.fetch = receive;

    const users = harness.dataSource.getRepository(User);
    const owner = await users.save(
      users.create({
        email: `owner-${randomUUID()}@example.test`,
        displayName: 'Owner',
        emailVerifiedAt: new Date(),
      }),
    );
    const organizations = harness.dataSource.getRepository(Organization);
    organization = await organizations.save(
      organizations.create({
        name: 'Despacho Circuito',
        slug: `circuito-${randomUUID()}`,
        ownerUserId: owner.id,
      }),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    globalThis.fetch = originalFetch;
  });

  function dispatcher(): CommercialOutboxDispatcher {
    return new CommercialOutboxDispatcher(
      harness.dataSource,
      new WebhookCommercialOutboxTransport(),
      {
        workerId: 'circuit-worker',
        batchSize: 10,
        maxAttempts: 3,
        leaseMs: 1_000,
        heartbeatMs: 0,
        baseBackoffMs: 1_000,
        maxBackoffMs: 8_000,
        jitterRatio: 0,
      },
    );
  }

  async function enqueueVerificationEmail(): Promise<EmailOutbox> {
    const emails = harness.dataSource.getRepository(EmailOutbox);
    return emails.save(
      emails.create({
        organizationId: null,
        tenantId: null,
        recipient: 'nuevo-usuario@example.test',
        template: 'identity.verify-email',
        payload: {
          token: 'tok_circuito',
          path: '/verify-email?token=tok_circuito',
          expiresAt: '2026-08-21T18:00:00.000Z',
        },
        idempotencyKey: 'identity.verify-email:token-circuito',
        payloadHash: PAYLOAD_HASH,
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(0),
        lockedAt: null,
        lockOwner: null,
        lastError: null,
        sentAt: null,
        failedAt: null,
      }),
    );
  }

  it('email_outbox → dispatchOnce → receptor → exactamente UN envío, incluso reentregado', async () => {
    const row = await enqueueVerificationEmail();

    const summary = await dispatcher().dispatchOnce();
    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0 });

    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe('nuevo-usuario@example.test');
    expect(sends[0].idempotencyKey).toBe(
      'identity.verify-email:token-circuito',
    );
    expect(sends[0].subject).toBe('Confirma tu correo — Valle Design');
    expect(sends[0].html).toContain(
      'https://design.example.test/verify-email?token=tok_circuito',
    );

    const receipts = harness.dataSource.getRepository(WebhookReceipt);
    await expect(receipts.count()).resolves.toBe(1);
    const emails = harness.dataSource.getRepository(EmailOutbox);
    await expect(emails.findOneByOrFail({ id: row.id })).resolves.toMatchObject(
      { status: 'sent', attemptCount: 1 },
    );

    // Reentrega at-least-once: la fila vuelve a `pending` (como haría un
    // lease perdido tras un envío con respuesta extraviada) y el worker la
    // entrega OTRA VEZ con la misma clave. El receptor la deduplica: 200 sin
    // reenvío, y el worker la da por enviada.
    await emails.update(row.id, {
      status: 'pending',
      attemptCount: 0,
      sentAt: null,
      availableAt: new Date(0),
    });
    const redelivery = await dispatcher().dispatchOnce();
    expect(redelivery).toMatchObject({ claimed: 1, sent: 1, failed: 0 });

    expect(sends).toHaveLength(1);
    await expect(receipts.count()).resolves.toBe(1);
  });

  it('la cola domain cierra el circuito con aceptación durable', async () => {
    const domains = harness.dataSource.getRepository(DomainOutbox);
    const row = await domains.save(
      domains.create({
        organizationId: organization.id,
        tenantId: organization.id,
        type: 'design.document.saved',
        aggregateId: 'documento-1',
        payload: { version: 7 },
        idempotencyKey: 'design.document.saved:documento-1:v7',
        payloadHash: PAYLOAD_HASH,
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(0),
        lockedAt: null,
        lockOwner: null,
        lastError: null,
        sentAt: null,
        failedAt: null,
      }),
    );

    const summary = await dispatcher().dispatchOnce();
    expect(summary).toMatchObject({ claimed: 1, sent: 1 });
    expect(sends).toHaveLength(0);

    const receipts = await harness.dataSource
      .getRepository(WebhookReceipt)
      .find();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      queue: 'domain',
      idempotencyKey: 'design.document.saved:documento-1:v7',
      outcome: 'domain_accepted',
    });
    await expect(
      harness.dataSource
        .getRepository(DomainOutbox)
        .findOneByOrFail({ id: row.id }),
    ).resolves.toMatchObject({ status: 'sent' });
  });
});
