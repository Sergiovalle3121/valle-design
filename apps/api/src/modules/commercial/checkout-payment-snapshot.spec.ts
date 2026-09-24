import { readPaidCheckoutSnapshot } from './checkout-payment-snapshot';

const INTENT = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  requestedPlanCode: 'despacho',
  requestedSeats: 5,
};

function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_old_three_seats',
    mode: 'subscription',
    payment_status: 'paid',
    amount_total: 50_700,
    currency: 'mxn',
    metadata: {
      intentId: INTENT.id,
      organizationId: INTENT.organizationId,
      planCode: 'despacho',
      seats: '3',
      period: 'monthly',
      paymentMethod: 'card',
      unitAmountCents: '16900',
      currency: 'MXN',
    },
    ...overrides,
  };
}

describe('snapshot del checkout pagado', () => {
  it('concede los tres asientos pagados aunque el intent mutable ya pida cinco', () => {
    expect(readPaidCheckoutSnapshot(paidSession(), INTENT)).toEqual({
      planCode: 'despacho',
      seats: 3,
      period: 'monthly',
      paymentMethod: 'card',
      unitAmountCents: 16_900,
      amountTotalCents: 50_700,
      currency: 'MXN',
    });
  });

  it('falla cerrado si falta el total o si el dinero/moneda difiere del pedido', () => {
    expect(
      readPaidCheckoutSnapshot(paidSession({ amount_total: null }), INTENT),
    ).toBeNull();
    expect(
      readPaidCheckoutSnapshot(paidSession({ amount_total: 50_699 }), INTENT),
    ).toBeNull();
    expect(
      readPaidCheckoutSnapshot(paidSession({ currency: 'usd' }), INTENT),
    ).toBeNull();
    expect(
      readPaidCheckoutSnapshot(
        paidSession({
          metadata: {
            ...paidSession().metadata,
            intentId: '33333333-3333-4333-8333-333333333333',
          },
        }),
        INTENT,
      ),
    ).toBeNull();
  });

  it('distingue un nuevo precio válido del catálogo viejo sin consultar el catálogo actual', () => {
    expect(
      readPaidCheckoutSnapshot(
        paidSession({
          amount_total: 59_700,
          metadata: { ...paidSession().metadata, unitAmountCents: '19900' },
        }),
        INTENT,
      )?.amountTotalCents,
    ).toBe(59_700);
  });

  it('no activa una sesión sin dinero ni una cantidad de asientos inválida', () => {
    expect(
      readPaidCheckoutSnapshot(
        paidSession({ payment_status: 'unpaid' }),
        INTENT,
      ),
    ).toBeNull();
    expect(
      readPaidCheckoutSnapshot(
        paidSession({ payment_status: 'no_payment_required', amount_total: 0 }),
        INTENT,
      ),
    ).toBeNull();
    expect(
      readPaidCheckoutSnapshot(
        paidSession({
          metadata: { ...paidSession().metadata, seats: '5x' },
        }),
        INTENT,
      ),
    ).toBeNull();
  });
});
