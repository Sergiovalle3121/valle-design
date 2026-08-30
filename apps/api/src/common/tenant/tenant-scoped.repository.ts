import {
  DataSource,
  DeepPartial,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  IsNull,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { Provider } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * A TypeORM repository that AUTOMATICALLY injects `WHERE tenant_id = <ctx tenant>`
 * into every read it OVERRIDES (`find` / `findOne` / `findBy` / `findOneBy` /
 * `count` / `findAndCount` / `exists`) and stamps the tenant on `create`,
 * reading the active tenant from TenantContextService.
 *
 * EL CONTRATO HONESTO — qué cubre y qué NO cubre:
 * - Cubiertos: los siete métodos de lectura de arriba y `create`.
 * - NO cubiertos (delegan a Repository y salen SIN filtro de tenant):
 *   `findOneOrFail`, `findOneByOrFail`, `existsBy`, `countBy`,
 *   `findAndCountBy`, `update`, `delete`, `softDelete`, `restore`,
 *   `increment`, `decrement`, `sum`, `average`, `maximum`, `minimum` y todo
 *   `createQueryBuilder`. Quien use uno de ésos añade el predicado de tenant
 *   A MANO en el `where` (así lo hacen hoy los tres call sites que los usan)
 *   — no existe ningún helper mágico que lo haga por ti, y esta cabecera
 *   llegó a prometer dos (`withTenantScope()`, `applyScope()`) que nunca
 *   existieron en el repositorio. Extender la cobertura a los métodos de
 *   mutación es trabajo pendiente declarado, no un hecho.
 *
 * Notes:
 * - The tenant comes from the verified first-party session and membership
 *   (via TenantInterceptor → context), never the
 *   request body.
 * - DEFAULT (legacy) mode: if there is no tenant in context (e.g. system/seed)
 *   OR the entity has no `tenant_id` column, no filter is added — so existing
 *   single-tenant/admin flows are unaffected. This makes adoption additive.
 * - STRICT (fail-closed) mode, opt-in per provider (VD-TEN-001): when the
 *   entity HAS a tenant column and the context has NO tenant, reads are scoped
 *   to the system lane (`tenant IS NULL`) instead of running unscoped — a
 *   missing context can never read another tenant's rows. Entities without
 *   tenant column are unaffected.
 */
export interface TenantScopeOptions {
  /** Fail closed cuando falta tenant en contexto (lecturas → lane sistema). */
  strict?: boolean;
}

export class TenantScopedRepository<
  T extends ObjectLiteral,
> extends Repository<T> {
  private tenantCtx?: TenantContextService;
  private strict = false;

  setTenantContext(
    ctx: TenantContextService,
    options: TenantScopeOptions = {},
  ): this {
    this.tenantCtx = ctx;
    this.strict = options.strict === true;
    return this;
  }

  /**
   * El MISMO repositorio, atado a la transacción de `manager`.
   *
   * Sin esto, un servicio que quiera participar en una transacción ajena sólo
   * puede hacerlo con `manager.getRepository(Entity)`, que devuelve un
   * repositorio SIN el filtro de tenant — es decir, la forma más discreta que
   * existe de perder el aislamiento: el código se ve igual, las pruebas pasan y
   * el `WHERE tenant_id` sencillamente no está.
   *
   * Copia el contexto y el modo estricto, así que el repositorio transaccional
   * scopea exactamente igual que el original. Sin `manager`, devuelve `this`:
   * quien no participa en ninguna transacción no paga nada.
   */
  withManager(manager?: EntityManager): TenantScopedRepository<T> {
    if (!manager || manager === this.manager) return this;
    const bound = new TenantScopedRepository<T>(
      this.target,
      manager,
      manager.queryRunner,
    );
    if (this.tenantCtx) {
      bound.setTenantContext(this.tenantCtx, { strict: this.strict });
    }
    return bound;
  }

  /**
   * The PROPERTY name of the tenant column on this entity, or null if it has none.
   * Supports both conventions in the codebase: snake `tenant_id` (mayoría) and
   * camel `tenantId` (ai_*, sem_*, erp_journal_entries, …). Se filtra por nombre
   * de propiedad porque el `where` de TypeORM usa propiedades, no columnas DB.
   */
  private tenantProp(): string | null {
    const col = this.metadata.columns.find(
      (c) =>
        c.databaseName === 'tenant_id' ||
        c.propertyName === 'tenant_id' ||
        c.databaseName === 'tenantId' ||
        c.propertyName === 'tenantId',
    );
    return col ? col.propertyName : null;
  }

  /** The tenant filter to apply, or null when scoping should not be applied. */
  private tenantFilter(): FindOptionsWhere<T> | null {
    const tenant = this.tenantCtx?.getTenantId() ?? null;
    const prop = this.tenantProp();
    if (!prop) return null;
    if (!tenant) {
      // Strict: sin tenant en contexto solo se ve el lane de sistema
      // (tenant IS NULL) — nunca filas de otros tenants. Legacy: sin filtro.
      return this.strict
        ? ({ [prop]: IsNull() } as unknown as FindOptionsWhere<T>)
        : null;
    }
    return { [prop]: tenant } as unknown as FindOptionsWhere<T>;
  }

  private mergeWhere(where: unknown): unknown {
    const tf = this.tenantFilter();
    if (!tf) return where;
    if (where === undefined || where === null) return tf;
    if (Array.isArray(where)) {
      // OR-array of conditions: scope each branch by tenant (AND).
      return where.map((w) => ({ ...(w as object), ...tf }));
    }
    return { ...where, ...tf };
  }

  /**
   * Estampa el tenant del contexto en un entityLike ANTES de crear/guardar,
   * si la entidad tiene columna de tenant y el caller no la fijó ya. Cierra
   * la asimetría histórica del repo scoped: leía filtrado por tenant pero
   * escribía NULL (registros invisibles al activar tenancy). ADR §146.
   */
  private stampTenant<E extends DeepPartial<T>>(entityLike: E): E {
    const tenant = this.tenantCtx?.getTenantId() ?? null;
    const prop = this.tenantProp();
    if (!tenant || !prop) return entityLike;
    const rec = entityLike as Record<string, unknown>;
    if (rec[prop] !== undefined && rec[prop] !== null) return entityLike;
    // Copia, no mutación: el objeto es del llamante y estampar sobre él era
    // un efecto lateral observable (un DTO reutilizado quedaba con el tenant
    // de la primera llamada pegado).
    return { ...rec, [prop]: tenant } as E;
  }

  override create(): T;
  override create(entityLike: DeepPartial<T>): T;
  override create(entityLikeArray: DeepPartial<T>[]): T[];
  override create(entityLike?: DeepPartial<T> | DeepPartial<T>[]): T | T[] {
    if (entityLike === undefined) return super.create();
    if (Array.isArray(entityLike)) {
      return super.create(entityLike.map((e) => this.stampTenant(e)));
    }
    return super.create(this.stampTenant(entityLike));
  }

  override find(options?: FindManyOptions<T>): Promise<T[]> {
    return super.find({
      ...(options ?? {}),
      where: this.mergeWhere(options?.where) as FindOptionsWhere<T>,
    });
  }

  override findAndCount(options?: FindManyOptions<T>): Promise<[T[], number]> {
    return super.findAndCount({
      ...(options ?? {}),
      where: this.mergeWhere(options?.where) as FindOptionsWhere<T>,
    });
  }

  override findOne(options: FindOneOptions<T>): Promise<T | null> {
    return super.findOne({
      ...options,
      where: this.mergeWhere(options.where) as FindOptionsWhere<T>,
    });
  }

  override count(options?: FindManyOptions<T>): Promise<number> {
    return super.count({
      ...(options ?? {}),
      where: this.mergeWhere(options?.where) as FindOptionsWhere<T>,
    });
  }

  override findBy(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): Promise<T[]> {
    return super.findBy(this.mergeWhere(where) as FindOptionsWhere<T>);
  }

  override findOneBy(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): Promise<T | null> {
    return super.findOneBy(this.mergeWhere(where) as FindOptionsWhere<T>);
  }

  override exists(options?: FindManyOptions<T>): Promise<boolean> {
    return super.exists({
      ...(options ?? {}),
      where: this.mergeWhere(options?.where) as FindOptionsWhere<T>,
    });
  }
}

/** Factory: build a tenant-scoped repository bound to a context + manager. */
export function createTenantScopedRepository<T extends ObjectLiteral>(
  entity: EntityTarget<T>,
  manager: EntityManager,
  ctx: TenantContextService,
  options: TenantScopeOptions = {},
): TenantScopedRepository<T> {
  const repo = new TenantScopedRepository<T>(
    entity,
    manager,
    manager.queryRunner,
  );
  return repo.setTenantContext(ctx, options);
}

/** Injection token for a tenant-scoped repository of `entity`. */
export function getTenantRepositoryToken(
  entity: EntityTarget<ObjectLiteral>,
): string {
  const name =
    typeof entity === 'function'
      ? entity.name
      : typeof entity === 'string'
        ? entity
        : // Un esquema sin nombre produciría el token '[object Object]' para
          // TODOS los anónimos — colisión de inyección silenciosa. Se nombra
          // el caso en vez de dejar que String() lo tape.
          ((entity as { name?: string }).name ?? 'anonymous-entity');
  return `TENANT_SCOPED_REPOSITORY_${name}`;
}

/**
 * NestJS provider for a tenant-scoped repository. Inject it in a service with
 * `@Inject(getTenantRepositoryToken(Entity))`.
 */
export function provideTenantScopedRepository(
  entity: EntityTarget<ObjectLiteral>,
  options: TenantScopeOptions = {},
): Provider {
  return {
    provide: getTenantRepositoryToken(entity),
    inject: [DataSource, TenantContextService],
    useFactory: (dataSource: DataSource, ctx: TenantContextService) =>
      createTenantScopedRepository(entity, dataSource.manager, ctx, options),
  };
}
