import type {
  PaymentMethod,
  PlanPricePeriod,
  SubscriptionUpgradeIntent,
} from './entities/commercial.entities';
import {
  readAmountCents,
  readCurrency,
  readMetadata,
  readShortString,
} from './stripe-event.reader';

/** El pedido cobrado, tomado de una Checkout Session firmada por Stripe. */
export interface PaidCheckoutSnapshot {
  planCode: string;
  seats: number;
  period: PlanPricePeriod;
  paymentMethod: PaymentMethod;
  unitAmountCents: number;
  amountTotalCents: number;
  currency: string;
}

/**
 * El intent es mutable mientras está pendiente. Una sesión anterior puede
 * pagarse después de que se pidan más asientos o cambie el precio de lista.
 * Sólo la sesión pagada dice qué compró el cliente: su metadata (puesta al
 * crearla) debe cuadrar con el total y la moneda que Stripe afirma haber
 * cobrado. Un dato ausente o incoherente pide revisión y nunca concede acceso.
 */
export function readPaidCheckoutSnapshot(
  session: unknown,
  intent: Pick<
    SubscriptionUpgradeIntent,
    'id' | 'organizationId' | 'requestedPlanCode' | 'requestedSeats'
  >,
): PaidCheckoutSnapshot | null {
  if (readShortString(session, 'payment_status', 40) !== 'paid') return null;
  const metadataIntentId = readMetadata(session, 'intentId');
  const planCode = readMetadata(session, 'planCode');
  const organizationId = readMetadata(session, 'organizationId');
  const seats = positiveInteger(readMetadata(session, 'seats'), 1_000);
  const period = readMetadata(session, 'period');
  const paymentMethod = readMetadata(session, 'paymentMethod');
  const unitAmountCents = positiveInteger(
    readMetadata(session, 'unitAmountCents'),
    Number.MAX_SAFE_INTEGER,
  );
  const metadataCurrency = readMetadata(session, 'currency');
  const currency = readCurrency(session, 'currency');
  const amountTotalCents = readAmountCents(session, ['amount_total']);
  const mode = readShortString(session, 'mode', 20);

  if (
    metadataIntentId !== intent.id ||
    planCode !== intent.requestedPlanCode ||
    organizationId !== intent.organizationId ||
    seats === null ||
    unitAmountCents === null ||
    amountTotalCents === null ||
    !currency ||
    metadataCurrency !== currency ||
    (period !== 'monthly' && period !== 'yearly') ||
    (paymentMethod !== 'card' &&
      paymentMethod !== 'oxxo' &&
      paymentMethod !== 'spei') ||
    mode !== (paymentMethod === 'card' ? 'subscription' : 'payment')
  ) {
    return null;
  }

  const expectedTotal = seats * unitAmountCents;
  if (
    !Number.isSafeInteger(expectedTotal) ||
    amountTotalCents !== expectedTotal
  ) {
    return null;
  }
  return {
    planCode,
    seats,
    period,
    paymentMethod,
    unitAmountCents,
    amountTotalCents,
    currency,
  };
}

function positiveInteger(raw: string | null, maximum: number): number | null {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= maximum ? value : null;
}
