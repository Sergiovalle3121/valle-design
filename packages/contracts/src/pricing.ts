/**
 * MODELO DE PRECIOS — libro por mercado, componentes de cobro y cotización.
 *
 * Sustituye al antiguo `listPriceUsd: number | null`, que sólo podía expresar
 * "un número o nada". El catálogo real necesita distinguir cosas que ese campo
 * confundía:
 *
 *   • un precio FIJO ($99/usuario/mes) de uno "DESDE" ($12,900/mes) de uno que
 *     sólo se COTIZA (configuración empresarial);
 *   • una cuota BASE que ya incluye cinco usuarios, de un precio POR UNIDAD;
 *   • un cargo RECURRENTE de un cargo ÚNICO de implementación — que es una
 *     estimación comercial, no algo que se cobre a una tarjeta;
 *   • el precio PÚBLICO del identificador de precio del proveedor de pagos.
 *
 * Esa última separación es de seguridad, no de estilo: el precio que se
 * MUESTRA y el precio que se COBRA viven en sitios distintos y se resuelven
 * por caminos distintos. El navegador jamás envía ninguno de los dos.
 */

import type { BillingMetric } from "./product-catalog";
import type { CurrencyCode, MarketCode, Money, TaxBehavior } from "./money";
import {
  addMoney,
  majorUnits,
  money,
  multiplyMoney,
  sumMoney,
  zeroMoney,
} from "./money";

/* ────────────────────────────── Tipo de precio ────────────────────────────── */

/**
 * `fixed`  — la cifra publicada es el precio; se puede cobrar tal cual.
 * `from`   — la cifra es un piso real; la configuración final puede subirla.
 * `quote`  — no hay cifra publicable; requiere diagnóstico comercial.
 *
 * `from` NO es un adorno de marketing: marca las ofertas cuyo precio final
 * depende de una configuración que todavía no se ha hecho. Publicar un `from`
 * como si fuera `fixed` sería prometer un precio que no se puede sostener.
 */
export const PRICE_KINDS = ["fixed", "from", "quote"] as const;

export type PriceKind = (typeof PRICE_KINDS)[number];

/** Periodicidad de una cifra publicada. */
export const PRICE_INTERVALS = ["monthly", "annual", "one_time"] as const;

export type PriceInterval = (typeof PRICE_INTERVALS)[number];

export function isPriceInterval(value: unknown): value is PriceInterval {
  return (
    typeof value === "string" &&
    (PRICE_INTERVALS as readonly string[]).includes(value)
  );
}

/* ──────────────────────────── Precio publicable ───────────────────────────── */

/**
 * Cifra tal como se muestra. `amount` es `null` únicamente cuando
 * `kind === "quote"`; cualquier otra combinación es un libro de precios mal
 * escrito y `validatePriceBook` la rechaza.
 */
export interface DisplayPrice {
  readonly kind: PriceKind;
  readonly amount: Money | null;
  readonly unit: BillingMetric;
  readonly interval: PriceInterval;
  readonly taxBehavior: TaxBehavior;
}

/* ────────────────────────── Componentes de cobro ──────────────────────────── */

/**
 * `base`    — cuota fija del producto; puede incluir unidades (ERP: 5 usuarios).
 * `per_unit`— se multiplica por la cantidad contratada (Design: por autor).
 * `overage` — precio de cada unidad por encima de las incluidas (usuario 6+).
 * `one_time`— cargo único estimado (implementación). NUNCA se cobra solo.
 */
export const COMPONENT_KINDS = [
  "base",
  "per_unit",
  "overage",
  "one_time",
] as const;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export interface BillingComponent {
  readonly kind: ComponentKind;
  /** Clave i18n del rótulo. Nunca texto visible: la marca sale del manifiesto. */
  readonly labelKey: string;
  readonly unit: BillingMetric;
  /** `null` ⇒ este componente se cotiza y no entra al subtotal automático. */
  readonly unitPrice: Money | null;
  /** Unidades ya cubiertas por este componente (0 si no cubre ninguna). */
  readonly includedQuantity: number;
  /** Mínimo comercial de unidades contratables. */
  readonly minQuantity: number;
}

/* ───────────────────────────── Entrada del libro ──────────────────────────── */

export interface PriceBookEntry {
  /** Oferta del catálogo (o del catálogo de paquetes) a la que aplica. */
  readonly offerCode: string;
  readonly display: DisplayPrice;
  readonly components: readonly BillingComponent[];
  /**
   * Cargo único de implementación/onboarding. Es una ESTIMACIÓN comercial: no
   * se convierte en un cobro automático sin propuesta firmada y aceptación.
   */
  readonly implementation: DisplayPrice | null;
  /**
   * Variable de entorno que contiene el identificador de precio del proveedor
   * de pagos PARA ESTE MERCADO. Vive aquí y no en la oferta porque el mismo
   * producto tiene identificadores distintos por mercado, moneda e intervalo.
   * `null` ⇒ la oferta no se puede cobrar en línea.
   */
  readonly priceEnvVar: string | null;
  /** Compromiso mínimo en meses (ERP y MES: 12). 0 = sin compromiso. */
  readonly minimumTermMonths: number;
  /** Claves i18n de límites y condiciones honestas mostradas junto al precio. */
  readonly noteKeys: readonly string[];
}

/* ─────────────────────────────── Libro por mercado ────────────────────────── */

export interface MarketPriceBook {
  readonly market: MarketCode;
  readonly currency: CurrencyCode;
  readonly taxBehavior: TaxBehavior;
  /** Vigencia. Un libro caducado NO se sirve: no se "aproxima" un precio viejo. */
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly entries: Readonly<Record<string, PriceBookEntry>>;
}

/** ¿El libro está vigente en `now`? Fuera de vigencia no hay precio publicable. */
export function isPriceBookCurrent(
  book: MarketPriceBook,
  now: Date = new Date(),
): boolean {
  const t = now.getTime();
  if (Number.isNaN(t)) return false;
  const from = Date.parse(book.validFrom);
  if (Number.isFinite(from) && t < from) return false;
  if (book.validUntil) {
    const until = Date.parse(book.validUntil);
    if (Number.isFinite(until) && t >= until) return false;
  }
  return true;
}

/* ──────────────────────────────── Cotización ──────────────────────────────── */

export interface QuoteBreakdownLine {
  readonly componentKind: ComponentKind;
  readonly labelKey: string;
  readonly unit: BillingMetric;
  readonly quantity: number;
  readonly unitPrice: Money | null;
  readonly amount: Money | null;
}

export interface QuoteLine {
  readonly offerCode: string;
  readonly quantity: number;
  readonly priceKind: PriceKind;
  /** Recurrente calculado. `null` ⇒ requiere cotización comercial. */
  readonly recurring: Money | null;
  readonly interval: PriceInterval;
  /** Implementación estimada "desde". Nunca entra al cobro automático. */
  readonly implementationFrom: Money | null;
  readonly minimumTermMonths: number;
  readonly breakdown: readonly QuoteBreakdownLine[];
  readonly noteKeys: readonly string[];
}

export interface Quote {
  readonly market: MarketCode;
  readonly currency: CurrencyCode;
  readonly taxBehavior: TaxBehavior;
  readonly lines: readonly QuoteLine[];
  /** Suma de lo que SÍ tiene precio publicado. */
  readonly recurringSubtotal: Money;
  /** Suma de las implementaciones estimadas. Separada del recurrente. */
  readonly implementationFrom: Money;
  /** Ofertas de la selección que no tienen cifra publicable. */
  readonly requiresQuote: readonly string[];
  /** `true` si alguna línea es "desde": el total mostrado es un piso, no un cierre. */
  readonly isEstimate: boolean;
}

/**
 * Cotiza UNA oferta para una cantidad dada.
 *
 * Regla de las unidades incluidas: la cuota `base` cubre `includedQuantity`
 * unidades; sólo el excedente se multiplica por el `overage`. Sin esa regla
 * un ERP de 5 usuarios costaría 5 × $12,900 en vez de $12,900.
 *
 * Devuelve `null` si la oferta no existe en este libro — el llamador decide si
 * eso es un error del cliente o un producto sin precio en ese mercado. Jamás
 * se inventa una cifra.
 */
export function quoteOffer(
  book: MarketPriceBook,
  offerCode: string,
  quantity: number,
): QuoteLine | null {
  const entry = book.entries[offerCode];
  if (!entry) return null;

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const breakdown: QuoteBreakdownLine[] = [];
  let recurring: Money | null = zeroMoney(book.currency);
  let coveredByBase = 0;

  for (const component of entry.components) {
    if (component.kind === "one_time") continue;

    // Un componente sólo consume la cantidad contratada si mide en la MISMA
    // unidad que la oferta. MES cobra por planta e incluye diez terminales:
    // restar terminales a un número de plantas produciría un excedente
    // inventado. Los componentes en otra unidad son límites declarados, no
    // cargos calculados.
    const measuresContractedUnit = component.unit === entry.display.unit;

    if (component.kind === "base") {
      if (measuresContractedUnit) coveredByBase += component.includedQuantity;
      const amount = component.unitPrice;
      breakdown.push({
        componentKind: "base",
        labelKey: component.labelKey,
        unit: component.unit,
        quantity: 1,
        unitPrice: component.unitPrice,
        amount,
      });
      recurring = amount && recurring ? addMoney(recurring, amount) : null;
      continue;
    }

    if (component.kind === "per_unit") {
      const units = Math.max(qty, component.minQuantity);
      const amount = component.unitPrice
        ? multiplyMoney(component.unitPrice, units)
        : null;
      breakdown.push({
        componentKind: "per_unit",
        labelKey: component.labelKey,
        unit: component.unit,
        quantity: units,
        unitPrice: component.unitPrice,
        amount,
      });
      recurring = amount && recurring ? addMoney(recurring, amount) : null;
      continue;
    }

    // overage: sólo las unidades por encima de las que cubre la base, y sólo
    // si el excedente se mide en la unidad que el cliente está contratando.
    const extra = measuresContractedUnit ? Math.max(0, qty - coveredByBase) : 0;
    const amount = component.unitPrice
      ? multiplyMoney(component.unitPrice, extra)
      : null;
    breakdown.push({
      componentKind: "overage",
      labelKey: component.labelKey,
      unit: component.unit,
      quantity: extra,
      unitPrice: component.unitPrice,
      amount,
    });
    // Un excedente sin precio publicado sólo obliga a cotizar cuando la
    // cantidad realmente lo supera. Mientras no se consuma, no afecta al
    // subtotal: MES publica $24,900 por planta con diez terminales incluidas y
    // no debe convertirse en "cotizar" por el simple hecho de que la terminal
    // número once no tenga tarifa automática.
    if (extra > 0) {
      recurring = amount && recurring ? addMoney(recurring, amount) : null;
    }
  }

  if (entry.display.kind === "quote") recurring = null;

  return {
    offerCode,
    quantity: qty,
    priceKind: entry.display.kind,
    recurring,
    interval: entry.display.interval,
    implementationFrom: entry.implementation?.amount ?? null,
    minimumTermMonths: entry.minimumTermMonths,
    breakdown,
    noteKeys: entry.noteKeys,
  };
}

/**
 * Cotiza una selección completa. Los importes recurrentes y los cargos únicos
 * se mantienen SEPARADOS: mezclarlos produciría un "total" que no corresponde
 * ni a lo que se cobra cada mes ni a lo que se factura al inicio.
 */
export function quoteSelection(
  book: MarketPriceBook,
  items: readonly { readonly offerCode: string; readonly quantity: number }[],
): Quote {
  const lines: QuoteLine[] = [];
  const requiresQuote: string[] = [];
  const recurringParts: Money[] = [];
  const implementationParts: Money[] = [];
  let isEstimate = false;

  for (const item of items) {
    const line = quoteOffer(book, item.offerCode, item.quantity);
    if (!line) {
      requiresQuote.push(item.offerCode);
      continue;
    }
    lines.push(line);
    if (line.recurring) recurringParts.push(line.recurring);
    else requiresQuote.push(line.offerCode);
    if (line.implementationFrom) implementationParts.push(line.implementationFrom);
    if (line.priceKind === "from") isEstimate = true;
  }

  return {
    market: book.market,
    currency: book.currency,
    taxBehavior: book.taxBehavior,
    lines,
    recurringSubtotal: sumMoney(recurringParts, book.currency),
    implementationFrom: sumMoney(implementationParts, book.currency),
    requiresQuote,
    isEstimate,
  };
}

/* ─────────────────────────── Validación del libro ─────────────────────────── */

/**
 * Comprueba las invariantes que un libro de precios mal escrito violaría en
 * silencio. Se ejecuta en pruebas y en el arranque, no sólo en revisión humana:
 * un precio ausente donde la interfaz espera una cifra produce "$NaN" en una
 * página pública, y eso lo ve un cliente antes que nosotros.
 */
export function validatePriceBook(book: MarketPriceBook): string[] {
  const problems: string[] = [];

  if (!Number.isFinite(Date.parse(book.validFrom))) {
    problems.push(`validFrom no es una fecha ISO válida: ${book.validFrom}`);
  }
  if (book.validUntil && !Number.isFinite(Date.parse(book.validUntil))) {
    problems.push(`validUntil no es una fecha ISO válida: ${book.validUntil}`);
  }

  for (const [code, entry] of Object.entries(book.entries)) {
    if (entry.offerCode !== code) {
      problems.push(`${code}: la clave no coincide con offerCode (${entry.offerCode})`);
    }

    const { display } = entry;
    if (display.kind === "quote" && display.amount !== null) {
      problems.push(`${code}: una oferta cotizada no puede publicar importe`);
    }
    if (display.kind !== "quote" && display.amount === null) {
      problems.push(`${code}: precio ${display.kind} sin importe publicado`);
    }
    if (display.amount && display.amount.currency !== book.currency) {
      problems.push(
        `${code}: importe en ${display.amount.currency} dentro de un libro en ${book.currency}`,
      );
    }
    if (display.taxBehavior !== book.taxBehavior) {
      problems.push(
        `${code}: tratamiento fiscal ${display.taxBehavior} distinto al del libro (${book.taxBehavior})`,
      );
    }

    for (const component of entry.components) {
      if (component.unitPrice && component.unitPrice.currency !== book.currency) {
        problems.push(
          `${code}: componente ${component.kind} en ${component.unitPrice.currency}`,
        );
      }
      if (!Number.isInteger(component.includedQuantity) || component.includedQuantity < 0) {
        problems.push(`${code}: includedQuantity inválido en ${component.kind}`);
      }
      if (!Number.isInteger(component.minQuantity) || component.minQuantity < 0) {
        problems.push(`${code}: minQuantity inválido en ${component.kind}`);
      }
    }

    const sameUnitOverage = entry.components.some(
      (c) => c.kind === "overage" && c.unit === display.unit,
    );
    const hasBase = entry.components.some((c) => c.kind === "base");
    if (sameUnitOverage && !hasBase) {
      problems.push(`${code}: define excedente sin cuota base que declare lo incluido`);
    }

    for (const component of entry.components) {
      if (component.kind === "per_unit" && component.unit !== display.unit) {
        problems.push(
          `${code}: el componente por unidad mide en ${component.unit} pero la oferta se contrata en ${display.unit}`,
        );
      }
    }

    if (entry.implementation) {
      if (entry.implementation.interval !== "one_time") {
        problems.push(`${code}: la implementación debe declararse como one_time`);
      }
      if (entry.implementation.kind === "fixed") {
        problems.push(
          `${code}: la implementación es una estimación comercial; no puede publicarse como precio fijo`,
        );
      }
    }

    if (entry.minimumTermMonths < 0 || !Number.isInteger(entry.minimumTermMonths)) {
      problems.push(`${code}: minimumTermMonths inválido`);
    }
  }

  return problems;
}

/* ──────────────────────── Comparación paquete vs suelto ───────────────────── */

export interface BundleComparison {
  readonly bundleOfferCode: string;
  readonly quantity: number;
  readonly bundlePrice: Money | null;
  /** Lo que costaría comprar los mismos componentes por separado. */
  readonly standaloneTotal: Money | null;
  readonly savings: Money | null;
  /** Ahorro en basis points sobre el precio suelto (2500 = 25%). */
  readonly savingsBps: number | null;
}

/**
 * Compara un paquete contra la compra suelta de sus componentes.
 *
 * El ahorro se CALCULA desde el mismo libro que publica ambos precios; no se
 * declara a mano. Un "ahorra 30%" escrito en una constante se convierte en
 * mentira en cuanto cambia una de las dos cifras, y nadie se entera hasta que
 * un cliente hace la resta.
 *
 * Devuelve `null` en los importes cuando alguna parte no tiene precio
 * publicado: no se anuncia un ahorro sobre una cifra que no existe.
 *
 * @param expandedItems componentes ya expandidos (ver `expandBundle`).
 */
export function compareBundleToStandalone(
  book: MarketPriceBook,
  bundleOfferCode: string,
  quantity: number,
  expandedItems: readonly {
    readonly offerCode: string;
    readonly quantity: number;
  }[],
): BundleComparison {
  const bundleLine = quoteOffer(book, bundleOfferCode, quantity);
  const bundlePrice = bundleLine?.recurring ?? null;

  const standalone = quoteSelection(book, expandedItems);
  const standaloneTotal =
    standalone.requiresQuote.length === 0 ? standalone.recurringSubtotal : null;

  if (!bundlePrice || !standaloneTotal) {
    return {
      bundleOfferCode,
      quantity,
      bundlePrice,
      standaloneTotal,
      savings: null,
      savingsBps: null,
    };
  }

  const savingsMinor = standaloneTotal.amountMinor - bundlePrice.amountMinor;
  return {
    bundleOfferCode,
    quantity,
    bundlePrice,
    standaloneTotal,
    savings: money(savingsMinor, book.currency),
    savingsBps:
      standaloneTotal.amountMinor > 0
        ? Math.round((savingsMinor * 10_000) / standaloneTotal.amountMinor)
        : null,
  };
}

/* ─────────────────────────────── Constructores ────────────────────────────── */

/** Azúcar para autorar el libro: importe en pesos enteros del mercado. */
export function priceIn(currency: CurrencyCode) {
  return (major: number): Money => majorUnits(major, currency);
}

export function fixedPrice(params: {
  amount: Money;
  unit: BillingMetric;
  interval: PriceInterval;
  taxBehavior: TaxBehavior;
}): DisplayPrice {
  return {
    kind: "fixed",
    amount: params.amount,
    unit: params.unit,
    interval: params.interval,
    taxBehavior: params.taxBehavior,
  };
}

export function fromPrice(params: {
  amount: Money;
  unit: BillingMetric;
  interval: PriceInterval;
  taxBehavior: TaxBehavior;
}): DisplayPrice {
  return {
    kind: "from",
    amount: params.amount,
    unit: params.unit,
    interval: params.interval,
    taxBehavior: params.taxBehavior,
  };
}

export function quotedPrice(params: {
  unit: BillingMetric;
  interval: PriceInterval;
  taxBehavior: TaxBehavior;
}): DisplayPrice {
  return {
    kind: "quote",
    amount: null,
    unit: params.unit,
    interval: params.interval,
    taxBehavior: params.taxBehavior,
  };
}

/** Reexporta el constructor entero para que el libro no importe `money` aparte. */
export { money as minorUnits };
