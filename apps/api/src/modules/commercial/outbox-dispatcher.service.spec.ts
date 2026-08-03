import type { DataSource, QueryRunner } from 'typeorm';
import {
  CommercialOutboxDispatcher,
  type CommercialOutboxDeliveryContext,
  type CommercialOutboxMessage,
  type CommercialOutboxObservation,
  UnsupportedOutboxDriverError,
} from './outbox-dispatcher.service';
import { DomainOutbox } from './entities/commercial.entities';

type SqlMock = jest.Mock<Promise<unknown>, [sql: string, values: unknown[]]>;
type DeliveryMock = jest.Mock<
  Promise<void>,
  [message: CommercialOutboxMessage, context: CommercialOutboxDeliveryContext]
>;
type ObserverMock = jest.Mock<
  Promise<void>,
  [observation: CommercialOutboxObservation]
>;

interface Harness {
  dispatcher: CommercialOutboxDispatcher;
  transport: { deliver: DeliveryMock };
  observer: { observe: ObserverMock };
  query: SqlMock;
  runnerQuery: SqlMock;
}

function domainClaim(attemptCount = 1) {
  return {
    id: 'event-1',
    organization_id: '11111111-1111-4111-8111-111111111111',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    idempotency_key: 'cad.saved:document-1:version-2',
    payload: { documentId: 'document-1' },
    attempt_count: attemptCount,
    type: 'cad.document.saved',
    aggregate_id: 'document-1',
  };
}

function emailClaim(attemptCount = 1) {
  return {
    id: 'email-1',
    organization_id: null,
    tenant_id: null,
    idempotency_key: 'identity.verify:user-1',
    payload: { verificationUrl: 'https://example.test/verify?token=secret' },
    attempt_count: attemptCount,
    recipient: 'person@example.test',
    template: 'verify-email',
  };
}

function harness(
  input: {
    domain?: ReturnType<typeof domainClaim>[];
    email?: ReturnType<typeof emailClaim>[];
    exhaustedDomain?: Array<{ id: string; attempt_count: number }>;
    exhaustedEmail?: Array<{ id: string; attempt_count: number }>;
    deliver?: DeliveryMock;
    updateResults?: unknown[][];
    driver?: string;
    maxAttempts?: number;
    baseBackoffMs?: number;
    heartbeatMs?: number;
  } = {},
): Harness {
  const runnerQuery: SqlMock = jest.fn(
    async (sql: string, values: unknown[]) => {
      void values;
      if (sql.includes("SET status = 'dead'")) {
        return sql.includes('domain_outbox')
          ? (input.exhaustedDomain ?? [])
          : (input.exhaustedEmail ?? []);
      }
      if (sql.includes('WITH candidates')) {
        return sql.includes('domain_outbox')
          ? (input.domain ?? [])
          : (input.email ?? []);
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    },
  );
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: runnerQuery,
  } as unknown as QueryRunner;
  const updateResults = [...(input.updateResults ?? [[{ id: 'updated' }]])];
  const query: SqlMock = jest.fn(async (sql: string, values: unknown[]) => {
    void sql;
    void values;
    return updateResults.shift() ?? [{ id: 'updated' }];
  });
  const db = {
    options: { type: input.driver ?? 'postgres' },
    createQueryRunner: jest.fn(() => queryRunner),
    getMetadata: jest.fn((entity: unknown) => ({
      tablePath: entity === DomainOutbox ? 'domain_outbox' : 'email_outbox',
    })),
    query,
  } as unknown as DataSource;
  const transport = {
    deliver:
      input.deliver ??
      jest
        .fn<
          Promise<void>,
          [CommercialOutboxMessage, CommercialOutboxDeliveryContext]
        >()
        .mockResolvedValue(undefined),
  };
  const observer = {
    observe: jest
      .fn<Promise<void>, [CommercialOutboxObservation]>()
      .mockResolvedValue(undefined),
  };
  const dispatcher = new CommercialOutboxDispatcher(
    db,
    transport,
    {
      workerId: 'worker-1',
      batchSize: 10,
      maxAttempts: input.maxAttempts ?? 4,
      leaseMs: 60_000,
      heartbeatMs: input.heartbeatMs ?? 0,
      baseBackoffMs: input.baseBackoffMs ?? 1_000,
      maxBackoffMs: 60_000,
      jitterRatio: 0,
      random: () => 0.5,
    },
    observer,
  );
  return { dispatcher, transport, observer, query, runnerQuery };
}

describe('CommercialOutboxDispatcher', () => {
  it('claims with SKIP LOCKED and passes the stable idempotency key to the handler', async () => {
    const test = harness({ domain: [domainClaim()] });

    await expect(test.dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 1,
      sent: 1,
      failed: 0,
      dead: 0,
      leaseLost: 0,
    });

    const claimCall = test.runnerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('WITH candidates'),
    );
    expect(claimCall?.[0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(claimCall?.[0]).toContain("status = 'processing'");
    expect(claimCall?.[0]).toContain('locked_at IS NULL');
    expect(claimCall?.[1][3]).toMatch(/^worker-1:[0-9a-f]{8}-[0-9a-f-]{27}$/);
    expect(test.transport.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'domain',
        idempotencyKey: 'cad.saved:document-1:version-2',
      }),
      {
        idempotencyKey: 'cad.saved:document-1:version-2',
        attemptCount: 1,
        queue: 'domain',
      },
    );
    expect(test.query.mock.calls[0][0]).toContain("SET status = 'sent'");
    expect(test.query.mock.calls[0][0]).toContain('lock_owner = $2');
  });

  it('recovers an expired lease with the same idempotency key', async () => {
    const test = harness({ domain: [domainClaim(2)] });

    await test.dispatcher.dispatchOnce();

    const claimCall = test.runnerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('WITH candidates'),
    );
    expect(claimCall?.[0]).toContain("status = 'processing'");
    expect(claimCall?.[0]).toContain('locked_at <= clock_timestamp()');
    expect(claimCall?.[0]).toContain("INTERVAL '1 millisecond'");
    expect(claimCall?.[1][0]).toBe(60_000);
    expect(test.transport.deliver.mock.calls[0][1]).toEqual({
      idempotencyKey: 'cad.saved:document-1:version-2',
      attemptCount: 2,
      queue: 'domain',
    });
  });

  it('renews a lease while a slow handler is still running', async () => {
    jest.useFakeTimers();
    let releaseDelivery: (() => void) | undefined;
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const deliver = jest.fn<
      Promise<void>,
      [CommercialOutboxMessage, CommercialOutboxDeliveryContext]
    >(
      () =>
        new Promise<void>((resolve) => {
          releaseDelivery = resolve;
          signalStarted?.();
        }),
    );
    const test = harness({
      domain: [domainClaim()],
      deliver,
      heartbeatMs: 100,
    });

    try {
      const dispatch = test.dispatcher.dispatchOnce();
      await started;
      await jest.advanceTimersByTimeAsync(100);
      releaseDelivery?.();

      await expect(dispatch).resolves.toEqual(
        expect.objectContaining({ sent: 1, leaseLost: 0 }),
      );
      expect(test.query.mock.calls[0][0]).toContain(
        'SET locked_at = clock_timestamp()',
      );
      expect(test.query.mock.calls[0][1][1]).toBe(
        test.query.mock.calls[1][1][1],
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('persists a redacted diagnostic and schedules exponential retry', async () => {
    const fakeCredential = 'redaction-fixture-'.repeat(3);
    const deliveryError = new Error(
      `SMTP rejected person@example.test token=${fakeCredential}`,
    );
    const test = harness({
      email: [emailClaim(3)],
      deliver: jest
        .fn<
          Promise<void>,
          [CommercialOutboxMessage, CommercialOutboxDeliveryContext]
        >()
        .mockRejectedValue(deliveryError),
      baseBackoffMs: 1_000,
    });

    await expect(test.dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 1,
      sent: 0,
      failed: 1,
      dead: 0,
      leaseLost: 0,
    });

    const failureCall = test.query.mock.calls[0];
    expect(failureCall[0]).toContain('last_error = $3');
    expect(failureCall[1][0]).toBe('failed');
    expect(failureCall[1][1]).toBe(4_000);
    expect(failureCall[1][2]).toContain('[redacted-email]');
    expect(failureCall[1][2]).toContain('token=[redacted]');
    expect(failureCall[1][2]).not.toContain('person@example.test');
    expect(failureCall[1][2]).not.toContain(fakeCredential);
  });

  it('moves the final failed attempt to dead', async () => {
    const test = harness({
      domain: [domainClaim(4)],
      deliver: jest
        .fn<
          Promise<void>,
          [CommercialOutboxMessage, CommercialOutboxDeliveryContext]
        >()
        .mockRejectedValue(new Error('provider unavailable')),
      maxAttempts: 4,
    });

    await expect(test.dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 1,
      sent: 0,
      failed: 0,
      dead: 1,
      leaseLost: 0,
    });
    expect(test.query.mock.calls[0][1][0]).toBe('dead');
    expect(test.query.mock.calls[0][1][1]).toBe(0);
  });

  it('reaps an already exhausted expired lease without delivering it again', async () => {
    const test = harness({
      exhaustedDomain: [{ id: 'event-dead', attempt_count: 4 }],
      maxAttempts: 4,
    });

    await expect(test.dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 0,
      sent: 0,
      failed: 0,
      dead: 1,
      leaseLost: 0,
    });
    expect(test.transport.deliver).not.toHaveBeenCalled();
    const reapCall = test.runnerQuery.mock.calls.find(([sql]) =>
      String(sql).includes('WITH exhausted_candidates'),
    );
    expect(reapCall?.[0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(reapCall?.[1][2]).toBe(10);
    expect(test.observer.observe).toHaveBeenCalledWith({
      event: 'dead',
      queue: 'domain',
      outboxId: 'event-dead',
      attemptCount: 4,
      failureKind: 'attempts_exhausted',
    });
  });

  it('does not mark delivery as sent after losing the lease', async () => {
    const test = harness({
      domain: [domainClaim()],
      updateResults: [[]],
    });

    await expect(test.dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 1,
      sent: 0,
      failed: 0,
      dead: 0,
      leaseLost: 1,
    });
    expect(test.observer.observe).toHaveBeenCalledWith({
      event: 'lease_lost',
      queue: 'domain',
      outboxId: 'event-1',
      attemptCount: 1,
    });
  });

  it('keeps observations free of payload, recipient and idempotency data', async () => {
    const test = harness({
      email: [emailClaim()],
      deliver: jest
        .fn<
          Promise<void>,
          [CommercialOutboxMessage, CommercialOutboxDeliveryContext]
        >()
        .mockRejectedValue(new Error('temporary')),
    });

    await test.dispatcher.dispatchOnce();

    for (const [observation] of test.observer.observe.mock.calls) {
      const serialized = JSON.stringify(observation);
      expect(serialized).not.toContain('person@example.test');
      expect(serialized).not.toContain('verificationUrl');
      expect(serialized).not.toContain('identity.verify');
    }
  });

  it('fails explicitly on SQLite instead of pretending to provide a safe lease', async () => {
    const test = harness({ driver: 'better-sqlite3' });

    await expect(test.dispatcher.dispatchOnce()).rejects.toBeInstanceOf(
      UnsupportedOutboxDriverError,
    );
    expect(test.runnerQuery).not.toHaveBeenCalled();
  });
});
