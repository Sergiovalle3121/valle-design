import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../../common/testing/postgres-harness';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.types';
import { User } from '../../identity/entities/identity.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { PostgresEntitlementService } from '../../commercial/adapters/postgres.adapters';
import {
  PlanCatalog,
  PlanEntitlement,
  Subscription,
} from '../../commercial/entities/commercial.entities';
import { PermissionsGuard } from './permissions.guard';

/**
 * LA REGLA DE ORO, contra PostgreSQL REAL — los datos del usuario JAMÁS
 * quedan rehenes.
 *
 * Estas comprobaciones no podían vivir en SQLite. Lo que se ejerce es la
 * consulta de VENCIMIENTO (`lapsedEntitlement`) con `timestamptz` de verdad:
 * dos fechas en el pasado, una `NULL`, un plan que dejó de publicar la
 * capacidad. En SQLite las fechas son texto y la comparación la arbitra una
 * conversión distinta de la de producción; una suite verde ahí no probaría
 * que el arquitecto puede abrir sus planos el día 91.
 *
 * Los cuatro estados que importan, en orden de qué le pasa a una persona:
 *
 * 1. Prueba VIGENTE → edita (control: la regla no cambió nada para quien paga).
 * 2. Prueba VENCIDA → abre y exporta (`cad:view` sobrevive) pero no edita.
 * 3. NUNCA contrató → 403 completo, igual que siempre. Esto no abre el
 *    producto a un desconocido: le devuelve su trabajo a un cliente.
 * 4. Vencida SIN fecha registrada → 403 completo. Sin vencimiento PROBADO no
 *    hay concesión: fallo cerrado.
 */
describePostgres(
  'Guard de entitlement — modo solo-lectura post-expiración',
  () => {
    jest.setTimeout(60_000);

    let harness: PostgresHarness;
    let guard: PermissionsGuard;
    let entitlements: PostgresEntitlementService;
    let organizationId: string;

    const PLAN = 'standalone-trial';

    beforeAll(async () => {
      harness = await createPostgresHarness(
        [User, Organization, PlanCatalog, PlanEntitlement, Subscription],
        { schemaPrefix: 'entitlement_read_only' },
      );
      entitlements = new PostgresEntitlementService(harness.dataSource);
      guard = new PermissionsGuard(
        new Reflector(),
        new TenantContextService(),
        entitlements,
      );
    });

    afterAll(async () => {
      if (harness) await harness.destroy();
    });

    beforeEach(async () => {
      await harness.truncateAll();
      const owner = await harness.dataSource.getRepository(User).save(
        harness.dataSource.getRepository(User).create({
          email: `lapse-owner-${randomUUID()}@example.test`,
        }),
      );
      organizationId = (
        await harness.dataSource.getRepository(Organization).save(
          harness.dataSource.getRepository(Organization).create({
            name: 'Despacho con prueba vencida',
            slug: `lapse-${randomUUID()}`,
            ownerUserId: owner.id,
          }),
        )
      ).id;
      await harness.dataSource
        .getRepository(PlanCatalog)
        .save({ code: PLAN, active: true, metadata: { kind: 'trial' } });
      await harness.dataSource
        .getRepository(PlanEntitlement)
        .save({ planCode: PLAN, entitlementCode: 'design.cad' });
    });

    /** Suscripción de prueba con el fin donde el caso lo necesite. */
    async function subscribe(trialEndsAt: Date | null): Promise<void> {
      await harness.dataSource.getRepository(Subscription).save({
        organizationId,
        tenantId: organizationId,
        planCode: PLAN,
        status: 'trialing',
        trialEndsAt,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        seats: 1,
      });
    }

    /**
     * Contexto de ejecución mínimo pero HONESTO: los permisos exigidos los
     * entrega un `Reflector` real leyendo la metadata que el decorador escribe,
     * no un mock que devuelve lo que el test quiera.
     */
    function contextFor(permissions: string[]): {
      context: ExecutionContext;
      request: Record<string, unknown>;
    } {
      const user: AuthenticatedUser = {
        userId: 'arquitecta',
        email: 'arquitecta@example.test',
        role: 'member',
        tenant_id: organizationId,
        organization_id: organizationId,
        plant_id: null,
        permissions: ['cad:view', 'cad:edit'],
        scopes: null,
      };
      const request: Record<string, unknown> = {
        user,
        method: 'GET',
        path: '/v1/cad/documents',
      };
      class Handler {}
      Reflect.defineMetadata('permissions', permissions, Handler);
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => Handler,
        getClass: () => Handler,
      } as unknown as ExecutionContext;
      return { context, request };
    }

    const days = (n: number) => new Date(Date.now() + n * 86_400_000);

    it('1. con la prueba VIGENTE, edita: la regla no le quita nada a quien está al corriente', async () => {
      await subscribe(days(30));
      const { context } = contextFor(['cad:edit']);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('2. con la prueba VENCIDA, ABRE Y EXPORTA — cad:view sobrevive al vencimiento', async () => {
      await subscribe(days(-1));
      // `cad:view` es el permiso que exigen GET /documents/:id y
      // GET /documents/:id/export/dxf: si este caso se pone rojo, el usuario
      // perdió el acceso a sus propios planos.
      const { context, request } = contextFor(['cad:view']);
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.entitlementLapse).toMatchObject({
        planCode: PLAN,
        reason: 'trial_ended',
      });
    });

    it('2b. con la prueba VENCIDA, NO edita — y el 403 dice por qué, no «no autorizado»', async () => {
      await subscribe(days(-1));
      const { context } = contextFor(['cad:edit']);
      const error = await guard
        .canActivate(context)
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(ForbiddenException);
      const body = (error as ForbiddenException).getResponse() as {
        code: string;
        message: string;
        details: { reason: string; lapseReason: string; lapsedAt: string };
      };
      expect(body.code).toBe('entitlement_required');
      expect(body.details.reason).toBe('read_only_after_lapse');
      expect(body.details.lapseReason).toBe('trial_ended');
      expect(Date.parse(body.details.lapsedAt)).toBeLessThan(Date.now());
      // El mensaje tiene que decirle a una persona qué SIGUE funcionando.
      expect(body.message).toContain('exportando');
    });

    it('2c. una petición mixta (ver + editar) se deniega entera: el modo es de LECTURA', async () => {
      await subscribe(days(-1));
      const { context } = contextFor(['cad:view', 'cad:edit']);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('3. quien NUNCA contrató sigue viendo el 403 completo, también para leer', async () => {
      // Sin fila de suscripción: no hay nada que haya vencido.
      const { context } = contextFor(['cad:view']);
      const error = await guard
        .canActivate(context)
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(
        (
          (error as ForbiddenException).getResponse() as {
            details: { reason: string };
          }
        ).details.reason,
      ).toBe('not_entitled');
    });

    it('4. vencida SIN fecha registrada: sin vencimiento probado no hay concesión', async () => {
      await subscribe(null);
      const { context } = contextFor(['cad:view']);
      const error = await guard
        .canActivate(context)
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(
        (
          (error as ForbiddenException).getResponse() as {
            details: { reason: string };
          }
        ).details.reason,
      ).toBe('not_entitled');
    });

    it('5. si el operador retira design.cad del plan, no queda nada que conservar', async () => {
      await subscribe(days(-1));
      await harness.dataSource
        .getRepository(PlanEntitlement)
        .delete({ planCode: PLAN, entitlementCode: 'design.cad' });
      const { context } = contextFor(['cad:view']);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('6. el vencimiento que se reporta es el MÁS RECIENTE de prueba y periodo', async () => {
      await harness.dataSource.getRepository(Subscription).save({
        organizationId,
        tenantId: organizationId,
        planCode: PLAN,
        status: 'active',
        trialEndsAt: days(-40),
        currentPeriodEnd: days(-2),
        cancelAtPeriodEnd: false,
        seats: 1,
      });
      const lapse = await entitlements.lapsedEntitlement('design.cad', {
        tenantId: organizationId,
        organizationId,
      });
      expect(lapse?.reason).toBe('period_ended');
      expect(lapse!.lapsedAt.getTime()).toBeGreaterThan(days(-3).getTime());
    });

    it('7. un fallo del almacén NUNCA concede lectura: falla cerrado', async () => {
      await subscribe(days(-1));
      const rota = {
        hasEntitlement: async () => false,
        lapsedEntitlement: async () => {
          throw new Error('la base se cayó a media consulta');
        },
      };
      const guardRoto = new PermissionsGuard(
        new Reflector(),
        new TenantContextService(),
        rota,
      );
      const { context } = contextFor(['cad:view']);
      await expect(guardRoto.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('8. un adaptador SIN el método conserva el comportamiento anterior', async () => {
      await subscribe(days(-1));
      const guardViejo = new PermissionsGuard(
        new Reflector(),
        new TenantContextService(),
        { hasEntitlement: async () => false },
      );
      const { context } = contextFor(['cad:view']);
      await expect(guardViejo.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  },
);
