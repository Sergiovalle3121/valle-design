/**
 * PRECIOS PUBLICABLES — aritmética entera y etiquetas que no engañan.
 *
 * El contrato publica los importes en CÉNTIMOS ENTEROS (`amountCents`) y esa
 * es la única representación que circula por aquí. No hay un solo `/ 100` en
 * el módulo: pasar a coma flotante para "verlo bonito" es exactamente cómo un
 * catálogo acaba anunciando 198,99 donde la base de datos dice 19900. La
 * conversión a texto se hace partiendo la cadena de dígitos y dejando que
 * `Intl` ponga separadores, símbolo y decimales de la moneda.
 *
 * La segunda razón de existir de este módulo es que 169 al lado de 199 es
 * MENTIRA si el primero es por usuario y exige tres asientos: el importe suelto
 * no es comparable. Por eso la unidad (`por usuario/mes`), el mínimo de
 * asientos y el impuesto incluido se derivan del MISMO dato que el precio y no
 * de una nota al pie que alguien tiene que acordarse de escribir.
 *
 * Módulo puro: sin red, sin React, sin `window`. Todo lo que decide qué se
 * puede afirmar sobre un plan se prueba aquí.
 */
import type { components } from "@valle/design-sdk";
import type { LaunchMode } from "@/config/launch";

type Schemas = components["schemas"];

export type PlanPeriod = Schemas["PlanPricePeriod"];
export type PlanPrice = Schemas["CommercialPlanPrice"];
export type PublicPlan = Schemas["PublicCommercialPlan"];
export type PublicCatalog = Schemas["PublicCommercialPlanList"];
export type CheckoutMode = Schemas["CommercialCheckoutMode"];

/** Meses de un año: el único factor con el que se compara mensual y anual. */
export const MONTHS_PER_YEAR = 12;

/**
 * Un importe que no se puede formatear NO se muestra a medias.
 *
 * Preferimos romper la tarjeta del plan a publicar un número que no salió de
 * la API: un precio equivocado en una página pública es una promesa de venta
 * que alguien tendrá que honrar o desdecir.
 */
export class MoneyFormatError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "MoneyFormatError";
  }
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

/**
 * Formateadores memorizados por moneda. Construir un `Intl.NumberFormat` no es
 * gratis y la página repite el mismo por cada precio de cada plan.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  const cached = formatters.get(currency);
  if (cached) return cached;
  // Locale fijo `es-MX`: el producto se vende en español de México y la
  // agrupación de miles y el símbolo deben ser los de ese mercado, no los del
  // navegador de quien mira. La MONEDA sí sale del dato, para que publicar un
  // precio en otra divisa no obligue a tocar código.
  const formatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  });
  formatters.set(currency, formatter);
  return formatter;
}

/**
 * Céntimos enteros → texto monetario.
 *
 * La cadena decimal se construye moviendo el punto DENTRO del texto de los
 * dígitos: 19900 → "199.00". Ni una división, ni un redondeo, ni un caso en el
 * que el importe publicado se aleje del de la base de datos.
 */
export function formatMoney(amountCents: number, currency: string): string {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new MoneyFormatError(
      `Importe no publicable: ${String(amountCents)} no es un número entero de céntimos no negativo.`,
    );
  }
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new MoneyFormatError(
      `Moneda no publicable: "${currency}" no es un código ISO-4217 en mayúsculas.`,
    );
  }
  const digits = String(amountCents).padStart(3, "0");
  const decimal = `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  // `Intl.NumberFormat` acepta cadenas numéricas desde Intl V3 (Node 20+ y
  // todos los navegadores vigentes) y las formatea SIN pasar por un double.
  // TypeScript sólo tipa esa sobrecarga para literales (`StringNumericLiteral`),
  // así que el cast es lo que permite conservar la ruta exacta en vez de
  // rendirse a `Number(decimal)`.
  const format = formatterFor(currency).format as (value: string) => string;
  return format(decimal);
}

/** Precio activo de un plan para un período y moneda, o `null` si no lo hay. */
export function planPrice(
  plan: PublicPlan,
  period: PlanPeriod,
  currency: string,
): PlanPrice | null {
  return (
    plan.prices.find(
      (price) => price.period === period && price.currency === currency,
    ) ?? null
  );
}

export interface AnnualSaving {
  /** Ahorro EXACTO en céntimos: doce mensualidades menos el precio anual. */
  savedCents: number;
  /** El mismo ahorro en porcentaje redondeado, sólo para el titular. */
  percent: number;
  /** Lo que costarían doce meses sueltos; el término de comparación. */
  twelveMonthsCents: number;
}

/**
 * Ahorro real del pago anual, o `null` si no lo hay.
 *
 * Se calcula SIEMPRE a partir de los dos importes publicados. Un porcentaje
 * escrito a mano sobrevive a los cambios de precio y se convierte en publicidad
 * falsa el día que alguien toca la tabla; éste no puede.
 *
 * `percent` es una razón para el titular, no dinero: es el único sitio con una
 * división, y lo que el visitante compara —`savedCents`— sigue siendo entero.
 * Si el anual no ahorra nada, no se inventa un descuento: devuelve `null`.
 */
export function annualSaving(
  monthlyCents: number,
  yearlyCents: number,
): AnnualSaving | null {
  if (
    !Number.isSafeInteger(monthlyCents) ||
    !Number.isSafeInteger(yearlyCents) ||
    monthlyCents <= 0 ||
    yearlyCents < 0
  ) {
    return null;
  }
  const twelveMonthsCents = monthlyCents * MONTHS_PER_YEAR;
  const savedCents = twelveMonthsCents - yearlyCents;
  if (savedCents <= 0) return null;
  return {
    savedCents,
    percent: Math.round((savedCents * 100) / twelveMonthsCents),
    twelveMonthsCents,
  };
}

/**
 * Unidad del importe. Un plan `perSeat` cuesta ESO por cada usuario: omitirlo
 * al lado de un plan por cuenta invita a comparar dos números que no miden lo
 * mismo.
 */
export function priceUnitLabel(
  plan: Pick<PublicPlan, "perSeat">,
  period: PlanPeriod,
): string {
  const unit = period === "yearly" ? "año" : "mes";
  return plan.perSeat ? `por usuario/${unit}` : `por cuenta/${unit}`;
}

/** Mínimo contratable, o `null` cuando un solo asiento ya es válido. */
export function seatsMinimumLabel(
  plan: Pick<PublicPlan, "perSeat" | "seatsMinimum">,
): string | null {
  if (!plan.perSeat || plan.seatsMinimum <= 1) return null;
  return `Mínimo ${plan.seatsMinimum} usuarios`;
}

/**
 * Importe MÍNIMO real de la primera factura del plan.
 *
 * En un plan por asiento el precio unitario no es lo que se paga: con tres
 * asientos mínimos, 169 por usuario son 507. Publicar sólo el unitario deja al
 * visitante calculando la cifra que de verdad le importa.
 */
export function minimumChargeCents(
  plan: Pick<PublicPlan, "perSeat" | "seatsMinimum">,
  price: Pick<PlanPrice, "amountCents">,
): number {
  if (!Number.isSafeInteger(price.amountCents) || price.amountCents < 0) {
    throw new MoneyFormatError(
      `Importe no publicable: ${String(price.amountCents)} no es un número entero de céntimos no negativo.`,
    );
  }
  if (!plan.perSeat) return price.amountCents;
  const seats = Number.isSafeInteger(plan.seatsMinimum)
    ? Math.max(1, plan.seatsMinimum)
    : 1;
  return price.amountCents * seats;
}

/** Declaración fiscal visible; nunca se calla que el impuesto va aparte. */
export function taxLabel(plan: Pick<PublicPlan, "taxIncluded">): string {
  return plan.taxIncluded ? "IVA incluido" : "IVA no incluido";
}

/**
 * ¿Puede esta página ofrecer un botón de compra?
 *
 * Con `external` el despliegue no tiene pasarela: pulsar el botón terminaría en
 * un 409 `checkout_unavailable`. Un CTA que no lleva a ninguna parte es peor
 * que no tenerlo, así que la decisión se toma una vez, aquí, y la interfaz la
 * obedece.
 */
export function canStartCheckout(
  catalog: Pick<PublicCatalog, "checkout">,
  plan: Pick<PublicPlan, "kind" | "prices">,
  launch: LaunchMode = "commercial",
): boolean {
  return (
    // TERCERA condición, añadida por la campaña de lanzamiento: durante el
    // lanzamiento gratuito el producto no ofrece cobro aunque la pasarela esté
    // configurada. El código de Stripe sigue intacto y probado; lo que se
    // apaga es la VISIBILIDAD. El parámetro es explícito y su defecto es
    // `commercial` para que este módulo siga siendo puro —no lee `process.env`
    // — y para que quien llame tenga que decidir a la vista.
    launch === "commercial" &&
    catalog.checkout === "hosted" &&
    plan.kind === "paid" &&
    plan.prices.length > 0
  );
}

export interface PlanPeriodView {
  period: PlanPeriod;
  price: PlanPrice;
  /** Importe unitario ya formateado. */
  amount: string;
  /** `por usuario/mes` o `por cuenta/mes`. */
  unit: string;
  /** Cargo mínimo formateado cuando difiere del unitario (planes por asiento). */
  minimumCharge: string | null;
}

export interface PlanView {
  code: string;
  name: string;
  kind: PublicPlan["kind"];
  /** Períodos con precio en la moneda pedida, mensual primero. */
  periods: PlanPeriodView[];
  saving: AnnualSaving | null;
  /** Ahorro anual ya formateado, listo para el texto. */
  savingAmount: string | null;
  seatsNote: string | null;
  taxNote: string;
  purchasable: boolean;
}

const PERIOD_ORDER: readonly PlanPeriod[] = ["monthly", "yearly"];

/**
 * Traduce un plan del contrato a lo que la página puede AFIRMAR de él.
 *
 * Concentrar aquí la derivación evita que un componente calcule el ahorro con
 * un número y el siguiente lo escriba con otro; y hace que "este plan no
 * ofrece botón de compra" sea una propiedad verificable en un spec, no algo que
 * hay que ir a leer al JSX.
 */
export function planView(
  catalog: Pick<PublicCatalog, "checkout">,
  plan: PublicPlan,
  currency: string,
  launch: LaunchMode = "commercial",
): PlanView {
  const periods: PlanPeriodView[] = [];
  for (const period of PERIOD_ORDER) {
    const price = planPrice(plan, period, currency);
    if (!price) continue;
    const minimum = minimumChargeCents(plan, price);
    periods.push({
      period,
      price,
      amount: formatMoney(price.amountCents, price.currency),
      unit: priceUnitLabel(plan, period),
      minimumCharge:
        minimum === price.amountCents
          ? null
          : formatMoney(minimum, price.currency),
    });
  }
  const monthly = periods.find((entry) => entry.period === "monthly");
  const yearly = periods.find((entry) => entry.period === "yearly");
  const saving =
    monthly && yearly
      ? annualSaving(monthly.price.amountCents, yearly.price.amountCents)
      : null;
  return {
    code: plan.code,
    name: plan.name,
    kind: plan.kind,
    periods,
    saving,
    savingAmount:
      saving && yearly
        ? formatMoney(saving.savedCents, yearly.price.currency)
        : null,
    seatsNote: seatsMinimumLabel(plan),
    taxNote: taxLabel(plan),
    purchasable: canStartCheckout(catalog, plan, launch),
  };
}
