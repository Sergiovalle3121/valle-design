import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.types';
import { ApiRateLimitService } from '../../modules/identity/api-rate-limit.service';
import { BoundedMemoryIdentityRateLimitStore } from '../../modules/identity/identity-rate-limit.store';
import type { StripeConfiguration } from '../../modules/commercial/adapters/stripe-payment.provider';

/**
 * Piezas compartidas por las suites .pg del ciclo cobrado
 * (`commercial-billing` y `commercial-mexican-billing`). Vivían duplicadas en
 * ambas — misma configuración, mismo request autenticado, mismo secreto — y
 * cada divergencia accidental entre copias era una diferencia de harness
 * disfrazada de diferencia de comportamiento.
 */

export const STRIPE_TEST_WEBHOOK_SECRET =
  'whsec_prueba_de_treinta_y_dos_caracteres';

export const STRIPE_TEST_CONFIGURATION: StripeConfiguration = {
  secretKey: 'sk_test_x',
  webhookSecret: STRIPE_TEST_WEBHOOK_SECRET,
  apiBaseUrl: 'https://api.stripe.test',
  successUrl: 'https://app.example.test/ok',
  cancelUrl: 'https://app.example.test/ko',
  portalReturnUrl: 'https://app.example.test/portal',
  timeoutMs: 5_000,
  toleranceSeconds: 300,
  apiVersion: null,
};

/** Request con el usuario comercial autenticado que los controllers esperan. */
export function authenticatedCommercialRequest(
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
): Request {
  const user: AuthenticatedUser = {
    userId,
    organization_id: organizationId,
    tenant_id: organizationId,
    role,
  } as AuthenticatedUser;
  return { user } as unknown as Request;
}

export function epochSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/** La sesión de prueba refleja el formulario REAL enviado al proveedor. */
export function paidCheckoutSessionFromForm(
  form: URLSearchParams,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const metadata = Object.fromEntries(
    [...form.entries()]
      .filter(([key]) => /^metadata\[[^\]]+\]$/.test(key))
      .map(([key, value]) => [key.slice(9, -1), value]),
  );
  const unit = Number(form.get('line_items[0][price_data][unit_amount]'));
  const quantity = Number(form.get('line_items[0][quantity]'));
  return {
    client_reference_id: form.get('client_reference_id'),
    mode: form.get('mode'),
    payment_status: 'paid',
    amount_total: unit * quantity,
    currency: form.get('line_items[0][price_data][currency]'),
    metadata,
    ...extra,
  };
}

/** Rate limiting real con store en memoria: la mecánica sin PostgreSQL. */
export function memoryRateLimits(): ApiRateLimitService {
  return new ApiRateLimitService(new BoundedMemoryIdentityRateLimitStore());
}
