import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type {
  CadEventPublisher,
  EmailService,
  EntitlementContext,
  EntitlementService,
  LapsedEntitlement,
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
      // `active` no basta por sí solo (P0-B, campaña de seguridad
      // 2026-08-23): el estado dice que hubo un ciclo de cobro, no que el
      // período YA PAGADO siga vigente — sin comparar `currentPeriodEnd`
      // contra el reloj, una suscripción cuya renovación falló (o que nunca
      // tuvo un período registrado) seguía concediendo `design.cad`. La
      // comparación es UTC contra UTC: las columnas `timestamptz` de
      // PostgreSQL normalizan a UTC en el almacenamiento y `:now` llega como
      // un `Date` (instante absoluto, sin zona), así que no hace falta
      // convertir nada aquí. `currentPeriodEnd IS NULL` hace que
      // `currentPeriodEnd > :now` evalúe a UNKNOWN en PostgreSQL —ni
      // verdadero ni falso— y el WHERE lo descarta igual que si fuera falso:
      // ausencia de vigencia probada falla cerrado sin necesitar un
      // `IS NOT NULL` explícito.
      .andWhere(
        '((subscription.status = :active AND subscription.currentPeriodEnd > :now) OR (subscription.status = :trialing AND subscription.trialEndsAt > :now))',
        { active: 'active', trialing: 'trialing', now },
      )
      .select('1', 'entitled')
      .limit(1)
      .getRawOne<{ entitled: number }>();
    return !!entitled;
  }

  /**
   * LA REGLA DE ORO — ¿esto es una prueba vencida o alguien que nunca contrató?
   *
   * La consulta es la MISMA de `hasEntitlement` con la vigencia invertida: el
   * plan tiene que seguir publicando `design.cad` (si el operador retiró la
   * capacidad del plan, no hay nada que conservar) y la suscripción tiene que
   * existir con una fecha REAL en el pasado. Sin fecha registrada no hay
   * vencimiento probado y se responde `null`: fallo cerrado, igual que arriba.
   *
   * `IS NOT NULL` sí es explícito aquí, al revés que en `hasEntitlement`. Allí
   * el `NULL` se descartaba solo porque `> :now` evalúa a UNKNOWN; aquí la
   * comparación es `<= :now`, que con `NULL` también da UNKNOWN — pero el
   * resultado que queremos de un `NULL` no es «descártalo por si acaso», es
   * «no sabemos cuándo venció», y decirlo con el predicado en vez de confiar
   * en la lógica ternaria es lo que hace que se lea igual dentro de un año.
   */
  async lapsedEntitlement(
    code: string,
    context: EntitlementContext = {},
  ): Promise<LapsedEntitlement | null> {
    if (
      !context.organizationId ||
      context.organizationId !== context.tenantId
    ) {
      return null;
    }
    const now = context.now ?? new Date();
    const row = await this.db
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
        '((subscription.trialEndsAt IS NOT NULL AND subscription.trialEndsAt <= :now) OR (subscription.currentPeriodEnd IS NOT NULL AND subscription.currentPeriodEnd <= :now))',
        { now },
      )
      .select([
        'subscription.planCode AS "planCode"',
        'subscription.status AS "status"',
        'subscription.trialEndsAt AS "trialEndsAt"',
        'subscription.currentPeriodEnd AS "currentPeriodEnd"',
      ])
      .limit(1)
      .getRawOne<{
        planCode: string;
        status: string;
        trialEndsAt: Date | null;
        currentPeriodEnd: Date | null;
      }>();
    if (!row) return null;

    // El vencimiento que manda es el MÁS RECIENTE de los dos: una cuenta que
    // pasó de prueba a periodo pagado y luego venció tiene las dos fechas en
    // el pasado, y la que el usuario reconoce es la última.
    const trialEnd = toPastDate(row.trialEndsAt, now);
    const periodEnd = toPastDate(row.currentPeriodEnd, now);
    if (!trialEnd && !periodEnd) return null;
    const usePeriod =
      !!periodEnd && (!trialEnd || periodEnd.getTime() >= trialEnd.getTime());
    return {
      planCode: row.planCode,
      status: row.status,
      lapsedAt: usePeriod ? periodEnd! : trialEnd!,
      reason: usePeriod ? 'period_ended' : 'trial_ended',
    };
  }
}

/** Una fecha sólo cuenta como vencimiento si es real y ya pasó. */
function toPastDate(value: Date | string | null, now: Date): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime() <= now.getTime() ? parsed : null;
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
