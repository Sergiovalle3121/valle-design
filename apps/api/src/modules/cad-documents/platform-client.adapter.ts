/**
 * Adaptadores in-proc de los puertos de plataforma (WP2c).
 *
 * Identidad sobre TenantContextService (ALS del request autenticado),
 * entitlements sobre EntitlementsService (autoridad única del acceso pagado) y
 * un medidor de uso no-op. En Fase 3 el repo Design los sustituye por clientes
 * de la API de plataforma sin tocar el dominio.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ProductCapabilityId } from '@axos/contracts';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import type {
  EntitlementClient,
  PlatformIdentityClient,
  UsageMeter,
} from './ports/platform-client.ports';

/** Identidad del contexto autenticado, leída del ALS de TenantContextService. */
@Injectable()
export class TenantContextIdentityClient implements PlatformIdentityClient {
  constructor(private readonly tenantCtx: TenantContextService) {}

  currentTenantId(): string | undefined {
    return this.tenantCtx.getTenantId() ?? undefined;
  }

  /** Sin fallback 'anonymous': fuera de contexto simplemente no hay actor. */
  currentUserEmail(): string | undefined {
    return this.tenantCtx.get()?.user_email;
  }

  currentPlantId(): string | undefined {
    return this.tenantCtx.getPlantId() ?? undefined;
  }
}

/**
 * Entitlements sobre la autoridad comercial real (EntitlementsService.
 * hasCapability). FAIL-CLOSED como manda ese módulo: sin tenant en contexto o
 * sin servicio disponible, la respuesta es false — nunca se regala acceso por
 * ausencia de dato.
 */
@Injectable()
export class EnterpriseEntitlementClient implements EntitlementClient {
  private readonly logger = new Logger(EnterpriseEntitlementClient.name);

  constructor(
    private readonly tenantCtx: TenantContextService,
    @Optional() private readonly entitlements?: EntitlementsService,
  ) {}

  async hasEntitlement(code: string): Promise<boolean> {
    const tenant = this.tenantCtx.getTenantId();
    if (!tenant) return false;
    if (!this.entitlements) {
      this.logger.warn(
        `EntitlementsService no disponible; se niega '${code}' (fail-closed).`,
      );
      return false;
    }
    return this.entitlements.hasCapability(tenant, code as ProductCapabilityId);
  }
}

/** Medidor de uso no-op; Fase 2 lo sustituye por metering real design.*. */
@Injectable()
export class NoopUsageMeter implements UsageMeter {
  track(): void {
    // No-op deliberado: aún no hay métricas design.* que reportar.
  }
}
