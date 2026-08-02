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
  Subscription,
  UsageLedger,
} from '../entities/commercial.entities';
function manager(tx: TransactionContext): EntityManager {
  if (!(tx.native instanceof EntityManager))
    throw new Error('Se requiere una transacción PostgreSQL activa.');
  return tx.native;
}
@Injectable()
export class PostgresSubscriptionProvider implements SubscriptionProvider {
  constructor(private readonly db: DataSource) {}
  async currentSubscription(c: EntitlementContext) {
    if (!c.organizationId) return null;
    const row = await this.db
      .getRepository(Subscription)
      .findOne({ where: { organizationId: c.organizationId } });
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
  async hasEntitlement(code: string, c: EntitlementContext = {}) {
    if (
      process.env.ENTITLEMENTS_MODE !== 'platform-api' &&
      process.env.NODE_ENV !== 'production'
    )
      return true;
    if (!c.organizationId || !c.tenantId) return false;
    const now = c.now ?? new Date();
    const rows = await this.db.query(
      `SELECT 1 FROM subscriptions s JOIN plan_catalog p ON p.code=s.plan_code AND p.active=true JOIN plan_entitlements e ON e.plan_code=p.code WHERE s.organization_id=$1 AND s.tenant_id=$2 AND e.entitlement_code=$3 AND (s.status='active' OR (s.status='trialing' AND s.trial_ends_at > $4)) LIMIT 1`,
      [c.organizationId, c.tenantId, code, now],
    );
    return rows.length > 0;
  }
}
@Injectable()
export class PostgresUsageMeter implements UsageMeter {
  async record(i: Parameters<UsageMeter['record']>[0], tx: TransactionContext) {
    await manager(tx)
      .getRepository(UsageLedger)
      .createQueryBuilder()
      .insert()
      .values({
        organizationId: i.organizationId,
        tenantId: i.tenantId,
        metric: i.metric,
        quantity: i.quantity ?? 1,
        idempotencyKey: i.idempotencyKey,
      })
      .orIgnore()
      .execute();
  }
}
@Injectable()
export class PostgresCadEventPublisher implements CadEventPublisher {
  async publish(
    i: Parameters<CadEventPublisher['publish']>[0],
    tx: TransactionContext,
  ) {
    await manager(tx)
      .getRepository(DomainOutbox)
      .createQueryBuilder()
      .insert()
      .values({
        ...i,
        payload: i.payload as object,
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        sentAt: null,
      })
      .orIgnore()
      .execute();
  }
}
@Injectable()
export class PostgresEmailService implements EmailService {
  async enqueue(
    i: Parameters<EmailService['enqueue']>[0],
    tx: TransactionContext,
  ) {
    await manager(tx)
      .getRepository(EmailOutbox)
      .createQueryBuilder()
      .insert()
      .values({
        organizationId: i.organizationId,
        tenantId: i.tenantId,
        recipient: i.to,
        template: i.template,
        payload: i.payload as object,
        idempotencyKey: i.idempotencyKey,
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        sentAt: null,
      })
      .orIgnore()
      .execute();
  }
}
