/**
 * ENTITLEMENTS — la frontera entre "lo que un prospecto pidió" y "lo que un
 * cliente pagó".
 *
 * Invariante central del sistema comercial:
 *
 *     NINGÚN parámetro del navegador concede acceso a un producto pagado.
 *
 * Una solicitud (`requested`) es SOLO intención comercial. El acceso se activa
 * exclusivamente por (a) un evento verificado del proveedor de pagos, o (b) una
 * concesión administrativa explícita, con razón obligatoria y auditada.
 *
 * Este archivo define la máquina de estados y la política de acceso como
 * funciones PURAS, para que la misma verdad se pueda probar sin base de datos y
 * compartir entre API y web.
 */

import type { ProductCapabilityId, ProductCode } from "./product-catalog";
import { capabilitiesForOffers, findOffer } from "./product-catalog";

/* ─────────────────────────────── Estados ──────────────────────────────────── */

export const ENTITLEMENT_STATUSES = [
  /** Intención comercial registrada. JAMÁS concede acceso. */
  "requested",
  /** Esperando verificación (correo, pago en curso, validación de ventas). */
  "pending_verification",
  /** Prueba vigente. Concede acceso mientras `trialEndsAt` esté en el futuro. */
  "trialing",
  /** Suscripción pagada y vigente. Concede acceso. */
  "active",
  /** Cobro fallido. NO concede acceso; ver `PAST_DUE_POLICY`. */
  "past_due",
  /** Suspendido por decisión administrativa o impago sostenido. Sin acceso. */
  "suspended",
  /** Cancelado por el cliente o por el proveedor. Sin acceso. */
  "cancelled",
  /** Trial o licencia vencida sin renovación. Sin acceso. */
  "expired",
] as const;

export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export function isEntitlementStatus(
  value: unknown,
): value is EntitlementStatus {
  return (
    typeof value === "string" &&
    (ENTITLEMENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * ÚNICOS estados que pueden conceder acceso. Cualquier otro es negativo por
 * construcción: agregar un estado nuevo NO abre acceso por accidente.
 */
export const ACCESS_GRANTING_STATUSES: readonly EntitlementStatus[] = [
  "active",
  "trialing",
];

/* ───────────────────────────── Origen del grant ───────────────────────────── */

export const GRANT_SOURCES = [
  /** Evento verificado del proveedor de pagos (firma válida + deduplicado). */
  "payment_provider",
  /** Concesión manual de un admin de plataforma, con razón y auditoría. */
  "admin_grant",
  /** Trial abierto por política server-side tras verificar el correo. */
  "trial_policy",
  /** Migración de los planes globales heredados a grants por producto. */
  "legacy_migration",
  /** Base incluida en cualquier contratación (`platform-core`). */
  "platform_included",
  /** Solicitud del prospecto. Nunca produce acceso, sólo deja rastro comercial. */
  "signup_request",
] as const;

export type GrantSource = (typeof GRANT_SOURCES)[number];

export function isGrantSource(value: unknown): value is GrantSource {
  return (
    typeof value === "string" &&
    (GRANT_SOURCES as readonly string[]).includes(value)
  );
}

/**
 * Orígenes que un endpoint autenticado puede fijar. `payment_provider` sólo lo
 * escribe el webhook verificado; `platform_included` sólo el provisioning.
 */
export const ADMIN_ASSIGNABLE_GRANT_SOURCES: readonly GrantSource[] = [
  "admin_grant",
];

/* ───────────────────────────── Proveedores de pago ────────────────────────── */

export const BILLING_PROVIDERS = ["stripe", "manual"] as const;

export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

/* ─────────────────────────── Forma de un entitlement ──────────────────────── */

/**
 * Vista de un grant, independiente del ORM. La API la devuelve tal cual y la
 * web la consume sin traducir.
 */
export interface ProductGrantView {
  readonly tenantId: string;
  readonly productCode: ProductCode;
  readonly offerCode: string;
  readonly status: EntitlementStatus;
  readonly quantity: number;
  readonly billingMetric: string;
  readonly deploymentModel: string;
  readonly grantSource: GrantSource;
  /**
   * Paquete comercial que originó el grant; `null` si se contrató suelto.
   * La pantalla de suscripción lo usa para explicar POR QUÉ el cliente tiene
   * un producto que no recuerda haber comprado por separado.
   */
  readonly sourceBundleCode: string | null;
  readonly sourceBundleOfferCode: string | null;
  readonly trialStartsAt: string | null;
  readonly trialEndsAt: string | null;
  readonly currentPeriodStartsAt: string | null;
  readonly currentPeriodEndsAt: string | null;
  readonly provider: string | null;
  readonly providerSubscriptionId: string | null;
  readonly providerPriceId: string | null;
  readonly createdBy: string | null;
  readonly reason: string | null;
  readonly revokedAt: string | null;
}

/* ───────────────────────────── Política de acceso ─────────────────────────── */

/**
 * Política EXPLÍCITA de cobro fallido.
 *
 * Decisión: `past_due` NO concede acceso. La alternativa (periodo de gracia con
 * acceso) fue descartada porque el contrato exige que sólo `active`/`trialing`
 * abran producto; un "casi pagado" que funciona igual que un pagado es
 * exactamente el tipo de simulación que este trabajo debe eliminar.
 *
 * El periodo de gracia SÍ existe, pero para la RECUPERACIÓN comercial: durante
 * `graceDays` el grant se conserva (el cliente paga y vuelve sin re-contratar);
 * pasado ese plazo la política lo lleva a `suspended`.
 */
export const PAST_DUE_POLICY = {
  grantsAccess: false,
  graceDays: 14,
  statusAfterGrace: "suspended" as EntitlementStatus,
  /** Código que la API devuelve para que la web ofrezca el portal de pago. */
  errorCode: "BILLING_PAYMENT_REQUIRED",
} as const;

/** Código devuelto cuando el tenant simplemente no contrató el producto. */
export const PRODUCT_NOT_ENTITLED_CODE = "PRODUCT_NOT_ENTITLED";

/**
 * ¿Este grant concede acceso AHORA?
 *
 * Fail-closed en cada rama: revocado, estado no habilitante, trial vencido o
 * periodo terminado ⇒ no. No existe rama "por si acaso, sí".
 */
export function grantIsActive(
  grant: Pick<
    ProductGrantView,
    "status" | "trialEndsAt" | "currentPeriodEndsAt" | "revokedAt"
  >,
  now: Date = new Date(),
): boolean {
  if (grant.revokedAt) return false;
  if (!ACCESS_GRANTING_STATUSES.includes(grant.status)) return false;

  if (grant.status === "trialing") {
    // Un trial sin fecha de fin sería un trial infinito: se rechaza.
    if (!grant.trialEndsAt) return false;
    return new Date(grant.trialEndsAt).getTime() > now.getTime();
  }

  // `active` con periodo vencido: el proveedor todavía no mandó la renovación.
  // Se respeta la fecha, no la etiqueta.
  if (grant.currentPeriodEndsAt) {
    return new Date(grant.currentPeriodEndsAt).getTime() > now.getTime();
  }
  return true;
}

/** Estado al que debe llevarse un grant `trialing` ya vencido. */
export function expiredTrialStatus(): EntitlementStatus {
  return "expired";
}

/**
 * ¿Un grant `past_due` ya agotó su gracia comercial? Se mide desde el inicio
 * del impago (`pastDueSince`), no desde la fecha del grant.
 */
export function pastDueGraceExhausted(
  pastDueSince: string | Date | null,
  now: Date = new Date(),
): boolean {
  if (!pastDueSince) return false;
  const since = new Date(pastDueSince).getTime();
  if (!Number.isFinite(since)) return false;
  const graceMs = PAST_DUE_POLICY.graceDays * 24 * 60 * 60 * 1000;
  return now.getTime() - since >= graceMs;
}

/** Capacidades EFECTIVAS de un tenant: sólo de grants que conceden acceso hoy. */
export function effectiveCapabilities(
  grants: readonly ProductGrantView[],
  now: Date = new Date(),
): ProductCapabilityId[] {
  const offerCodes = grants
    .filter((g) => grantIsActive(g, now))
    .map((g) => g.offerCode);
  return capabilitiesForOffers(offerCodes);
}

/** Productos EFECTIVOS de un tenant (los que puede abrir hoy). */
export function effectiveProducts(
  grants: readonly ProductGrantView[],
  now: Date = new Date(),
): ProductCode[] {
  const set = new Set<ProductCode>();
  for (const grant of grants) {
    if (grantIsActive(grant, now)) set.add(grant.productCode);
  }
  return [...set];
}

/** ¿El tenant tiene la capacidad? Base del guard server-side. */
export function hasCapability(
  grants: readonly ProductGrantView[],
  capability: ProductCapabilityId,
  now: Date = new Date(),
): boolean {
  return effectiveCapabilities(grants, now).includes(capability);
}

/**
 * Motivo de denegación, para que la web ofrezca la ruta correcta en vez de un
 * error opaco: pagar (portal) vs contratar (ventas/checkout).
 */
export type DenialReason =
  | { kind: "not_entitled"; code: typeof PRODUCT_NOT_ENTITLED_CODE }
  | { kind: "payment_required"; code: typeof PAST_DUE_POLICY.errorCode };

export function denialReasonFor(
  grants: readonly ProductGrantView[],
  capability: ProductCapabilityId,
): DenialReason {
  const owningOffers = grants.filter((g) =>
    (findOffer(g.offerCode)?.capabilities ?? []).includes(capability),
  );
  const hasPastDue = owningOffers.some((g) => g.status === "past_due");
  return hasPastDue
    ? { kind: "payment_required", code: PAST_DUE_POLICY.errorCode }
    : { kind: "not_entitled", code: PRODUCT_NOT_ENTITLED_CODE };
}

/* ───────────────────── Migración de los planes heredados ──────────────────── */

/**
 * Traducción EXACTA de los tres planes globales a grants por producto.
 *
 * Se derivó de lo que la página de precios prometía y el guard aplicaba:
 *   • `core-operations` (todos los planes) = ventas, compras, inventario,
 *     calidad, planeación y MES ⇒ grants de `erp` **y** `mes`.
 *   • `finance-suite` (professional+) ⇒ `erp.finance`.
 *   • `enterprise-governance` (enterprise) ⇒ `platform.governance`.
 *
 * Regla dura: un tenant SIN plan explícito (legacy, creado por el owner) hoy
 * opera como enterprise por fail-open en tiempo de ejecución. La migración
 * MATERIALIZA ese acceso como filas explícitas — no se pierde ningún cliente —
 * y a partir de ahí el fail-open se apaga. Preservar acceso con datos escritos
 * es auditable; preservarlo con una rama `if (!plan) return true` no lo es.
 */
export const LEGACY_TIER_OFFER_MAP: Readonly<
  Record<"starter" | "professional" | "enterprise", readonly string[]>
> = {
  starter: ["erp-legacy-starter", "mes-legacy-starter"],
  professional: ["erp-legacy-professional", "mes-legacy-professional"],
  enterprise: ["erp-legacy-enterprise", "mes-legacy-enterprise"],
};

/** Plan asumido para tenants sin `plan_tier` al momento de migrar (fail-open). */
export const LEGACY_NULL_TIER_EQUIVALENT = "enterprise" as const;

/** Ofertas legacy que corresponden a un `plan_tier` (o a su ausencia). */
export function legacyOffersForTier(
  tier: string | null | undefined,
): readonly string[] {
  const key =
    tier === "starter" || tier === "professional" || tier === "enterprise"
      ? tier
      : LEGACY_NULL_TIER_EQUIVALENT;
  return LEGACY_TIER_OFFER_MAP[key];
}

/**
 * Puente temporal entre las capacidades del contrato viejo y las nuevas. Vive
 * SOLO durante la ventana de migración; su criterio de eliminación está en
 * `docs/architecture/VALLE_PRODUCT_CATALOG_AND_ENTITLEMENTS.md`.
 */
export const LEGACY_CAPABILITY_BRIDGE: Readonly<
  Record<string, readonly ProductCapabilityId[]>
> = {
  // Basta UNA de las listadas para satisfacer la capacidad legacy.
  "core-operations": ["erp.core", "mes.execution"],
  "finance-suite": ["erp.finance"],
  "enterprise-governance": ["platform.governance"],
};

/** ¿Las capacidades nuevas satisfacen una capacidad del contrato heredado? */
export function legacyCapabilitySatisfied(
  legacyCapability: string,
  capabilities: readonly ProductCapabilityId[],
): boolean {
  const accepted = LEGACY_CAPABILITY_BRIDGE[legacyCapability];
  if (!accepted) return false;
  return accepted.some((cap) => capabilities.includes(cap));
}

/**
 * Cupo de asientos que traía cada plan heredado. `0` = sin tope, que es lo que
 * el enterprise legacy concedía de facto.
 *
 * Vive aquí —y no sólo dentro de la migración— porque el relleno bajo demanda
 * tiene que conceder EXACTAMENTE lo mismo que concedió la migración. Dos
 * caminos hacia el mismo grant con cupos distintos producirían clientes que
 * pierden asientos según por dónde llegaron.
 */
export const LEGACY_TIER_SEATS: Readonly<
  Record<"starter" | "professional" | "enterprise", number>
> = {
  starter: 5,
  professional: 50,
  enterprise: 0,
};

/** Asientos del plan heredado, tratando la ausencia como enterprise. */
export function legacySeatsForTier(tier: string | null | undefined): number {
  const key =
    tier === "starter" || tier === "professional" || tier === "enterprise"
      ? tier
      : LEGACY_NULL_TIER_EQUIVALENT;
  return LEGACY_TIER_SEATS[key];
}
