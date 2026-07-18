/**
 * Planes comerciales de AXOS OS (AXOS-BIZ-001).
 *
 * Fuente de verdad compartida del contrato de plan: el slug viaja en
 * `tenants.plan_tier` (alta self-service) y parametriza los entitlements por
 * empresa. Se llama "tier" a propósito: en AXOS "plan" ya significa plan de
 * producción (módulo plans / Muro del plan) y no deben confundirse.
 *
 * Los PRECIOS DE LISTA son valores editables por el owner en un solo lugar
 * (aquí); la página pública de precios los lee de la copia web
 * (`apps/web/src/config/planTiers.ts`). `null` = precio a medida (ventas).
 */
export const PLAN_TIER_IDS = ["starter", "professional", "enterprise"] as const;

export type PlanTierId = (typeof PLAN_TIER_IDS)[number];

export interface PlanTierProfile {
  id: PlanTierId;
  /** Límite de usuarios activos del tenant (null = sin límite). */
  maxUsers: number | null;
  /** Precio de lista mensual en USD (0 = gratis, null = a medida/ventas). */
  listPriceUsdMonthly: number | null;
}

export const PLAN_TIERS: Record<PlanTierId, PlanTierProfile> = {
  starter: { id: "starter", maxUsers: 5, listPriceUsdMonthly: 0 },
  professional: { id: "professional", maxUsers: 50, listPriceUsdMonthly: 490 },
  enterprise: { id: "enterprise", maxUsers: null, listPriceUsdMonthly: null },
};

/** Plan por defecto del alta self-service cuando el formulario no manda uno. */
export const DEFAULT_SELF_SERVICE_TIER: PlanTierId = "starter";

export function isPlanTierId(value: unknown): value is PlanTierId {
  return (
    typeof value === "string" && (PLAN_TIER_IDS as readonly string[]).includes(value)
  );
}

/**
 * Entitlements efectivos de un tenant. Los tenants sin plan (legacy, creados
 * antes de AXOS-BIZ-001, o dados de alta por el owner) operan como enterprise:
 * el plan comercial jamás recorta a un cliente existente (fail-open).
 */
export function planTierLimits(tier?: string | null): PlanTierProfile {
  return isPlanTierId(tier) ? PLAN_TIERS[tier] : PLAN_TIERS.enterprise;
}
