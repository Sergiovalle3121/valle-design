import { createHmac } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  StripePaymentProvider,
  type StripeHttpClient,
} from './adapters/stripe-payment.provider';
import {
  BillingWebhookService,
  type BillingWebhookResult,
} from './billing-webhook.service';
import { BillingWebhookController } from './controllers/billing-webhook.controller';
import { PAYMENT_PROVIDER } from './ports/payment-provider.port';
import {
  STRIPE_WEBHOOK_BODY_LIMIT_BYTES,
  STRIPE_WEBHOOK_PATH,
  stripeWebhookRawBody,
  useStripeWebhookRawBody,
} from './stripe-webhook.raw-body';

const WEBHOOK_SECRET = 'whsec_prueba_de_treinta_y_dos_caracteres';

function fakeRequest(chunks: Buffer[]): IncomingMessage {
  const stream = new PassThrough();
  queueMicrotask(() => {
    for (const chunk of chunks) stream.write(chunk);
    stream.end();
  });
  return stream as unknown as IncomingMessage;
}

function runMiddleware(
  chunks: Buffer[],
): Promise<{ body: unknown; error: unknown }> {
  const message = fakeRequest(chunks);
  return new Promise((resolve) => {
    stripeWebhookRawBody()(
      message,
      undefined as unknown as ServerResponse,
      (error?: unknown) =>
        resolve({ body: (message as { body?: unknown }).body, error }),
    );
  });
}

describe('stripeWebhookRawBody (parser crudo de la ruta del webhook)', () => {
  it('entrega los bytes EXACTOS, sin parsear ni normalizar', async () => {
    // JSON con espacios y orden de claves propio: si algo lo re-serializara,
    // los bytes cambiarían y la firma dejaría de validar.
    const original = Buffer.from(
      '{\n  "type": "invoice.paid",\n  "id": "evt_1"\n}',
      'utf8',
    );
    const { body, error } = await runMiddleware([
      original.subarray(0, 10),
      original.subarray(10),
    ]);
    expect(error).toBeUndefined();
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body).toEqual(original);
  });

  it('marca la petición para que el parser JSON global no la vuelva a tocar', async () => {
    const message = fakeRequest([Buffer.from('{}')]);
    await new Promise<void>((resolve) => {
      stripeWebhookRawBody()(
        message,
        undefined as unknown as ServerResponse,
        () => resolve(),
      );
    });
    expect((message as { _body?: boolean })._body).toBe(true);
  });

  it('respeta un cuerpo ya parseado por otro middleware', async () => {
    const message = fakeRequest([Buffer.from('{}')]) as IncomingMessage & {
      _body?: boolean;
      body?: unknown;
    };
    message._body = true;
    message.body = { ya: 'parseado' };
    await new Promise<void>((resolve) => {
      stripeWebhookRawBody()(
        message,
        undefined as unknown as ServerResponse,
        () => resolve(),
      );
    });
    expect(message.body).toEqual({ ya: 'parseado' });
  });

  it('acepta un cuerpo vacío como Buffer vacío (la firma lo rechazará después)', async () => {
    const { body, error } = await runMiddleware([]);
    expect(error).toBeUndefined();
    expect(body).toEqual(Buffer.alloc(0));
  });

  it('corta el cuerpo que supera el límite MIENTRAS lo lee', async () => {
    const enorme = Buffer.alloc(STRIPE_WEBHOOK_BODY_LIMIT_BYTES + 1, 0x61);
    const { error } = await runMiddleware([enorme]);
    expect(error).toMatchObject({
      name: 'StripeWebhookBodyTooLargeError',
      statusCode: 413,
    });
  });

  it('propaga un error del stream en vez de entregar un cuerpo truncado', async () => {
    const stream = new PassThrough();
    const message = stream as unknown as IncomingMessage;
    const result = new Promise<unknown>((resolve) => {
      stripeWebhookRawBody()(
        message,
        undefined as unknown as ServerResponse,
        (error?: unknown) => resolve(error),
      );
    });
    stream.write(Buffer.from('{"id"'));
    stream.emit('error', new Error('conexión cortada'));
    await expect(result).resolves.toMatchObject({
      message: 'conexión cortada',
    });
  });
});

/**
 * El cableado completo por HTTP: montar el parser en la ruta, que los bytes
 * lleguen intactos al controller y que la firma calculada sobre ESOS bytes
 * verifique. Es la prueba que ninguna unidad por separado puede dar — el
 * defecto clásico («funciona en el adaptador, falla en producción») vive
 * exactamente en esta junta.
 */
describe('POST /v1/commercial/webhooks/stripe (cuerpo crudo de extremo a extremo)', () => {
  let app: INestApplication;
  let server: Server;
  let processed: Array<{ eventId: string; rawBody: Buffer }>;

  const httpClient: StripeHttpClient = () =>
    Promise.reject(new Error('el webhook no llama a la API'));

  beforeAll(async () => {
    processed = [];
    const provider = new StripePaymentProvider(
      {
        secretKey: 'sk_test_x',
        webhookSecret: WEBHOOK_SECRET,
        apiBaseUrl: 'https://api.stripe.test',
        successUrl: 'https://app.example.test/ok',
        cancelUrl: 'https://app.example.test/ko',
        timeoutMs: 5_000,
        toleranceSeconds: 300,
        apiVersion: null,
      },
      httpClient,
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingWebhookController],
      providers: [
        { provide: PAYMENT_PROVIDER, useValue: provider },
        {
          provide: BillingWebhookService,
          useValue: {
            process: (
              event: { id: string },
              rawBody: Buffer,
            ): Promise<BillingWebhookResult> => {
              processed.push({ eventId: event.id, rawBody });
              return Promise.resolve({
                status: 'processed',
                outcome: 'subscription_activated',
              });
            },
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    // Exactamente el mismo cableado que main.ts, en el mismo orden.
    useStripeWebhookRawBody(app);
    await app.init();
    // getHttpServer() devuelve any; se fija el tipo UNA vez aquí.
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  function signed(body: string, secondsAgo = 0): { header: string } {
    const timestamp = Math.floor(Date.now() / 1000) - secondsAgo;
    const signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    return { header: `t=${timestamp},v1=${signature}` };
  }

  it('verifica la firma sobre los bytes recibidos y procesa el evento', async () => {
    // Formato deliberadamente «feo»: el cuerpo llega tal cual y la firma se
    // calcula sobre ESOS bytes.
    const body =
      '{"id":"evt_e2e_1",  "type":"checkout.session.completed","data":{"object":{}}}';
    const response = await request(server)
      .post(STRIPE_WEBHOOK_PATH)
      .set('content-type', 'application/json')
      .set('stripe-signature', signed(body).header)
      .send(body)
      .expect(200);

    expect(response.body).toEqual({
      received: true,
      status: 'processed',
      outcome: 'subscription_activated',
    });
    expect(processed).toHaveLength(1);
    expect(processed[0].eventId).toBe('evt_e2e_1');
    // Los bytes que vio el servicio son los que se enviaron, byte a byte.
    expect(processed[0].rawBody.toString('utf8')).toBe(body);
  });

  it('rechaza con 400 la firma inválida, la vieja y la ausente', async () => {
    const body = '{"id":"evt_e2e_2","type":"invoice.paid","data":{}}';
    const antes = processed.length;

    await request(server)
      .post(STRIPE_WEBHOOK_PATH)
      .set('content-type', 'application/json')
      .set(
        'stripe-signature',
        `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`,
      )
      .send(body)
      .expect(400);

    await request(server)
      .post(STRIPE_WEBHOOK_PATH)
      .set('content-type', 'application/json')
      .set('stripe-signature', signed(body, 3_600).header)
      .send(body)
      .expect(400);

    await request(server)
      .post(STRIPE_WEBHOOK_PATH)
      .set('content-type', 'application/json')
      .send(body)
      .expect(400);

    // Ninguna de las tres llegó al procesamiento: sin firma no hay efecto.
    expect(processed).toHaveLength(antes);
  });

  it('es PÚBLICA: no exige sesión, cookie ni token CSRF', async () => {
    const body =
      '{"id":"evt_e2e_3","type":"invoice.paid","data":{"object":{}}}';
    await request(server)
      .post(STRIPE_WEBHOOK_PATH)
      .set('content-type', 'application/json')
      .set('stripe-signature', signed(body).header)
      .send(body)
      .expect(200);
  });
});
