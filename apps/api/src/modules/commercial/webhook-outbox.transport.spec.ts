import { createHmac } from 'node:crypto';
import { pollIntervalMs } from './outbox-worker.service';
import {
  OutboxWebhookConfigurationError,
  resolveWebhookOutboxConfiguration,
  WebhookCommercialOutboxTransport,
} from './webhook-outbox.transport';

describe('WebhookCommercialOutboxTransport', () => {
  const originalEnvironment = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.OUTBOX_EMAIL_WEBHOOK_URL = 'https://mail.example.test/outbox';
    process.env.OUTBOX_DOMAIN_WEBHOOK_URL =
      'https://events.example.test/outbox';
    process.env.OUTBOX_WEBHOOK_SECRET = 's'.repeat(48);
    process.env.OUTBOX_WEBHOOK_TIMEOUT_MS = '5000';
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('requires explicit HTTPS endpoints and a long signing secret', () => {
    expect(() =>
      resolveWebhookOutboxConfiguration({
        NODE_ENV: 'production',
        OUTBOX_EMAIL_WEBHOOK_URL: 'http://mail.example.test/outbox',
        OUTBOX_DOMAIN_WEBHOOK_URL: 'https://events.example.test/outbox',
        OUTBOX_WEBHOOK_SECRET: 'short',
      }),
    ).toThrow(OutboxWebhookConfigurationError);

    expect(
      resolveWebhookOutboxConfiguration({
        NODE_ENV: 'test',
        OUTBOX_EMAIL_WEBHOOK_URL: 'http://localhost:4100/email',
        OUTBOX_DOMAIN_WEBHOOK_URL: 'http://127.0.0.1:4100/events',
        OUTBOX_WEBHOOK_SECRET: 'x'.repeat(32),
      }),
    ).toMatchObject({ timeoutMs: 15_000 });
  });

  it('signs an email delivery and forwards its stable idempotency key', async () => {
    const mockedFetch = jest.fn(
      async () => new Response(null, { status: 204 }),
    );
    globalThis.fetch = mockedFetch as typeof fetch;
    const transport = new WebhookCommercialOutboxTransport();

    await transport.deliver(
      {
        queue: 'email',
        id: 'outbox-1',
        organizationId: null,
        tenantId: null,
        recipient: 'user@example.test',
        template: 'identity.verify-email',
        idempotencyKey: 'identity.verify-email:token-1',
        payload: { token: 'not-logged-by-the-worker' },
      },
      {
        queue: 'email',
        attemptCount: 2,
        idempotencyKey: 'identity.verify-email:token-1',
      },
    );

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockedFetch.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.toString()).toBe('https://mail.example.test/outbox');
    const headers = new Headers(init.headers);
    expect(headers.get('idempotency-key')).toBe(
      'identity.verify-email:token-1',
    );
    if (typeof init.body !== 'string') {
      throw new Error('Expected the webhook transport to serialize JSON.');
    }
    const body = init.body;
    const timestamp = headers.get('x-valle-timestamp')!;
    const expectedSignature = createHmac('sha256', 's'.repeat(48))
      .update(`${timestamp}.${body}`)
      .digest('hex');
    expect(headers.get('x-valle-signature')).toBe(
      `sha256=${expectedSignature}`,
    );
    expect(JSON.parse(body)).toMatchObject({
      queue: 'email',
      recipient: 'user@example.test',
      attemptCount: 2,
    });
  });

  it('bounds the polling interval', () => {
    expect(pollIntervalMs(undefined)).toBe(1_000);
    expect(pollIntervalMs('250')).toBe(250);
    expect(() => pollIntervalMs('249')).toThrow();
    expect(() => pollIntervalMs('not-a-number')).toThrow();
  });
});
