import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { WebhookReceipt } from './entities/webhook-receipt.entity';
import { OutboxReceiverService } from './outbox-receiver.service';
import {
  EmailSendError,
  type EmailSender,
  type EmailSendRequest,
} from './ports/email-sender.port';

/**
 * La promesa del receptor — «dos entregas de la misma clave, UN solo envío» —
 * es una promesa sobre PostgreSQL real: la hace el índice único bajo MVCC,
 * no el código TypeScript. Por eso estas pruebas viven en el arnés PG y no en
 * un mock que afirmaría lo que se quería probar.
 */
describePostgres('OutboxReceiverService (dedup insert-first)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let sends: EmailSendRequest[];
  let failNextSends: number;

  const sender: EmailSender = {
    descriptor: () => ({ name: 'falso', available: true }),
    send: async (request) => {
      if (failNextSends > 0) {
        failNextSends -= 1;
        throw new EmailSendError(500);
      }
      sends.push(request);
    },
  };

  function service(): OutboxReceiverService {
    return new OutboxReceiverService(
      harness.dataSource,
      sender,
      'https://design.example.test',
    );
  }

  function emailDelivery(overrides: Partial<{ template: string }> = {}) {
    return {
      queue: 'email' as const,
      idempotencyKey: 'identity.verify-email:token-1',
      recipient: 'user@example.test',
      template: overrides.template ?? 'identity.verify-email',
      payload: {
        token: 'tok_1',
        path: '/verify-email?token=tok_1',
        expiresAt: '2026-08-21T18:00:00.000Z',
      },
    };
  }

  const rawBody = Buffer.from('{"cuerpo":"firmado"}', 'utf8');

  beforeAll(async () => {
    harness = await createPostgresHarness([WebhookReceipt], {
      schemaPrefix: 'outbox_receiver',
    });
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    sends = [];
    failNextSends = 0;
  });

  it('dos entregas de la misma clave producen UN solo envío', async () => {
    const first = await service().processEmail(emailDelivery(), rawBody);
    expect(first).toEqual({ status: 'processed', outcome: 'email_sent' });

    const second = await service().processEmail(emailDelivery(), rawBody);
    expect(second).toEqual({ status: 'duplicate', outcome: 'duplicate' });

    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe('user@example.test');
    expect(sends[0].idempotencyKey).toBe('identity.verify-email:token-1');
    // El correo lleva el enlace ABSOLUTO construido con la base configurada.
    expect(sends[0].html).toContain(
      'https://design.example.test/verify-email?token=tok_1',
    );

    const receipts = await harness.dataSource
      .getRepository(WebhookReceipt)
      .find();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      queue: 'email',
      outcome: 'email_sent',
    });
  });

  it('dos entregas CONCURRENTES de la misma clave: sólo una envía', async () => {
    // La segunda transacción queda bloqueada en el INSERT hasta que la
    // primera commitea, y entonces recibe 23505. Esto sólo se puede
    // demostrar con MVCC real.
    const results = await Promise.all([
      service().processEmail(emailDelivery(), rawBody),
      service().processEmail(emailDelivery(), rawBody),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      'duplicate',
      'processed',
    ]);
    expect(sends).toHaveLength(1);
  });

  it('si el proveedor falla NO queda recibo y la reentrega vuelve a intentar', async () => {
    failNextSends = 1;
    await expect(
      service().processEmail(emailDelivery(), rawBody),
    ).rejects.toBeInstanceOf(EmailSendError);
    // La transacción se revirtió entera: sin recibo, la promesa «aceptado ⇒
    // enviado» sigue en pie.
    await expect(
      harness.dataSource.getRepository(WebhookReceipt).count(),
    ).resolves.toBe(0);

    const retry = await service().processEmail(emailDelivery(), rawBody);
    expect(retry).toEqual({ status: 'processed', outcome: 'email_sent' });
    expect(sends).toHaveLength(1);
  });

  it('una plantilla desconocida se apunta y se acepta, sin envío ni reintento', async () => {
    const result = await service().processEmail(
      emailDelivery({ template: 'marketing.navidad' }),
      rawBody,
    );
    expect(result).toEqual({ status: 'ignored', outcome: 'unknown_template' });
    expect(sends).toHaveLength(0);

    // La reentrega de esos mismos bytes tampoco mejora: duplicada, 200.
    const redelivery = await service().processEmail(
      emailDelivery({ template: 'marketing.navidad' }),
      rawBody,
    );
    expect(redelivery.status).toBe('duplicate');
    await expect(
      harness.dataSource.getRepository(WebhookReceipt).count(),
    ).resolves.toBe(1);
  });

  it('la cola domain acepta durablemente y deduplica igual', async () => {
    const delivery = {
      queue: 'domain' as const,
      idempotencyKey: 'design.document.saved:doc-1:v7',
      payload: { version: 7 },
    };
    const first = await service().processDomain(delivery, rawBody);
    expect(first).toEqual({ status: 'accepted', outcome: 'domain_accepted' });
    const second = await service().processDomain(delivery, rawBody);
    expect(second).toEqual({ status: 'duplicate', outcome: 'duplicate' });
    await expect(
      harness.dataSource.getRepository(WebhookReceipt).count(),
    ).resolves.toBe(1);
  });
});
