import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { IdentityRateLimit } from './entities/identity.entity';
import { PostgresIdentityRateLimitStore } from './postgres-identity-rate-limit.store';

describePostgres('PostgresIdentityRateLimitStore', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await createPostgresHarness([IdentityRateLimit], {
      schemaPrefix: 'identity_rate_limit',
    });
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  it('shares an atomic cap across API replicas and bounds the persisted count', async () => {
    const replicas = [
      new PostgresIdentityRateLimitStore(harness.dataSource),
      new PostgresIdentityRateLimitStore(harness.dataSource),
    ];
    const decisions = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        replicas[index % replicas.length].consume(
          'identity:test:opaque',
          8,
          60_000,
        ),
      ),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(8);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(32);
    expect(decisions.every((decision) => decision.retryAfterMs > 0)).toBe(true);

    const row = await harness.dataSource
      .getRepository(IdentityRateLimit)
      .findOneByOrFail({ key: 'identity:test:opaque' });
    expect(row.count).toBe(9);
  });

  it('starts a new window after expiry and purges expired opaque keys', async () => {
    const store = new PostgresIdentityRateLimitStore(harness.dataSource);
    expect((await store.consume('identity:old', 1, 5)).allowed).toBe(true);
    await harness.dataSource.query('SELECT pg_sleep(0.02)');
    expect((await store.consume('identity:new', 1, 60_000)).allowed).toBe(true);
    expect(
      await harness.dataSource
        .getRepository(IdentityRateLimit)
        .findOneBy({ key: 'identity:old' }),
    ).toBeNull();
  });
});
