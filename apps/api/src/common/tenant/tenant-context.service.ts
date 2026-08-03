import { ForbiddenException, Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { UserScopes } from '../types/authenticated-user.types';

/**
 * Lanzada cuando una operación sobre datos tenant-owned se ejecuta sin tenant
 * en el contexto autenticado. Extiende ForbiddenException para que los flujos
 * HTTP respondan 403 sin mapeo adicional; en jobs/system es un error normal.
 */
export class MissingTenantContextError extends ForbiddenException {
  constructor(operation?: string) {
    super(
      `Operación tenant-owned sin tenant en el contexto autenticado${
        operation ? `: ${operation}` : ''
      }. El tenant debe venir de la sesión y membresía verificadas (nunca del body/query) y estar presente antes de tocar datos de negocio.`,
    );
  }
}

export interface TenantContext {
  tenant_id: string | null;
  organization_id: string | null;
  plant_id: string | null;
  user_email: string;
  role: string | null;
  permissions: string[] | null;
  scopes: UserScopes | null;
}

/**
 * Contexto autenticado del request/job en curso (AsyncLocalStorage).
 * Valle Design es multi-tenant: `organization.id` es el tenant (ADR-0005) y
 * el contexto sólo se abre después de validar la membresía server-side.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  get(): TenantContext | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string | null {
    return this.storage.getStore()?.tenant_id ?? null;
  }

  /**
   * Variante fail-closed: devuelve el tenant activo o lanza
   * MissingTenantContextError. Úsala en servicios que NUNCA deben operar
   * sobre datos tenant-owned sin tenant (prohibido cualquier fallback).
   */
  requireTenantId(operation?: string): string {
    const tenant = this.getTenantId();
    if (!tenant) throw new MissingTenantContextError(operation);
    return tenant;
  }

  getOrganizationId(): string | null {
    return this.storage.getStore()?.organization_id ?? null;
  }

  getPlantId(): string | null {
    return this.storage.getStore()?.plant_id ?? null;
  }

  getUserEmail(): string {
    return this.storage.getStore()?.user_email ?? 'anonymous';
  }

  getRole(): string | null {
    return this.storage.getStore()?.role ?? null;
  }

  getPermissions(): string[] | null {
    return this.storage.getStore()?.permissions ?? null;
  }

  getScopes(): UserScopes | null {
    return this.storage.getStore()?.scopes ?? null;
  }

  hasPermission(permission: string): boolean {
    return this.storage.getStore()?.permissions?.includes(permission) ?? false;
  }

  isAdmin(): boolean {
    return this.storage.getStore()?.role === 'Admin';
  }
}
