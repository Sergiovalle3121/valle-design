/**
 * PAQUETES COMERCIALES — combinaciones con precio propio que se EXPANDEN en
 * los productos que las componen.
 *
 * Regla estructural, no cosmética: un paquete NO es un producto técnico nuevo.
 * No aparece en `PRODUCT_CODES`, no tiene capacidades propias y no existe
 * ningún guard que pregunte "¿tiene Work Suite?". Lo que existe son los grants
 * de `documents`, `spreadsheets` y `presentations`.
 *
 * Por qué importa: la alternativa —crear un producto `work-suite` con sus
 * propias capacidades— obliga a que cada frontera del sistema conozca todas
 * las combinaciones comerciales que ventas invente. El día que se venda un
 * paquete nuevo habría que tocar guards. Aquí un paquete nuevo es una fila de
 * datos.
 *
 * Trazabilidad: cada grant nacido de un paquete recuerda de cuál
 * (`sourceBundleCode`). Cancelar el paquete retira EXACTAMENTE esos grants y
 * no toca los que el cliente contrató por separado.
 */

import type {
  BillingMetric,
  DeploymentModel,
  ProductCode,
  TrialPolicy,
} from "./product-catalog";
import { PRODUCT_CATALOG, findOffer } from "./product-catalog";

/* ──────────────────────────────── Códigos ─────────────────────────────────── */

export const BUNDLE_CODES = [
  "work-suite",
  "business-operations",
  "manufacturing-bridge",
  "manufacturing-complete",
  "engineering-studio",
  "enterprise-complete",
] as const;

export type BundleCode = (typeof BUNDLE_CODES)[number];

export function isBundleCode(value: unknown): value is BundleCode {
  return (
    typeof value === "string" &&
    (BUNDLE_CODES as readonly string[]).includes(value)
  );
}

/* ─────────────────────────── Segmentos de comprador ───────────────────────── */

/**
 * A quién va dirigido cada paquete. Se declara aquí para que la interfaz
 * explique la elección en vez de dejar al visitante adivinar cuál le toca.
 */
export const BUYER_SEGMENTS = [
  "smb_operations",
  "manufacturer_with_external_erp",
  "manufacturer_full",
  "engineering",
  "enterprise_group",
] as const;

export type BuyerSegment = (typeof BUYER_SEGMENTS)[number];

/* ──────────────────────────────── Escalado ────────────────────────────────── */

/**
 * `per_unit`   — el paquete se cotiza por unidad y todos sus componentes
 *                escalan con ella (Work Suite: N usuarios ⇒ N de cada editor).
 * `fixed_pack` — el paquete es una configuración cerrada; la cantidad
 *                contratada es siempre 1 y los componentes traen cantidades
 *                absolutas (Business Operations: ERP 5 + Work Suite 5).
 */
export const BUNDLE_SCALINGS = ["per_unit", "fixed_pack"] as const;

export type BundleScaling = (typeof BUNDLE_SCALINGS)[number];

/* ─────────────────────────────── Definiciones ─────────────────────────────── */

export interface BundleComponent {
  readonly productCode: ProductCode;
  /** Oferta concreta que se concede al expandir. Debe existir en el catálogo. */
  readonly offerCode: string;
  /**
   * `fixed_pack`: cantidad absoluta.
   * `per_unit`:   multiplicador por cada unidad del paquete.
   */
  readonly quantity: number;
}

export interface BundleOfferDefinition {
  /** Código de oferta del paquete; es lo único que el navegador puede enviar. */
  readonly code: string;
  readonly bundleCode: BundleCode;
  readonly billingInterval: "monthly" | "annual";
  readonly deploymentModel: DeploymentModel;
  readonly scaling: BundleScaling;
  /** Unidad comercial del paquete (usuarios para Work Suite, paquete para packs). */
  readonly unit: BillingMetric;
  readonly minQuantity: number;
  readonly components: readonly BundleComponent[];
  readonly segment: BuyerSegment;
  readonly trialPolicy: TrialPolicy;
}

const BUNDLE_TRIAL_14: TrialPolicy = {
  days: 14,
  requiresVerifiedEmail: true,
  oncePerTenant: true,
};

const BUNDLE_NO_TRIAL: TrialPolicy = {
  days: 0,
  requiresVerifiedEmail: true,
  oncePerTenant: true,
};

/** Los tres editores, por intervalo. Se repite en tres paquetes. */
function workSuiteComponents(
  interval: "monthly" | "annual",
  quantity: number,
): BundleComponent[] {
  return [
    {
      productCode: "documents",
      offerCode: `documents-saas-${interval}`,
      quantity,
    },
    {
      productCode: "spreadsheets",
      offerCode: `spreadsheets-saas-${interval}`,
      quantity,
    },
    {
      productCode: "presentations",
      offerCode: `presentations-saas-${interval}`,
      quantity,
    },
  ];
}

export const BUNDLE_OFFERS: readonly BundleOfferDefinition[] = [
  /* ── Work Suite: los tres editores por usuario ────────────────────────── */
  {
    code: "work-suite-saas-monthly",
    bundleCode: "work-suite",
    billingInterval: "monthly",
    deploymentModel: "saas_shared",
    scaling: "per_unit",
    unit: "named_user",
    minQuantity: 1,
    components: workSuiteComponents("monthly", 1),
    segment: "smb_operations",
    trialPolicy: BUNDLE_TRIAL_14,
  },
  {
    code: "work-suite-saas-annual",
    bundleCode: "work-suite",
    billingInterval: "annual",
    deploymentModel: "saas_shared",
    scaling: "per_unit",
    unit: "named_user",
    minQuantity: 1,
    components: workSuiteComponents("annual", 1),
    segment: "smb_operations",
    trialPolicy: BUNDLE_TRIAL_14,
  },

  /* ── Engineering Studio: Design 5 autores + Work Suite 5 usuarios ─────── */
  {
    code: "engineering-studio-saas-monthly",
    bundleCode: "engineering-studio",
    billingInterval: "monthly",
    deploymentModel: "saas_shared",
    scaling: "fixed_pack",
    unit: "tenant_package",
    minQuantity: 1,
    components: [
      { productCode: "design", offerCode: "design-saas-monthly", quantity: 5 },
      ...workSuiteComponents("monthly", 5),
    ],
    segment: "engineering",
    trialPolicy: BUNDLE_TRIAL_14,
  },

  /* ── Business Operations: ERP 5 usuarios + Work Suite 5 ───────────────── */
  {
    code: "business-operations-saas-monthly",
    bundleCode: "business-operations",
    billingInterval: "monthly",
    deploymentModel: "saas_shared",
    scaling: "fixed_pack",
    unit: "tenant_package",
    minQuantity: 1,
    components: [
      { productCode: "erp", offerCode: "erp-saas-standard", quantity: 5 },
      ...workSuiteComponents("monthly", 5),
    ],
    segment: "smb_operations",
    trialPolicy: BUNDLE_NO_TRIAL,
  },

  /* ── Manufacturing Bridge: MES + Intelligence + un conector ───────────── */
  {
    code: "manufacturing-bridge-saas-monthly",
    bundleCode: "manufacturing-bridge",
    billingInterval: "monthly",
    deploymentModel: "saas_shared",
    scaling: "fixed_pack",
    unit: "tenant_package",
    minQuantity: 1,
    components: [
      { productCode: "mes", offerCode: "mes-saas-standard", quantity: 1 },
      {
        productCode: "intelligence",
        offerCode: "intelligence-saas-package",
        quantity: 1,
      },
      {
        productCode: "integrations",
        offerCode: "integrations-saas-connectors",
        quantity: 1,
      },
    ],
    segment: "manufacturer_with_external_erp",
    trialPolicy: BUNDLE_NO_TRIAL,
  },

  /* ── Manufacturing Complete: ERP 10 + MES + Work 10 + IA + conector ───── */
  {
    code: "manufacturing-complete-saas-monthly",
    bundleCode: "manufacturing-complete",
    billingInterval: "monthly",
    deploymentModel: "saas_shared",
    scaling: "fixed_pack",
    unit: "tenant_package",
    minQuantity: 1,
    components: [
      { productCode: "erp", offerCode: "erp-saas-standard", quantity: 10 },
      { productCode: "mes", offerCode: "mes-saas-standard", quantity: 1 },
      ...workSuiteComponents("monthly", 10),
      {
        productCode: "intelligence",
        offerCode: "intelligence-saas-package",
        quantity: 1,
      },
      {
        productCode: "integrations",
        offerCode: "integrations-saas-connectors",
        quantity: 1,
      },
    ],
    segment: "manufacturer_full",
    trialPolicy: BUNDLE_NO_TRIAL,
  },

  /* ── Enterprise Complete: configuración empresarial, siempre cotizada ─── */
  {
    code: "enterprise-complete-saas-monthly",
    bundleCode: "enterprise-complete",
    billingInterval: "monthly",
    deploymentModel: "private_cloud",
    scaling: "fixed_pack",
    unit: "tenant_package",
    minQuantity: 1,
    // Cantidades MÍNIMAS indicativas: el alcance real sale del diagnóstico.
    // Por eso su precio es "desde" y su canal es asistido sin excepción.
    components: [
      { productCode: "erp", offerCode: "erp-private-cloud", quantity: 25 },
      { productCode: "mes", offerCode: "mes-private-cloud", quantity: 1 },
      {
        productCode: "design",
        offerCode: "design-private-cloud",
        quantity: 10,
      },
      {
        productCode: "documents",
        offerCode: "documents-private-cloud",
        quantity: 25,
      },
      {
        productCode: "spreadsheets",
        offerCode: "spreadsheets-private-cloud",
        quantity: 25,
      },
      {
        productCode: "intelligence",
        offerCode: "intelligence-private-cloud",
        quantity: 1,
      },
      {
        productCode: "integrations",
        offerCode: "integrations-saas-connectors",
        quantity: 2,
      },
    ],
    segment: "enterprise_group",
    trialPolicy: BUNDLE_NO_TRIAL,
  },
];

const BUNDLE_OFFERS_BY_CODE = new Map<string, BundleOfferDefinition>(
  BUNDLE_OFFERS.map((b) => [b.code, b]),
);

export function findBundleOffer(
  code: unknown,
): BundleOfferDefinition | null {
  return typeof code === "string"
    ? (BUNDLE_OFFERS_BY_CODE.get(code) ?? null)
    : null;
}

export function isBundleOfferCode(value: unknown): boolean {
  return findBundleOffer(value) !== null;
}

/** Ofertas de un paquete concreto (mensual y anual si existen). */
export function offersForBundle(code: BundleCode): BundleOfferDefinition[] {
  return BUNDLE_OFFERS.filter((b) => b.bundleCode === code);
}

/* ─────────────────────────────── Expansión ────────────────────────────────── */

export interface ExpandedBundleItem {
  readonly productCode: ProductCode;
  readonly offerCode: string;
  readonly quantity: number;
}

/**
 * Expande un paquete en las ofertas de producto que concede.
 *
 * `fixed_pack` ignora la cantidad solicitada (siempre es un paquete); en
 * `per_unit` cada componente se multiplica por ella.
 */
export function expandBundle(
  bundle: BundleOfferDefinition,
  quantity = 1,
): ExpandedBundleItem[] {
  const units =
    bundle.scaling === "fixed_pack"
      ? 1
      : Math.max(bundle.minQuantity, Math.floor(Number(quantity) || 1));

  return bundle.components.map((component) => ({
    productCode: component.productCode,
    offerCode: component.offerCode,
    quantity:
      bundle.scaling === "fixed_pack"
        ? component.quantity
        : component.quantity * units,
  }));
}

/** Productos que concede un paquete, sin duplicados. */
export function productsInBundle(
  bundle: BundleOfferDefinition,
): ProductCode[] {
  return [...new Set(bundle.components.map((c) => c.productCode))];
}

/**
 * ¿El paquete es apto para autoservicio?
 *
 * DERIVADO, nunca declarado: un paquete es autoservicio si y sólo si TODOS sus
 * productos lo son. Declararlo a mano permitiría que alguien marcara como
 * autoservicio un paquete que contiene ERP, que es exactamente el error que
 * esta función existe para hacer imposible.
 */
export function bundleSelfServiceEligible(
  bundle: BundleOfferDefinition,
): boolean {
  return bundle.components.every(
    (c) => PRODUCT_CATALOG[c.productCode].selfServiceEligible,
  );
}

/**
 * Canal EFECTIVO del paquete. Igual que en productos: requiere ser apto Y que
 * el owner haya encendido TODOS sus productos en el flag. Sin las dos, asistido.
 */
export function bundleEffectiveSalesMotion(
  bundle: BundleOfferDefinition,
  enabledSelfServiceProducts: readonly string[] = [],
): "self_service" | "assisted" {
  if (!bundleSelfServiceEligible(bundle)) return "assisted";
  return bundle.components.every((c) =>
    enabledSelfServiceProducts.includes(c.productCode),
  )
    ? "self_service"
    : "assisted";
}

/* ─────────────────────────────── Validación ───────────────────────────────── */

/**
 * Invariantes de los paquetes. Se ejecuta en pruebas: un componente que
 * referencia una oferta inexistente produciría un grant imposible de conceder
 * y un checkout que falla después de cobrar.
 */
export function validateBundles(): string[] {
  const problems: string[] = [];
  for (const bundle of BUNDLE_OFFERS) {
    if (bundle.components.length === 0) {
      problems.push(`${bundle.code}: paquete sin componentes`);
    }
    for (const component of bundle.components) {
      const offer = findOffer(component.offerCode);
      if (!offer) {
        problems.push(
          `${bundle.code}: componente apunta a una oferta inexistente (${component.offerCode})`,
        );
        continue;
      }
      if (offer.productCode !== component.productCode) {
        problems.push(
          `${bundle.code}: ${component.offerCode} pertenece a ${offer.productCode}, no a ${component.productCode}`,
        );
      }
      if (offer.legacyOnly) {
        problems.push(
          `${bundle.code}: no puede incluir la oferta legacy ${component.offerCode}`,
        );
      }
      if (component.quantity < 1 || !Number.isInteger(component.quantity)) {
        problems.push(
          `${bundle.code}: cantidad inválida para ${component.offerCode}`,
        );
      }
    }
    if (bundle.scaling === "fixed_pack" && bundle.minQuantity !== 1) {
      problems.push(
        `${bundle.code}: un paquete cerrado sólo puede contratarse una vez (minQuantity debe ser 1)`,
      );
    }
    const duplicated = bundle.components
      .map((c) => c.offerCode)
      .filter((code, i, all) => all.indexOf(code) !== i);
    if (duplicated.length > 0) {
      problems.push(
        `${bundle.code}: oferta repetida en los componentes (${[...new Set(duplicated)].join(", ")})`,
      );
    }
  }
  return problems;
}
