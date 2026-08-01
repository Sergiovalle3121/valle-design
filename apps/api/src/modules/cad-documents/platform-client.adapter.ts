/**
 * Adaptadores in-proc de los puertos de plataforma (adaptación Design del
 * WP2c del origen).
 *
 * Identidad sobre TenantContextService (ALS del request autenticado),
 * entitlements por CONFIGURACIÓN (ENTITLEMENTS_MODE) y un medidor de uso
 * no-op. El adaptador enterprise que consultaba EntitlementsService in-proc
 * se sustituye aquí: Design no tiene autoridad comercial propia — la
 * autoridad es Platform, y su cliente HTTP llega en R-seguridad.
 */
import { Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
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

export type EntitlementsMode = 'allow-all' | 'platform-api';

/**
 * Modo de imposición de entitlements, por entorno:
 * - `allow-all`  → todo tenant autenticado tiene design.cad (DEFAULT en
 *   desarrollo; documentado en .env.example). Pensado para dev/demo local.
 * - `platform-api` → la autoridad es la API de Platform. TODO-R3: implementar
 *   el cliente HTTP real contra specs/platform-api.v1.yaml; hasta entonces
 *   este modo NIEGA (fail-closed) con un warn — nunca se regala acceso por
 *   ausencia de cliente.
 *
 * En PRODUCCIÓN el default es `platform-api` (fail-closed): dejar allow-all
 * por omisión en prod sería regalar el producto a cualquier token válido.
 */
export function resolveEntitlementsMode(): EntitlementsMode {
  const raw = (process.env.ENTITLEMENTS_MODE ?? '').trim().toLowerCase();
  if (raw === 'allow-all') return 'allow-all';
  if (raw === 'platform-api') return 'platform-api';
  return process.env.NODE_ENV === 'production' ? 'platform-api' : 'allow-all';
}

/**
 * Entitlements por configuración (sustituto del EnterpriseEntitlementClient).
 * Ver resolveEntitlementsMode(); la imposición real server-side llega en
 * R-seguridad con el cliente platform-api (TODO-R3).
 */
@Injectable()
export class ConfigEntitlementClient implements EntitlementClient {
  private readonly logger = new Logger(ConfigEntitlementClient.name);
  private warned = false;

  async hasEntitlement(code: string): Promise<boolean> {
    if (resolveEntitlementsMode() === 'allow-all') return true;
    // TODO-R3: cliente HTTP real contra la API de Platform
    // (packages/contracts/specs/platform-api.v1.yaml). Hasta entonces,
    // fail-closed: platform-api sin cliente niega SIEMPRE.
    if (!this.warned) {
      this.warned = true;
      this.logger.warn(
        `ENTITLEMENTS_MODE=platform-api sin cliente implementado; se niega '${code}' (fail-closed). Llega en R-seguridad.`,
      );
    }
    return false;
  }
}

/** Medidor de uso no-op; una fase posterior lo sustituye por metering design.*. */
@Injectable()
export class NoopUsageMeter implements UsageMeter {
  track(): void {
    // No-op deliberado: aún no hay métricas design.* que reportar.
  }
}
