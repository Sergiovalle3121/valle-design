/**
 * VISTA PÚBLICA DEL CATÁLOGO — una sola construcción para API y web.
 *
 * El encargo exige que los precios sean idénticos entre la página, la API y el
 * checkout. Eso se puede intentar con una prueba que compare tres implementa-
 * ciones, o se puede hacer imposible de romper: aquí sólo hay UNA función que
 * construye la vista. La API la sirve, la web la renderiza y el checkout
 * resuelve el cobro desde el mismo libro. No hay una segunda aritmética que
 * pueda divergir.
 *
 * Todo lo que sale de aquí es serializable: importes en unidades menores más
 * moneda, nunca cadenas ya formateadas. El formato depende del idioma del
 * visitante y es la última capa, no un dato del catálogo.
 */

import type { BrandManifest } from "./brand";
import { productDisplayName } from "./brand";
import type { CurrencyCode, MarketCode, Money, TaxBehavior } from "./money";
import type { DisplayPrice, PriceInterval, PriceKind } from "./pricing";
import { compareBundleToStandalone, quoteOffer } from "./pricing";
import { priceBookFor } from "./price-book-mx";
import type {
  BillingMetric,
  DeploymentModel,
  ProductCode,
  SalesMotion,
} from "./product-catalog";
import {
  DEPLOYMENT_AVAILABILITY,
  PRODUCT_CATALOG,
  PRODUCT_CODES,
  effectiveSalesMotion,
  purchasableOffers,
} from "./product-catalog";
import type { BundleCode, BuyerSegment } from "./bundles";
import {
  BUNDLE_OFFERS,
  bundleEffectiveSalesMotion,
  expandBundle,
  productsInBundle,
} from "./bundles";

/* ──────────────────────────────── Formas ──────────────────────────────────── */

export interface PublicMoney {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export interface PublicPrice {
  readonly kind: PriceKind;
  readonly amount: PublicMoney | null;
  readonly unit: BillingMetric;
  readonly interval: PriceInterval;
  readonly taxBehavior: TaxBehavior;
}

export interface PublicComponent {
  readonly kind: string;
  readonly labelKey: string;
  readonly unit: BillingMetric;
  readonly unitPrice: PublicMoney | null;
  readonly includedQuantity: number;
  readonly minQuantity: number;
}

export interface PublicOffer {
  readonly code: string;
  readonly edition: string;
  readonly deploymentModel: DeploymentModel;
  readonly deploymentAvailability: "general" | "limited";
  readonly billingInterval: string;
  readonly billingMetric: BillingMetric;
  readonly minQuantity: number;
  readonly trialDays: number;
  readonly salesMotion: SalesMotion;
  /** `null` = el mercado no publica precio para esta oferta. */
  readonly price: PublicPrice | null;
  readonly components: readonly PublicComponent[];
  readonly implementation: PublicPrice | null;
  readonly minimumTermMonths: number;
  readonly noteKeys: readonly string[];
  /** `true` si el cobro en línea está realmente configurado y disponible hoy. */
  readonly checkoutAvailable: boolean;
}

export interface PublicProduct {
  readonly code: ProductCode;
  readonly displayName: string;
  readonly foundation: boolean;
  readonly requiresAnyOf: readonly ProductCode[];
  readonly billingMetric: BillingMetric;
  readonly deploymentModels: readonly DeploymentModel[];
  readonly offers: readonly PublicOffer[];
}

export interface PublicBundleComponent {
  readonly productCode: ProductCode;
  readonly offerCode: string;
  readonly quantity: number;
}

export interface PublicBundle {
  readonly code: string;
  readonly bundleCode: BundleCode;
  readonly segment: BuyerSegment;
  readonly billingInterval: string;
  readonly deploymentModel: DeploymentModel;
  readonly scaling: string;
  readonly unit: BillingMetric;
  readonly minQuantity: number;
  readonly trialDays: number;
  readonly salesMotion: SalesMotion;
  readonly products: readonly ProductCode[];
  readonly components: readonly PublicBundleComponent[];
  readonly price: PublicPrice | null;
  readonly implementation: PublicPrice | null;
  readonly minimumTermMonths: number;
  readonly noteKeys: readonly string[];
  readonly checkoutAvailable: boolean;
  /** Comparación CALCULADA contra comprar los componentes por separado. */
  readonly standaloneTotal: PublicMoney | null;
  readonly savings: PublicMoney | null;
  readonly savingsBps: number | null;
}

export interface PublicCatalog {
  readonly market: MarketCode | string;
  readonly currency: CurrencyCode | null;
  readonly taxBehavior: TaxBehavior | null;
  readonly priceBookValidFrom: string | null;
  readonly brand: {
    readonly brandName: string;
    readonly legalEntityName: string;
    readonly trademarkStatus: string;
    readonly trademarkSymbol: string;
  };
  readonly selfServiceProducts: readonly ProductCode[];
  readonly products: readonly PublicProduct[];
  readonly bundles: readonly PublicBundle[];
}

/* ─────────────────────────────── Construcción ─────────────────────────────── */

function toPublicMoney(amount: Money | null): PublicMoney | null {
  return amount
    ? { amountMinor: amount.amountMinor, currency: amount.currency }
    : null;
}

function toPublicPrice(price: DisplayPrice | null): PublicPrice | null {
  if (!price) return null;
  return {
    kind: price.kind,
    amount: toPublicMoney(price.amount),
    unit: price.unit,
    interval: price.interval,
    taxBehavior: price.taxBehavior,
  };
}

export interface CatalogBuildOptions {
  readonly market: string;
  readonly brand: BrandManifest;
  readonly selfServiceProducts: readonly ProductCode[];
  /**
   * Ofertas cuyo cobro en línea está EFECTIVAMENTE configurado (identificador
   * de precio presente). Lo calcula el backend leyendo el entorno; el
   * contrato no lee variables de entorno porque también corre en el navegador.
   */
  readonly chargeableOfferCodes: readonly string[];
  readonly now?: Date;
}

/**
 * Construye la vista pública completa.
 *
 * `checkoutAvailable` es la conjunción de TODO lo que debe ser cierto para
 * comprar: canal de autoservicio, modalidad disponible, precio publicado en el
 * mercado e identificador de precio configurado. La interfaz no vuelve a
 * razonar sobre esas cuatro condiciones por separado — si intentara, tarde o
 * temprano mostraría un botón de compra que el backend rechaza.
 */
export function buildPublicCatalog(
  options: CatalogBuildOptions,
): PublicCatalog {
  const now = options.now ?? new Date();
  const book = priceBookFor(options.market, now);
  const chargeable = new Set(options.chargeableOfferCodes);
  const enabled = options.selfServiceProducts;

  const products: PublicProduct[] = PRODUCT_CODES.map((code) => {
    const product = PRODUCT_CATALOG[code];
    return {
      code,
      displayName: productDisplayName(options.brand, code),
      foundation: product.foundation,
      requiresAnyOf: product.requiresAnyOf,
      billingMetric: product.billingMetric,
      deploymentModels: product.deploymentModels,
      offers: purchasableOffers(code).map((offer): PublicOffer => {
        const entry = book?.entries[offer.code] ?? null;
        return {
          code: offer.code,
          edition: offer.edition,
          deploymentModel: offer.deploymentModel,
          deploymentAvailability:
            DEPLOYMENT_AVAILABILITY[offer.deploymentModel],
          billingInterval: offer.billingInterval,
          billingMetric: offer.billingMetric,
          minQuantity: offer.minQuantity,
          trialDays: offer.trialPolicy.days,
          salesMotion: effectiveSalesMotion(offer, enabled),
          price: toPublicPrice(entry?.display ?? null),
          components: (entry?.components ?? []).map((c) => ({
            kind: c.kind,
            labelKey: c.labelKey,
            unit: c.unit,
            unitPrice: toPublicMoney(c.unitPrice),
            includedQuantity: c.includedQuantity,
            minQuantity: c.minQuantity,
          })),
          implementation: toPublicPrice(entry?.implementation ?? null),
          minimumTermMonths: entry?.minimumTermMonths ?? 0,
          noteKeys: entry?.noteKeys ?? [],
          checkoutAvailable: chargeable.has(offer.code),
        };
      }),
    };
  });

  const bundles: PublicBundle[] = BUNDLE_OFFERS.map((bundle): PublicBundle => {
    const entry = book?.entries[bundle.code] ?? null;
    const referenceQuantity =
      bundle.scaling === "fixed_pack" ? 1 : Math.max(1, bundle.minQuantity);
    const comparison = book
      ? compareBundleToStandalone(
          book,
          bundle.code,
          referenceQuantity,
          expandBundle(bundle, referenceQuantity),
        )
      : null;

    return {
      code: bundle.code,
      bundleCode: bundle.bundleCode,
      segment: bundle.segment,
      billingInterval: bundle.billingInterval,
      deploymentModel: bundle.deploymentModel,
      scaling: bundle.scaling,
      unit: bundle.unit,
      minQuantity: bundle.minQuantity,
      trialDays: bundle.trialPolicy.days,
      salesMotion: bundleEffectiveSalesMotion(bundle, enabled),
      products: productsInBundle(bundle),
      components: bundle.components.map((c) => ({
        productCode: c.productCode,
        offerCode: c.offerCode,
        quantity: c.quantity,
      })),
      price: toPublicPrice(entry?.display ?? null),
      implementation: toPublicPrice(entry?.implementation ?? null),
      minimumTermMonths: entry?.minimumTermMonths ?? 0,
      noteKeys: entry?.noteKeys ?? [],
      checkoutAvailable: chargeable.has(bundle.code),
      standaloneTotal: toPublicMoney(comparison?.standaloneTotal ?? null),
      savings: toPublicMoney(comparison?.savings ?? null),
      savingsBps: comparison?.savingsBps ?? null,
    };
  });

  return {
    market: options.market,
    currency: book?.currency ?? null,
    taxBehavior: book?.taxBehavior ?? null,
    priceBookValidFrom: book?.validFrom ?? null,
    brand: {
      brandName: options.brand.brandName,
      legalEntityName: options.brand.legalEntityName,
      trademarkStatus: options.brand.trademarkStatus,
      trademarkSymbol: options.brand.trademarkSymbol,
    },
    selfServiceProducts: [...enabled],
    products,
    bundles,
  };
}

/* ───────────────────────── Cotización desde la vista ──────────────────────── */

export interface PublicQuoteLine {
  readonly offerCode: string;
  readonly quantity: number;
  readonly isBundle: boolean;
  readonly priceKind: PriceKind;
  readonly recurring: PublicMoney | null;
  readonly interval: PriceInterval;
  readonly implementationFrom: PublicMoney | null;
  readonly salesMotion: SalesMotion;
  readonly checkoutAvailable: boolean;
  readonly minimumTermMonths: number;
  readonly noteKeys: readonly string[];
}

export interface PublicQuote {
  readonly market: string;
  readonly currency: CurrencyCode | null;
  readonly taxBehavior: TaxBehavior | null;
  readonly lines: readonly PublicQuoteLine[];
  readonly recurringSubtotal: PublicMoney | null;
  readonly implementationFrom: PublicMoney | null;
  readonly requiresQuote: readonly string[];
  readonly isEstimate: boolean;
  /** Ofertas de la selección que SÍ se pueden pagar ahora mismo. */
  readonly selfServiceOfferCodes: readonly string[];
  /** Ofertas que van a propuesta comercial. */
  readonly assistedOfferCodes: readonly string[];
}

/**
 * Cotiza una selección mixta y la SEPARA en lo que se puede contratar ahora y
 * lo que requiere diagnóstico.
 *
 * Esa separación es el punto: un carrito que mezcla Design (pagable hoy) con
 * ERP (implantación de semanas) y muestra un único total sugiere que todo se
 * activa al pagar. No es cierto, y descubrirlo después de pagar es la peor
 * forma de descubrirlo.
 */
export function quotePublicSelection(
  catalog: PublicCatalog,
  items: readonly { readonly offerCode: string; readonly quantity: number }[],
  now: Date = new Date(),
): PublicQuote {
  const book = priceBookFor(catalog.market, now);
  const offerIndex = new Map<string, PublicOffer>();
  for (const product of catalog.products) {
    for (const offer of product.offers) offerIndex.set(offer.code, offer);
  }
  const bundleIndex = new Map<string, PublicBundle>(
    catalog.bundles.map((b) => [b.code, b]),
  );

  const lines: PublicQuoteLine[] = [];
  const requiresQuote: string[] = [];
  const selfService: string[] = [];
  const assisted: string[] = [];
  let recurringMinor = 0;
  let implementationMinor = 0;
  let isEstimate = false;
  let sawPricedLine = false;

  for (const item of items) {
    const bundle = bundleIndex.get(item.offerCode) ?? null;
    const offer = offerIndex.get(item.offerCode) ?? null;
    if (!bundle && !offer) {
      requiresQuote.push(item.offerCode);
      continue;
    }

    const quantity =
      bundle?.scaling === "fixed_pack"
        ? 1
        : Math.max(
            1,
            Math.floor(Number(item.quantity) || 1),
            bundle?.minQuantity ?? offer?.minQuantity ?? 1,
          );

    const line = book ? quoteOffer(book, item.offerCode, quantity) : null;
    const salesMotion = (bundle?.salesMotion ??
      offer?.salesMotion ??
      "assisted") as SalesMotion;
    const checkoutAvailable =
      (bundle?.checkoutAvailable ?? offer?.checkoutAvailable ?? false) &&
      salesMotion === "self_service";

    if (checkoutAvailable) selfService.push(item.offerCode);
    else assisted.push(item.offerCode);

    if (line?.recurring) {
      recurringMinor += line.recurring.amountMinor;
      sawPricedLine = true;
    } else {
      requiresQuote.push(item.offerCode);
    }
    if (line?.implementationFrom) {
      implementationMinor += line.implementationFrom.amountMinor;
    }
    if (line?.priceKind === "from") isEstimate = true;

    lines.push({
      offerCode: item.offerCode,
      quantity,
      isBundle: !!bundle,
      priceKind: line?.priceKind ?? "quote",
      recurring: toPublicMoney(line?.recurring ?? null),
      interval: line?.interval ?? "monthly",
      implementationFrom: toPublicMoney(line?.implementationFrom ?? null),
      salesMotion,
      checkoutAvailable,
      minimumTermMonths:
        bundle?.minimumTermMonths ?? offer?.minimumTermMonths ?? 0,
      noteKeys: bundle?.noteKeys ?? offer?.noteKeys ?? [],
    });
  }

  const currency = catalog.currency;
  return {
    market: catalog.market,
    currency,
    taxBehavior: catalog.taxBehavior,
    lines,
    recurringSubtotal:
      currency && sawPricedLine
        ? { amountMinor: recurringMinor, currency }
        : null,
    implementationFrom:
      currency && implementationMinor > 0
        ? { amountMinor: implementationMinor, currency }
        : null,
    requiresQuote,
    isEstimate,
    selfServiceOfferCodes: selfService,
    assistedOfferCodes: assisted,
  };
}
