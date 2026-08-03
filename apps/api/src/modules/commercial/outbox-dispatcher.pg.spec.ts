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
} from './entities/commercial.entities';
import {
  CommercialOutboxDispatcher,
  type CommercialOutboxDeliveryContext,
  type CommercialOutboxMessage,
  type CommercialOutboxTransport,
} from './outbox-dispatcher.service';

const PAYLOAD_HASH = 'a'.repeat(64);

describePostgres('CommercialOutboxDispatcher PostgreSQL leases', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let organizationA: Organization;
  let organizationB: Organization;

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
      ],
      { schemaPrefix: 'commercial_outbox' },
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    const users = harness.dataSource.getRepository(User);
    const ownerA = await users.save(
      users.create({
        email: `owner-a-${randomUUID()}@example.test`,
        displayName: 'Owner A',
        emailVerifiedAt: new Date(),
      }),
    );
    const ownerB = await users.save(
      users.create({
        email: `owner-b-${randomUUID()}@example.test`,
        displayName: 'Owner B',
        emailVerifiedAt: new Date(),
      }),
    );
    const organizations = harness.dataSource.getRepository(Organization);
    organizationA = await organizations.save(
      organizations.create({
        name: 'Organization A',
        slug: `organization-a-${randomUUID()}`,
        ownerUserId: ownerA.id,
      }),
    );
    organizationB = await organizations.save(
      organizations.create({
        name: 'Organization B',
        slug: `organization-b-${randomUUID()}`,
        ownerUserId: ownerB.id,
      }),
    );
  });

  function dispatcher(
    workerId: string,
    transport: CommercialOutboxTransport,
    overrides: { batchSize?: number; maxAttempts?: number } = {},
  ): CommercialOutboxDispatcher {
    return new CommercialOutboxDispatcher(harness.dataSource, transport, {
      workerId,
      batchSize: overrides.batchSize ?? 10,
      maxAttempts: overrides.maxAttempts ?? 3,
      leaseMs: 1_000,
      heartbeatMs: 0,
      baseBackoffMs: 1_000,
      maxBackoffMs: 8_000,
      jitterRatio: 0,
    });
  }

  it('delivers each row exactly once while two workers claim with SKIP LOCKED', async () => {
    const domains = harness.dataSource.getRepository(DomainOutbox);
    const emails = harness.dataSource.getRepository(EmailOutbox);
    await domains.save(
      Array.from({ length: 10 }, (_, index) =>
        domains.create({
          organizationId: organizationA.id,
          tenantId: organizationA.id,
          type: 'design.document.saved',
          aggregateId: `document-${index}`,
          payload: { index },
          idempotencyKey: `domain-concurrency-${index}`,
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
      ),
    );
    await emails.save(
      Array.from({ length: 10 }, (_, index) =>
        emails.create({
          organizationId: organizationA.id,
          tenantId: organizationA.id,
          recipient: `recipient-${index}@example.test`,
          template: 'organization.invitation',
          payload: { index },
          idempotencyKey: `email-concurrency-${index}`,
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
      ),
    );

    const deliveries: Array<{
      worker: string;
      message: CommercialOutboxMessage;
      context: CommercialOutboxDeliveryContext;
    }> = [];
    const arrived = new Set<string>();
    let release: (() => void) | undefined;
    const bothWorkersClaimed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport = (worker: string): CommercialOutboxTransport => ({
      deliver: async (message, context) => {
        deliveries.push({ worker, message, context });
        arrived.add(worker);
        if (arrived.size === 2) release?.();
        await bothWorkersClaimed;
      },
    });

    const summaries = await Promise.all([
      dispatcher('worker-a', transport('worker-a')).dispatchOnce(),
      dispatcher('worker-b', transport('worker-b')).dispatchOnce(),
    ]);

    expect(summaries.map((summary) => summary.claimed).sort()).toEqual([
      10, 10,
    ]);
    expect(summaries.reduce((total, summary) => total + summary.sent, 0)).toBe(
      20,
    );
    expect(new Set(deliveries.map(({ message }) => message.id)).size).toBe(20);
    expect(new Set(deliveries.map(({ worker }) => worker))).toEqual(
      new Set(['worker-a', 'worker-b']),
    );
    for (const { message, context } of deliveries) {
      expect(context.idempotencyKey).toBe(message.idempotencyKey);
      expect(context.attemptCount).toBe(1);
    }

    const persisted = [...(await domains.find()), ...(await emails.find())];
    expect(persisted).toHaveLength(20);
    expect(
      persisted.every(
        (row) =>
          row.status === 'sent' &&
          row.attemptCount === 1 &&
          row.sentAt instanceof Date &&
          row.lockedAt === null &&
          row.lockOwner === null,
      ),
    ).toBe(true);
  });

  it('recovers an expired lease with the stable key and persists only redacted failures', async () => {
    const domains = harness.dataSource.getRepository(DomainOutbox);
    const emails = harness.dataSource.getRepository(EmailOutbox);
    const expired = await domains.save(
      domains.create({
        organizationId: organizationA.id,
        tenantId: organizationA.id,
        type: 'design.document.saved',
        aggregateId: 'document-expired',
        payload: { version: 2 },
        idempotencyKey: 'domain-expired-lease',
        payloadHash: PAYLOAD_HASH,
        status: 'processing',
        attemptCount: 1,
        availableAt: new Date(0),
        lockedAt: new Date(Date.now() - 5_000),
        lockOwner: 'crashed-worker',
        lastError: null,
        sentAt: null,
        failedAt: null,
      }),
    );
    const delivered = jest
      .fn<
        Promise<void>,
        [CommercialOutboxMessage, CommercialOutboxDeliveryContext]
      >()
      .mockResolvedValue(undefined);
    await dispatcher('recovery-worker', { deliver: delivered }).dispatchOnce();
    expect(delivered).toHaveBeenCalledWith(
      expect.objectContaining({ id: expired.id }),
      expect.objectContaining({
        idempotencyKey: 'domain-expired-lease',
        attemptCount: 2,
      }),
    );
    await expect(
      domains.findOneByOrFail({ id: expired.id }),
    ).resolves.toMatchObject({
      status: 'sent',
      attemptCount: 2,
      lockOwner: null,
    });

    const failed = await emails.save(
      emails.create({
        organizationId: null,
        tenantId: null,
        recipient: 'pii.person@example.test',
        template: 'identity.reset-password',
        payload: { token: 'not-returned-to-logs' },
        idempotencyKey: 'email-redaction',
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
    const sensitiveUuid = 'ba957ab8-e4bf-4148-8202-0a04c9913ae1';
    const rejecting: CommercialOutboxTransport = {
      deliver: async () => {
        throw new Error(
          `provider rejected pii.person@example.test tenant=${sensitiveUuid} ` +
            'token=abcdefghijklmnopqrstuvwxyz123456789 password=super-secret',
        );
      },
    };
    const retrying = dispatcher('retry-worker', rejecting, { maxAttempts: 2 });
    await expect(retrying.dispatchOnce()).resolves.toMatchObject({ failed: 1 });
    const afterFirst = await emails.findOneByOrFail({ id: failed.id });
    expect(afterFirst).toMatchObject({ status: 'failed', attemptCount: 1 });
    expect(afterFirst.lastError).toContain('[redacted-email]');
    expect(afterFirst.lastError).toContain('token=[redacted]');
    expect(afterFirst.lastError).toContain('password=[redacted]');
    expect(afterFirst.lastError).not.toContain('pii.person@example.test');
    expect(afterFirst.lastError).not.toContain(sensitiveUuid);

    await emails.update(failed.id, { availableAt: new Date(0) });
    await expect(retrying.dispatchOnce()).resolves.toMatchObject({ dead: 1 });
    await expect(
      emails.findOneByOrFail({ id: failed.id }),
    ).resolves.toMatchObject({
      status: 'dead',
      attemptCount: 2,
      lockOwner: null,
    });
  });

  it('enforces tenant equality and organization foreign keys in PostgreSQL', async () => {
    const domains = harness.dataSource.getRepository(DomainOutbox);
    const invalidScope = domains.save(
      domains.create({
        organizationId: organizationA.id,
        tenantId: organizationB.id,
        type: 'design.document.saved',
        aggregateId: 'document-invalid-scope',
        payload: {},
        idempotencyKey: 'invalid-scope',
        payloadHash: PAYLOAD_HASH,
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockOwner: null,
        lastError: null,
        sentAt: null,
        failedAt: null,
      }),
    );
    await expect(invalidScope).rejects.toMatchObject({
      driverError: { code: '23514' },
    });

    const missingOrganizationId = randomUUID();
    const invalidForeignKey = domains.save(
      domains.create({
        organizationId: missingOrganizationId,
        tenantId: missingOrganizationId,
        type: 'design.document.saved',
        aggregateId: 'document-missing-organization',
        payload: {},
        idempotencyKey: 'invalid-foreign-key',
        payloadHash: PAYLOAD_HASH,
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockOwner: null,
        lastError: null,
        sentAt: null,
        failedAt: null,
      }),
    );
    await expect(invalidForeignKey).rejects.toMatchObject({
      driverError: { code: '23503' },
    });
  });
});
