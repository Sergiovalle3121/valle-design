import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CommercialOutboxDeliveryContext,
  CommercialOutboxMessage,
  CommercialOutboxTransport,
} from './outbox-dispatcher.service';

const MIN_SECRET_LENGTH = 32;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface WebhookOutboxConfiguration {
  emailUrl: URL;
  domainUrl: URL;
  secret: string;
  timeoutMs: number;
}

export class OutboxWebhookConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboxWebhookConfigurationError';
  }
}

export class OutboxWebhookDeliveryError extends Error {
  constructor(status: number) {
    super(`Outbox webhook rejected delivery with HTTP ${status}.`);
    this.name = 'OutboxWebhookDeliveryError';
  }
}

/**
 * Production transport for both queues. Deployments provide two HTTPS
 * receivers (they may be the same URL): one renders/sends email and the other
 * consumes domain events. Bodies are signed and carry a stable idempotency key.
 */
@Injectable()
export class WebhookCommercialOutboxTransport implements CommercialOutboxTransport {
  assertConfigured(): WebhookOutboxConfiguration {
    return resolveWebhookOutboxConfiguration(process.env);
  }

  async deliver(
    message: CommercialOutboxMessage,
    context: CommercialOutboxDeliveryContext,
  ): Promise<void> {
    const configuration = this.assertConfigured();
    const endpoint =
      message.queue === 'email'
        ? configuration.emailUrl
        : configuration.domainUrl;
    const timestamp = new Date().toISOString();
    const body = JSON.stringify({
      id: message.id,
      queue: message.queue,
      organizationId: message.organizationId,
      tenantId: message.tenantId,
      idempotencyKey: context.idempotencyKey,
      attemptCount: context.attemptCount,
      ...(message.queue === 'email'
        ? {
            recipient: message.recipient,
            template: message.template,
            payload: message.payload,
          }
        : {
            type: message.type,
            aggregateId: message.aggregateId,
            payload: message.payload,
          }),
    });
    const signature = createHmac('sha256', configuration.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': context.idempotencyKey,
        'x-valle-timestamp': timestamp,
        'x-valle-signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(configuration.timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) {
      // Never read or persist the provider body: it may echo tokens or PII.
      await response.body?.cancel().catch(() => undefined);
      throw new OutboxWebhookDeliveryError(response.status);
    }
    await response.body?.cancel().catch(() => undefined);
  }
}

export function resolveWebhookOutboxConfiguration(
  environment: NodeJS.ProcessEnv,
): WebhookOutboxConfiguration {
  const emailUrl = secureWebhookUrl(
    environment.OUTBOX_EMAIL_WEBHOOK_URL,
    'OUTBOX_EMAIL_WEBHOOK_URL',
    environment.NODE_ENV,
  );
  const domainUrl = secureWebhookUrl(
    environment.OUTBOX_DOMAIN_WEBHOOK_URL,
    'OUTBOX_DOMAIN_WEBHOOK_URL',
    environment.NODE_ENV,
  );
  const secret = environment.OUTBOX_WEBHOOK_SECRET?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new OutboxWebhookConfigurationError(
      `OUTBOX_WEBHOOK_SECRET must contain at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }
  const parsedTimeout = Number(environment.OUTBOX_WEBHOOK_TIMEOUT_MS);
  const timeoutMs = environment.OUTBOX_WEBHOOK_TIMEOUT_MS
    ? parsedTimeout
    : DEFAULT_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 120_000
  ) {
    throw new OutboxWebhookConfigurationError(
      'OUTBOX_WEBHOOK_TIMEOUT_MS must be an integer from 1000 to 120000.',
    );
  }
  return { emailUrl, domainUrl, secret, timeoutMs };
}

function secureWebhookUrl(
  raw: string | undefined,
  name: string,
  environment: string | undefined,
): URL {
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    throw new OutboxWebhookConfigurationError(
      `${name} must be an absolute URL.`,
    );
  }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (
    url.protocol !== 'https:' &&
    !(environment !== 'production' && loopback)
  ) {
    throw new OutboxWebhookConfigurationError(
      `${name} must use HTTPS (plain HTTP is allowed only for local development).`,
    );
  }
  if (url.username || url.password || url.hash) {
    throw new OutboxWebhookConfigurationError(
      `${name} cannot contain credentials or a URL fragment.`,
    );
  }
  return url;
}
