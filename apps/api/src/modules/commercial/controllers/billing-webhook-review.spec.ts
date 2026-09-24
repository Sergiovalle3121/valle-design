import type { Request } from 'express';
import { BillingWebhookUnsafeCheckoutError } from '../billing-webhook.service';
import type { BillingWebhookService } from '../billing-webhook.service';
import type { PaymentProvider } from '../ports/payment-provider.port';
import { BillingWebhookController } from './billing-webhook.controller';

it('un cobro inseguro responde 409 explícito para revisión y no acusa recibo', async () => {
  const provider = {
    descriptor: () => ({ name: 'stripe', mode: 'hosted', available: true }),
    verifyWebhook: () =>
      Promise.resolve({
        id: 'evt_review',
        type: 'checkout.session.completed',
        payload: {},
      }),
  } as unknown as PaymentProvider;
  const webhooks = {
    process: () =>
      Promise.reject(
        new BillingWebhookUnsafeCheckoutError(
          'checkout_payment_snapshot_invalid',
        ),
      ),
  } as unknown as BillingWebhookService;
  const controller = new BillingWebhookController(provider, webhooks);
  const request = {
    body: Buffer.from('{}'),
    headers: { 'stripe-signature': 'firmado-en-la-prueba' },
  } as unknown as Request;

  await expect(controller.receiveStripeWebhook(request)).rejects.toMatchObject({
    status: 409,
    response: { code: 'checkout_review_required' },
  });
});
