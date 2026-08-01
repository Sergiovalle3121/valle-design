/**
 * Puertos neutrales de plataforma para el CAD (WP2c).
 *
 * Tres contratos mínimos con los que el dominio CAD consume servicios de la
 * plataforma anfitriona sin conocerla: identidad del request (hoy
 * TenantContextService), acceso comercial (hoy EntitlementsService) y medición
 * de uso (hoy no-op). En el repo Design (Fase 3) los adaptadores in-proc se
 * sustituyen por clientes propios (API de plataforma) sin tocar el dominio.
 */

/** Identidad del contexto autenticado vigente (request/job en curso). */
export interface PlatformIdentityClient {
  currentTenantId(): string | undefined;
  currentUserEmail(): string | undefined;
  /**
   * Planta activa del contexto. Extensión mecánica del contrato: el scoping de
   * CadBlocksService estampa `plant_id` al crear bloques, así que la identidad
   * de plataforma debe exponerla para que el servicio no vuelva a depender de
   * TenantContextService.
   */
  currentPlantId(): string | undefined;
}

/** Acceso comercial: ¿el tenant vigente tiene contratada esta capacidad? */
export interface EntitlementClient {
  hasEntitlement(code: string): Promise<boolean>;
}

/** Medición de uso de producto (metering). Fase 2 define las métricas design.*. */
export interface UsageMeter {
  track(metric: string, value?: number): void;
}

/** Tokens de inyección de los puertos de plataforma. */
export const PLATFORM_IDENTITY_CLIENT = Symbol('PLATFORM_IDENTITY_CLIENT');
export const ENTITLEMENT_CLIENT = Symbol('ENTITLEMENT_CLIENT');
export const USAGE_METER = Symbol('USAGE_METER');
