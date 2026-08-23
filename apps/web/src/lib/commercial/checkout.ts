/**
 * COMPRA — de "quiero este plan" a un desenlace que no miente.
 *
 * Tres reglas gobiernan este módulo, y las tres existen porque la alternativa
 * ya se ha visto fallar en productos reales:
 *
 * 1. LA ELECCIÓN SOBREVIVE AL LOGIN. Un visitante que pulsa un plan y se
 *    encuentra un formulario de registro no debería tener que volver a elegir:
 *    el plan viaja en la URL de retorno y la compra se retoma sola. Es una
 *    pista de navegación, no una autorización: el precio lo pone el servidor
 *    desde `plan_prices`, así que falsificar el parámetro no compra más barato.
 *
 * 2. EL DESENLACE SALE DE LA SUSCRIPCIÓN, NUNCA DE LA URL. La pasarela vuelve
 *    a una URL que el operador configura y que cualquiera puede teclear con
 *    `?status=paid`. Por eso `resolveCheckoutOutcome` sólo mira lo que dice
 *    `GET /v1/commercial/subscription`.
 *
 * 3. PENDIENTE NO ES ERROR. Un pago con OXXO o SPEI tarda HORAS en
 *    confirmarse; presentarlo como fallo empuja al cliente a pagar dos veces o
 *    a pedir la devolución de algo que sí compró.
 */
import type { components } from "@valle/design-sdk";
import type { PlanPeriod } from "./pricing";

type Schemas = components["schemas"];

export type Subscription = Schemas["EffectiveSubscriptionView"];
export type OrganizationRole = Schemas["OrganizationRole"];
export type PaymentMethod = Schemas["PaymentMethod"];
export type PendingPayment = Schemas["CommercialPendingPayment"];
export type LegalDocumentVersion = Schemas["LegalDocumentVersion"];
export type LegalAcceptanceRecord = Schemas["LegalAcceptanceRecord"];

/** Página pública de precios. */
export const PRICING_PATH = "/precios";
/** Retoma la compra del plan elegido (requiere sesión). */
export const CHECKOUT_PATH = "/precios/checkout";
/** Portal del cliente. */
export const BILLING_PATH = "/cuenta/facturacion";
/** Retorno de la pasarela; es la URL que el operador configura en el proveedor. */
export const CHECKOUT_RETURN_PATH = "/cuenta/facturacion/retorno";

/** Mismo patrón que el contrato: un código que no encaja no llega a la API. */
const PLAN_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const PLAN_CODE_MAX = 80;

export interface PlanSelection {
  planCode: string;
  currency: string;
  period: PlanPeriod;
}

/** URL que retoma la compra. Los nombres van en español, como las rutas. */
export function checkoutPath(selection: PlanSelection): string {
  const query = new URLSearchParams({
    plan: selection.planCode,
    periodo: selection.period,
    moneda: selection.currency,
  });
  return `${CHECKOUT_PATH}?${query.toString()}`;
}

/**
 * Lee la elección de la URL, o `null`.
 *
 * Fallo cerrado: con un parámetro raro NO se adivina un plan por defecto. Una
 * compra que arranca sola con el plan equivocado es peor que una pantalla que
 * pide volver a elegir.
 */
export function parsePlanSelection(
  read: (key: string) => string | null,
): PlanSelection | null {
  const planCode = (read("plan") ?? "").trim();
  const period = (read("periodo") ?? "").trim();
  const currency = (read("moneda") ?? "").trim();
  if (
    !planCode ||
    planCode.length > PLAN_CODE_MAX ||
    !PLAN_CODE_PATTERN.test(planCode)
  ) {
    return null;
  }
  if (period !== "monthly" && period !== "yearly") return null;
  if (!CURRENCY_PATTERN.test(currency)) return null;
  return { planCode, currency, period };
}

/**
 * Registro o login conservando el plan. `returnTo` es una ruta local; el
 * `localReturnTo` de identidad ya rechaza destinos absolutos.
 */
export function authPathForCheckout(
  mode: "login" | "register",
  selection: PlanSelection,
): string {
  return `/${mode}?returnTo=${encodeURIComponent(checkoutPath(selection))}`;
}

/**
 * Quién puede abrir una compra: la API exige owner o admin. Enseñar el botón a
 * un miembro sólo sirve para regalarle un 403 después de tres pantallas.
 */
export function canOpenCheckout(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Quién puede dar de baja: SÓLO owner (`requireOwner` en la API). */
export function canCancelSubscription(
  role: string | null | undefined,
): boolean {
  return role === "owner";
}

/**
 * MEDIOS DE PAGO, con lo que el cliente necesita saber ANTES de elegir.
 *
 * No son tres botones equivalentes. Quien paga con OXXO o SPEI compra UN
 * periodo y tendra que renovar a mano, porque ninguno de los dos se domicilia:
 * OXXO es efectivo en un mostrador y SPEI una transferencia que ordena su
 * banco. Callarlo para que el boton parezca mas atractivo garantiza que el
 * cliente pierda el acceso un dia sin entender por que.
 */
export interface PaymentMethodOption {
  method: PaymentMethod;
  label: string;
  detail: string;
  /** `true` cuando el cobro se confirma horas o dias despues. */
  asynchronous: boolean;
}

export const PAYMENT_METHOD_OPTIONS: readonly PaymentMethodOption[] = [
  {
    method: "card",
    label: "Tarjeta",
    detail:
      "Se activa al momento y se renueva sola. Aceptamos crédito y débito.",
    asynchronous: false,
  },
  {
    method: "oxxo",
    label: "Efectivo en OXXO",
    detail:
      "Te damos una ficha para pagar en cualquier tienda. Tarda unas horas en confirmarse y cubre un solo periodo: tendrás que renovar a mano.",
    asynchronous: true,
  },
  {
    method: "spei",
    label: "Transferencia SPEI",
    detail:
      "Te damos una CLABE para transferir desde tu banco. Puede tardar hasta un día hábil y cubre un solo periodo: tendrás que renovar a mano.",
    asynchronous: true,
  },
];

export function paymentMethodLabel(method: string): string {
  return (
    PAYMENT_METHOD_OPTIONS.find((option) => option.method === method)?.label ??
    method
  );
}

/**
 * Los medios en efectivo solo existen en pesos: es una restriccion de la red,
 * no una decision nuestra. Ofrecerlos en un plan facturado en dolares seria
 * ofrecer un boton que el proveedor va a rechazar.
 */
export function availablePaymentMethods(
  currency: string,
): readonly PaymentMethodOption[] {
  if (currency.toUpperCase() !== "MXN") {
    return PAYMENT_METHOD_OPTIONS.filter((option) => !option.asynchronous);
  }
  return PAYMENT_METHOD_OPTIONS;
}

/**
 * QUE SE ESTA ESPERANDO, con nombre y fecha.
 *
 * Entre pedir una ficha de OXXO y que el dinero llegue pasan horas o dias. Una
 * pantalla que durante ese tiempo solo diga "sin suscripcion activa" empuja al
 * cliente a pagar otra vez; esta frase es lo que lo evita.
 */
export function pendingPaymentNotice(pending: PendingPayment): string {
  const method = paymentMethodLabel(pending.method);
  return (
    `Estamos esperando tu pago por ${method} del plan ${pending.planCode}. ` +
    "No vuelvas a pagar: en cuanto el proveedor nos confirme el dinero, tu " +
    "suscripción se activa sola y te avisamos por correo."
  );
}

export interface CheckoutProblem {
  /** Código contractual cuando viajó; útil para soporte. */
  code: string | null;
  title: string;
  detail: string;
  /** `true` cuando el problema se resuelve fuera del producto (ventas). */
  contactSales: boolean;
}

interface ApiErrorShape {
  status?: unknown;
  code?: unknown;
  body?: { intentId?: unknown } | null;
}

/**
 * Traduce el fallo de `POST /v1/commercial/checkout-sessions`.
 *
 * Se lee por forma (`status`/`code`) y no por `instanceof` para no arrastrar el
 * cliente del SDK —y su `fetch`— a un módulo que sólo decide texto.
 */
export function checkoutProblem(error: unknown): CheckoutProblem {
  const shaped = (error ?? {}) as ApiErrorShape;
  const status = typeof shaped.status === "number" ? shaped.status : null;
  const code = typeof shaped.code === "string" ? shaped.code : null;

  if (code === "checkout_unavailable") {
    return {
      code,
      title: "Este despliegue todavía no cobra en línea",
      detail:
        "Tu solicitud quedó registrada para el equipo comercial, que la retomará contigo. No se te ha cobrado nada.",
      contactSales: true,
    };
  }
  if (code === "tax_profile_required") {
    return {
      code,
      title: "Nos faltan tus datos fiscales",
      detail:
        "Antes de cobrarte necesitamos tu RFC, razón social, régimen fiscal, uso de CFDI y código postal. Sin ellos no podemos emitirte un CFDI y el pago no sería deducible. No se te ha cobrado nada.",
      contactSales: false,
    };
  }
  if (
    code === "payment_method_amount_limit" ||
    code === "payment_method_currency"
  ) {
    return {
      code,
      title: "Ese medio de pago no sirve para este pedido",
      detail:
        "Una ficha de OXXO no admite más de 10.000 MXN y los pagos en efectivo sólo se cobran en pesos. Elige transferencia SPEI o tarjeta. No se te ha cobrado nada.",
      contactSales: false,
    };
  }
  if (code === "plan_already_active") {
    return {
      code,
      title: "Ya tienes este plan",
      detail:
        "Tu organización ya está suscrita a este plan. Puedes revisar el estado y las facturas en tu portal de facturación.",
      contactSales: false,
    };
  }
  if (code === "upgrade_intent_pending") {
    return {
      code,
      title: "Hay otra solicitud de cambio en curso",
      detail:
        "Tu organización tiene pendiente el cambio a otro plan. Cancélalo o complétalo antes de contratar éste.",
      contactSales: false,
    };
  }
  if (code === "plan_unavailable" || code === "price_unavailable") {
    return {
      code,
      title: "Ese plan no se puede contratar ahora",
      detail:
        "El plan dejó de venderse o no tiene precio publicado para esa moneda y periodicidad. Vuelve a la página de precios para ver el catálogo vigente.",
      contactSales: true,
    };
  }
  if (status === 401) {
    return {
      code,
      title: "Tu sesión ha caducado",
      detail:
        "Vuelve a iniciar sesión y retomaremos la compra con el plan que elegiste.",
      contactSales: false,
    };
  }
  if (status === 403) {
    return {
      code,
      title: "Tu rol no permite contratar",
      detail:
        "Sólo el propietario o un administrador de la organización pueden abrir una compra. Pídeselo a quien lo sea.",
      contactSales: false,
    };
  }
  return {
    code,
    title: "No pudimos abrir el pago",
    detail:
      "El servicio no respondió como esperábamos y no se ha iniciado ningún cobro. Inténtalo de nuevo en unos minutos.",
    contactSales: true,
  };
}

export type CheckoutOutcome = "pagado" | "pendiente" | "fallido";

export interface CheckoutOutcomeView {
  outcome: CheckoutOutcome;
  title: string;
  detail: string;
  /** Sólo `pendiente` merece seguir preguntando por el estado. */
  keepPolling: boolean;
}

/**
 * Desenlace de la compra a partir del ESTADO REAL de la suscripción.
 *
 * `expectedPlanCode` es la pista de qué se intentó comprar (la guarda el
 * navegador al salir hacia la pasarela). No manda: sólo evita cantar "pagado"
 * cuando la suscripción activa sigue siendo la ANTERIOR y el plan nuevo aún no
 * ha aterrizado.
 *
 * `pendiente` jamás caduca a `fallido` por tiempo: un pago en efectivo puede
 * tardar un día en llegar y el producto no sabe —ni tiene por qué— si el
 * visitante llegó aquí desde la cancelación o desde el comprobante.
 */
export function resolveCheckoutOutcome(
  subscription: Subscription | null,
  expectedPlanCode: string | null,
  pendingPayment: PendingPayment | null = null,
): CheckoutOutcomeView {
  const status = subscription?.status ?? null;

  if (status === "past_due") {
    return {
      outcome: "fallido",
      title: "El cobro no se completó",
      detail:
        "El proveedor rechazó el pago. Tu acceso sigue vigente por ahora; actualiza el medio de pago para no perderlo.",
      keepPolling: false,
    };
  }
  if (status === "suspended") {
    return {
      outcome: "fallido",
      title: "La suscripción está suspendida",
      detail:
        "No hay un pago vigente que la sostenga. Contacta con soporte para reactivarla.",
      keepPolling: false,
    };
  }
  if (status === "cancelled") {
    return {
      outcome: "fallido",
      title: "La suscripción está cancelada",
      detail:
        "No se registró ninguna alta. Si querías contratar, vuelve a la página de precios y empieza de nuevo.",
      keepPolling: false,
    };
  }
  if (
    status === "active" &&
    (!expectedPlanCode || subscription?.planCode === expectedPlanCode)
  ) {
    return {
      outcome: "pagado",
      title: "Pago confirmado",
      detail:
        "Tu suscripción está activa. Ya puedes usar el producto con el plan contratado.",
      keepPolling: false,
    };
  }
  // Con un pago asíncrono REGISTRADO no se habla en abstracto: se nombra el
  // medio y el plan. La diferencia entre «aún no nos ha llegado nada» y
  // «esperamos tu pago en OXXO del plan despacho» es la diferencia entre un
  // cliente que espera tranquilo y uno que paga dos veces.
  if (pendingPayment) {
    return {
      outcome: "pendiente",
      title: `Esperando tu pago por ${paymentMethodLabel(pendingPayment.method)}`,
      detail: pendingPaymentNotice(pendingPayment),
      keepPolling: true,
    };
  }
  return {
    outcome: "pendiente",
    title: "Esperando la confirmación del pago",
    detail:
      "Aún no nos ha llegado la confirmación del proveedor. Los pagos en OXXO o por SPEI pueden tardar horas: no vuelvas a pagar; esta página se actualiza sola y te avisaremos por correo.",
    keepPolling: true,
  };
}

/** Lo que el navegador recuerda mientras el visitante está en la pasarela. */
export interface CheckoutMemory {
  planCode: string;
  startedAt: number;
}

export const CHECKOUT_MEMORY_KEY = "valle_checkout_plan";

/**
 * Se guarda en `sessionStorage` y no en una cookie ni en el servidor porque no
 * es una credencial ni un derecho: es la pregunta "¿de qué plan espero
 * confirmación?". Manipularla sólo puede volver la página MÁS prudente, ya que
 * el estado que decide es el de la suscripción.
 */
export function rememberCheckout(
  storage: Pick<Storage, "setItem"> | null | undefined,
  memory: CheckoutMemory,
): void {
  try {
    storage?.setItem(CHECKOUT_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Un navegador con el almacenamiento bloqueado no puede romper la compra:
    // sin memoria el retorno es más conservador, nada más.
  }
}

export function recallCheckout(
  storage: Pick<Storage, "getItem"> | null | undefined,
): CheckoutMemory | null {
  try {
    const raw = storage?.getItem(CHECKOUT_MEMORY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { planCode, startedAt } = parsed as Record<string, unknown>;
    if (typeof planCode !== "string" || !PLAN_CODE_PATTERN.test(planCode)) {
      return null;
    }
    return {
      planCode,
      startedAt: typeof startedAt === "number" ? startedAt : 0,
    };
  } catch {
    return null;
  }
}

export function forgetCheckout(
  storage: Pick<Storage, "removeItem"> | null | undefined,
): void {
  try {
    storage?.removeItem(CHECKOUT_MEMORY_KEY);
  } catch {
    // Idem: olvidar es una cortesía, no una garantía.
  }
}
