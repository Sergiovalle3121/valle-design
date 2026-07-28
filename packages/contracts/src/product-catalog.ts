/**
 * CATÁLOGO CANÓNICO DE PRODUCTOS Y OFERTAS.
 *
 * La compañía NO vende un sistema operativo: vende productos empresariales
 * INDEPENDIENTES que comparten una plataforma técnica común. Este archivo es la
 * única definición de qué se puede contratar, con qué métrica se cobra, por qué
 * canal se vende y qué capacidades concede.
 *
 * ─── Neutralidad de marca ────────────────────────────────────────────────────
 * `productCode` / `offerCode` / `capabilityId` son NEUTRALES: no contienen
 * "VALLE", "AXOS" ni ninguna marca. Viajan a columnas de base de datos, a la
 * metadata del proveedor de pagos y a las APIs, y deben sobrevivir a cualquier
 * rebranding. El nombre visible se resuelve con `brand.ts`.
 *
 * ─── Independencia real ──────────────────────────────────────────────────────
 * Cada producto se contrata por separado. `platform-core` va incluido siempre y
 * NO se vende: es identidad, tenant, RBAC, auditoría, billing y onboarding. La
 * "suite completa" no es un plan especial, es la suma de varios subscription
 * items. Las dependencias comerciales están DECLARADAS aquí (`requiresAnyOf`),
 * nunca escondidas en la interfaz.
 *
 * ─── Precios ─────────────────────────────────────────────────────────────────
 * Este archivo NO contiene precios. Un precio depende del mercado, la moneda,
 * la vigencia y el tratamiento fiscal; meterlo en la definición del producto
 * obliga a duplicar el catálogo entero por cada país. El precio vive en
 * `pricing.ts` (modelo) y `price-book-mx.ts` (cifras del mercado mexicano),
 * indexado por `offerCode`.
 *
 * El identificador de precio del proveedor de pagos también vive en el libro,
 * no aquí, por la misma razón y por una adicional: el precio que se MUESTRA y
 * el que se COBRA deben resolverse por caminos distintos. El navegador jamás
 * envía ninguno de los dos.
 */

/** Códigos internos estables. `platform-core` es la base común incluida. */
export const PRODUCT_CODES = [
  "platform-core",
  "erp",
  "mes",
  "design",
  "documents",
  "spreadsheets",
  "presentations",
  "intelligence",
  "integrations",
] as const;

export type ProductCode = (typeof PRODUCT_CODES)[number];

/** Productos contratables (todos menos la base incluida). */
export const SELLABLE_PRODUCT_CODES = PRODUCT_CODES.filter(
  (c) => c !== "platform-core",
) as readonly ProductCode[];

export function isProductCode(value: unknown): value is ProductCode {
  return (
    typeof value === "string" &&
    (PRODUCT_CODES as readonly string[]).includes(value)
  );
}

/* ────────────────────────────── Capacidades ───────────────────────────────── */

/**
 * Capacidades exigibles server-side. Cada id es una frontera REAL: si aparece
 * aquí, existe un guard que la aplica. El catálogo público no puede prometer
 * una capacidad que no esté en esta lista.
 */
export const PRODUCT_CAPABILITY_IDS = [
  // platform-core (incluido en cualquier contratación)
  "platform.identity",
  "platform.tenant",
  "platform.rbac",
  "platform.audit",
  "platform.billing",
  "platform.notifications",
  "platform.onboarding",
  "platform.support",
  "platform.governance",
  // erp
  "erp.core",
  "erp.sales",
  "erp.procurement",
  "erp.inventory",
  "erp.finance",
  // mes
  "mes.execution",
  "mes.quality",
  "mes.maintenance",
  "mes.traceability",
  "mes.masterdata",
  // design
  "design.cad",
  "design.viewer",
  // documents
  "documents.editor",
  "documents.pdf",
  // spreadsheets
  "spreadsheets.editor",
  // presentations
  "presentations.editor",
  // intelligence
  "intelligence.copilot",
  "intelligence.analytics",
  // integrations
  "integrations.connectors",
] as const;

export type ProductCapabilityId = (typeof PRODUCT_CAPABILITY_IDS)[number];

export function isProductCapabilityId(
  value: unknown,
): value is ProductCapabilityId {
  return (
    typeof value === "string" &&
    (PRODUCT_CAPABILITY_IDS as readonly string[]).includes(value)
  );
}

/* ───────────────────────── Métricas, canal y despliegue ───────────────────── */

/** Unidad sobre la que se cobra. Determina qué cantidad pide el configurador. */
export const BILLING_METRICS = [
  "included",
  "named_user",
  "site",
  "author_seat",
  "tenant_package",
  "connector",
  /** Entorno dedicado de nube privada; se cotiza, nunca se cobra en línea. */
  "environment",
  /**
   * Terminal operativa de planta. Es un LÍMITE incluido en la oferta de MES,
   * no una unidad de cobro automático: sin medición confiable del uso real,
   * cobrar por terminal sería inventar una factura.
   */
  "terminal",
] as const;

export type BillingMetric = (typeof BILLING_METRICS)[number];

/** Cómo se contrata: autoservicio (checkout) o venta asistida (implementación). */
export const SALES_MOTIONS = ["included", "self_service", "assisted"] as const;

export type SalesMotion = (typeof SALES_MOTIONS)[number];

/** Modalidades de contratación soportadas. */
export const DEPLOYMENT_MODELS = [
  "saas_shared",
  "private_cloud",
  "customer_hosted",
] as const;

export type DeploymentModel = (typeof DEPLOYMENT_MODELS)[number];

export function isDeploymentModel(value: unknown): value is DeploymentModel {
  return (
    typeof value === "string" &&
    (DEPLOYMENT_MODELS as readonly string[]).includes(value)
  );
}

/**
 * Disponibilidad COMERCIAL de cada modalidad.
 *
 * `customer_hosted` NO está disponible de forma general y no puede cotizarse
 * como si lo estuviera. Requiere licencia firmada verificable, enforcement
 * técnico, procedimiento de actualización y soporte definido; nada de eso
 * existe todavía. Publicarlo como GA sería vender una obligación de soporte
 * que no se puede cumplir y entregar el software sin ningún control de uso.
 *
 * Esta constante es la ÚNICA autoridad: la web, el configurador y el checkout
 * la consultan. Cambiarla es la decisión explícita que habilita la modalidad.
 */
export const DEPLOYMENT_AVAILABILITY = {
  saas_shared: "general",
  private_cloud: "general",
  customer_hosted: "limited",
} as const satisfies Readonly<Record<DeploymentModel, "general" | "limited">>;

/** ¿Se puede cotizar y contratar esta modalidad hoy? */
export function deploymentIsSellable(model: DeploymentModel): boolean {
  return DEPLOYMENT_AVAILABILITY[model] === "general";
}

/** Periodicidad de la oferta. */
export const BILLING_INTERVALS = ["monthly", "annual", "custom"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Edición comercial dentro de un producto (define el corte de capacidades). */
export const PRODUCT_EDITIONS = [
  "standard",
  "starter",
  "professional",
  "enterprise",
] as const;

export type ProductEdition = (typeof PRODUCT_EDITIONS)[number];

/** Política de prueba. `days: 0` ⇒ el producto no ofrece trial autoservicio. */
export interface TrialPolicy {
  readonly days: number;
  /** Un trial sólo se puede activar si la política server-side lo permite. */
  readonly requiresVerifiedEmail: boolean;
  /** Un trial por producto y tenant; nunca renovable desde el navegador. */
  readonly oncePerTenant: boolean;
}

const NO_TRIAL: TrialPolicy = {
  days: 0,
  requiresVerifiedEmail: true,
  oncePerTenant: true,
};

const TRIAL_14: TrialPolicy = {
  days: 14,
  requiresVerifiedEmail: true,
  oncePerTenant: true,
};

/* ──────────────────────────────── Ofertas ─────────────────────────────────── */

export interface OfferDefinition {
  /** Código interno estable, neutral de marca. Es lo único que envía el cliente. */
  readonly code: string;
  readonly productCode: ProductCode;
  readonly edition: ProductEdition;
  readonly deploymentModel: DeploymentModel;
  readonly billingInterval: BillingInterval;
  readonly billingMetric: BillingMetric;
  readonly salesMotion: SalesMotion;
  /** Capacidades que concede esta oferta (corte de edición). */
  readonly capabilities: readonly ProductCapabilityId[];
  readonly minQuantity: number;
  readonly trialPolicy: TrialPolicy;
  /** Oferta sólo alcanzable por migración legacy; no se ofrece a prospectos. */
  readonly legacyOnly?: boolean;
}

/* ─────────────────────────────── Productos ────────────────────────────────── */

export interface ProductDefinition {
  readonly code: ProductCode;
  /** Base común incluida en cualquier contratación; no se vende por separado. */
  readonly foundation: boolean;
  /**
   * Dependencia comercial DECLARADA: para contratar este producto el tenant
   * necesita acceso vigente a alguno de estos. Vacío = independiente.
   */
  readonly requiresAnyOf: readonly ProductCode[];
  readonly defaultSalesMotion: SalesMotion;
  /**
   * Si el owner enciende autoservicio por feature flag, este producto puede
   * pasar a `self_service`. ERP y MES NO son elegibles: siempre venta asistida.
   */
  readonly selfServiceEligible: boolean;
  readonly billingMetric: BillingMetric;
  readonly deploymentModels: readonly DeploymentModel[];
  readonly offers: readonly OfferDefinition[];
}

const PLATFORM_CAPABILITIES: readonly ProductCapabilityId[] = [
  "platform.identity",
  "platform.tenant",
  "platform.rbac",
  "platform.audit",
  "platform.billing",
  "platform.notifications",
  "platform.onboarding",
  "platform.support",
];

const ERP_CORE_CAPABILITIES: readonly ProductCapabilityId[] = [
  "erp.core",
  "erp.sales",
  "erp.procurement",
  "erp.inventory",
];

const MES_CORE_CAPABILITIES: readonly ProductCapabilityId[] = [
  "mes.execution",
  "mes.quality",
  "mes.traceability",
  "mes.masterdata",
];

/**
 * Constructor de ofertas de venta asistida (implementación + licencia anual).
 * Nunca llevan precio de lista ni price id: se cotizan.
 */
function assistedOffer(params: {
  code: string;
  productCode: ProductCode;
  edition: ProductEdition;
  deploymentModel: DeploymentModel;
  billingMetric: BillingMetric;
  capabilities: readonly ProductCapabilityId[];
  minQuantity?: number;
}): OfferDefinition {
  return {
    code: params.code,
    productCode: params.productCode,
    edition: params.edition,
    deploymentModel: params.deploymentModel,
    billingInterval: params.deploymentModel === "saas_shared" ? "annual" : "custom",
    billingMetric: params.billingMetric,
    salesMotion: "assisted",
    capabilities: params.capabilities,
    minQuantity: params.minQuantity ?? 1,
    trialPolicy: NO_TRIAL,
  };
}

/**
 * Constructor de ofertas de autoservicio. El precio publicable y el
 * identificador de precio del proveedor viven en el libro de precios del
 * mercado, no aquí.
 */
function selfServiceOffer(params: {
  code: string;
  productCode: ProductCode;
  edition: ProductEdition;
  billingInterval: Exclude<BillingInterval, "custom">;
  billingMetric: BillingMetric;
  capabilities: readonly ProductCapabilityId[];
  trialPolicy?: TrialPolicy;
  minQuantity?: number;
}): OfferDefinition {
  return {
    code: params.code,
    productCode: params.productCode,
    edition: params.edition,
    deploymentModel: "saas_shared",
    billingInterval: params.billingInterval,
    billingMetric: params.billingMetric,
    salesMotion: "self_service",
    capabilities: params.capabilities,
    minQuantity: params.minQuantity ?? 1,
    trialPolicy: params.trialPolicy ?? TRIAL_14,
  };
}

/** Oferta legacy: sólo la crea la migración de planes globales. */
function legacyOffer(params: {
  code: string;
  productCode: ProductCode;
  edition: ProductEdition;
  billingMetric: BillingMetric;
  capabilities: readonly ProductCapabilityId[];
}): OfferDefinition {
  return {
    code: params.code,
    productCode: params.productCode,
    edition: params.edition,
    deploymentModel: "saas_shared",
    billingInterval: "monthly",
    billingMetric: params.billingMetric,
    salesMotion: "assisted",
    capabilities: params.capabilities,
    minQuantity: 1,
    trialPolicy: NO_TRIAL,
    legacyOnly: true,
  };
}

export const PRODUCT_CATALOG: Readonly<Record<ProductCode, ProductDefinition>> =
  {
    "platform-core": {
      code: "platform-core",
      foundation: true,
      requiresAnyOf: [],
      defaultSalesMotion: "included",
      selfServiceEligible: false,
      billingMetric: "included",
      deploymentModels: ["saas_shared", "private_cloud", "customer_hosted"],
      offers: [
        {
          code: "platform-core-included",
          productCode: "platform-core",
          edition: "standard",
          deploymentModel: "saas_shared",
          billingInterval: "monthly",
          billingMetric: "included",
          salesMotion: "included",
          capabilities: PLATFORM_CAPABILITIES,
          minQuantity: 1,
          trialPolicy: NO_TRIAL,
        },
      ],
    },

    erp: {
      code: "erp",
      foundation: false,
      requiresAnyOf: [],
      defaultSalesMotion: "assisted",
      // ERP se implanta: catálogo de cuentas, impuestos, saldos iniciales. No
      // se activa con una tarjeta de crédito y una pantalla de bienvenida.
      selfServiceEligible: false,
      billingMetric: "named_user",
      deploymentModels: ["saas_shared", "private_cloud", "customer_hosted"],
      offers: [
        assistedOffer({
          code: "erp-saas-standard",
          productCode: "erp",
          edition: "standard",
          deploymentModel: "saas_shared",
          billingMetric: "named_user",
          capabilities: [...ERP_CORE_CAPABILITIES, "erp.finance"],
          minQuantity: 5,
        }),
        assistedOffer({
          code: "erp-private-cloud",
          productCode: "erp",
          edition: "enterprise",
          deploymentModel: "private_cloud",
          billingMetric: "named_user",
          capabilities: [
            ...ERP_CORE_CAPABILITIES,
            "erp.finance",
            "platform.governance",
          ],
          minQuantity: 25,
        }),
        assistedOffer({
          code: "erp-customer-hosted",
          productCode: "erp",
          edition: "enterprise",
          deploymentModel: "customer_hosted",
          billingMetric: "named_user",
          capabilities: [
            ...ERP_CORE_CAPABILITIES,
            "erp.finance",
            "platform.governance",
          ],
          minQuantity: 25,
        }),
        legacyOffer({
          code: "erp-legacy-starter",
          productCode: "erp",
          edition: "starter",
          billingMetric: "named_user",
          capabilities: ERP_CORE_CAPABILITIES,
        }),
        legacyOffer({
          code: "erp-legacy-professional",
          productCode: "erp",
          edition: "professional",
          billingMetric: "named_user",
          capabilities: [...ERP_CORE_CAPABILITIES, "erp.finance"],
        }),
        legacyOffer({
          code: "erp-legacy-enterprise",
          productCode: "erp",
          edition: "enterprise",
          billingMetric: "named_user",
          capabilities: [
            ...ERP_CORE_CAPABILITIES,
            "erp.finance",
            "platform.governance",
          ],
        }),
      ],
    },

    mes: {
      code: "mes",
      foundation: false,
      // MES NO exige ERP: trae el subconjunto mínimo de maestros y ejecución
      // (`mes.masterdata`) o se conecta al ERP externo del cliente.
      requiresAnyOf: [],
      defaultSalesMotion: "assisted",
      selfServiceEligible: false,
      billingMetric: "site",
      deploymentModels: ["saas_shared", "private_cloud", "customer_hosted"],
      offers: [
        assistedOffer({
          code: "mes-saas-standard",
          productCode: "mes",
          edition: "standard",
          deploymentModel: "saas_shared",
          billingMetric: "site",
          capabilities: MES_CORE_CAPABILITIES,
        }),
        assistedOffer({
          code: "mes-private-cloud",
          productCode: "mes",
          edition: "enterprise",
          deploymentModel: "private_cloud",
          billingMetric: "site",
          capabilities: [
            ...MES_CORE_CAPABILITIES,
            "mes.maintenance",
            "platform.governance",
          ],
        }),
        assistedOffer({
          code: "mes-customer-hosted",
          productCode: "mes",
          edition: "enterprise",
          deploymentModel: "customer_hosted",
          billingMetric: "site",
          capabilities: [
            ...MES_CORE_CAPABILITIES,
            "mes.maintenance",
            "platform.governance",
          ],
        }),
        legacyOffer({
          code: "mes-legacy-starter",
          productCode: "mes",
          edition: "starter",
          billingMetric: "site",
          capabilities: MES_CORE_CAPABILITIES,
        }),
        legacyOffer({
          code: "mes-legacy-professional",
          productCode: "mes",
          edition: "professional",
          billingMetric: "site",
          capabilities: [...MES_CORE_CAPABILITIES, "mes.maintenance"],
        }),
        legacyOffer({
          code: "mes-legacy-enterprise",
          productCode: "mes",
          edition: "enterprise",
          billingMetric: "site",
          capabilities: [
            ...MES_CORE_CAPABILITIES,
            "mes.maintenance",
            "platform.governance",
          ],
        }),
      ],
    },

    design: {
      code: "design",
      foundation: false,
      // Diseño técnico funciona solo: no necesita ERP ni MES.
      requiresAnyOf: [],
      defaultSalesMotion: "assisted",
      selfServiceEligible: true,
      billingMetric: "author_seat",
      deploymentModels: ["saas_shared", "private_cloud"],
      offers: [
        selfServiceOffer({
          code: "design-saas-monthly",
          productCode: "design",
          edition: "standard",
          billingInterval: "monthly",
          billingMetric: "author_seat",
          capabilities: ["design.cad", "design.viewer"],
        }),
        selfServiceOffer({
          code: "design-saas-annual",
          productCode: "design",
          edition: "standard",
          billingInterval: "annual",
          billingMetric: "author_seat",
          capabilities: ["design.cad", "design.viewer"],
        }),
        assistedOffer({
          code: "design-private-cloud",
          productCode: "design",
          edition: "enterprise",
          deploymentModel: "private_cloud",
          billingMetric: "author_seat",
          capabilities: ["design.cad", "design.viewer", "platform.governance"],
          minQuantity: 10,
        }),
      ],
    },

    documents: {
      code: "documents",
      foundation: false,
      requiresAnyOf: [],
      defaultSalesMotion: "assisted",
      selfServiceEligible: true,
      billingMetric: "named_user",
      deploymentModels: ["saas_shared", "private_cloud"],
      offers: [
        selfServiceOffer({
          code: "documents-saas-monthly",
          productCode: "documents",
          edition: "standard",
          billingInterval: "monthly",
          billingMetric: "named_user",
          capabilities: ["documents.editor", "documents.pdf"],
        }),
        selfServiceOffer({
          code: "documents-saas-annual",
          productCode: "documents",
          edition: "standard",
          billingInterval: "annual",
          billingMetric: "named_user",
          capabilities: ["documents.editor", "documents.pdf"],
        }),
        assistedOffer({
          code: "documents-private-cloud",
          productCode: "documents",
          edition: "enterprise",
          deploymentModel: "private_cloud",
          billingMetric: "named_user",
          capabilities: [
            "documents.editor",
            "documents.pdf",
            "platform.governance",
          ],
          minQuantity: 25,
        }),
      ],
    },

    spreadsheets: {
      code: "spreadsheets",
      foundation: false,
      requiresAnyOf: [],
      defaultSalesMotion: "assisted",
      selfServiceEligible: true,
      billingMetric: "named_user",
      deploymentModels: ["saas_shared", "private_cloud"],
      offers: [
        selfServiceOffer({
          code: "spreadsheets-saas-monthly",
          productCode: "spreadsheets",
          edition: "standard",
          billingInterval: "monthly",
          billingMetric: "named_user",
          capabilities: ["spreadsheets.editor"],
        }),
        selfServiceOffer({
          code: "spreadsheets-saas-annual",
          productCode: "spreadsheets",
          edition: "standard",
          billingInterval: "annual",
          billingMetric: "named_user",
          capabilities: ["spreadsheets.editor"],
        }),
        assistedOffer({
          code: "spreadsheets-private-cloud",
          productCode: "spreadsheets",
          edition: "enterprise",
          deploymentModel: "private_cloud",
          billingMetric: "named_user",
          capabilities: ["spreadsheets.editor", "platform.governance"],
          minQuantity: 25,
        }),
      ],
    },

    presentations: {
      code: "presentations",
      foundation: false,
      requiresAnyOf: [],
      defaultSalesMotion: "assisted",
      selfServiceEligible: true,
      billingMetric: "named_user",
      deploymentModels: ["saas_shared", "private_cloud"],
      offers: [
        selfServiceOffer({
          code: "presentations-saas-monthly",
          productCode: "presentations",
          edition: "standard",
          billingInterval: "monthly",
          billingMetric: "named_user",
          capabilities: ["presentations.editor"],
        }),
        selfServiceOffer({
          code: "presentations-saas-annual",
          productCode: "presentations",
          edition: "standard",
          billingInterval: "annual",
          billingMetric: "named_user",
          capabilities: ["presentations.editor"],
        }),
      ],
    },

    intelligence: {
      code: "intelligence",
      foundation: false,
      // Add-on: sin datos que analizar no tiene resultado que entregar. La
      // dependencia es COMERCIAL y está declarada, no escondida en la UI.
      requiresAnyOf: [
        "erp",
        "mes",
        "design",
        "documents",
        "spreadsheets",
        "presentations",
      ],
      defaultSalesMotion: "assisted",
      selfServiceEligible: false,
      billingMetric: "tenant_package",
      deploymentModels: ["saas_shared", "private_cloud"],
      offers: [
        assistedOffer({
          code: "intelligence-saas-package",
          productCode: "intelligence",
          edition: "standard",
          deploymentModel: "saas_shared",
          billingMetric: "tenant_package",
          capabilities: ["intelligence.copilot", "intelligence.analytics"],
        }),
        assistedOffer({
          code: "intelligence-private-cloud",
          productCode: "intelligence",
          edition: "enterprise",
          deploymentModel: "private_cloud",
          billingMetric: "tenant_package",
          capabilities: [
            "intelligence.copilot",
            "intelligence.analytics",
            "platform.governance",
          ],
        }),
      ],
    },

    integrations: {
      code: "integrations",
      foundation: false,
      requiresAnyOf: ["erp", "mes"],
      defaultSalesMotion: "assisted",
      selfServiceEligible: false,
      billingMetric: "connector",
      deploymentModels: ["saas_shared", "private_cloud", "customer_hosted"],
      offers: [
        assistedOffer({
          code: "integrations-saas-connectors",
          productCode: "integrations",
          edition: "standard",
          deploymentModel: "saas_shared",
          billingMetric: "connector",
          capabilities: ["integrations.connectors"],
        }),
        // Conector especializado: mismo producto y misma capacidad, distinto
        // esfuerzo de construcción. Se separa como oferta porque su precio y su
        // implementación son otros, no porque conceda algo distinto.
        assistedOffer({
          code: "integrations-saas-custom",
          productCode: "integrations",
          edition: "professional",
          deploymentModel: "saas_shared",
          billingMetric: "connector",
          capabilities: ["integrations.connectors"],
        }),
        assistedOffer({
          code: "integrations-customer-hosted",
          productCode: "integrations",
          edition: "enterprise",
          deploymentModel: "customer_hosted",
          billingMetric: "connector",
          capabilities: ["integrations.connectors", "platform.governance"],
        }),
      ],
    },
  };

/* ───────────────────────────── Derivaciones puras ─────────────────────────── */

export const ALL_OFFERS: readonly OfferDefinition[] = PRODUCT_CODES.flatMap(
  (code) => PRODUCT_CATALOG[code].offers,
);

const OFFERS_BY_CODE = new Map<string, OfferDefinition>(
  ALL_OFFERS.map((o) => [o.code, o]),
);

export function findOffer(code: unknown): OfferDefinition | null {
  return typeof code === "string" ? (OFFERS_BY_CODE.get(code) ?? null) : null;
}

export function isOfferCode(value: unknown): boolean {
  return findOffer(value) !== null;
}

export function productFor(code: ProductCode): ProductDefinition {
  return PRODUCT_CATALOG[code];
}

/** Ofertas ofrecibles a un prospecto (excluye las que sólo crea la migración). */
export function purchasableOffers(code: ProductCode): OfferDefinition[] {
  return PRODUCT_CATALOG[code].offers.filter((o) => !o.legacyOnly);
}

/**
 * Canal de venta EFECTIVO de una oferta. Autoservicio requiere DOS condiciones:
 * el producto es elegible y el owner lo encendió por feature flag. Sin flag,
 * todo cae a venta asistida — nunca al revés.
 *
 * @param enabledSelfServiceProducts lista del flag `SELF_SERVICE_PRODUCTS`.
 */
export function effectiveSalesMotion(
  offer: OfferDefinition,
  enabledSelfServiceProducts: readonly string[] = [],
): SalesMotion {
  if (offer.salesMotion !== "self_service") return offer.salesMotion;
  const product = PRODUCT_CATALOG[offer.productCode];
  if (!product.selfServiceEligible) return "assisted";
  return enabledSelfServiceProducts.includes(offer.productCode)
    ? "self_service"
    : "assisted";
}

/** Parsea el feature flag `SELF_SERVICE_PRODUCTS=design,documents`. */
export function parseSelfServiceProducts(raw: string | undefined): ProductCode[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isProductCode)
    .filter((code) => PRODUCT_CATALOG[code].selfServiceEligible);
}

/** Capacidades concedidas por un conjunto de ofertas vigentes. */
export function capabilitiesForOffers(
  offerCodes: readonly string[],
): ProductCapabilityId[] {
  const set = new Set<ProductCapabilityId>();
  for (const code of offerCodes) {
    const offer = findOffer(code);
    if (!offer) continue;
    for (const cap of offer.capabilities) set.add(cap);
  }
  return [...set];
}

/** Producto al que pertenece una capacidad (para mensajes de upgrade honestos). */
export function productOwningCapability(
  capability: ProductCapabilityId,
): ProductCode | null {
  for (const code of PRODUCT_CODES) {
    for (const offer of PRODUCT_CATALOG[code].offers) {
      if (offer.capabilities.includes(capability)) return code;
    }
  }
  return null;
}

/**
 * ¿Se satisfacen las dependencias comerciales declaradas de `code` dado el
 * conjunto de productos que el tenant tendría? `platform-core` no cuenta como
 * "producto con datos": un add-on necesita un producto real.
 */
export function dependenciesSatisfied(
  code: ProductCode,
  ownedProducts: readonly ProductCode[],
): boolean {
  const required = PRODUCT_CATALOG[code].requiresAnyOf;
  if (required.length === 0) return true;
  return required.some((dep) => ownedProducts.includes(dep));
}

/** Dependencias faltantes; vacío si el producto es contratable tal cual. */
export function missingDependencies(
  code: ProductCode,
  ownedProducts: readonly ProductCode[],
): ProductCode[] {
  return dependenciesSatisfied(code, ownedProducts)
    ? []
    : [...PRODUCT_CATALOG[code].requiresAnyOf];
}

/**
 * Valida una selección completa del configurador (varios productos a la vez).
 * Devuelve los productos cuya dependencia NO queda cubierta por la propia
 * selección. Una selección `[intelligence]` es inválida; `[erp, intelligence]`
 * es válida aunque el tenant no tenga nada contratado todavía.
 */
export function unsatisfiedSelections(
  selection: readonly ProductCode[],
  alreadyOwned: readonly ProductCode[] = [],
): ProductCode[] {
  const pool = [...new Set([...selection, ...alreadyOwned])];
  return selection.filter((code) => !dependenciesSatisfied(code, pool));
}
