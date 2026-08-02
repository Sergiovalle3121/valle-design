import { Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import type {
  EntitlementCheckContext,
  EntitlementClient,
} from './ports/platform-client.ports';

export type EntitlementsMode = 'allow-all' | 'platform-api';

/**
 * Modo de imposición de entitlements, por entorno:
 * - `allow-all`  → todo tenant autenticado tiene design.cad (DEFAULT en
 *   desarrollo; documentado en .env.example). Pensado para dev/demo local.
 * - `platform-api` → la autoridad es la API de Platform
 *   (`GET /v1/entitlements/{code}` de specs/platform-api.v1.yaml) con el
 *   bearer del request reenviado. FAIL-CLOSED: cualquier error — sin URL
 *   configurada, sin token que reenviar, timeout, red caída, respuesta no-200
 *   o cuerpo malformado — NIEGA. Nunca se regala acceso por avería.
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

/** Timeout corto de la consulta a Platform (ms). */
const DEFAULT_TIMEOUT_MS = 1_500;
/** Caché breve por tenant (ms): amortigua el hot path sin retener revocaciones. */
const DEFAULT_CACHE_TTL_MS = 30_000;
/** Cota dura del tamaño del caché (tenants activos simultáneos). */
const CACHE_MAX_ENTRIES = 10_000;

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

/**
 * Cliente HTTP REAL del puerto EntitlementClient contra la API de Platform
 * (cierra el TODO-R3 de ConfigEntitlementClient). El switch a la Platform
 * productiva es SOLO configuración: apuntar `PLATFORM_API_URL` al host real
 * (el contrato ya está implementado aquí).
 *
 * - Reenvía el bearer del REQUEST (contexto explícito del guard, o el ALS
 *   como fallback para futuros call sites dentro del request).
 * - Cachea SOLO respuestas resueltas por Platform (200 con `active`
 *   true/false y 404 de código desconocido) por tenant+código durante un TTL
 *   breve. Errores de transporte NO se cachean: niegan esta vez y se
 *   reintentará al siguiente request.
 * - `allow-all` responde true sin tocar la red (modo dev).
 */
@Injectable()
export class PlatformEntitlementClient implements EntitlementClient {
  private readonly logger = new Logger(PlatformEntitlementClient.name);
  private readonly cache = new Map<string, CacheEntry>();
  private warnedNoBaseUrl = false;

  constructor(private readonly tenantCtx: TenantContextService) {}

  async hasEntitlement(
    code: string,
    context?: EntitlementCheckContext,
  ): Promise<boolean> {
    if (resolveEntitlementsMode() === 'allow-all') return true;

    const tenantId = context?.tenantId ?? this.tenantCtx.getTenantId();
    const bearerToken = context?.bearerToken ?? null;
    if (!tenantId || !bearerToken) {
      // Sin tenant o sin bearer no hay a quién preguntar por quién: negar.
      this.logger.warn(
        `Entitlement '${code}' negado (fail-closed): falta ${
          tenantId ? 'bearer del request' : 'tenant'
        } en el contexto de verificación.`,
      );
      return false;
    }

    const cacheKey = `${tenantId}|${code}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const baseUrl = (process.env.PLATFORM_API_URL ?? '')
      .trim()
      .replace(/\/+$/, '');
    if (!baseUrl) {
      if (!this.warnedNoBaseUrl) {
        this.warnedNoBaseUrl = true;
        this.logger.warn(
          `ENTITLEMENTS_MODE=platform-api sin PLATFORM_API_URL configurada; se niega '${code}' (fail-closed).`,
        );
      }
      return false;
    }

    try {
      const response = await this.fetchWithTimeout(
        `${baseUrl}/v1/entitlements/${encodeURIComponent(code)}`,
        bearerToken,
      );
      if (response.status === 200) {
        const body = (await response.json()) as {
          code?: unknown;
          active?: unknown;
        };
        // Fail-closed también en la forma: solo un `active: true` literal con
        // eco del código consultado concede acceso.
        const active = body?.active === true && body?.code === code;
        this.remember(cacheKey, active);
        return active;
      }
      if (response.status === 404) {
        // Código fuera del catálogo de Platform: respuesta resuelta → caché.
        this.remember(cacheKey, false);
        return false;
      }
      this.logger.warn(
        `Platform respondió ${response.status} al consultar '${code}'; se niega (fail-closed).`,
      );
      return false;
    } catch (err) {
      this.logger.warn(
        `Error consultando entitlements de Platform ('${code}'): ${(err as Error)?.message}; se niega (fail-closed).`,
      );
      return false;
    }
  }

  private async fetchWithTimeout(
    url: string,
    bearerToken: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), entitlementsTimeoutMs());
    // El timer no debe mantener vivo el proceso (jobs/CLI).
    timer.unref?.();
    try {
      return await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private remember(key: string, value: boolean): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      // Poda simple: descarta lo más viejo insertado (Map preserva orden).
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + entitlementsCacheTtlMs(),
    });
  }
}

function entitlementsTimeoutMs(): number {
  const raw = Number(process.env.ENTITLEMENTS_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function entitlementsCacheTtlMs(): number {
  const raw = Number(process.env.ENTITLEMENTS_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CACHE_TTL_MS;
}
