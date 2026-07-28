/**
 * LIBRO DE PRECIOS — MÉXICO 2026. Todas las cifras en MXN, ANTES DE IVA.
 *
 * Autorizado por el propietario (Sergio Valle) como precios de lanzamiento.
 * Este archivo es la ÚNICA fuente de las cifras publicadas: la landing, el
 * configurador, la API y el checkout leen de aquí. Si una pantalla muestra un
 * número que no sale de este archivo, es un número inventado.
 *
 * ─── Qué NO hace este archivo ────────────────────────────────────────────────
 * No contiene identificadores de precio del proveedor de pagos: contiene el
 * NOMBRE de la variable de entorno que los guarda. Un identificador de precio
 * es configuración de despliegue, no código, y no se versiona en el
 * repositorio.
 *
 * ─── Cargos de implementación ────────────────────────────────────────────────
 * Se declaran como `from` (estimación "desde") y jamás como `fixed`. Son
 * estimaciones comerciales que se convierten en cargo únicamente tras una
 * propuesta aceptada. El checkout automático no las cobra nunca.
 *
 * ─── Compromisos ─────────────────────────────────────────────────────────────
 * ERP y MES declaran `minimumTermMonths: 12`. Es una condición comercial
 * propuesta, no una cláusula contractual vigente: los términos legales todavía
 * no están aprobados. Ver `docs/commercial/SALES_AND_IMPLEMENTATION_TERMS.md`.
 */

import type { MarketPriceBook, PriceBookEntry } from "./pricing";
import { fixedPrice, fromPrice, quotedPrice } from "./pricing";
import type { BillingMetric } from "./product-catalog";
import type { MarketCode, Money } from "./money";
import { majorUnits } from "./money";

/** Pesos mexicanos enteros → dinero exacto en centavos. */
const mxn = (major: number): Money => majorUnits(major, "MXN");

/** Todo el libro comparte tratamiento fiscal: los precios NO incluyen IVA. */
const TAX = "exclusive" as const;

/**
 * Nombre de la variable de entorno del identificador de precio, con el mercado
 * en el nombre. Un mismo producto tiene identificadores distintos por mercado,
 * moneda e intervalo; el mercado en el nombre impide cobrar el precio de un
 * país en otro por una variable mal copiada.
 */
function priceVar(offerCode: string): string {
  return `BILLING_PRICE_MX_${offerCode.toUpperCase().replace(/-/g, "_")}`;
}

/* ───────────────────────────── Constructores ──────────────────────────────── */

/** Oferta que se cobra por unidad contratada (autor, usuario, conector…). */
function perUnitEntry(params: {
  offerCode: string;
  amount: Money;
  unit: BillingMetric;
  interval: "monthly" | "annual";
  kind?: "fixed" | "from";
  sellableOnline: boolean;
  implementationFrom?: Money;
  minimumTermMonths?: number;
  noteKeys?: readonly string[];
  minQuantity?: number;
}): PriceBookEntry {
  const display = (params.kind === "from" ? fromPrice : fixedPrice)({
    amount: params.amount,
    unit: params.unit,
    interval: params.interval,
    taxBehavior: TAX,
  });
  return {
    offerCode: params.offerCode,
    display,
    components: [
      {
        kind: "per_unit",
        labelKey: `pricing.component.${params.unit}`,
        unit: params.unit,
        unitPrice: params.amount,
        includedQuantity: 0,
        minQuantity: params.minQuantity ?? 1,
      },
    ],
    implementation: params.implementationFrom
      ? fromPrice({
          amount: params.implementationFrom,
          unit: params.unit,
          interval: "one_time",
          taxBehavior: TAX,
        })
      : null,
    priceEnvVar: params.sellableOnline ? priceVar(params.offerCode) : null,
    minimumTermMonths: params.minimumTermMonths ?? 0,
    noteKeys: params.noteKeys ?? [],
  };
}

/** Oferta con cuota base que ya incluye unidades, más excedente por unidad. */
function baseWithOverageEntry(params: {
  offerCode: string;
  baseAmount: Money;
  includedQuantity: number;
  overageAmount: Money | null;
  unit: BillingMetric;
  interval: "monthly" | "annual";
  sellableOnline: boolean;
  implementationFrom?: Money;
  minimumTermMonths?: number;
  noteKeys?: readonly string[];
  /** Límites incluidos medidos en OTRA unidad (terminales de una planta). */
  includedLimits?: readonly {
    unit: BillingMetric;
    quantity: number;
    labelKey: string;
  }[];
}): PriceBookEntry {
  return {
    offerCode: params.offerCode,
    display: fromPrice({
      amount: params.baseAmount,
      unit: params.unit,
      interval: params.interval,
      taxBehavior: TAX,
    }),
    components: [
      {
        kind: "base",
        labelKey: `pricing.component.base.${params.offerCode}`,
        unit: params.unit,
        unitPrice: params.baseAmount,
        includedQuantity: params.includedQuantity,
        minQuantity: 1,
      },
      {
        kind: "overage",
        labelKey: `pricing.component.overage.${params.unit}`,
        unit: params.unit,
        unitPrice: params.overageAmount,
        includedQuantity: 0,
        minQuantity: 0,
      },
      ...(params.includedLimits ?? []).map((limit) => ({
        kind: "overage" as const,
        labelKey: limit.labelKey,
        unit: limit.unit,
        // Sin precio: el excedente de esta unidad se COTIZA. No se inventa una
        // tarifa automática sobre algo que todavía no se mide con fiabilidad.
        unitPrice: null,
        includedQuantity: limit.quantity,
        minQuantity: 0,
      })),
    ],
    implementation: params.implementationFrom
      ? fromPrice({
          amount: params.implementationFrom,
          unit: params.unit,
          interval: "one_time",
          taxBehavior: TAX,
        })
      : null,
    priceEnvVar: params.sellableOnline ? priceVar(params.offerCode) : null,
    minimumTermMonths: params.minimumTermMonths ?? 0,
    noteKeys: params.noteKeys ?? [],
  };
}

/** Oferta sin cifra publicable: requiere diagnóstico comercial. */
function quotedEntry(params: {
  offerCode: string;
  unit: BillingMetric;
  interval: "monthly" | "annual";
  implementationFrom?: Money;
  minimumTermMonths?: number;
  noteKeys?: readonly string[];
}): PriceBookEntry {
  return {
    offerCode: params.offerCode,
    display: quotedPrice({
      unit: params.unit,
      interval: params.interval,
      taxBehavior: TAX,
    }),
    components: [],
    implementation: params.implementationFrom
      ? fromPrice({
          amount: params.implementationFrom,
          unit: params.unit,
          interval: "one_time",
          taxBehavior: TAX,
        })
      : null,
    // Una oferta cotizada NUNCA tiene identificador de precio: no hay checkout.
    priceEnvVar: null,
    minimumTermMonths: params.minimumTermMonths ?? 12,
    noteKeys: params.noteKeys ?? [],
  };
}

/* ──────────────────────────────── Entradas ────────────────────────────────── */

const ENTRIES: PriceBookEntry[] = [
  /* ─── ERP: base de organización con 5 usuarios + usuario adicional ────── */
  baseWithOverageEntry({
    offerCode: "erp-saas-standard",
    baseAmount: mxn(12_900),
    includedQuantity: 5,
    overageAmount: mxn(790),
    unit: "named_user",
    interval: "monthly",
    // Venta asistida: hay implementación real (catálogo de cuentas, impuestos,
    // saldos iniciales). No hay checkout automático aunque haya precio público.
    sellableOnline: false,
    implementationFrom: mxn(95_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.erp.includesOrganization",
      "pricing.note.erp.additionalUser",
      "pricing.note.assistedOnly",
      "pricing.note.minimumTerm12",
    ],
  }),

  /* ─── MES: por planta, con diez terminales incluidas ──────────────────── */
  baseWithOverageEntry({
    offerCode: "mes-saas-standard",
    baseAmount: mxn(24_900),
    includedQuantity: 1,
    // El excedente de plantas se cotiza: cada planta añade implementación.
    overageAmount: null,
    unit: "site",
    interval: "monthly",
    sellableOnline: false,
    implementationFrom: mxn(180_000),
    minimumTermMonths: 12,
    includedLimits: [
      {
        unit: "terminal",
        quantity: 10,
        labelKey: "pricing.component.included.terminals",
      },
    ],
    noteKeys: [
      "pricing.note.mes.perSite",
      "pricing.note.mes.terminals",
      "pricing.note.mes.higherVolumeAssisted",
      "pricing.note.assistedOnly",
      "pricing.note.minimumTerm12",
    ],
  }),

  /* ─── Design: por autor; visualizadores sin costo ─────────────────────── */
  perUnitEntry({
    offerCode: "design-saas-monthly",
    amount: mxn(790),
    unit: "author_seat",
    interval: "monthly",
    sellableOnline: true,
    implementationFrom: mxn(9_900),
    noteKeys: ["pricing.note.design.viewersFree", "pricing.note.design.onboardingOptional"],
  }),
  perUnitEntry({
    offerCode: "design-saas-annual",
    amount: mxn(7_900),
    unit: "author_seat",
    interval: "annual",
    sellableOnline: true,
    implementationFrom: mxn(9_900),
    noteKeys: [
      "pricing.note.design.viewersFree",
      "pricing.note.design.onboardingOptional",
      "pricing.note.annualSavings",
    ],
  }),

  /* ─── Editores individuales ───────────────────────────────────────────── */
  perUnitEntry({
    offerCode: "documents-saas-monthly",
    amount: mxn(99),
    unit: "named_user",
    interval: "monthly",
    sellableOnline: true,
  }),
  perUnitEntry({
    offerCode: "documents-saas-annual",
    amount: mxn(990),
    unit: "named_user",
    interval: "annual",
    sellableOnline: true,
    noteKeys: ["pricing.note.annualSavings"],
  }),
  perUnitEntry({
    offerCode: "spreadsheets-saas-monthly",
    amount: mxn(99),
    unit: "named_user",
    interval: "monthly",
    sellableOnline: true,
  }),
  perUnitEntry({
    offerCode: "spreadsheets-saas-annual",
    amount: mxn(990),
    unit: "named_user",
    interval: "annual",
    sellableOnline: true,
    noteKeys: ["pricing.note.annualSavings"],
  }),
  perUnitEntry({
    offerCode: "presentations-saas-monthly",
    amount: mxn(99),
    unit: "named_user",
    interval: "monthly",
    sellableOnline: true,
  }),
  perUnitEntry({
    offerCode: "presentations-saas-annual",
    amount: mxn(990),
    unit: "named_user",
    interval: "annual",
    sellableOnline: true,
    noteKeys: ["pricing.note.annualSavings"],
  }),

  /* ─── Intelligence: base por organización + consumo medido ────────────── */
  baseWithOverageEntry({
    offerCode: "intelligence-saas-package",
    baseAmount: mxn(4_900),
    includedQuantity: 1,
    overageAmount: null,
    unit: "tenant_package",
    interval: "monthly",
    sellableOnline: false,
    implementationFrom: mxn(20_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.intelligence.meteredConsumption",
      "pricing.note.intelligence.budgetControlled",
      "pricing.note.assistedOnly",
      "pricing.note.minimumTerm12",
    ],
  }),

  /* ─── Integraciones ───────────────────────────────────────────────────── */
  perUnitEntry({
    offerCode: "integrations-saas-connectors",
    amount: mxn(2_500),
    unit: "connector",
    interval: "monthly",
    sellableOnline: false,
    implementationFrom: mxn(25_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.integrations.standardScope",
      "pricing.note.integrations.implementationRange",
      "pricing.note.assistedOnly",
    ],
  }),
  perUnitEntry({
    offerCode: "integrations-saas-custom",
    amount: mxn(5_000),
    unit: "connector",
    interval: "monthly",
    kind: "from",
    sellableOnline: false,
    implementationFrom: mxn(75_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.integrations.customScope",
      "pricing.note.assistedOnly",
    ],
  }),

  /* ─── Nube privada: recargo por entorno dedicado ──────────────────────── */
  perUnitEntry({
    offerCode: "private-cloud-environment",
    amount: mxn(24_900),
    unit: "environment",
    interval: "monthly",
    kind: "from",
    sellableOnline: false,
    implementationFrom: mxn(250_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.privateCloud.additional",
      "pricing.note.privateCloud.annualCommitment",
      "pricing.note.privateCloud.noCertifications",
      "pricing.note.assistedOnly",
    ],
  }),

  /* ─── Soporte prioritario ─────────────────────────────────────────────── */
  perUnitEntry({
    offerCode: "support-priority",
    amount: mxn(5_900),
    unit: "tenant_package",
    interval: "monthly",
    kind: "from",
    sellableOnline: false,
    noteKeys: [
      "pricing.note.support.standardIncluded",
      "pricing.note.support.no247",
      "pricing.note.assistedOnly",
    ],
  }),

  /* ─── Paquetes ────────────────────────────────────────────────────────── */
  perUnitEntry({
    offerCode: "work-suite-saas-monthly",
    amount: mxn(249),
    unit: "named_user",
    interval: "monthly",
    sellableOnline: true,
    noteKeys: ["pricing.note.bundle.expandsToProducts"],
  }),
  perUnitEntry({
    offerCode: "work-suite-saas-annual",
    amount: mxn(2_490),
    unit: "named_user",
    interval: "annual",
    sellableOnline: true,
    noteKeys: [
      "pricing.note.bundle.expandsToProducts",
      "pricing.note.annualSavings",
    ],
  }),
  perUnitEntry({
    offerCode: "engineering-studio-saas-monthly",
    amount: mxn(4_900),
    unit: "tenant_package",
    interval: "monthly",
    sellableOnline: true,
    implementationFrom: mxn(15_000),
    noteKeys: [
      "pricing.note.bundle.expandsToProducts",
      "pricing.note.bundle.fixedPack",
      "pricing.note.design.onboardingOptional",
    ],
  }),
  perUnitEntry({
    offerCode: "business-operations-saas-monthly",
    amount: mxn(13_900),
    unit: "tenant_package",
    interval: "monthly",
    sellableOnline: false,
    implementationFrom: mxn(110_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.bundle.expandsToProducts",
      "pricing.note.bundle.fixedPack",
      "pricing.note.assistedOnly",
      "pricing.note.minimumTerm12",
    ],
  }),
  perUnitEntry({
    offerCode: "manufacturing-bridge-saas-monthly",
    amount: mxn(31_900),
    unit: "tenant_package",
    interval: "monthly",
    sellableOnline: false,
    implementationFrom: mxn(220_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.bundle.expandsToProducts",
      "pricing.note.bundle.fixedPack",
      "pricing.note.bundle.keepsExternalErp",
      "pricing.note.assistedOnly",
      "pricing.note.minimumTerm12",
    ],
  }),
  perUnitEntry({
    offerCode: "manufacturing-complete-saas-monthly",
    amount: mxn(49_900),
    unit: "tenant_package",
    interval: "monthly",
    sellableOnline: false,
    implementationFrom: mxn(280_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.bundle.expandsToProducts",
      "pricing.note.bundle.fixedPack",
      "pricing.note.assistedOnly",
      "pricing.note.minimumTerm12",
    ],
  }),
  perUnitEntry({
    offerCode: "enterprise-complete-saas-monthly",
    amount: mxn(76_900),
    unit: "tenant_package",
    interval: "monthly",
    kind: "from",
    sellableOnline: false,
    implementationFrom: mxn(500_000),
    minimumTermMonths: 12,
    noteKeys: [
      "pricing.note.bundle.expandsToProducts",
      "pricing.note.bundle.enterpriseScope",
      "pricing.note.assistedOnly",
      "pricing.note.minimumTerm12",
    ],
  }),

  /* ─── Nube privada por producto: siempre cotizada ─────────────────────── */
  quotedEntry({
    offerCode: "erp-private-cloud",
    unit: "named_user",
    interval: "monthly",
    implementationFrom: mxn(250_000),
    noteKeys: ["pricing.note.privateCloud.quoted", "pricing.note.assistedOnly"],
  }),
  quotedEntry({
    offerCode: "mes-private-cloud",
    unit: "site",
    interval: "monthly",
    implementationFrom: mxn(250_000),
    noteKeys: ["pricing.note.privateCloud.quoted", "pricing.note.assistedOnly"],
  }),
  quotedEntry({
    offerCode: "design-private-cloud",
    unit: "author_seat",
    interval: "monthly",
    implementationFrom: mxn(250_000),
    noteKeys: ["pricing.note.privateCloud.quoted", "pricing.note.assistedOnly"],
  }),
  quotedEntry({
    offerCode: "documents-private-cloud",
    unit: "named_user",
    interval: "monthly",
    implementationFrom: mxn(250_000),
    noteKeys: ["pricing.note.privateCloud.quoted", "pricing.note.assistedOnly"],
  }),
  quotedEntry({
    offerCode: "spreadsheets-private-cloud",
    unit: "named_user",
    interval: "monthly",
    implementationFrom: mxn(250_000),
    noteKeys: ["pricing.note.privateCloud.quoted", "pricing.note.assistedOnly"],
  }),
  quotedEntry({
    offerCode: "intelligence-private-cloud",
    unit: "tenant_package",
    interval: "monthly",
    implementationFrom: mxn(250_000),
    noteKeys: ["pricing.note.privateCloud.quoted", "pricing.note.assistedOnly"],
  }),
];

/* ─────────────────────────────── El libro ─────────────────────────────────── */

export const PRICE_BOOK_MX_2026: MarketPriceBook = {
  market: "MX",
  currency: "MXN",
  taxBehavior: TAX,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: null,
  entries: Object.fromEntries(ENTRIES.map((e) => [e.offerCode, e])),
};

/* ─────────────────────────── Registro de mercados ─────────────────────────── */

const PRICE_BOOKS: Readonly<Record<MarketCode, MarketPriceBook>> = {
  MX: PRICE_BOOK_MX_2026,
};

/**
 * Libro de un mercado. Devuelve `null` si el mercado no existe o su libro está
 * fuera de vigencia: sin libro vigente NO hay precio, y la interfaz debe
 * ofrecer contacto comercial en vez de mostrar una cifra caducada.
 */
export function priceBookFor(
  market: string,
  now: Date = new Date(),
): MarketPriceBook | null {
  const book = (PRICE_BOOKS as Record<string, MarketPriceBook | undefined>)[
    market
  ];
  if (!book) return null;
  const from = Date.parse(book.validFrom);
  if (Number.isFinite(from) && now.getTime() < from) return null;
  if (book.validUntil) {
    const until = Date.parse(book.validUntil);
    if (Number.isFinite(until) && now.getTime() >= until) return null;
  }
  return book;
}

/** Nombres de TODAS las variables de precio que el mercado necesita configuradas. */
export function requiredPriceEnvVars(book: MarketPriceBook): string[] {
  return Object.values(book.entries)
    .map((e) => e.priceEnvVar)
    .filter((v): v is string => !!v)
    .sort();
}
