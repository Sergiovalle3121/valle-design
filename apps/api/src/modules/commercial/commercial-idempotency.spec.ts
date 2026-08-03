import { DataSource } from 'typeorm';
import {
  CommercialTenantScopeError,
  PostgresCadEventPublisher,
  PostgresEmailService,
  PostgresUsageMeter,
} from './adapters/postgres.adapters';
import {
  DomainOutbox,
  EmailOutbox,
  UsageLedger,
} from './entities/commercial.entities';
import { IdempotencyConflictError } from './payload-hash';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';

const ORGANIZATION_ID = '2dbb26f1-1e6e-48fe-a114-55cab78d94a5';

describe('commercial idempotency', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [User, Organization, UsageLedger, DomainOutbox, EmailOutbox],
      synchronize: true,
    });
    await dataSource.initialize();
    const user = await dataSource.getRepository(User).save({
      email: 'owner@example.test',
      displayName: 'Owner',
      emailVerifiedAt: new Date(),
    });
    await dataSource.getRepository(Organization).save({
      id: ORGANIZATION_ID,
      name: 'Organization',
      slug: 'organization',
      ownerUserId: user.id,
    });
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('replays identical usage once and rejects a different quantity', async () => {
    const meter = new PostgresUsageMeter();
    const base = {
      organizationId: ORGANIZATION_ID,
      tenantId: ORGANIZATION_ID,
      metric: 'design.document.saved',
      idempotencyKey: 'usage-1',
    };
    await dataSource.transaction(async (native) => {
      await meter.record(base, { native });
      await meter.record({ ...base, quantity: 1 }, { native });
    });
    await expect(
      dataSource.transaction((native) =>
        meter.record({ ...base, quantity: 2 }, { native }),
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(dataSource.getRepository(UsageLedger).count()).resolves.toBe(
      1,
    );
  });

  it('rejects a reused domain-event key with a different payload', async () => {
    const publisher = new PostgresCadEventPublisher();
    const base = {
      organizationId: ORGANIZATION_ID,
      tenantId: ORGANIZATION_ID,
      type: 'design.document.saved',
      aggregateId: 'doc-1',
      payload: { version: 1, nested: { b: 2, a: 1 } },
      idempotencyKey: 'event-1',
    };
    await dataSource.transaction((native) =>
      publisher.publish(base, { native }),
    );
    await dataSource.transaction((native) =>
      publisher.publish(
        { ...base, payload: { nested: { a: 1, b: 2 }, version: 1 } },
        { native },
      ),
    );
    await expect(
      dataSource.transaction((native) =>
        publisher.publish({ ...base, payload: { version: 2 } }, { native }),
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(dataSource.getRepository(DomainOutbox).count()).resolves.toBe(
      1,
    );
  });

  it('supports pre-organization email and rejects conflicting key reuse', async () => {
    const email = new PostgresEmailService();
    const base = {
      organizationId: null,
      tenantId: null,
      to: 'person@example.test',
      template: 'identity.verify-email',
      payload: { token: 'test-only-token' },
      idempotencyKey: 'email-1',
    };
    await dataSource.transaction((native) => email.enqueue(base, { native }));
    await dataSource.transaction((native) => email.enqueue(base, { native }));
    await expect(
      dataSource.transaction((native) =>
        email.enqueue({ ...base, to: 'other@example.test' }, { native }),
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    const row = await dataSource.getRepository(EmailOutbox).findOneByOrFail({
      idempotencyKey: base.idempotencyKey,
    });
    expect(row.organizationId).toBeNull();
    expect(row.tenantId).toBeNull();
  });

  it('rejects mixed organization/tenant scopes before writing any ledger or outbox row', async () => {
    const otherTenant = '13a65786-10b9-4471-a941-8257051715b8';
    const usage = new PostgresUsageMeter();
    const events = new PostgresCadEventPublisher();
    const email = new PostgresEmailService();

    await expect(
      dataSource.transaction((native) =>
        usage.record(
          {
            organizationId: ORGANIZATION_ID,
            tenantId: otherTenant,
            metric: 'design.document.saved',
            idempotencyKey: 'mixed-scope-usage',
          },
          { native },
        ),
      ),
    ).rejects.toBeInstanceOf(CommercialTenantScopeError);
    await expect(
      dataSource.transaction((native) =>
        events.publish(
          {
            organizationId: ORGANIZATION_ID,
            tenantId: otherTenant,
            type: 'design.document.saved',
            aggregateId: 'document-1',
            payload: {},
            idempotencyKey: 'mixed-scope-event',
          },
          { native },
        ),
      ),
    ).rejects.toBeInstanceOf(CommercialTenantScopeError);
    await expect(
      dataSource.transaction((native) =>
        email.enqueue(
          {
            organizationId: ORGANIZATION_ID,
            tenantId: null,
            to: 'person@example.test',
            template: 'organization.invitation',
            payload: {},
            idempotencyKey: 'mixed-scope-email',
          },
          { native },
        ),
      ),
    ).rejects.toBeInstanceOf(CommercialTenantScopeError);

    await expect(
      dataSource.getRepository(UsageLedger).findOneBy({
        idempotencyKey: 'mixed-scope-usage',
      }),
    ).resolves.toBeNull();
    await expect(
      dataSource.getRepository(DomainOutbox).findOneBy({
        idempotencyKey: 'mixed-scope-event',
      }),
    ).resolves.toBeNull();
    await expect(
      dataSource.getRepository(EmailOutbox).findOneBy({
        idempotencyKey: 'mixed-scope-email',
      }),
    ).resolves.toBeNull();
  });
});
