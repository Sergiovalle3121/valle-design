import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type {
  CadEventPublisher,
  EmailService,
  EntitlementContext,
  EntitlementService,
  SubscriptionProvider,
  TransactionContext,
  UsageMeter,
} from '../ports/commercial.ports';
import {
  DomainOutbox,
  EmailOutbox,
  PlanCatalog,
  PlanEntitlement,
  Subscription,
  UsageLedger,
} from '../entities/commercial.entities';
import {
  commercialPayloadHash,
  IdempotencyConflictError,
} from '../payload-hash';

function manager(tx: TransactionContext): EntityManager {
  if (!(tx.native instanceof EntityManager)) {
    throw new Error('Se requiere una transacción PostgreSQL activa.');
  }
  return tx.native;
}

export class CommercialTenantScopeError extends Error {
  constructor() {
    super(
      'Commercial organization and tenant scope must identify the same organization.',
    );
    this.name = 'CommercialTenantScopeError';
  }
}

function validTenantScope(
  organizationId: string | null | undefined,
  tenantId: string | null | undefined,
): boolean {
  return !!organizationId && organizationId === tenantId;
}

function assertTenantScope(
  organizationId: string | null,
  tenantId: string | null,
  nullable: boolean,
): void {
  if (nullable && organizationId === null && tenantId === null) return;
  if (!validTenantScope(organizationId, tenantId)) {
    throw new CommercialTenantScopeError();
  }
}

@Injectable()
export class PostgresSubscriptionProvider implements SubscriptionProvider {
  constructor(private readonly db: DataSource) {}

  async currentSubscription(context: EntitlementContext) {
    if (
      !context.organizationId ||
      context.organizationId !== context.tenantId
    ) {
      return null;
    }
    const row = await this.db.getRepository(Subscription).findOne({
      where: {
        organizationId: context.organizationId,
        tenantId: context.tenantId,
      },
    });
    return row
      ? {
          planCode: row.planCode,
          status: row.status,
          trialEndsAt: row.trialEndsAt,
        }
      : null;
  }
}

@Injectable()
export class PostgresEntitlementService implements EntitlementService {
  constructor(private readonly db: DataSource) {}

  async hasEntitlement(code: string, context: EntitlementContext = {}) {
    if (
      !context.organizationId ||
      context.organizationId !== context.tenantId
    ) {
      return false;
    }
    const now = context.now ?? new Date();
    const entitled = await this.db
      .getRepository(Subscription)
      .createQueryBuilder('subscription')
      .innerJoin(
        PlanCatalog,
        'plan',
        'plan.code = subscription.planCode AND plan.active = :planActive',
        { planActive: true },
      )
      .innerJoin(
        PlanEntitlement,
        'entitlement',
        'entitlement.planCode = plan.code AND entitlement.entitlementCode = :code',
        { code },
      )
      .where('subscription.organizationId = :organizationId', {
        organizationId: context.organizationId,
      })
      .andWhere('subscription.tenantId = :tenantId', {
        tenantId: context.tenantId,
      })
      .andWhere(
        '(subscription.status = :active OR (subscription.status = :trialing AND subscription.trialEndsAt > :now))',
        { active: 'active', trialing: 'trialing', now },
      )
      .select('1', 'entitled')
      .limit(1)
      .getRawOne<{ entitled: number }>();
    return !!entitled;
  }
}

@Injectable()
export class PostgresUsageMeter implements UsageMeter {
  async record(
    input: Parameters<UsageMeter['record']>[0],
    tx: TransactionContext,
  ) {
    assertTenantScope(input.organizationId, input.tenantId, false);
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('La cantidad de uso debe ser un entero positivo.');
    }
    const payloadHash = commercialPayloadHash({ ...input, quantity });
    const repository = manager(tx).getRepository(UsageLedger);
    await repository
      .createQueryBuilder()
      .insert()
      .values({
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        metric: input.metric,
        quantity,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
      })
      .orIgnore()
      .execute();
    const persisted = await repository.findOneByOrFail({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
    });
    assertMatchingPayload(
      persisted.payloadHash,
      payloadHash,
      input.idempotencyKey,
    );
  }
}

@Injectable()
export class PostgresCadEventPublisher implements CadEventPublisher {
  async publish(
    input: Parameters<CadEventPublisher['publish']>[0],
    tx: TransactionContext,
  ) {
    assertTenantScope(input.organizationId, input.tenantId, false);
    const payloadHash = commercialPayloadHash(input);
    const repository = manager(tx).getRepository(DomainOutbox);
    await repository
      .createQueryBuilder()
      .insert()
      .values({
        ...input,
        payload: input.payload as object,
        payloadHash,
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockOwner: null,
        lastError: null,
        sentAt: null,
        failedAt: null,
      })
      .orIgnore()
      .execute();
    const persisted = await repository.findOneByOrFail({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
    });
    assertMatchingPayload(
      persisted.payloadHash,
      payloadHash,
      input.idempotencyKey,
    );
  }
}

@Injectable()
export class PostgresEmailService implements EmailService {
  async enqueue(
    input: Parameters<EmailService['enqueue']>[0],
    tx: TransactionContext,
  ) {
    assertTenantScope(input.organizationId, input.tenantId, true);
    const payloadHash = commercialPayloadHash(input);
    const repository = manager(tx).getRepository(EmailOutbox);
    await repository
      .createQueryBuilder()
      .insert()
      .values({
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        recipient: input.to,
        template: input.template,
        payload: input.payload as object,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockOwner: null,
        lastError: null,
        sentAt: null,
        failedAt: null,
      })
      .orIgnore()
      .execute();
    const persisted = await repository.findOneByOrFail({
      idempotencyKey: input.idempotencyKey,
    });
    assertMatchingPayload(
      persisted.payloadHash,
      payloadHash,
      input.idempotencyKey,
    );
  }
}

function assertMatchingPayload(
  persistedHash: string,
  requestedHash: string,
  idempotencyKey: string,
): void {
  if (persistedHash !== requestedHash) {
    throw new IdempotencyConflictError(idempotencyKey);
  }
}
