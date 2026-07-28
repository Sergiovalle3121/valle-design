/**
 * CONSUMO DE INTELIGENCIA — presupuesto, umbrales y paquetes autorizados.
 *
 * Regla comercial que este archivo hace cumplible: **nunca se ofrece consumo
 * sin límite**. La palabra "ilimitado" no aparece en ninguna superficie porque
 * no describe nada real — toda inferencia consume capacidad y esa capacidad
 * cuesta. Un producto que promete "IA ilimitada" o pierde dinero con el cliente
 * que más lo usa, o incumple la promesa en silencio cuando le conviene.
 *
 * El modelo es explícito:
 *
 *   consumo incluido      — lo que cubre la cuota base del producto;
 *   paquetes autorizados  — capacidad adicional que alguien APROBÓ, con razón,
 *                           vigencia y rastro de auditoría;
 *   excedente             — no existe como cobro automático. Al agotarse el
 *                           presupuesto el servicio se DETIENE.
 *
 * Detenerse es la decisión correcta frente a la alternativa: seguir sirviendo y
 * facturar después. Un cliente que descubre a fin de mes que su consumo se
 * multiplicó no tiene forma de deshacerlo, y nosotros no tenemos forma de
 * justificarlo.
 */

/* ─────────────────────────────── Umbrales ─────────────────────────────────── */

/**
 * Umbrales de aviso en basis points del presupuesto (7000 = 70%).
 *
 * Tres avisos y no uno: al 70% queda margen para decidir, al 90% para actuar y
 * al 100% ya no hay decisión que tomar — sólo hay que enterarse de que el
 * servicio se detuvo, y enterarse por una alerta es mejor que por un usuario
 * confundido.
 */
export const INTELLIGENCE_ALERT_THRESHOLDS_BPS = [7000, 9000, 10_000] as const;

export type IntelligenceAlertThreshold =
  (typeof INTELLIGENCE_ALERT_THRESHOLDS_BPS)[number];

export function isIntelligenceAlertThreshold(
  value: unknown,
): value is IntelligenceAlertThreshold {
  return (
    typeof value === "number" &&
    (INTELLIGENCE_ALERT_THRESHOLDS_BPS as readonly number[]).includes(value)
  );
}

/* ──────────────────────────── Origen de capacidad ─────────────────────────── */

export const INTELLIGENCE_GRANT_SOURCES = [
  /** Paquete adicional contratado y pagado. */
  "purchase",
  /** Ampliación concedida por un admin de plataforma, con razón obligatoria. */
  "admin_grant",
  /** Capacidad incluida en la cuota base del producto. */
  "included",
] as const;

export type IntelligenceGrantSource =
  (typeof INTELLIGENCE_GRANT_SOURCES)[number];

/* ───────────────────────────── Estado de consumo ──────────────────────────── */

export interface IntelligenceBudgetGrantView {
  readonly id: string;
  readonly tenantId: string;
  readonly tokens: number;
  readonly source: IntelligenceGrantSource;
  readonly reason: string | null;
  readonly createdBy: string | null;
  readonly effectiveFrom: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export interface IntelligenceUsageSnapshot {
  readonly tenantId: string;
  /** Inicio del periodo mensual vigente (UTC). */
  readonly periodStart: string;
  /** Capacidad que cubre la cuota base. */
  readonly includedTokens: number;
  /** Capacidad adicional vigente y autorizada. */
  readonly authorizedExtraTokens: number;
  /** Suma de ambas: el límite real de este periodo. */
  readonly totalBudgetTokens: number;
  readonly usedTokens: number;
  readonly remainingTokens: number;
  /** Porcentaje consumido en basis points (10000 = 100%). */
  readonly consumedBps: number;
  /** `true` si el servicio está detenido por presupuesto agotado. */
  readonly blocked: boolean;
  /** Umbrales ya cruzados en este periodo. */
  readonly crossedThresholds: readonly number[];
  readonly grants: readonly IntelligenceBudgetGrantView[];
}

/**
 * Porcentaje consumido, en basis points. Aritmética entera: el porcentaje se
 * usa para decidir si se emite una alerta, y un redondeo de coma flotante
 * podría emitirla dos veces o ninguna en el borde exacto.
 */
export function consumedBasisPoints(
  usedTokens: number,
  totalBudgetTokens: number,
): number {
  if (totalBudgetTokens <= 0) return 10_000;
  return Math.floor((usedTokens * 10_000) / totalBudgetTokens);
}

/** Umbrales que un consumo dado ha alcanzado. */
export function thresholdsReached(consumedBps: number): number[] {
  return INTELLIGENCE_ALERT_THRESHOLDS_BPS.filter((t) => consumedBps >= t);
}

/**
 * ¿Se puede servir otra petición?
 *
 * Fail-closed por construcción: un presupuesto de cero o negativo NO significa
 * "sin límite", significa "sin capacidad". Es la interpretación segura, y la
 * contraria (cero como infinito) es exactamente el error que convierte un
 * problema de configuración en una factura imprevista.
 */
export function canServe(
  usedTokens: number,
  totalBudgetTokens: number,
): boolean {
  if (!Number.isFinite(totalBudgetTokens) || totalBudgetTokens <= 0) {
    return false;
  }
  return usedTokens < totalBudgetTokens;
}

/** Inicio del periodo mensual UTC que contiene `now`. */
export function periodStartFor(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** ¿Un paquete adicional está vigente en `now`? */
export function grantIsEffective(
  grant: {
    readonly effectiveFrom?: string | Date | null;
    readonly expiresAt?: string | Date | null;
    readonly revokedAt?: string | Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (grant.revokedAt) return false;
  const t = now.getTime();
  if (grant.effectiveFrom && new Date(grant.effectiveFrom).getTime() > t) {
    return false;
  }
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= t) {
    return false;
  }
  return true;
}

/* ────────────────────────────── Política de margen ────────────────────────── */

/**
 * Margen bruto mínimo exigido a un paquete adicional de inferencia.
 *
 * Está aquí y no sólo en la documentación porque un número que vive únicamente
 * en un documento no impide vender por debajo de él. `meetsMarginPolicy` puede
 * comprobarlo en el momento de autorizar el paquete.
 */
export const MIN_INFERENCE_GROSS_MARGIN_BPS = 6000;

export function meetsMarginPolicy(
  revenueMinor: number,
  directCostMinor: number,
): boolean {
  if (revenueMinor <= 0) return false;
  const marginBps = Math.floor(
    ((revenueMinor - directCostMinor) * 10_000) / revenueMinor,
  );
  return marginBps >= MIN_INFERENCE_GROSS_MARGIN_BPS;
}
