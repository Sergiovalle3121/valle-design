/**
 * Adaptadores in-proc de los puertos de plataforma (adaptación Design del
 * WP2c del origen).
 *
 * Identidad sobre TenantContextService (ALS del request autenticado) y un
 * medidor de uso no-op. El puerto de ENTITLEMENTS ya NO vive aquí: desde
 * Fase 5 lo satisface `PlatformEntitlementClient`
 * (platform-entitlement.client.ts) — cliente HTTP real del contrato
 * `specs/platform-api.v1.yaml` con caché breve por tenant y fail-closed
 * (cierra el TODO-R3 del ConfigEntitlementClient que vivía en este archivo).
 */
import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import type {
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

/** Medidor de uso no-op; una fase posterior lo sustituye por metering design.*. */
@Injectable()
export class NoopUsageMeter implements UsageMeter {
  track(): void {
    // No-op deliberado: aún no hay métricas design.* que reportar.
  }
}
