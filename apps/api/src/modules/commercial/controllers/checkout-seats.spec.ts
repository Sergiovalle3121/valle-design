import { BadRequestException } from '@nestjs/common';
import { PlanCatalog } from '../entities/commercial.entities';
import { resolveCheckoutSeats } from './billing.controller';

/**
 * La cantidad de asientos la elige el cliente, pero quién puede pedirla lo
 * decide el catálogo. Estas pruebas fijan esa frontera, porque equivocarla no
 * produce un error visible: produce una factura por el importe equivocado.
 */
function planWith(metadata: Record<string, unknown> | null): PlanCatalog {
  const plan = new PlanCatalog();
  plan.code = 'despacho';
  plan.active = true;
  plan.metadata = metadata;
  return plan;
}

describe('resolveCheckoutSeats', () => {
  it('cobra el mínimo del plan cuando el cliente no pide una cantidad', () => {
    expect(
      resolveCheckoutSeats(
        planWith({ perSeat: true, seatsMinimum: 3 }),
        undefined,
      ),
    ).toBe(3);
  });

  it('respeta la cantidad pedida por encima del mínimo', () => {
    expect(
      resolveCheckoutSeats(planWith({ perSeat: true, seatsMinimum: 3 }), 7),
    ).toBe(7);
  });

  it('rechaza por debajo del mínimo en vez de subirlo en silencio', () => {
    // Subirlo calladamente cobraría más de lo que el cliente aceptó; quien
    // pidió dos asientos de un plan de tres tiene que enterarse ANTES de pagar.
    expect(() =>
      resolveCheckoutSeats(planWith({ perSeat: true, seatsMinimum: 3 }), 2),
    ).toThrow(BadRequestException);
    try {
      resolveCheckoutSeats(planWith({ perSeat: true, seatsMinimum: 3 }), 2);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'seats_below_minimum',
        minimumSeats: 3,
      });
    }
  });

  it('un plan que no cobra por usuario sólo admite un asiento', () => {
    const individual = planWith({ perSeat: false, seatsMinimum: 1 });

    expect(resolveCheckoutSeats(individual, undefined)).toBe(1);
    expect(resolveCheckoutSeats(individual, 1)).toBe(1);
    // Su precio cubre la cuenta entera: multiplicarlo por tres cobraría el
    // triple por exactamente lo mismo.
    expect(() => resolveCheckoutSeats(individual, 3)).toThrow(
      BadRequestException,
    );
  });

  it('sin metadata de asientos trata el plan como uno por cuenta', () => {
    // Fallo cerrado hacia el lado barato: ante un catálogo incompleto se cobra
    // una unidad, jamás una cantidad deducida a ojo.
    expect(resolveCheckoutSeats(planWith(null), undefined)).toBe(1);
    expect(() => resolveCheckoutSeats(planWith({}), 5)).toThrow(
      BadRequestException,
    );
  });

  it('ignora un mínimo absurdo del catálogo en vez de propagarlo al cobro', () => {
    for (const seatsMinimum of [0, -3, 2.5, 5_000, 'tres']) {
      expect(
        resolveCheckoutSeats(planWith({ perSeat: true, seatsMinimum }), 1),
      ).toBe(1);
    }
  });
});
