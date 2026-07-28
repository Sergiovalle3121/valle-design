/**
 * DINERO — representación exacta, sin punto flotante.
 *
 * Por qué existe este archivo: el catálogo anterior guardaba precios en una
 * propiedad llamada `listPriceUsd`, un `number` en unidades mayores. Eso tiene
 * dos defectos que no se arreglan renombrando:
 *
 *   1. `0.1 + 0.2 !== 0.3`. Un subtotal construido sumando pesos en `float`
 *      produce centavos fantasma. En una factura eso es un descuadre; en un
 *      cobro recurrente es un descuadre que se repite cada mes.
 *   2. La moneda vivía en el NOMBRE de la propiedad, no en el dato. Meter un
 *      importe en pesos en un campo llamado `Usd` no es un atajo: es una
 *      mentira que el compilador no puede detectar y que termina cobrándose.
 *
 * Aquí el dinero es SIEMPRE un entero en unidades menores (centavos) más un
 * código ISO 4217 explícito. Toda la aritmética ocurre en enteros. Las
 * unidades mayores existen únicamente para escribir el libro de precios de
 * forma legible y para formatear al usuario.
 */

/* ─────────────────────────────── Monedas ──────────────────────────────────── */

export const CURRENCY_CODES = ["MXN", "USD"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    (CURRENCY_CODES as readonly string[]).includes(value)
  );
}

/**
 * Exponente decimal ISO 4217: cuántas unidades menores forman una mayor.
 * No todas las monedas usan 2 (JPY usa 0, TND usa 3). Se declara por moneda
 * para que añadir una nueva no dependa de recordar esta trampa.
 */
const CURRENCY_EXPONENT: Readonly<Record<CurrencyCode, number>> = {
  MXN: 2,
  USD: 2,
};

export function currencyExponent(currency: CurrencyCode): number {
  return CURRENCY_EXPONENT[currency];
}

/** Locale de formato por moneda; determina separadores y posición del símbolo. */
const CURRENCY_LOCALE: Readonly<Record<CurrencyCode, string>> = {
  MXN: "es-MX",
  USD: "en-US",
};

/* ──────────────────────────────── Money ───────────────────────────────────── */

/**
 * Importe exacto. `amountMinor` es SIEMPRE un entero: 1290000 = $12,900.00 MXN.
 * Nunca se expone un constructor que acepte un decimal ya redondeado por el
 * llamador, porque ese redondeo es justo donde se pierde el centavo.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/** Construye dinero desde unidades MENORES. Exige entero. */
export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new RangeError(
      `El dinero se expresa en unidades menores enteras; recibido ${amountMinor}.`,
    );
  }
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Importe fuera del rango entero seguro: ${amountMinor}.`);
  }
  return { amountMinor, currency };
}

/**
 * Construye dinero desde unidades MAYORES (pesos). Pensado para AUTORAR el
 * libro de precios de forma legible: `majorUnits(12_900, "MXN")`.
 *
 * Rechaza cualquier valor que no caiga exactamente en una unidad menor. Un
 * precio de $0.005 no se redondea en silencio: es un error del libro de
 * precios y debe corregirlo una persona, no una función.
 */
export function majorUnits(major: number, currency: CurrencyCode): Money {
  if (!Number.isFinite(major)) {
    throw new RangeError(`Importe no finito: ${major}.`);
  }
  const factor = 10 ** CURRENCY_EXPONENT[currency];
  const scaled = major * factor;
  const rounded = Math.round(scaled);
  // Tolerancia mínima: `19.99 * 100` da 1998.9999999999998 en IEEE-754. Se
  // acepta esa deriva de representación, pero NO un valor con más precisión
  // decimal de la que la moneda admite.
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new RangeError(
      `${major} no es representable en ${currency} (exponente ${CURRENCY_EXPONENT[currency]}).`,
    );
  }
  return money(rounded, currency);
}

export const ZERO_MXN: Money = { amountMinor: 0, currency: "MXN" };

export function zeroMoney(currency: CurrencyCode): Money {
  return { amountMinor: 0, currency };
}

export function isMoney(value: unknown): value is Money {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<Money>;
  return Number.isInteger(m.amountMinor) && isCurrencyCode(m.currency);
}

/* ───────────────────────────── Aritmética ─────────────────────────────────── */

/**
 * Sumar importes de monedas distintas es un error de programa, no un caso a
 * resolver con una conversión implícita: no hay tipo de cambio confiable en
 * este contexto y adivinarlo produciría un total falso.
 */
function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(
      `No se pueden combinar importes de monedas distintas (${a.currency} y ${b.currency}).`,
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sumMoney(
  amounts: readonly Money[],
  currency: CurrencyCode,
): Money {
  let total = 0;
  for (const amount of amounts) {
    if (amount.currency !== currency) {
      throw new TypeError(
        `Suma con moneda inconsistente: se esperaba ${currency} y llegó ${amount.currency}.`,
      );
    }
    total += amount.amountMinor;
  }
  return money(total, currency);
}

/** Multiplica por una cantidad ENTERA (usuarios, plantas, asientos, meses). */
export function multiplyMoney(amount: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(
      `La cantidad debe ser un entero no negativo; recibido ${quantity}.`,
    );
  }
  return money(amount.amountMinor * quantity, amount.currency);
}

/**
 * Aplica un porcentaje de descuento en BASIS POINTS (1% = 100 bps) redondeando
 * al centavo más cercano.
 *
 * Se usan basis points en vez de un `number` fraccionario porque "25%" escrito
 * como `0.25` invita a `precio * 0.25` en punto flotante; escrito como `2500`
 * la operación permanece entera hasta la única división, que se redondea una
 * sola vez y de forma declarada.
 */
export function applyDiscountBps(amount: Money, discountBps: number): Money {
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10_000) {
    throw new RangeError(
      `El descuento debe expresarse en basis points entre 0 y 10000; recibido ${discountBps}.`,
    );
  }
  const discount = Math.round((amount.amountMinor * discountBps) / 10_000);
  return money(amount.amountMinor - discount, amount.currency);
}

/** Importe del descuento (no el precio final). Útil para desglosar la cotización. */
export function discountAmountBps(amount: Money, discountBps: number): Money {
  return subtractMoney(amount, applyDiscountBps(amount, discountBps));
}

export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amountMinor - b.amountMinor;
}

export function isZeroMoney(amount: Money): boolean {
  return amount.amountMinor === 0;
}

export function isPositiveMoney(amount: Money): boolean {
  return amount.amountMinor > 0;
}

/* ─────────────────────────────── Formato ──────────────────────────────────── */

/**
 * Formatea para mostrar. El resultado es TEXTO: nunca vuelve a entrar a la
 * aritmética. `locale` permite que la web use el idioma del visitante sin
 * cambiar la moneda (un cliente en inglés sigue viendo MXN).
 */
export function formatMoney(
  amount: Money,
  locale?: string,
  options?: { readonly maximumFractionDigits?: number },
): string {
  const exponent = CURRENCY_EXPONENT[amount.currency];
  const major = amount.amountMinor / 10 ** exponent;
  const fractionDigits =
    options?.maximumFractionDigits ??
    (amount.amountMinor % 10 ** exponent === 0 ? 0 : exponent);
  return new Intl.NumberFormat(locale ?? CURRENCY_LOCALE[amount.currency], {
    style: "currency",
    currency: amount.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(major);
}

/** Unidades mayores como número. SÓLO para presentación y serialización. */
export function toMajorUnits(amount: Money): number {
  return amount.amountMinor / 10 ** CURRENCY_EXPONENT[amount.currency];
}

/* ─────────────────────────── Tratamiento fiscal ───────────────────────────── */

/**
 * Cómo se relaciona el precio publicado con el impuesto.
 *
 * El lanzamiento en México es `exclusive`: los precios NO incluyen IVA. Esto
 * es una declaración con consecuencias — la interfaz debe decirlo en cada
 * superficie donde muestre una cifra, y el proveedor de pagos debe cobrarlo
 * como impuesto añadido si algún día se configura Stripe Tax.
 */
export const TAX_BEHAVIORS = ["exclusive", "inclusive"] as const;

export type TaxBehavior = (typeof TAX_BEHAVIORS)[number];

/* ──────────────────────────────── Mercados ────────────────────────────────── */

/** Mercado comercial (ISO 3166-1 alpha-2). Determina moneda, fiscalidad y libro. */
export const MARKET_CODES = ["MX"] as const;

export type MarketCode = (typeof MARKET_CODES)[number];

export function isMarketCode(value: unknown): value is MarketCode {
  return (
    typeof value === "string" &&
    (MARKET_CODES as readonly string[]).includes(value)
  );
}

/** Mercado por defecto mientras sólo hay un libro publicado. */
export const DEFAULT_MARKET: MarketCode = "MX";
