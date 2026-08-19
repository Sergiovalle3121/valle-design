import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  PaymentCancellationResult,
  PaymentCheckoutIntent,
  PaymentCheckoutResult,
  PaymentCustomerReference,
  PaymentPortalResult,
  PaymentPriceSnapshot,
  PaymentProvider,
  PaymentProviderDescriptor,
  PaymentSubscriptionReference,
  PaymentWebhookEvent,
} from '../ports/payment-provider.port';

/**
 * Adaptador REAL del puerto de pagos contra la API HTTP de Stripe.
 *
 * Dos decisiones gobiernan este archivo:
 *
 * 1. CERO dependencias nuevas. Stripe publica una API HTTP form-encoded
 *    perfectamente estable; el SDK oficial aportaría tipos y reintentos a
 *    cambio de meter un árbol de dependencias en el gate de licencias y de
 *    esconder exactamente lo que aquí hay que auditar (qué bytes se firman y
 *    qué se compara en tiempo constante). El cliente HTTP se INYECTA, así que
 *    las pruebas ejercen el adaptador entero sin red ni claves reales.
 *
 * 2. La configuración es el interruptor, no el código. Sin
 *    STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET el módulo inyecta el adaptador
 *    nulo; con la configuración COMPLETA inyecta este. Una configuración a
 *    medias no arranca (ver resolveStripeConfiguration): cobrar sin poder
 *    confirmar el cobro es peor que no cobrar.
 *
 * La verificación de webhooks aplica el mismo rigor que
 * webhook-outbox.transport.ts en el sentido contrario: HMAC-SHA256 sobre los
 * BYTES CRUDOS, comparación en tiempo constante, rechazo de timestamps fuera
 * de tolerancia y rechazo si falta el secreto.
 */

/** Cliente HTTP inyectable: la firma de `fetch`, sin acoplarse a globalThis. */
export type StripeHttpClient = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
    redirect: 'error';
  },
) => Promise<StripeHttpResponse>;

/** Lo único que el adaptador consume de una respuesta HTTP. */
export interface StripeHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export interface StripeConfiguration {
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly apiBaseUrl: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** Vuelta desde el portal del cliente; por defecto, la URL de éxito. */
  readonly portalReturnUrl: string;
  readonly timeoutMs: number;
  readonly toleranceSeconds: number;
  /** Versión de la API fijada por configuración; sin ella manda la cuenta. */
  readonly apiVersion: string | null;
}

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeConfigurationError';
  }
}

/** El proveedor respondió, pero con un error: nunca se filtra su cuerpo. */
export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    readonly stripeCode: string | null,
  ) {
    super(
      `Stripe rechazó la llamada con HTTP ${status}` +
        (stripeCode ? ` (${stripeCode}).` : '.'),
    );
    this.name = 'StripeApiError';
  }
}

/** Firma ausente, mal formada, no coincidente o fuera de tolerancia. */
export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeSignatureError';
  }
}

const SIGNATURE_HEADER = 'stripe-signature';
const DEFAULT_API_BASE_URL = 'https://api.stripe.com';
const DEFAULT_TIMEOUT_MS = 20_000;
/** Misma tolerancia que recomienda Stripe: cinco minutos de reloj. */
const DEFAULT_TOLERANCE_SECONDS = 300;
const MIN_WEBHOOK_SECRET_LENGTH = 16;
/** Tope defensivo del cuerpo de error que se lee para extraer el `code`. */
const MAX_ERROR_BODY_BYTES = 8_192;

const PERIOD_INTERVALS: Readonly<Record<string, string>> = {
  monthly: 'month',
  yearly: 'year',
};

/**
 * Moneda única de los medios de pago mexicanos.
 *
 * OXXO y SPEI son infraestructura de pagos DE MÉXICO: Stripe sólo los acepta
 * en pesos. Mandar una sesión en dólares produciría un error del proveedor a
 * mitad del embudo; se rechaza antes, con un motivo que el producto puede
 * contar.
 */
const MEXICAN_CURRENCY = 'MXN';

/**
 * Tope de una ficha OXXO: 10.000 MXN.
 *
 * Es un límite de la RED, no nuestro: la tienda no cobra más que eso en una
 * sola ficha. Un Despacho anual de siete asientos (11.830 MXN) lo supera, y
 * enviar esa sesión a Stripe generaría una ficha que el cliente no podría
 * pagar en el mostrador — y se enteraría en la tienda, con el móvil en la
 * mano. Se rechaza aquí y quien llama ofrece SPEI o tarjeta.
 */
export const OXXO_MAX_AMOUNT_CENTS = 1_000_000;

/** Días que vive una ficha OXXO antes de caducar. */
const OXXO_EXPIRES_AFTER_DAYS = 3;

/** El proveedor no puede cobrar así; el motivo es para el cliente, no un log. */
export class StripePaymentMethodError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StripePaymentMethodError';
  }
}

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  constructor(
    private readonly configuration: StripeConfiguration,
    private readonly http: StripeHttpClient,
  ) {}

  descriptor(): PaymentProviderDescriptor {
    // `available` es true por construcción: este adaptador sólo se instancia
    // con configuración completa. No existe un StripePaymentProvider «a
    // medias» que haya que describir como no disponible.
    return { name: 'stripe', mode: 'hosted', available: true };
  }

  /**
   * Crea una Checkout Session hospedada para el intent y el precio dados.
   *
   * El precio se envía INLINE (`price_data`) en vez de referenciar un price de
   * Stripe: la verdad del catálogo vive en `plan_prices` (ola 1) y duplicarla
   * en el dashboard crearía dos fuentes que se desincronizan en silencio.
   *
   * `Idempotency-Key` es el id del intent: un reintento de red no crea dos
   * sesiones ni cobra dos veces.
   */
  async createCheckout(
    intent: PaymentCheckoutIntent,
    price: PaymentPriceSnapshot,
  ): Promise<PaymentCheckoutResult> {
    const interval = PERIOD_INTERVALS[price.period];
    if (!interval) {
      throw new StripeConfigurationError(
        `Período de precio no soportado por el checkout: ${price.period}.`,
      );
    }
    // La cantidad es la que multiplica el importe unitario en la factura del
    // proveedor. Con un plan por usuario, mandar 1 cobraría una tarifa unitaria
    // por un contrato de varios asientos — y lo haría en silencio, sin que
    // ningún estado del producto delatara la diferencia.
    if (!Number.isInteger(intent.seats) || intent.seats < 1) {
      throw new StripeConfigurationError(
        `Asientos no cobrables: ${String(intent.seats)} no es un entero mayor o igual que 1.`,
      );
    }
    const asynchronous = intent.paymentMethod !== 'card';
    const form = asynchronous
      ? this.cashCheckoutForm(intent, price)
      : this.cardCheckoutForm(intent, price, interval);

    const session = await this.call('/v1/checkout/sessions', form, {
      // La clave de idempotencia incluye el MEDIO: quien pidió una ficha de
      // OXXO y vuelve a intentarlo con tarjeta necesita una sesión nueva, no
      // la ficha de antes reservada bajo la misma clave.
      idempotencyKey: `checkout-intent:${intent.intentId}:${intent.paymentMethod}`,
    });
    const url = readString(session, 'url');
    const reference = readString(session, 'id');
    if (!url || !reference) {
      throw new StripeApiError(200, 'checkout_session_incomplete');
    }
    // Una URL de pago que no sea HTTPS sería un downgrade silencioso del
    // canal donde el usuario teclea su tarjeta.
    if (!url.startsWith('https://')) {
      throw new StripeApiError(200, 'checkout_url_not_https');
    }
    return { kind: 'hosted', url, reference, asynchronous };
  }

  /** Tarjeta: suscripción recurrente, tal y como la dejó la ola 2. */
  private cardCheckoutForm(
    intent: PaymentCheckoutIntent,
    price: PaymentPriceSnapshot,
    interval: string,
  ): URLSearchParams {
    return new URLSearchParams({
      mode: 'subscription',
      success_url: this.configuration.successUrl,
      cancel_url: this.configuration.cancelUrl,
      client_reference_id: intent.intentId,
      'payment_method_types[0]': 'card',
      'line_items[0][quantity]': String(intent.seats),
      'line_items[0][price_data][currency]': price.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(price.amountCents),
      'line_items[0][price_data][recurring][interval]': interval,
      'line_items[0][price_data][product_data][name]': price.planCode,
      ...this.checkoutMetadata(intent, price),
      // La suscripción arrastra su propia metadata: los eventos posteriores
      // (invoice.paid, customer.subscription.deleted) llegan sin la sesión, y
      // sin esto la correlación dependería sólo de los ids que guardamos.
      'subscription_data[metadata][intentId]': intent.intentId,
      'subscription_data[metadata][organizationId]': intent.organizationId,
      'subscription_data[metadata][planCode]': intent.planCode,
      'subscription_data[metadata][seats]': String(intent.seats),
    });
  }

  /**
   * OXXO y SPEI: un cobro ÚNICO por el período contratado, no una suscripción.
   *
   * No es una simplificación nuestra: ninguno de los dos puede domiciliarse.
   * OXXO es dinero en efectivo en un mostrador y SPEI es una transferencia que
   * el cliente ordena desde su banco; no existe el «vuelve a cobrarme el mes
   * que viene». Modelarlos como suscripción de Stripe produciría una
   * suscripción que jamás cobra su segunda cuota.
   *
   * La consecuencia está asumida y hay que decirla en la interfaz: quien paga
   * con OXXO o SPEI compra UN período y tendrá que renovar a mano. A cambio,
   * puede comprar sin tarjeta de crédito, que es la única forma de venderle a
   * buena parte del mercado objetivo.
   */
  private cashCheckoutForm(
    intent: PaymentCheckoutIntent,
    price: PaymentPriceSnapshot,
  ): URLSearchParams {
    if (price.currency.toUpperCase() !== MEXICAN_CURRENCY) {
      throw new StripePaymentMethodError(
        'payment_method_currency',
        `OXXO y SPEI sólo cobran en ${MEXICAN_CURRENCY}; ese plan se vende en ${price.currency}.`,
      );
    }
    const total = price.amountCents * intent.seats;
    if (intent.paymentMethod === 'oxxo' && total > OXXO_MAX_AMOUNT_CENTS) {
      throw new StripePaymentMethodError(
        'payment_method_amount_limit',
        `Una ficha de OXXO no admite más de ${OXXO_MAX_AMOUNT_CENTS / 100} MXN y este pedido suma ${total / 100} MXN. Paga por SPEI o con tarjeta.`,
      );
    }

    const form = new URLSearchParams({
      mode: 'payment',
      success_url: this.configuration.successUrl,
      cancel_url: this.configuration.cancelUrl,
      client_reference_id: intent.intentId,
      // Un Customer siempre: es lo que SPEI necesita para tener CLABE propia y
      // lo que el portal del proveedor (E4) necesita después para dejar al
      // cliente arreglar su medio de pago sin pasar por soporte.
      customer_creation: 'always',
      'line_items[0][quantity]': String(intent.seats),
      'line_items[0][price_data][currency]': price.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(price.amountCents),
      'line_items[0][price_data][product_data][name]': price.planCode,
      ...this.checkoutMetadata(intent, price),
      // El PaymentIntent arrastra la metadata: los eventos asíncronos
      // (`async_payment_succeeded`) llegan con la sesión, pero un reembolso o
      // una disputa posterior llegan sólo con el PaymentIntent.
      'payment_intent_data[metadata][intentId]': intent.intentId,
      'payment_intent_data[metadata][organizationId]': intent.organizationId,
      'payment_intent_data[metadata][planCode]': intent.planCode,
    });

    if (intent.paymentMethod === 'oxxo') {
      form.set('payment_method_types[0]', 'oxxo');
      form.set(
        'payment_method_options[oxxo][expires_after_days]',
        String(OXXO_EXPIRES_AFTER_DAYS),
      );
    } else {
      // SPEI viaja en Stripe como `customer_balance` con transferencia
      // bancaria mexicana: el cliente recibe una CLABE propia y el saldo se
      // aplica al pedido cuando el banco confirma.
      form.set('payment_method_types[0]', 'customer_balance');
      form.set(
        'payment_method_options[customer_balance][funding_type]',
        'bank_transfer',
      );
      form.set(
        'payment_method_options[customer_balance][bank_transfer][type]',
        'mx_bank_transfer',
      );
    }
    return form;
  }

  /**
   * Metadata común. `period` viaja porque el webhook de un pago único tiene
   * que saber HASTA CUÁNDO queda pagado: sin suscripción de Stripe no hay
   * `current_period_end` que leer, y la alternativa —suponer un mes— regalaría
   * once meses a quien pagó el año o cobraría un año a quien pagó un mes.
   */
  private checkoutMetadata(
    intent: PaymentCheckoutIntent,
    price: PaymentPriceSnapshot,
  ): Record<string, string> {
    return {
      'metadata[intentId]': intent.intentId,
      'metadata[organizationId]': intent.organizationId,
      'metadata[planCode]': intent.planCode,
      'metadata[seats]': String(intent.seats),
      'metadata[period]': price.period,
      'metadata[paymentMethod]': intent.paymentMethod,
    };
  }

  /**
   * Sesión del portal del proveedor para que el cliente arregle su tarjeta.
   *
   * La URL que devuelve Stripe es de UN cliente y caduca sola; por eso no se
   * cachea ni se guarda. Requiere que el portal esté configurado en el panel
   * de Stripe: si no lo está, la llamada falla con un `StripeApiError` cuyo
   * código lo dice, en vez de llevar al cliente a una página rota.
   */
  async createBillingPortalSession(
    reference: PaymentCustomerReference,
  ): Promise<PaymentPortalResult> {
    const id = reference.providerCustomerId.trim();
    if (!id || !/^[A-Za-z0-9_-]{1,255}$/.test(id)) {
      throw new StripeConfigurationError(
        'El identificador de cliente del proveedor no es utilizable.',
      );
    }
    const session = await this.call(
      '/v1/billing_portal/sessions',
      new URLSearchParams({
        customer: id,
        return_url: this.configuration.portalReturnUrl,
      }),
      // Sin `Idempotency-Key`: cada visita al portal necesita una sesión NUEVA
      // porque la anterior caduca. Reutilizar la respuesta de hace una hora
      // llevaría al cliente a un enlace muerto justo cuando intenta pagar.
      { idempotencyKey: null },
    );
    const url = readString(session, 'url');
    if (!url || !url.startsWith('https://')) {
      throw new StripeApiError(200, 'portal_session_incomplete');
    }
    return { kind: 'hosted', url };
  }

  /**
   * Programa la baja al terminar el período ya pagado. No borra la suscripción
   * en Stripe: el usuario conserva lo que compró hasta que venza.
   */
  async cancelAtPeriodEnd(
    reference: PaymentSubscriptionReference,
  ): Promise<PaymentCancellationResult> {
    const id = reference.providerSubscriptionId.trim();
    if (!id || !/^[A-Za-z0-9_-]{1,255}$/.test(id)) {
      throw new StripeConfigurationError(
        'El identificador de suscripción del proveedor no es utilizable.',
      );
    }
    const subscription = await this.call(
      `/v1/subscriptions/${encodeURIComponent(id)}`,
      new URLSearchParams({ cancel_at_period_end: 'true' }),
      { idempotencyKey: `cancel-at-period-end:${id}` },
    );
    return {
      kind: 'scheduled',
      currentPeriodEnd: readEpochSeconds(subscription, 'current_period_end'),
    };
  }

  /**
   * Verifica la firma del webhook sobre los BYTES CRUDOS.
   *
   * Stripe firma `<timestamp>.<cuerpo crudo>` con HMAC-SHA256 y publica el
   * resultado en `Stripe-Signature` como `t=…,v1=…` (puede traer varias `v1`
   * durante una rotación de secreto, y esquemas antiguos que se ignoran).
   * Aquí se rechaza, en este orden: secreto ausente, cabecera ausente o mal
   * formada, timestamp fuera de tolerancia y firma no coincidente — la
   * comparación siempre en tiempo constante.
   */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    now: Date = new Date(),
  ): Promise<PaymentWebhookEvent> {
    const secret = this.configuration.webhookSecret;
    if (!secret) {
      // Inalcanzable con la configuración validada; se comprueba igual porque
      // un HMAC con clave vacía verificaría cualquier cuerpo que un atacante
      // firme con clave vacía.
      return Promise.reject(
        new StripeSignatureError(
          'No hay secreto de webhook configurado: el evento no se puede verificar.',
        ),
      );
    }
    const header = singleHeader(headers, SIGNATURE_HEADER);
    if (!header) {
      return Promise.reject(
        new StripeSignatureError('Falta la cabecera Stripe-Signature.'),
      );
    }

    const parsed = parseSignatureHeader(header);
    if (parsed.timestamp === null || parsed.signatures.length === 0) {
      return Promise.reject(
        new StripeSignatureError('Cabecera Stripe-Signature mal formada.'),
      );
    }

    const ageSeconds = Math.abs(
      Math.floor(now.getTime() / 1000) - parsed.timestamp,
    );
    if (ageSeconds > this.configuration.toleranceSeconds) {
      // Un evento viejo es un replay: se rechaza ANTES de comparar la firma.
      return Promise.reject(
        new StripeSignatureError(
          'El timestamp de la firma está fuera de la tolerancia permitida.',
        ),
      );
    }

    const expected = createHmac('sha256', secret)
      .update(`${parsed.timestamp}.`)
      .update(rawBody)
      .digest();
    // Se recorren TODAS las firmas ofrecidas (rotación de secreto) y ninguna
    // comparación corta antes de tiempo.
    let matched = false;
    for (const candidate of parsed.signatures) {
      if (constantTimeEqualHex(expected, candidate)) matched = true;
    }
    if (!matched) {
      return Promise.reject(
        new StripeSignatureError('La firma del webhook no coincide.'),
      );
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return Promise.reject(
        new StripeSignatureError('El cuerpo firmado no es JSON válido.'),
      );
    }
    const id = readString(event, 'id');
    const type = readString(event, 'type');
    if (!id || !type) {
      return Promise.reject(
        new StripeSignatureError('El evento no declara `id` y `type`.'),
      );
    }
    return Promise.resolve({ id, type, payload: event });
  }

  /** Una llamada form-encoded a la API, con timeout y errores sin cuerpo. */
  private async call(
    path: string,
    form: URLSearchParams,
    options: { idempotencyKey: string | null },
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.configuration.secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      ...(options.idempotencyKey
        ? { 'idempotency-key': options.idempotencyKey }
        : {}),
    };
    if (this.configuration.apiVersion) {
      headers['stripe-version'] = this.configuration.apiVersion;
    }

    const response = await this.http(
      `${this.configuration.apiBaseUrl}${path}`,
      {
        method: 'POST',
        headers,
        body: form.toString(),
        // AbortSignal.timeout convierte un proveedor colgado en un error acotado
        // en vez de una petición que nunca termina.
        signal: AbortSignal.timeout(this.configuration.timeoutMs),
        redirect: 'error',
      },
    );

    const body = await readBoundedText(response);
    if (!response.ok) {
      // Del cuerpo de error sólo se extrae el `code` estable de Stripe: el
      // resto puede contener datos del cliente y jamás se propaga ni se
      // registra.
      throw new StripeApiError(response.status, readStripeErrorCode(body));
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new StripeApiError(response.status, 'invalid_json_response');
    }
  }
}

/**
 * Configuración de Stripe, o null si el despliegue no la trae.
 *
 * Regla única, deliberadamente rígida: o están TODAS las variables o no está
 * ninguna. Un despliegue con `STRIPE_SECRET_KEY` pero sin
 * `STRIPE_WEBHOOK_SECRET` podría cobrar y jamás enterarse de que cobró; uno
 * con secretos pero sin URLs de retorno mandaría al usuario a una página que
 * no existe. Las dos situaciones fallan al ARRANCAR, no en la primera compra.
 */
export function resolveStripeConfiguration(
  environment: NodeJS.ProcessEnv,
): StripeConfiguration | null {
  const secretKey = environment.STRIPE_SECRET_KEY?.trim() ?? '';
  const webhookSecret = environment.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
  const successUrl = environment.STRIPE_CHECKOUT_SUCCESS_URL?.trim() ?? '';
  const cancelUrl = environment.STRIPE_CHECKOUT_CANCEL_URL?.trim() ?? '';
  const declared = [secretKey, webhookSecret, successUrl, cancelUrl].filter(
    (value) => value.length > 0,
  );
  if (declared.length === 0) return null;
  if (declared.length < 4) {
    throw new StripeConfigurationError(
      'Configuración de Stripe incompleta: STRIPE_SECRET_KEY, ' +
        'STRIPE_WEBHOOK_SECRET, STRIPE_CHECKOUT_SUCCESS_URL y ' +
        'STRIPE_CHECKOUT_CANCEL_URL son obligatorias juntas. Sin las cuatro, ' +
        'deja las cuatro vacías y el producto seguirá con el cobro externo.',
    );
  }
  if (webhookSecret.length < MIN_WEBHOOK_SECRET_LENGTH) {
    throw new StripeConfigurationError(
      `STRIPE_WEBHOOK_SECRET debe tener al menos ${MIN_WEBHOOK_SECRET_LENGTH} caracteres.`,
    );
  }

  const apiBaseUrl = secureBaseUrl(
    environment.STRIPE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
    'STRIPE_API_BASE_URL',
    environment.NODE_ENV,
  );
  const timeoutMs = boundedInteger(
    environment.STRIPE_TIMEOUT_MS,
    'STRIPE_TIMEOUT_MS',
    DEFAULT_TIMEOUT_MS,
    1_000,
    120_000,
  );
  const toleranceSeconds = boundedInteger(
    environment.STRIPE_WEBHOOK_TOLERANCE_SECONDS,
    'STRIPE_WEBHOOK_TOLERANCE_SECONDS',
    DEFAULT_TOLERANCE_SECONDS,
    30,
    3_600,
  );
  const apiVersion = environment.STRIPE_API_VERSION?.trim() || null;
  if (
    apiVersion &&
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[a-z0-9_]+)?$/.test(apiVersion)
  ) {
    throw new StripeConfigurationError(
      'STRIPE_API_VERSION debe tener la forma AAAA-MM-DD (opcionalmente con sufijo).',
    );
  }

  const resolvedSuccessUrl = returnUrl(
    successUrl,
    'STRIPE_CHECKOUT_SUCCESS_URL',
    environment.NODE_ENV,
  );
  // OPCIONAL, y por eso no rompe la regla del «todas o ninguna»: sin ella el
  // portal devuelve al cliente a la misma página de retorno del checkout, que
  // ya sabe leer el estado real de la suscripción. Exigir una quinta variable
  // habría dejado sin arrancar a los despliegues que ya funcionan.
  const portalReturn = environment.STRIPE_PORTAL_RETURN_URL?.trim() ?? '';

  return {
    secretKey,
    webhookSecret,
    apiBaseUrl,
    successUrl: resolvedSuccessUrl,
    cancelUrl: returnUrl(
      cancelUrl,
      'STRIPE_CHECKOUT_CANCEL_URL',
      environment.NODE_ENV,
    ),
    portalReturnUrl: portalReturn
      ? returnUrl(
          portalReturn,
          'STRIPE_PORTAL_RETURN_URL',
          environment.NODE_ENV,
        )
      : resolvedSuccessUrl,
    timeoutMs,
    toleranceSeconds,
    apiVersion,
  };
}

/** `fetch` global adaptado al cliente inyectable (el único punto con red). */
export const globalStripeHttpClient: StripeHttpClient = (url, init) =>
  fetch(url, init);

function secureBaseUrl(
  raw: string,
  name: string,
  nodeEnv: string | undefined,
): string {
  const url = parseAbsoluteUrl(raw, name);
  assertSecureOrigin(url, name, nodeEnv);
  if (url.search || url.hash) {
    throw new StripeConfigurationError(`${name} no admite query ni fragmento.`);
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

function returnUrl(
  raw: string,
  name: string,
  nodeEnv: string | undefined,
): string {
  const url = parseAbsoluteUrl(raw, name);
  assertSecureOrigin(url, name, nodeEnv);
  return url.toString();
}

function parseAbsoluteUrl(raw: string, name: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new StripeConfigurationError(`${name} debe ser una URL absoluta.`);
  }
}

function assertSecureOrigin(
  url: URL,
  name: string,
  nodeEnv: string | undefined,
): void {
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(nodeEnv !== 'production' && loopback)) {
    throw new StripeConfigurationError(
      `${name} debe usar HTTPS (HTTP plano sólo se admite en local).`,
    );
  }
  if (url.username || url.password) {
    throw new StripeConfigurationError(`${name} no puede llevar credenciales.`);
  }
}

function boundedInteger(
  raw: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new StripeConfigurationError(
      `${name} debe ser un entero entre ${minimum} y ${maximum}.`,
    );
  }
  return value;
}

interface ParsedSignatureHeader {
  timestamp: number | null;
  signatures: string[];
}

function parseSignatureHeader(header: string): ParsedSignatureHeader {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') {
      // Un `t` repetido o no numérico invalida la cabecera entera en vez de
      // dejar que gane el último: la ambigüedad no se resuelve, se rechaza.
      if (timestamp !== null || !/^\d{1,15}$/.test(value))
        return {
          timestamp: null,
          signatures: [],
        };
      timestamp = Number(value);
    } else if (key === 'v1' && /^[0-9a-f]+$/i.test(value)) {
      signatures.push(value);
    }
  }
  return { timestamp, signatures };
}

/** Compara un digest binario con una firma hexadecimal, sin cortar antes. */
function constantTimeEqualHex(expected: Buffer, candidateHex: string): boolean {
  if (candidateHex.length !== expected.length * 2) return false;
  const candidate = Buffer.from(candidateHex, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(expected, candidate);
}

function singleHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  // Búsqueda insensible a mayúsculas: Node normaliza en minúsculas, pero el
  // puerto acepta cualquier mapa de cabeceras.
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    // Una cabecera duplicada es ambigua: no se elige una, se rechaza.
    if (Array.isArray(value)) return value.length === 1 ? value[0] : null;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

async function readBoundedText(response: StripeHttpResponse): Promise<string> {
  const body = await response.text();
  return body.length > MAX_ERROR_BODY_BYTES
    ? body.slice(0, MAX_ERROR_BODY_BYTES)
    : body;
}

function readStripeErrorCode(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const error = readRecord(parsed, 'error');
    const code = readString(error, 'code') ?? readString(error, 'type');
    return code && /^[a-z0-9_]{1,80}$/i.test(code) ? code : null;
  } catch {
    return null;
  }
}

function readRecord(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

function readString(value: unknown, key: string): string | null {
  const candidate = readRecord(value, key);
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

function readEpochSeconds(value: unknown, key: string): Date | null {
  const candidate = readRecord(value, key);
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return null;
  if (candidate <= 0) return null;
  return new Date(Math.trunc(candidate) * 1000);
}
