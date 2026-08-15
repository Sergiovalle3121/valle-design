import { createHmac } from 'node:crypto';
import {
  globalStripeHttpClient,
  resolveStripeConfiguration,
  StripeApiError,
  StripeConfigurationError,
  type StripeConfiguration,
  type StripeHttpClient,
  StripePaymentProvider,
  StripeSignatureError,
} from './stripe-payment.provider';

/**
 * El adaptador de Stripe se ejerce ENTERO sin red y sin claves reales: el
 * cliente HTTP se inyecta y las firmas se calculan en la propia prueba con el
 * secreto de prueba. Eso es lo que hace que enchufar claves de verdad sea
 * configuración y no código — si aquí hiciera falta una clave, el adaptador
 * estaría acoplado al proveedor en vez de a su protocolo.
 */

const WEBHOOK_SECRET = 'whsec_prueba_de_treinta_y_dos_caracteres';

function configuration(
  overrides: Partial<StripeConfiguration> = {},
): StripeConfiguration {
  return {
    secretKey: 'sk_test_clave_de_prueba',
    webhookSecret: WEBHOOK_SECRET,
    apiBaseUrl: 'https://api.stripe.test',
    successUrl: 'https://app.example.test/billing/ok',
    cancelUrl: 'https://app.example.test/billing/ko',
    timeoutMs: 5_000,
    toleranceSeconds: 300,
    apiVersion: null,
    ...overrides,
  };
}

interface Call {
  url: string;
  headers: Record<string, string>;
  form: URLSearchParams;
}

function httpDouble(
  responses: Array<{ ok?: boolean; status?: number; body: string }>,
): { client: StripeHttpClient; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;
  const client: StripeHttpClient = (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      form: new URLSearchParams(init.body),
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return Promise.resolve({
      ok: next.ok ?? true,
      status: next.status ?? 200,
      text: () => Promise.resolve(next.body),
    });
  };
  return { client, calls };
}

function sign(
  rawBody: Buffer,
  options: { timestamp: number; secret?: string },
): string {
  const signature = createHmac('sha256', options.secret ?? WEBHOOK_SECRET)
    .update(`${options.timestamp}.`)
    .update(rawBody)
    .digest('hex');
  return `t=${options.timestamp},v1=${signature}`;
}

const INTENT = {
  intentId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  planCode: 'standalone-full',
};
const PRICE = {
  planCode: 'standalone-full',
  currency: 'USD',
  period: 'monthly' as const,
  amountCents: 2900,
};

describe('StripePaymentProvider · descriptor', () => {
  it('se publica como pasarela hospedada y disponible', () => {
    const { client } = httpDouble([{ body: '{}' }]);
    expect(
      new StripePaymentProvider(configuration(), client).descriptor(),
    ).toEqual({ name: 'stripe', mode: 'hosted', available: true });
  });
});

describe('StripePaymentProvider · createCheckout', () => {
  it('crea la sesión con el precio del catálogo y devuelve la URL hospedada', async () => {
    const { client, calls } = httpDouble([
      {
        body: JSON.stringify({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.test/c/pay/cs_test_123',
        }),
      },
    ]);
    const provider = new StripePaymentProvider(configuration(), client);

    await expect(provider.createCheckout(INTENT, PRICE)).resolves.toEqual({
      kind: 'hosted',
      url: 'https://checkout.stripe.test/c/pay/cs_test_123',
      reference: 'cs_test_123',
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe('https://api.stripe.test/v1/checkout/sessions');
    expect(call.headers.authorization).toBe('Bearer sk_test_clave_de_prueba');
    expect(call.headers['content-type']).toBe(
      'application/x-www-form-urlencoded',
    );
    // La clave idempotente es el intent: un reintento de red NO cobra dos veces.
    expect(call.headers['idempotency-key']).toBe(
      `checkout-intent:${INTENT.intentId}`,
    );
    // Sin STRIPE_API_VERSION no se inventa una: manda la de la cuenta.
    expect(call.headers['stripe-version']).toBeUndefined();

    expect(call.form.get('mode')).toBe('subscription');
    expect(call.form.get('client_reference_id')).toBe(INTENT.intentId);
    expect(call.form.get('success_url')).toBe(
      'https://app.example.test/billing/ok',
    );
    // El precio viaja INLINE desde plan_prices: no hay un catálogo duplicado
    // en el dashboard del proveedor que se pueda desincronizar.
    expect(call.form.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(call.form.get('line_items[0][price_data][unit_amount]')).toBe(
      '2900',
    );
    expect(
      call.form.get('line_items[0][price_data][recurring][interval]'),
    ).toBe('month');
    // La metadata viaja también en la SUSCRIPCIÓN: los eventos posteriores
    // llegan sin la sesión y aun así se pueden correlacionar.
    expect(call.form.get('subscription_data[metadata][organizationId]')).toBe(
      INTENT.organizationId,
    );
  });

  it('traduce el período anual al intervalo del proveedor', async () => {
    const { client, calls } = httpDouble([
      { body: JSON.stringify({ id: 'cs_1', url: 'https://checkout/x' }) },
    ]);
    await new StripePaymentProvider(configuration(), client).createCheckout(
      INTENT,
      { ...PRICE, period: 'yearly' },
    );
    expect(
      calls[0].form.get('line_items[0][price_data][recurring][interval]'),
    ).toBe('year');
  });

  it('envía la versión de API cuando la configuración la fija', async () => {
    const { client, calls } = httpDouble([
      { body: JSON.stringify({ id: 'cs_1', url: 'https://checkout/x' }) },
    ]);
    await new StripePaymentProvider(
      configuration({ apiVersion: '2026-01-15' }),
      client,
    ).createCheckout(INTENT, PRICE);
    expect(calls[0].headers['stripe-version']).toBe('2026-01-15');
  });

  it('convierte un error del proveedor en StripeApiError sin filtrar su cuerpo', async () => {
    const { client } = httpDouble([
      {
        ok: false,
        status: 402,
        body: JSON.stringify({
          error: {
            code: 'card_declined',
            message: 'La tarjeta de ana@example.test fue rechazada',
          },
        }),
      },
    ]);
    const provider = new StripePaymentProvider(configuration(), client);
    const error: unknown = await provider
      .createCheckout(INTENT, PRICE)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StripeApiError);
    const apiError = error as StripeApiError;
    expect(apiError.status).toBe(402);
    expect(apiError.stripeCode).toBe('card_declined');
    // El mensaje del proveedor puede llevar datos del cliente: no se propaga.
    expect(apiError.message).not.toContain('ana@example.test');
  });

  it('acepta un error sin cuerpo JSON sin romperse', async () => {
    const { client } = httpDouble([
      { ok: false, status: 500, body: '<html>gateway</html>' },
    ]);
    const error: unknown = await new StripePaymentProvider(
      configuration(),
      client,
    )
      .createCheckout(INTENT, PRICE)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StripeApiError);
    expect((error as StripeApiError).stripeCode).toBeNull();
  });

  it('propaga el timeout del cliente HTTP en vez de esperar para siempre', async () => {
    const client: StripeHttpClient = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(
            new DOMException('The operation was aborted.', 'TimeoutError'),
          );
        });
      });
    const provider = new StripePaymentProvider(
      configuration({ timeoutMs: 1_000 }),
      client,
    );
    await expect(provider.createCheckout(INTENT, PRICE)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('rechaza una sesión sin URL o con URL no HTTPS', async () => {
    const sinUrl = httpDouble([{ body: JSON.stringify({ id: 'cs_1' }) }]);
    await expect(
      new StripePaymentProvider(configuration(), sinUrl.client).createCheckout(
        INTENT,
        PRICE,
      ),
    ).rejects.toBeInstanceOf(StripeApiError);

    const enClaro = httpDouble([
      { body: JSON.stringify({ id: 'cs_1', url: 'http://checkout/x' }) },
    ]);
    await expect(
      new StripePaymentProvider(configuration(), enClaro.client).createCheckout(
        INTENT,
        PRICE,
      ),
    ).rejects.toMatchObject({ stripeCode: 'checkout_url_not_https' });
  });

  it('rechaza una respuesta que no es JSON', async () => {
    const { client } = httpDouble([{ body: 'no-json' }]);
    await expect(
      new StripePaymentProvider(configuration(), client).createCheckout(
        INTENT,
        PRICE,
      ),
    ).rejects.toMatchObject({ stripeCode: 'invalid_json_response' });
  });
});

describe('StripePaymentProvider · cancelAtPeriodEnd', () => {
  it('programa la baja y devuelve el fin del período vigente', async () => {
    const periodEnd = 1_800_000_000;
    const { client, calls } = httpDouble([
      {
        body: JSON.stringify({
          id: 'sub_123',
          cancel_at_period_end: true,
          current_period_end: periodEnd,
        }),
      },
    ]);
    await expect(
      new StripePaymentProvider(configuration(), client).cancelAtPeriodEnd({
        providerSubscriptionId: 'sub_123',
      }),
    ).resolves.toEqual({
      kind: 'scheduled',
      currentPeriodEnd: new Date(periodEnd * 1000),
    });
    expect(calls[0].url).toBe(
      'https://api.stripe.test/v1/subscriptions/sub_123',
    );
    expect(calls[0].form.get('cancel_at_period_end')).toBe('true');
  });

  it('rechaza un identificador de suscripción no utilizable', async () => {
    const { client, calls } = httpDouble([{ body: '{}' }]);
    await expect(
      new StripePaymentProvider(configuration(), client).cancelAtPeriodEnd({
        providerSubscriptionId: 'sub/../../danger',
      }),
    ).rejects.toBeInstanceOf(StripeConfigurationError);
    expect(calls).toHaveLength(0);
  });
});

describe('StripePaymentProvider · verifyWebhook', () => {
  const provider = new StripePaymentProvider(
    configuration(),
    httpDouble([{ body: '{}' }]).client,
  );
  const now = new Date('2026-08-15T12:00:00.000Z');
  const timestamp = Math.floor(now.getTime() / 1000);
  const rawBody = Buffer.from(
    JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1' } },
    }),
    'utf8',
  );

  it('acepta una firma válida y devuelve id, tipo y payload', async () => {
    const verified = await provider.verifyWebhook(
      { 'stripe-signature': sign(rawBody, { timestamp }) },
      rawBody,
      now,
    );
    expect(verified.id).toBe('evt_1');
    expect(verified.type).toBe('checkout.session.completed');
    // El payload es el evento COMPLETO ya parseado: el servicio no vuelve a
    // tocar los bytes.
    expect(verified.payload).toMatchObject({
      id: 'evt_1',
      data: { object: { id: 'cs_1' } },
    });
  });

  it('acepta la cabecera en cualquier capitalización', async () => {
    await expect(
      provider.verifyWebhook(
        { 'Stripe-Signature': sign(rawBody, { timestamp }) },
        rawBody,
        now,
      ),
    ).resolves.toMatchObject({ id: 'evt_1' });
  });

  it('acepta varias firmas v1 (rotación de secreto) si UNA coincide', async () => {
    const buena = sign(rawBody, { timestamp }).split(',')[1];
    const header = `t=${timestamp},v1=${'0'.repeat(64)},${buena}`;
    await expect(
      provider.verifyWebhook({ 'stripe-signature': header }, rawBody, now),
    ).resolves.toMatchObject({ id: 'evt_1' });
  });

  it('rechaza una firma que no coincide', async () => {
    await expect(
      provider.verifyWebhook(
        { 'stripe-signature': sign(rawBody, { timestamp, secret: 'otro' }) },
        rawBody,
        now,
      ),
    ).rejects.toBeInstanceOf(StripeSignatureError);
  });

  it('rechaza el cuerpo alterado aunque la firma esté bien formada', async () => {
    const header = sign(rawBody, { timestamp });
    const alterado = Buffer.from(
      rawBody.toString('utf8').replace('evt_1', 'evt_2'),
      'utf8',
    );
    await expect(
      provider.verifyWebhook({ 'stripe-signature': header }, alterado, now),
    ).rejects.toThrow(/no coincide/);
  });

  it('rechaza un timestamp fuera de tolerancia (replay), en ambos sentidos', async () => {
    const viejo = timestamp - 301;
    await expect(
      provider.verifyWebhook(
        { 'stripe-signature': sign(rawBody, { timestamp: viejo }) },
        rawBody,
        now,
      ),
    ).rejects.toThrow(/tolerancia/);

    const futuro = timestamp + 301;
    await expect(
      provider.verifyWebhook(
        { 'stripe-signature': sign(rawBody, { timestamp: futuro }) },
        rawBody,
        now,
      ),
    ).rejects.toThrow(/tolerancia/);
  });

  it('acepta un timestamp justo en el borde de la tolerancia', async () => {
    await expect(
      provider.verifyWebhook(
        { 'stripe-signature': sign(rawBody, { timestamp: timestamp - 300 }) },
        rawBody,
        now,
      ),
    ).resolves.toMatchObject({ id: 'evt_1' });
  });

  it('rechaza la ausencia de cabecera y las cabeceras mal formadas', async () => {
    await expect(provider.verifyWebhook({}, rawBody, now)).rejects.toThrow(
      /Falta la cabecera/,
    );
    for (const header of [
      '',
      'v1=abc',
      `t=${timestamp}`,
      `t=no-numerico,v1=${'a'.repeat(64)}`,
      // Dos `t` es ambiguo: no se elige uno, se rechaza la cabecera entera.
      `t=${timestamp},t=${timestamp},v1=${'a'.repeat(64)}`,
    ]) {
      await expect(
        provider.verifyWebhook({ 'stripe-signature': header }, rawBody, now),
      ).rejects.toBeInstanceOf(StripeSignatureError);
    }
  });

  it('rechaza una cabecera duplicada en vez de elegir una', async () => {
    const header = sign(rawBody, { timestamp });
    await expect(
      provider.verifyWebhook(
        { 'stripe-signature': [header, header] },
        rawBody,
        now,
      ),
    ).rejects.toThrow(/Falta la cabecera/);
  });

  it('rechaza si NO hay secreto: un HMAC con clave vacía verificaría cualquier cosa', async () => {
    const sinSecreto = new StripePaymentProvider(
      configuration({ webhookSecret: '' }),
      httpDouble([{ body: '{}' }]).client,
    );
    await expect(
      sinSecreto.verifyWebhook(
        { 'stripe-signature': sign(rawBody, { timestamp, secret: '' }) },
        rawBody,
        now,
      ),
    ).rejects.toThrow(/secreto de webhook/);
  });

  it('rechaza un cuerpo firmado que no es un evento utilizable', async () => {
    for (const body of ['no es json', JSON.stringify({ type: 'x' }), '{}']) {
      const buffer = Buffer.from(body, 'utf8');
      await expect(
        provider.verifyWebhook(
          { 'stripe-signature': sign(buffer, { timestamp }) },
          buffer,
          now,
        ),
      ).rejects.toBeInstanceOf(StripeSignatureError);
    }
  });

  it('verifica sobre los BYTES, no sobre el JSON reserializado', async () => {
    // Mismo objeto, otro orden de claves y espacios: si el adaptador
    // re-serializara para firmar, este cuerpo legítimo fallaría.
    const conEspacios = Buffer.from(
      '{\n  "type": "invoice.paid",\n  "id": "evt_9",\n  "data": {"object": {}}\n}',
      'utf8',
    );
    await expect(
      provider.verifyWebhook(
        { 'stripe-signature': sign(conEspacios, { timestamp }) },
        conEspacios,
        now,
      ),
    ).resolves.toMatchObject({ id: 'evt_9', type: 'invoice.paid' });
  });
});

describe('resolveStripeConfiguration · el interruptor es la configuración', () => {
  const completa = {
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_CHECKOUT_SUCCESS_URL: 'https://app.example.test/ok',
    STRIPE_CHECKOUT_CANCEL_URL: 'https://app.example.test/ko',
  };

  it('devuelve null sin ninguna variable: el producto sigue con cobro externo', () => {
    expect(resolveStripeConfiguration({})).toBeNull();
    expect(
      resolveStripeConfiguration({
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '   ',
      }),
    ).toBeNull();
  });

  it('FALLA con configuración a medias: cobrar sin poder confirmar es peor', () => {
    for (const key of Object.keys(completa)) {
      const parcial: NodeJS.ProcessEnv = { ...completa };
      delete parcial[key];
      expect(() => resolveStripeConfiguration(parcial)).toThrow(
        StripeConfigurationError,
      );
    }
  });

  it('resuelve los valores por defecto con la configuración completa', () => {
    expect(resolveStripeConfiguration(completa)).toEqual({
      secretKey: 'sk_test_x',
      webhookSecret: WEBHOOK_SECRET,
      apiBaseUrl: 'https://api.stripe.com',
      successUrl: 'https://app.example.test/ok',
      cancelUrl: 'https://app.example.test/ko',
      timeoutMs: 20_000,
      toleranceSeconds: 300,
      apiVersion: null,
    });
  });

  it('rechaza secretos de webhook demasiado cortos', () => {
    expect(() =>
      resolveStripeConfiguration({
        ...completa,
        STRIPE_WEBHOOK_SECRET: 'corto',
      }),
    ).toThrow(/al menos/);
  });

  it('exige HTTPS fuera de local y rechaza credenciales en las URLs', () => {
    expect(() =>
      resolveStripeConfiguration({
        ...completa,
        NODE_ENV: 'production',
        STRIPE_CHECKOUT_SUCCESS_URL: 'http://app.example.test/ok',
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      resolveStripeConfiguration({
        ...completa,
        STRIPE_CHECKOUT_CANCEL_URL: 'https://user:pass@app.example.test/ko',
      }),
    ).toThrow(/credenciales/);
    // En local, HTTP contra loopback sigue siendo utilizable.
    expect(
      resolveStripeConfiguration({
        ...completa,
        STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:3000/ok',
      })?.successUrl,
    ).toBe('http://localhost:3000/ok');
  });

  it('acota timeout, tolerancia y versión de API', () => {
    expect(() =>
      resolveStripeConfiguration({ ...completa, STRIPE_TIMEOUT_MS: '10' }),
    ).toThrow(/entero entre/);
    expect(() =>
      resolveStripeConfiguration({
        ...completa,
        STRIPE_WEBHOOK_TOLERANCE_SECONDS: '99999',
      }),
    ).toThrow(/entero entre/);
    expect(() =>
      resolveStripeConfiguration({ ...completa, STRIPE_API_VERSION: 'ayer' }),
    ).toThrow(/AAAA-MM-DD/);
    expect(
      resolveStripeConfiguration({
        ...completa,
        STRIPE_TIMEOUT_MS: '3000',
        STRIPE_WEBHOOK_TOLERANCE_SECONDS: '60',
        STRIPE_API_VERSION: '2026-01-15',
      }),
    ).toMatchObject({
      timeoutMs: 3_000,
      toleranceSeconds: 60,
      apiVersion: '2026-01-15',
    });
  });

  it('normaliza la base de API y rechaza query o fragmento', () => {
    expect(
      resolveStripeConfiguration({
        ...completa,
        STRIPE_API_BASE_URL: 'https://api.stripe.test/',
      })?.apiBaseUrl,
    ).toBe('https://api.stripe.test');
    expect(() =>
      resolveStripeConfiguration({
        ...completa,
        STRIPE_API_BASE_URL: 'https://api.stripe.test/?debug=1',
      }),
    ).toThrow(/query ni fragmento/);
  });
});

describe('globalStripeHttpClient', () => {
  it('es el ÚNICO punto que toca la red: delega en fetch tal cual', async () => {
    const original = globalThis.fetch;
    const spy = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = spy;
    try {
      const init = {
        method: 'POST',
        headers: {},
        body: '',
        signal: AbortSignal.timeout(1_000),
        redirect: 'error' as const,
      };
      await globalStripeHttpClient('https://api.stripe.test/v1/x', init);
      expect(spy).toHaveBeenCalledWith('https://api.stripe.test/v1/x', init);
    } finally {
      globalThis.fetch = original;
    }
  });
});
