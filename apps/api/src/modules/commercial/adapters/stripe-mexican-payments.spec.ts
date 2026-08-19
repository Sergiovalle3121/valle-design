import {
  OXXO_MAX_AMOUNT_CENTS,
  StripeApiError,
  StripeConfigurationError,
  type StripeConfiguration,
  type StripeHttpClient,
  StripePaymentMethodError,
  StripePaymentProvider,
} from './stripe-payment.provider';

/**
 * OXXO, SPEI y el portal del proveedor, ejercidos SIN red y sin claves.
 *
 * Vive en su propio archivo y no dentro de stripe-payment.provider.spec.ts
 * porque aquél ya roza el presupuesto de líneas del repositorio; el adaptador
 * probado es exactamente el mismo.
 *
 * Lo que se demuestra aquí es que los pagos mexicanos NO son una variante
 * cosmética de la tarjeta: piden una sesión de naturaleza distinta (`mode:
 * payment`, sin recurrencia), tienen límites de la propia red y se resuelven
 * después. Cada una de esas tres cosas, mal hecha, produce un cobro que el
 * cliente cree hecho y que nunca llega.
 */

const CONFIGURATION: StripeConfiguration = {
  secretKey: 'sk_test_mx',
  webhookSecret: 'whsec_prueba_de_treinta_y_dos_caracteres',
  apiBaseUrl: 'https://api.stripe.test',
  successUrl: 'https://app.example.test/retorno',
  cancelUrl: 'https://app.example.test/precios',
  portalReturnUrl: 'https://app.example.test/facturacion',
  timeoutMs: 5_000,
  toleranceSeconds: 300,
  apiVersion: null,
};

interface Call {
  url: string;
  headers: Record<string, string>;
  form: URLSearchParams;
}

function httpDouble(body: string): {
  client: StripeHttpClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const client: StripeHttpClient = (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      form: new URLSearchParams(init.body),
    });
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
    });
  };
  return { client, calls };
}

const SESSION = JSON.stringify({
  id: 'cs_test_mx',
  url: 'https://checkout.stripe.test/c/pay/cs_test_mx',
});

const INTENT = {
  intentId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  planCode: 'individual',
  seats: 1,
  paymentMethod: 'oxxo' as const,
};
const PRICE = {
  planCode: 'individual',
  currency: 'MXN',
  period: 'monthly' as const,
  amountCents: 19_900,
};

describe('StripePaymentProvider · OXXO', () => {
  it('pide un cobro ÚNICO, no una suscripción que jamás cobraría su segunda cuota', async () => {
    const { client, calls } = httpDouble(SESSION);
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    const result = await provider.createCheckout(INTENT, PRICE);

    const [call] = calls;
    expect(call.form.get('mode')).toBe('payment');
    expect(call.form.get('payment_method_types[0]')).toBe('oxxo');
    // Sin `recurring`: el dinero en efectivo de un mostrador no se domicilia.
    expect(
      call.form.get('line_items[0][price_data][recurring][interval]'),
    ).toBe(null);
    expect(
      call.form.get('payment_method_options[oxxo][expires_after_days]'),
    ).toBe('3');
    // El período viaja en la metadata: sin suscripción de Stripe no hay
    // `current_period_end` que leer cuando el webhook active el acceso.
    expect(call.form.get('metadata[period]')).toBe('monthly');
    expect(call.form.get('metadata[paymentMethod]')).toBe('oxxo');
    // `asynchronous` es lo que permite a la web decir «te esperamos» en vez de
    // «pago fallido» cuando el cliente vuelve sin haber pagado todavía.
    expect(result).toEqual({
      kind: 'hosted',
      url: 'https://checkout.stripe.test/c/pay/cs_test_mx',
      reference: 'cs_test_mx',
      asynchronous: true,
    });
  });

  it('rechaza un importe por encima del tope de una ficha, antes de generarla', async () => {
    const { client, calls } = httpDouble(SESSION);
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    // Despacho anual x 7 asientos = 11.830 MXN, por encima de los 10.000 que
    // admite una ficha. Sin esta comprobación, el cliente lo descubriría en el
    // mostrador de la tienda con el móvil en la mano.
    await expect(
      provider.createCheckout(
        { ...INTENT, planCode: 'despacho', seats: 7 },
        {
          planCode: 'despacho',
          currency: 'MXN',
          period: 'yearly',
          amountCents: 169_000,
        },
      ),
    ).rejects.toBeInstanceOf(StripePaymentMethodError);
    // Y no se llegó a pedir NADA al proveedor: el fallo es cerrado.
    expect(calls).toHaveLength(0);
    expect(OXXO_MAX_AMOUNT_CENTS).toBe(1_000_000);
  });

  it('rechaza una moneda que OXXO no cobra', async () => {
    const { client, calls } = httpDouble(SESSION);
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    await expect(
      provider.createCheckout(INTENT, { ...PRICE, currency: 'USD' }),
    ).rejects.toMatchObject({ code: 'payment_method_currency' });
    expect(calls).toHaveLength(0);
  });

  it('la clave de idempotencia distingue el medio: volver con tarjeta abre sesión nueva', async () => {
    const { client, calls } = httpDouble(SESSION);
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    await provider.createCheckout(INTENT, PRICE);
    await provider.createCheckout({ ...INTENT, paymentMethod: 'card' }, PRICE);

    expect(calls[0].headers['idempotency-key']).toBe(
      `checkout-intent:${INTENT.intentId}:oxxo`,
    );
    expect(calls[1].headers['idempotency-key']).toBe(
      `checkout-intent:${INTENT.intentId}:card`,
    );
  });
});

describe('StripePaymentProvider · SPEI', () => {
  it('pide una transferencia bancaria mexicana con cliente propio', async () => {
    const { client, calls } = httpDouble(SESSION);
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    const result = await provider.createCheckout(
      { ...INTENT, paymentMethod: 'spei' },
      PRICE,
    );

    const [call] = calls;
    expect(call.form.get('mode')).toBe('payment');
    expect(call.form.get('payment_method_types[0]')).toBe('customer_balance');
    expect(
      call.form.get(
        'payment_method_options[customer_balance][bank_transfer][type]',
      ),
    ).toBe('mx_bank_transfer');
    // Un Customer siempre: es lo que da CLABE propia al cliente y lo que el
    // portal del proveedor necesitará después.
    expect(call.form.get('customer_creation')).toBe('always');
    expect(result).toMatchObject({ asynchronous: true });
  });

  it('SPEI no tiene el tope de la ficha de OXXO', async () => {
    const { client, calls } = httpDouble(SESSION);
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    await provider.createCheckout(
      { ...INTENT, paymentMethod: 'spei', planCode: 'despacho', seats: 7 },
      {
        planCode: 'despacho',
        currency: 'MXN',
        period: 'yearly',
        amountCents: 169_000,
      },
    );
    expect(calls).toHaveLength(1);
  });
});

describe('StripePaymentProvider · portal del proveedor', () => {
  it('abre una sesión del portal para el cliente de la pasarela', async () => {
    const { client, calls } = httpDouble(
      JSON.stringify({ url: 'https://billing.stripe.test/p/session/abc' }),
    );
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    await expect(
      provider.createBillingPortalSession({ providerCustomerId: 'cus_123' }),
    ).resolves.toEqual({
      kind: 'hosted',
      url: 'https://billing.stripe.test/p/session/abc',
    });
    const [call] = calls;
    expect(call.url).toBe('https://api.stripe.test/v1/billing_portal/sessions');
    expect(call.form.get('customer')).toBe('cus_123');
    expect(call.form.get('return_url')).toBe(
      'https://app.example.test/facturacion',
    );
    // SIN clave de idempotencia: cada visita necesita una sesión nueva porque
    // la anterior caduca. Reutilizar la de hace una hora llevaría al cliente a
    // un enlace muerto justo cuando intenta pagar.
    expect(call.headers['idempotency-key']).toBeUndefined();
  });

  it('rechaza un identificador de cliente que no es utilizable', async () => {
    const { client } = httpDouble('{}');
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    await expect(
      provider.createBillingPortalSession({ providerCustomerId: '  ' }),
    ).rejects.toBeInstanceOf(StripeConfigurationError);
  });

  it('rechaza una URL de portal que no sea HTTPS', async () => {
    const { client } = httpDouble(
      JSON.stringify({ url: 'http://billing.stripe.test/p/session/abc' }),
    );
    const provider = new StripePaymentProvider(CONFIGURATION, client);

    // Mandar a un cliente a teclear su tarjeta por HTTP plano es un downgrade
    // silencioso del canal; se rompe en vez de abrirlo.
    await expect(
      provider.createBillingPortalSession({ providerCustomerId: 'cus_123' }),
    ).rejects.toBeInstanceOf(StripeApiError);
  });
});
